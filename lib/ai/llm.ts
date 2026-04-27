/**
 * Provider-agnostic LLM entry point.
 *
 * Callers import `messages` from this module instead of from
 * `lib/ai/anthropic` or `lib/ai/gemini` directly. The active provider is
 * controlled by `AI_PROVIDER` in `.env.local` and validated at boot in
 * `lib/env.ts` (the matching API key must be present).
 *
 * The two providers share a contract:
 *   - Same `MessagesArgs` / `MessagesResult` types (re-exported here).
 *   - Same `LlmError` shape with codes: AUTH | RATE_LIMIT | OVERLOADED |
 *     TIMEOUT | NETWORK | INVALID_REQUEST | UPSTREAM | UNKNOWN.
 *   - Both write to `ai_calls` (provider='anthropic' or 'google') on
 *     success AND failure for end-to-end observability.
 *
 * Model slug mapping for the chat router:
 *   category → 'haiku' | 'sonnet' | 'opus' (model class label)
 *   class    → actual provider-specific slug
 *
 *     class  | anthropic                       | gemini
 *     -------|---------------------------------|--------------------
 *     haiku  | ANTHROPIC_MODEL_HAIKU           | GEMINI_MODEL_FAST
 *     sonnet | ANTHROPIC_MODEL_SONNET          | GEMINI_MODEL_FLASH
 *     opus   | ANTHROPIC_MODEL_OPUS            | GEMINI_MODEL_PRO
 *
 * Use `resolveModelSlug(class)` from this module to pick the right slug
 * regardless of provider.
 */

import { serverEnv } from '@/lib/env';
import {
  AnthropicError as LlmError,
  type MessagesArgs,
  type MessagesResult,
  type AnthropicEndpoint as LlmEndpoint,
} from './anthropic';

export type { MessagesArgs, MessagesResult, LlmEndpoint };
export { LlmError };

/** 'sonnet-class' is the workhorse, 'haiku-class' is router/calc, 'opus-class' is deep. */
export type ModelClass = 'haiku' | 'sonnet' | 'opus';

/**
 * Pick the active provider's model slug for a given model class.
 * Defaults to sonnet-class if nothing is passed.
 */
export function resolveModelSlug(modelClass: ModelClass = 'sonnet'): string {
  if (serverEnv.AI_PROVIDER === 'gemini') {
    if (modelClass === 'haiku') return serverEnv.GEMINI_MODEL_FAST;
    if (modelClass === 'opus') return serverEnv.GEMINI_MODEL_PRO;
    return serverEnv.GEMINI_MODEL_FLASH;
  }
  // anthropic
  if (modelClass === 'haiku') return serverEnv.ANTHROPIC_MODEL_HAIKU;
  if (modelClass === 'opus') return serverEnv.ANTHROPIC_MODEL_OPUS;
  return serverEnv.ANTHROPIC_MODEL_SONNET;
}

/**
 * Provider-dispatching messages() entry point. Lazy-imports the provider
 * module so we never bundle the unused one in the wrong runtime.
 */
export async function messages(args: MessagesArgs): Promise<MessagesResult> {
  if (serverEnv.AI_PROVIDER === 'gemini') {
    const mod = await import('./gemini');
    return mod.messages(args);
  }
  const mod = await import('./anthropic');
  return mod.messages(args);
}
