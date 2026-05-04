/**
 * PostHog feature flags via the Vercel Flags SDK.
 *
 * The `identify` function resolves the PostHog `distinctId` from the current
 * Supabase session so flags are evaluated per-user (not per-anonymous visitor).
 *
 * Usage in any Server Component or Route Handler:
 *   import { myFlag } from '@/flags'
 *   const enabled = await myFlag()
 *
 * Create / toggle flags in PostHog → Feature Flags.
 * Required env vars:
 *   POSTHOG_PERSONAL_API_KEY  — PostHog personal API key (Settings → Personal API keys)
 *   NEXT_PUBLIC_POSTHOG_KEY   — Project API key (phc_...)
 *   NEXT_PUBLIC_POSTHOG_HOST  — e.g. https://eu.i.posthog.com
 *   FLAGS_SECRET              — 32-byte hex string, generate with: openssl rand -hex 16
 */

import { postHogAdapter } from '@flags-sdk/posthog';
import { flag, dedupe } from 'flags/next';

export const identify = dedupe(async () => {
  try {
    const { createSupabaseServerClient } = await import('@/lib/supabase/server');
    const supabase = createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    return { distinctId: user?.id ?? 'anonymous' };
  } catch {
    return { distinctId: 'anonymous' };
  }
});

// ---------------------------------------------------------------------------
// Feature flags — add more here as you create them in PostHog.
// Each key must match exactly the flag key in PostHog.
// ---------------------------------------------------------------------------

/** Kill-switch for the ngspice DC simulator panel. */
export const simPanelFlag = flag<boolean>({
  key: 'sim-panel',
  adapter: postHogAdapter.isFeatureEnabled(),
  identify,
  defaultValue: false,
});

/** Show the experimental SymbolRenderer instead of the glyph renderer. */
export const symbolRendererFlag = flag<boolean>({
  key: 'symbol-renderer',
  adapter: postHogAdapter.isFeatureEnabled(),
  identify,
  defaultValue: false,
});

/** Enable the distributor pricing BOM panel (V1). */
export const bomPricingFlag = flag<boolean>({
  key: 'bom-pricing',
  adapter: postHogAdapter.isFeatureEnabled(),
  identify,
  defaultValue: true,
});
