/**
 * Minimal Google Gemini Generative Language API client.
 *
 * Same `messages()` signature as `lib/ai/anthropic.ts` so the dispatcher in
 * `lib/ai/llm.ts` can swap providers transparently. We do NOT depend on
 * @google/generative-ai SDK — same reasoning as Anthropic: small surface,
 * one fewer dep to audit, full control over abort/timeout/error mapping.
 *
 * Endpoint:
 *   POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={API_KEY}
 *
 * Request shape (the bits we care about):
 *   {
 *     "systemInstruction": { "parts": [{ "text": "<system>" }] },
 *     "contents": [{ "role": "user", "parts": [{ "text": "<user>" }] }],
 *     "generationConfig": {
 *       "maxOutputTokens": 1024,
 *       "temperature": 0.4,
 *       "responseMimeType": "text/plain"   // or "application/json" for strict JSON
 *     }
 *   }
 *
 * Response shape:
 *   {
 *     "candidates": [{
 *       "content": { "parts": [{ "text": "..." }], "role": "model" },
 *       "finishReason": "STOP" | "MAX_TOKENS" | "SAFETY" | "RECITATION",
 *       ...
 *     }],
 *     "usageMetadata": {
 *       "promptTokenCount": ...,
 *       "candidatesTokenCount": ...,
 *       "totalTokenCount": ...
 *     },
 *     "modelVersion": "gemini-2.5-flash-001"
 *   }
 *
 * Refs:
 *   https://ai.google.dev/api/generate-content
 *   https://ai.google.dev/api/rest/v1beta/models/generateContent
 *   https://ai.google.dev/gemini-api/docs/pricing
 */

import { z } from 'zod';
import { serverEnv } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { costFor } from './pricing';
import {
  AnthropicError as LlmError,
  type AnthropicEndpoint as LlmEndpoint,
  type MessagesArgs,
  type MessagesResult,
} from './anthropic';

// We re-export AnthropicError as the canonical LlmError so callers don't
// have to switch types when we change provider. The error code shape is
// already provider-agnostic ('AUTH', 'RATE_LIMIT', etc.).

export type { LlmError, LlmEndpoint };

// ---------------------------------------------------------------------------
// Response Zod schema
// ---------------------------------------------------------------------------

const PartSchema = z.object({
  text: z.string().optional(),
}).passthrough();

const ContentSchema = z.object({
  parts: z.array(PartSchema).optional(),
  role: z.string().optional(),
}).passthrough();

const CandidateSchema = z.object({
  content: ContentSchema.optional(),
  finishReason: z.string().optional(),
}).passthrough();

const UsageSchema = z.object({
  promptTokenCount: z.number().int().nonnegative().default(0),
  candidatesTokenCount: z.number().int().nonnegative().default(0),
  totalTokenCount: z.number().int().nonnegative().optional(),
}).passthrough();

