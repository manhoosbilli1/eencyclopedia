/**
 * Admin Supabase client — bypasses RLS via the service-role key.
 *
 * USE WITH EXTREME CARE. This client is for:
 *   - background jobs / cron tasks
 *   - webhook handlers (Stripe, Inngest)
 *   - privileged migrations from inside an Edge Function or Route Handler
 *
 * It MUST NOT be created in any code path that returns data directly to the
 * caller without manual authorisation checks.
 *
 * Refs:
 *   https://supabase.com/docs/reference/javascript/initializing
 *   https://supabase.com/docs/guides/api/securing-your-api  (RLS bypass)
 */

import { createClient } from '@supabase/supabase-js';
import { publicEnv, serverEnv, assertServer } from '@/lib/env';
import type { Database } from '@/lib/supabase/types';

let cached: ReturnType<typeof createClient<Database>> | null = null;

export function getSupabaseAdmin() {
  assertServer('getSupabaseAdmin');
  if (cached) return cached;

  cached = createClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        // Admin client never uses the user's session — no cookies, no refresh.
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: { 'x-eencyc-admin': '1' },
      },
    },
  );
  return cached;
}
