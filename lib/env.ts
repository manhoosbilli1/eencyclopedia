/**
 * Centralised, fail-fast env loader.
 *
 * Why this file exists:
 *   - Next.js exposes process.env directly, but typos/missing-vars cause silent
 *     runtime errors that are painful to debug. Zod validates everything once
 *     at boot.
 *   - We split SERVER vs PUBLIC so we never accidentally leak a server-only
 *     key into the browser bundle. Anything not prefixed `NEXT_PUBLIC_` will
 *     be tree-shaken out of client code by Next; `serverEnv` access from a
 *     'use client' boundary is a static error if you import this module.
 *   - All callers must `import { serverEnv, publicEnv } from '@/lib/env'`.
 *     Never read `process.env.X` directly in app code — search-and-fix
 *     anywhere it appears.
 *
 * Refs:
 *   https://nextjs.org/docs/app/building-your-application/configuring/environment-variables
 *   https://zod.dev/?id=strings  (URL/UUID/min validators)
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Helpers — `dotenv` returns "" for `KEY=` (empty value). `.optional()` only
// catches *missing* keys, not empty strings, so `z.string().url().optional()`
// blows up on `NEXT_PUBLIC_SENTRY_DSN=`. Same with placeholder strings like
// `<DB-PASSWORD>`. Coerce both to undefined before validating.
// ---------------------------------------------------------------------------
const isPlaceholder = (v: unknown): boolean =>
  typeof v === 'string' && (v.trim() === '' || /<[A-Z0-9_-]+>/i.test(v));

const optionalUrl = () =>
  z.preprocess((v) => (isPlaceholder(v) ? undefined : v), z.string().url().optional());

const optionalString = () =>
  z.preprocess((v) => (isPlaceholder(v) ? undefined : v), z.string().min(1).optional());

// ---------------------------------------------------------------------------
// Public env — exposed to the browser. Must be prefixed NEXT_PUBLIC_.
// ---------------------------------------------------------------------------
const PublicEnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  NEXT_PUBLIC_POSTHOG_KEY: optionalString(),
  NEXT_PUBLIC_POSTHOG_HOST: optionalUrl(),
  NEXT_PUBLIC_SENTRY_DSN: optionalUrl(),
  NEXT_PUBLIC_FEATURE_BILLING: z.coerce.boolean().default(false),
  NEXT_PUBLIC_FEATURE_SPICE_WASM: z.coerce.boolean().default(false),
  NEXT_PUBLIC_FEATURE_DISTRIBUTOR_PRICING: z.coerce.boolean().default(false),
  NEXT_PUBLIC_FEATURE_FORUM: z.coerce.boolean().default(false),
});

// ---------------------------------------------------------------------------
// Server env — never imported from a 'use client' boundary.
// ---------------------------------------------------------------------------
const ServerEnvSchema = z.object({
  // Runtime
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Supabase (server-only privileged surface)
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  SUPABASE_PROJECT_REF: optionalString(),
  SUPABASE_DB_URL: optionalUrl(),

  // AI provider switch — 'anthropic' or 'gemini'. The selected provider's
  // key MUST be present, validated via .superRefine() at the end of the
  // schema below.
  AI_PROVIDER: z.enum(['anthropic', 'gemini']).default('anthropic'),

  // Anthropic (optional unless AI_PROVIDER=anthropic)
  ANTHROPIC_API_KEY: optionalString(),
  ANTHROPIC_MODEL_SONNET: z.string().default('claude-sonnet-4-6'),
  ANTHROPIC_MODEL_HAIKU: z.string().default('claude-haiku-4-5-20251001'),
  ANTHROPIC_MODEL_OPUS: z.string().default('claude-opus-4-6'),

  // Google Gemini (optional unless AI_PROVIDER=gemini)
  // Slug naming aligns with our `category → model class` map in the router:
  //   FLASH = main 'sonnet-class' — chat / summary / schematic_explain
  //   PRO   = 'opus-class' — deep_analysis / opus_required
  //   FAST  = 'haiku-class' — router classification, calc-tool extraction
  GEMINI_API_KEY: optionalString(),
  GEMINI_MODEL_FLASH: z.string().default('gemini-2.5-flash'),
  GEMINI_MODEL_PRO: z.string().default('gemini-2.5-pro'),
  GEMINI_MODEL_FAST: z.string().default('gemini-2.0-flash-lite'),

  // OpenAI fallback (optional V0)
  OPENAI_API_KEY: optionalString(),

  // Voyage embeddings
  VOYAGE_API_KEY: z.string().min(20),
  VOYAGE_MODEL: z.string().default('voyage-3'),
  VOYAGE_EMBED_DIM: z.coerce.number().int().positive().default(1024),

  // Stripe (V1 — gated by feature flag)
  STRIPE_SECRET_KEY: optionalString(),
  STRIPE_WEBHOOK_SECRET: optionalString(),
  STRIPE_PRICE_PRO: optionalString(),
  STRIPE_PRICE_PRO_PLUS: optionalString(),

  // Upstash rate limiting
  UPSTASH_REDIS_REST_URL: optionalUrl(),
  UPSTASH_REDIS_REST_TOKEN: optionalString(),

  // Observability (optional)
  SENTRY_AUTH_TOKEN: optionalString(),

  // PostHog Flags SDK (server-side feature flags)
  POSTHOG_PERSONAL_API_KEY: optionalString(),
  FLAGS_SECRET: optionalString(),
  LANGFUSE_PUBLIC_KEY: optionalString(),
  LANGFUSE_SECRET_KEY: optionalString(),
  LANGFUSE_HOST: optionalUrl(),

  // Email
  RESEND_API_KEY: optionalString(),

  // Distributors (V1)
  MOUSER_API_KEY: optionalString(),
  DIGIKEY_CLIENT_ID: optionalString(),
  DIGIKEY_CLIENT_SECRET: optionalString(),
  OCTOPART_API_KEY: optionalString(),
  LCSC_USER_AGENT: z
    .string()
    .default('eencyclopedia/0.1 (+https://eencyclopedia.com; contact@eencyclopedia.com)'),

  // AI daily $ caps (USD)
  AI_DAILY_CAP_FREE: z.coerce.number().nonnegative().default(0.5),
  AI_DAILY_CAP_PRO: z.coerce.number().nonnegative().default(2),
  AI_DAILY_CAP_PRO_PLUS: z.coerce.number().nonnegative().default(10),

  // Admin
  ADMIN_EMAILS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ),
}).superRefine((env, ctx) => {
  // Cross-field: the selected AI provider's API key must be present.
  // We do this in superRefine because base zod can't reference one field
  // from another's validator.
  if (env.AI_PROVIDER === 'anthropic' && !env.ANTHROPIC_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ANTHROPIC_API_KEY'],
      message: 'AI_PROVIDER=anthropic requires ANTHROPIC_API_KEY to be set.',
    });
  }
  if (env.AI_PROVIDER === 'gemini' && !env.GEMINI_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['GEMINI_API_KEY'],
      message: 'AI_PROVIDER=gemini requires GEMINI_API_KEY to be set.',
    });
  }
});

// ---------------------------------------------------------------------------
// Parsing — fail loudly at boot, not silently mid-request.
// ---------------------------------------------------------------------------
function parse<T extends z.ZodTypeAny>(schema: T, raw: NodeJS.ProcessEnv, label: string) {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('\n');
    // eslint-disable-next-line no-console
    console.error(`[env] Invalid ${label} environment:\n${issues}`);
    throw new Error(`Invalid ${label} environment. See logs for details.`);
  }
  return result.data as z.infer<T>;
}

// In the browser bundle, only NEXT_PUBLIC_* is defined. Next inlines them
// statically, so we read them via property access (not a dynamic loop).
const rawPublic = {
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
  NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  NEXT_PUBLIC_FEATURE_BILLING: process.env.NEXT_PUBLIC_FEATURE_BILLING,
  NEXT_PUBLIC_FEATURE_SPICE_WASM: process.env.NEXT_PUBLIC_FEATURE_SPICE_WASM,
  NEXT_PUBLIC_FEATURE_DISTRIBUTOR_PRICING: process.env.NEXT_PUBLIC_FEATURE_DISTRIBUTOR_PRICING,
  NEXT_PUBLIC_FEATURE_FORUM: process.env.NEXT_PUBLIC_FEATURE_FORUM,
} as unknown as NodeJS.ProcessEnv;

export const publicEnv = parse(PublicEnvSchema, rawPublic, 'public');
export type PublicEnv = typeof publicEnv;

// `serverEnv` is *only* parsed when this module loads on the server.
// `typeof window === 'undefined'` is the canonical Next.js server-detect.
export const serverEnv =
  typeof window === 'undefined'
    ? parse(ServerEnvSchema, process.env, 'server')
    : (undefined as unknown as z.infer<typeof ServerEnvSchema>);

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

/**
 * Hard guard for code paths that MUST run server-side.
 * Throws synchronously if accidentally invoked on the client (e.g. during
 * a misconfigured RSC/Client Component boundary).
 */
export function assertServer(context: string): void {
  if (typeof window !== 'undefined') {
    throw new Error(`[env] ${context} must not run on the client.`);
  }
}
