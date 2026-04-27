/**
 * Anthropic per-model pricing (USD / million tokens). Values must be kept in
 * sync with https://www.anthropic.com/pricing.
 *
 * Why a hard-coded table instead of fetching from the API:
 *   - The Messages API does NOT return cost — only token counts. Cost is a
 *     client-side projection.
 *   - We bill our users based on these numbers + a small margin, so changes
 *     are reviewed (PR + audit log) rather than auto-pulled.
 *
 * If a model isn't in this table, `costFor(...)` falls back to the most
 * expensive entry to fail safely (over-estimate) rather than silently bill
 * zero.
 */

export interface ModelPrice {
  /** USD per 1M input tokens */
  inUsdPerM: number;
  /** USD per 1M output tokens */
  outUsdPerM: number;
}

/**
 * Reference prices as of early 2026. Update when providers re-price.
 * Slugs aligned with `lib/env.ts` (ANTHROPIC_MODEL_*, GEMINI_MODEL_*).
 */
export const ANTHROPIC_PRICING: Record<string, ModelPrice> = {
  // Claude Sonnet 4 family
  'claude-sonnet-4-5': { inUsdPerM: 3.0, outUsdPerM: 15.0 },
  'claude-sonnet-4-6': { inUsdPerM: 3.0, outUsdPerM: 15.0 },
  // Claude Haiku 4 family
  'claude-haiku-4-5-20251001': { inUsdPerM: 1.0, outUsdPerM: 5.0 },
  // Claude Opus 4 family
  'claude-opus-4-5': { inUsdPerM: 15.0, outUsdPerM: 75.0 },
  'claude-opus-4-6': { inUsdPerM: 15.0, outUsdPerM: 75.0 },
  // Older slugs that production code may still see — included for safety.
  'claude-3-5-sonnet-20241022': { inUsdPerM: 3.0, outUsdPerM: 15.0 },
  'claude-3-5-haiku-20241022': { inUsdPerM: 0.8, outUsdPerM: 4.0 },
  'claude-3-opus-20240229': { inUsdPerM: 15.0, outUsdPerM: 75.0 },
};

/**
 * Google Gemini per-model pricing (USD / million tokens).
 * Source: https://ai.google.dev/gemini-api/docs/pricing — Q1 2026 rates.
 *
 * Note: Google's pricing has tier breakpoints (≤200k tokens vs >200k).
 * For V0 we use the lower-tier rate since our prompts never exceed 200k.
 * If we ever ship long-context summaries (>200k inputs) we'll need a
 * dispatch on prompt length.
 */
export const GEMINI_PRICING: Record<string, ModelPrice> = {
  // 2.5 family
  'gemini-2.5-flash': { inUsdPerM: 0.3, outUsdPerM: 2.5 },
  'gemini-2.5-flash-lite': { inUsdPerM: 0.1, outUsdPerM: 0.4 },
  'gemini-2.5-pro': { inUsdPerM: 1.25, outUsdPerM: 10.0 },
  // 2.0 family — older but still listed
  'gemini-2.0-flash': { inUsdPerM: 0.1, outUsdPerM: 0.4 },
  'gemini-2.0-flash-lite': { inUsdPerM: 0.075, outUsdPerM: 0.3 },
  // 1.5 — kept for slugs that may surface from older configs
  'gemini-1.5-pro': { inUsdPerM: 1.25, outUsdPerM: 5.0 },
  'gemini-1.5-flash': { inUsdPerM: 0.075, outUsdPerM: 0.3 },
};

/**
 * Compute USD cost from token counts. Provider is auto-detected from the
 * model slug prefix. If the model isn't in either table, fall back to the
 * most expensive entry (Anthropic Opus pricing) so under-billing is
 * impossible.
 */
export function costFor(model: string, tokensIn: number, tokensOut: number): number {
  const price =
    ANTHROPIC_PRICING[model] ??
    GEMINI_PRICING[model] ??
    ANTHROPIC_PRICING['claude-opus-4-6']!;
  const inCost = (tokensIn / 1_000_000) * price.inUsdPerM;
  const outCost = (tokensOut / 1_000_000) * price.outUsdPerM;
  // Round to 6 decimal places — schema column is numeric(10,6).
  return Math.round((inCost + outCost) * 1_000_000) / 1_000_000;
}
