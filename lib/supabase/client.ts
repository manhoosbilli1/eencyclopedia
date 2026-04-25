/**
 * Browser Supabase client — used inside Client Components.
 *
 * - Uses the anon key only. Never imports SUPABASE_SERVICE_ROLE_KEY.
 * - Returns a fresh client per call (cheap; the auth cookie is read from
 *   document.cookie via @supabase/ssr's storage adapter).
 *
 * Refs:
 *   https://supabase.com/docs/guides/auth/server-side/nextjs
 *   https://supabase.com/docs/reference/javascript/initializing
 */

import { createBrowserClient } from '@supabase/ssr';
import { publicEnv } from '@/lib/env';
import type { Database } from '@/lib/supabase/types';

export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
