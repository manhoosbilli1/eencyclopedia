/**
 * Server Supabase client — used in Server Components, Route Handlers, and
 * Server Actions. Reads/writes the Supabase auth cookie via Next's cookies()
 * store so RLS can identify the user.
 *
 * IMPORTANT: This client must be created PER REQUEST. Do not memoise it
 * across requests — the cookie store is request-scoped.
 *
 * Refs:
 *   https://supabase.com/docs/guides/auth/server-side/nextjs?queryGroups=router&router=app
 */

import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { publicEnv, assertServer } from '@/lib/env';
import type { Database } from '@/lib/supabase/types';

export function createSupabaseServerClient() {
  assertServer('createSupabaseServerClient');
  const cookieStore = cookies();

  return createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        // Note: in pure RSC reads, Next forbids cookie mutation and these
        // setters will throw. The session-refresh path runs in middleware
        // (where mutation is allowed); RSCs only read. We swallow the
        // expected throw so RSC reads don't crash, per Supabase docs.
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            /* RSC read context — refresh handled in middleware */
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {
            /* RSC read context — refresh handled in middleware */
          }
        },
      },
    },
  );
}
