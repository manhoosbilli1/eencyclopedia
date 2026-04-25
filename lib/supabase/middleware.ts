/**
 * Session-refresh middleware helper.
 *
 * Runs on the edge for every matched route — it reads the user's auth cookie
 * and silently refreshes the access token if it's expiring. Without this,
 * users get logged out after the JWT TTL (1h by default).
 *
 * The pattern is taken verbatim from the Supabase Next.js App Router guide;
 * mutating cookies on both `request` and `response` is required so RSCs
 * downstream see the new cookie value within the same request.
 *
 * Refs:
 *   https://supabase.com/docs/guides/auth/server-side/nextjs?queryGroups=router&router=app
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { publicEnv } from '@/lib/env';
import type { Database } from '@/lib/supabase/types';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: '', ...options });
        },
      },
    },
  );

  // Touch getUser() so the SDK refreshes the JWT if it's near expiry.
  // The result is discarded — we only care about the side-effect.
  await supabase.auth.getUser();

  return response;
}
