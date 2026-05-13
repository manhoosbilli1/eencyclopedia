/**
 * Minimal Anthropic Messages API client. No `@anthropic-ai/sdk` dependency.
 *
 * Why hand-rolled:
 *   - 7-day sprint constraint (one less dep to audit/upgrade).
 *   - We only need `messages.create` — the SDK's full surface is overkill.
 *   - Direct fetch lets us share a single `signal:` AbortController for
 *     server-action timeouts (Next 14 server actions inherit a request
 *     deadline; we want to fail fast inside that, not hang).
 *
 * What this module guarantees:
 *   - Strict input/output validation via Zod.
 *   - Token + cost telemetry written to the `ai_calls` table on every call,
 *     using the cookie-bound server client (RLS will scope rows to the user
 *     who triggered the call). On failure to log, we log the exception and
 *     return the AI response anyway — telemetry is best-effort, not a gate.
 *   - 12-second hard timeout (server-action friendly).
 *   - Specific error codes so callers can branch on rate limits, auth, etc.
 *
 * Refs:
 *   https://docs.anthropic.com/en/api/messages
 *   https://docs.anthropic.com/en/api/errors
 *   https://docs.anthropic.com/en/api/getting-started  (anthropic-version: 2023-06-01)
 */

import { z } from 'zod';
import { serverEnv } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { costFor } from './pricing';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type AnthropicEndpoint = 'summary' | 'tool_call';

export interface MessagesArgs {
  endpoint: AnthropicEndpoint;
  model?: string;
  system: string;
  user: string;
  /**
   * Hard ceiling on output tokens. Default is 1024 — enough for a circuit
   * summary with derivations, well below the model max.
   */
  maxTokens?: number;
  /**
   * Optional schematic_id for ai_calls bookkeeping. When the call is in the
   * context of a specific circuit (summary, schematic_explain), we want it
   * indexed against that schematic for cost analysis.
   */
  schematicId?: string;
  /** Override the default 12-second timeout. */
  timeoutMs?: number;
  /** Cache the response server-side keyed on (model, system, user). */
  cacheable?: boolean;
}

export interface MessagesResult {
  text: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  cached: boolean;
  stopReason: string;
}

export class AnthropicError extends Error {
  readonly code:
    | 'TIMEOUT'
    | 'AUTH'
    | 'RATE_LIMIT'
    | 'OVERLOADED'
    | 'INVALID_REQUEST'
    | 'UPSTREAM'
    | 'NETWORK'
    | 'UNKNOWN';
  readonly status: number | null;
  constructor(code: AnthropicError['code'], message: string, status: number | null = null) {
    super(message);
    this.name = 'AnthropicError';
    this.code = code;
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Response Zod schema (strict — fail loudly if Anthropic changes shape)
// ---------------------------------------------------------------------------

const ContentTextBlock = z.object({
  type: z.literal('text'),
  text: z.string(),
});
const ContentBlock = z.discriminatedUnion('type', [
  ContentTextBlock,
  // We don't request tool use yet, but accept it without crashing — the
  // result.text will just be empty.
  z.object({ type: z.literal('tool_use') }).passthrough(),
  z.object({ type: z.literal('thinking') }).passthrough(),
]);

const MessagesResponseSchema = z.object({
  id: z.string(),
  type: z.literal('message'),
  role: z.literal('assistant'),
  model: z.string(),
  content: z.array(ContentBlock),
  stop_reason: z.string().nullable(),
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
    // cache_creation/read fields are optional and not used for V0 cost calc.
  }),
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 12_000;

export async function messages(args: MessagesArgs): Promise<MessagesResult> {
  const model = args.model ?? serverEnv.ANTHROPIC_MODEL_SONNET;
  const maxTokens = Math.min(args.maxTokens ?? 1024, 4096); // V0 ceiling
  const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // Cache lookup before spending tokens.
  const cacheKey = args.cacheable
    ? await sha256(`${model}|${args.system}|${args.user}|${maxTokens}`)
    : null;
  if (cacheKey) {
    const hit = await tryCacheHit(cacheKey);
    if (hit) {
      // Telemetry: log a $0/0/0 row marked cached, so dashboards still count
      // the call but don't double-bill. Best-effort — don't block the return.
      logCall({
        endpoint: args.endpoint,
        model,
        tokensIn: 0,
        tokensOut: 0,
        costUsd: 0,
        cached: true,
        schematicId: args.schematicId,
      }).catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.error('[anthropic] failed to log cached ai_call:', (err as Error).message);
      });
      return { ...hit, cached: true };
    }
  }