const GenerateContentResponseSchema = z.object({
  candidates: z.array(CandidateSchema).optional(),
  usageMetadata: UsageSchema.optional(),
  modelVersion: z.string().optional(),
  // Some error responses come 200 with this shape:
  promptFeedback: z
    .object({ blockReason: z.string().optional() })
    .passthrough()
    .optional(),
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 12_000;

export async function messages(args: MessagesArgs): Promise<MessagesResult> {
  if (!serverEnv.GEMINI_API_KEY) {
    throw new LlmError('AUTH', 'GEMINI_API_KEY not set in env.', null);
  }

  const model = args.model ?? serverEnv.GEMINI_MODEL_FLASH;
  const maxTokens = Math.min(args.maxTokens ?? 1024, 8192); // Gemini ceiling generous
  const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(serverEnv.GEMINI_API_KEY)}`;

  // We intentionally do NOT log the URL with key. Strip the query string
  // before any error message.
  const safeUrl = url.split('?')[0]!;

  const body = {
    systemInstruction: { parts: [{ text: args.system }] },
    contents: [{ role: 'user', parts: [{ text: args.user }] }],
    generationConfig: {
      maxOutputTokens: maxTokens,
      // Lower temperature for technical/code-style replies (summary JSON,
      // calc derivations). Chat callers can override via args if we add it
      // to MessagesArgs later.
      temperature: 0.4,
    },
  };

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'eencyclopedia/0.1 (server)',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err: unknown) {
    const code: LlmError['code'] =
      (err as { name?: string })?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK';
    const msg =
      code === 'TIMEOUT'
        ? `Request timed out after ${timeoutMs}ms`
        : `Network error contacting ${safeUrl}: ${(err as Error).message}`;
    await logFailure({
      endpoint: args.endpoint,
      model,
      schematicId: args.schematicId,
      code,
      message: msg,
      status: null,
    });
    throw new LlmError(code, msg, null);
  } finally {
    clearTimeout(t);
  }

  if (!res.ok) {
    const errBody = await safeText(res);
    let code: LlmError['code'];
    let msg: string;
    if (res.status === 401 || res.status === 403) {
      code = 'AUTH';
      msg = `Auth failed (${res.status}): ${truncate(errBody, 400)}`;
    } else if (res.status === 429) {
      code = 'RATE_LIMIT';
      msg = `Rate limited: ${truncate(errBody, 400)}`;
    } else if (res.status === 503) {
      code = 'OVERLOADED';
      msg = `Gemini overloaded: ${truncate(errBody, 400)}`;
    } else if (res.status >= 400 && res.status < 500) {
      code = 'INVALID_REQUEST';
      msg = `Bad request (${res.status}): ${truncate(errBody, 400)}`;
    } else {
      code = 'UPSTREAM';
      msg = `Upstream ${res.status}: ${truncate(errBody, 400)}`;
    }
    await logFailure({
      endpoint: args.endpoint,
      model,
      schematicId: args.schematicId,
      code,
      message: msg,
      status: res.status,
    });
    throw new LlmError(code, msg, res.status);
  }

  const json: unknown = await res.json();
  const parsed = GenerateContentResponseSchema.safeParse(json);
  if (!parsed.success) {
    const msg = `Unexpected Gemini response shape: ${parsed.error.issues.map((i) => i.message).join('; ')}`;
    await logFailure({
      endpoint: args.endpoint,
      model,
      schematicId: args.schematicId,
      code: 'UNKNOWN',
      message: msg,
      status: null,
    });
    throw new LlmError('UNKNOWN', msg, null);
  }

  // Safety / blocked-prompt path: Gemini returns 200 with promptFeedback set
  // and no candidates. Surface as INVALID_REQUEST so callers see the cause.
  const candidate = parsed.data.candidates?.[0];
  const blockReason = parsed.data.promptFeedback?.blockReason;
  if (!candidate || (blockReason && !candidate.content?.parts)) {
    const msg = blockReason
      ? `Gemini blocked the prompt: ${blockReason}`
      : 'Gemini returned no candidates.';
    await logFailure({
      endpoint: args.endpoint,
      model,
      schematicId: args.schematicId,
      code: 'INVALID_REQUEST',
      message: msg,
      status: null,
    });
    throw new LlmError('INVALID_REQUEST', msg, null);
  }

  const text = (candidate.content?.parts ?? [])
    .map((p) => (typeof p.text === 'string' ? p.text : ''))
    .join('');

  const tokensIn = parsed.data.usageMetadata?.promptTokenCount ?? 0;
  const tokensOut = parsed.data.usageMetadata?.candidatesTokenCount ?? 0;
  const reportedModel = parsed.data.modelVersion ?? model;
  const costUsd = costFor(reportedModel, tokensIn, tokensOut);

  const result: MessagesResult = {
    text,
    model: reportedModel,
    tokensIn,
    tokensOut,
    costUsd,
    cached: false,
    stopReason: candidate.finishReason ?? 'unknown',
  };

  // Telemetry — best effort.
  await logSuccess({
    endpoint: args.endpoint,
    model: reportedModel,
    tokensIn,
    tokensOut,
    costUsd,
    schematicId: args.schematicId,
  }).catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error('[gemini] failed to log ai_call:', (err as Error).message);
  });

  return result;
}

// ---------------------------------------------------------------------------
// Telemetry helpers — duplicate of anthropic.ts's logCall/logFailure but
// with provider='google'. The schema's check constraint accepts 'google'.
// ---------------------------------------------------------------------------

async function logFailure(args: {
  endpoint: LlmEndpoint;
  model: string;
  schematicId?: string;
  code: LlmError['code'];
  message: string;
  status: number | null;
}): Promise<void> {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('ai_calls').insert({
      user_id: user.id,
      endpoint: args.endpoint,
      provider: 'google',
      model: args.model,
      tokens_in: 0,
      tokens_out: 0,
      cost_usd: 0,
      cached: false,
      schematic_id: args.schematicId ?? null,
      request_meta: {
        ok: false,
        error_code: args.code,
        error_message: args.message.slice(0, 600),
        http_status: args.status,
      },
    } as never);
  } catch (err: unknown) {
    // eslint-disable-next-line no-console
    console.warn('[gemini] failed to log failure row:', (err as Error).message);
  }
}

async function logSuccess(args: {
  endpoint: LlmEndpoint;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  schematicId?: string;
}): Promise<void> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('ai_calls').insert({
    user_id: user.id,
    endpoint: args.endpoint,
    provider: 'google',
    model: args.model,
    tokens_in: args.tokensIn,
    tokens_out: args.tokensOut,
    cost_usd: args.costUsd,
    cached: false,
    schematic_id: args.schematicId ?? null,
    request_meta: { ok: true },
  } as never);
}

// ---------------------------------------------------------------------------
// Tiny helpers
// ---------------------------------------------------------------------------

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '<no body>';
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