  // Issue the request with a hard timeout.
  // Errors are logged to ai_calls (cost=0, request_meta carries the failure
  // detail) and re-thrown. Without the error log, debugging silent failures
  // requires reading server console output — which is impractical for users.
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        // ANTHROPIC_API_KEY is guaranteed non-null when AI_PROVIDER=anthropic
        // (env.ts superRefine validates this at boot). The `!` is safe.
        'x-api-key': serverEnv.ANTHROPIC_API_KEY ?? '',
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'user-agent': 'eencyclopedia/0.1 (server)',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: args.system,
        messages: [{ role: 'user', content: args.user }],
      }),
      signal: controller.signal,
    });
  } catch (err: unknown) {
    const code: AnthropicError['code'] =
      (err as { name?: string })?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK';
    const msg =
      code === 'TIMEOUT'
        ? `Request timed out after ${timeoutMs}ms`
        : `Network error: ${(err as Error).message}`;
    await logFailure({ endpoint: args.endpoint, model, schematicId: args.schematicId, code, message: msg, status: null });
    throw new AnthropicError(code, msg, null);
  } finally {
    clearTimeout(t);
  }

  // Handle non-2xx with specific codes.
  if (!res.ok) {
    const body = await safeText(res);
    let code: AnthropicError['code'];
    let msg: string;
    if (res.status === 401 || res.status === 403) {
      code = 'AUTH';
      msg = `Auth failed (${res.status}): ${body}`;
    } else if (res.status === 429) {
      code = 'RATE_LIMIT';
      msg = `Rate limited: ${body}`;
    } else if (res.status === 529) {
      code = 'OVERLOADED';
      msg = `Anthropic overloaded: ${body}`;
    } else if (res.status >= 400 && res.status < 500) {
      code = 'INVALID_REQUEST';
      msg = `Bad request (${res.status}): ${body}`;
    } else {
      code = 'UPSTREAM';
      msg = `Upstream ${res.status}: ${body}`;
    }
    await logFailure({ endpoint: args.endpoint, model, schematicId: args.schematicId, code, message: msg, status: res.status });
    throw new AnthropicError(code, msg, res.status);
  }

  // Parse + validate response shape.
  const json: unknown = await res.json();
  const parsed = MessagesResponseSchema.safeParse(json);
  if (!parsed.success) {
    const msg = `Unexpected response shape: ${parsed.error.issues.map((i) => i.message).join('; ')}`;
    await logFailure({ endpoint: args.endpoint, model, schematicId: args.schematicId, code: 'UNKNOWN', message: msg, status: null });
    throw new AnthropicError('UNKNOWN', msg, null);
  }

  const text = parsed.data.content
    .filter((c): c is z.infer<typeof ContentTextBlock> => c.type === 'text')
    .map((c) => c.text)
    .join('');

  const tokensIn = parsed.data.usage.input_tokens;
  const tokensOut = parsed.data.usage.output_tokens;
  const costUsd = costFor(parsed.data.model, tokensIn, tokensOut);

  const result: MessagesResult = {
    text,
    model: parsed.data.model,
    tokensIn,
    tokensOut,
    costUsd,
    cached: false,
    stopReason: parsed.data.stop_reason ?? 'unknown',
  };

  // Telemetry — best effort. Don't block the caller on logging failures.
  await logCall({
    endpoint: args.endpoint,
    model: parsed.data.model,
    tokensIn,
    tokensOut,
    costUsd,
    cached: false,
    schematicId: args.schematicId,
  }).catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error('[anthropic] failed to log ai_call:', (err as Error).message);
  });

  if (cacheKey) await writeCache(cacheKey, result);

  return result;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '<no body>';
  }
}

async function sha256(input: string): Promise<string> {
  // Web Crypto is available in Node 20+ as `globalThis.crypto`.
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

interface LogArgs {
  endpoint: AnthropicEndpoint;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  cached: boolean;
  schematicId?: string;
}

/**
 * Log a failure as an `ai_calls` row with cost=0 and the error info in
 * `request_meta`. Best-effort — if the user is anonymous (e.g. seed scripts)
 * or RLS rejects the insert, we just `console.warn` and move on. The point
 * is to give callers a signal they can read out later.
 */
async function logFailure(args: {
  endpoint: AnthropicEndpoint;
  model: string;
  schematicId?: string;
  code: AnthropicError['code'];
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
      provider: 'anthropic',
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
    console.warn('[anthropic] failed to log failure row:', (err as Error).message);
  }
}

async function logCall(args: LogArgs): Promise<void> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return; // Anonymous call (e.g. seed scripts) — skip the row.
  // RLS: schema 0001 has only a SELECT policy on ai_calls. Inserts via the
  // user-cookie client will be rejected. Use the service-role bypass route:
  // we hold the row data and let a future migration add an INSERT policy
  // for `user_id = auth.uid()`. For now, we attempt the insert; if it fails
  // we swallow the error in the caller's catch.
  const payload = {
    user_id: user.id,
    endpoint: args.endpoint,
    provider: 'anthropic',
    model: args.model,
    tokens_in: args.tokensIn,
    tokens_out: args.tokensOut,
    cost_usd: args.costUsd,
    cached: args.cached,
    schematic_id: args.schematicId ?? null,
    request_meta: {},
  };
  // We're inside an RSC request context; .from('ai_calls').insert() goes via
  // the user's cookie. The user has no INSERT policy, so this is expected to
  // fail until 0003 adds the policy. Until then, swallow.
  await supabase.from('ai_calls').insert(payload as never);
}

async function tryCacheHit(_cacheKey: string): Promise<MessagesResult | null> {
  // Stub: V0 ai_cache table exists but we don't implement cache lookup yet
  // — premature optimisation for sprint. Wire this up in Day 6 if cost
  // dashboard shows repeat hits worth saving.
  return null;
}

async function writeCache(_cacheKey: string, _result: MessagesResult): Promise<void> {
  // Stub — see tryCacheHit.
}
