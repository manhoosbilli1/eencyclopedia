/**
 * Session-refresh middleware helper.
 *
 * Runs on the edge for every matched route. Two side-effects per request:
 *   1. Reads `sb-*-auth-token` cookie and silently refreshes the JWT if
 *      it's expiring. Without this, users get logged out after the JWT TTL
 *      (default 1h).
 *   2. Returns the validated user so the wrapping middleware can decide
 *      whether to redirect to /login for protected paths.
 *
 * The cookie-mutation pattern (set on `request` AND `response`) is taken
 * verbatim from the Supabase Next.js App Router guide; it's required so
 * RSCs downstream see the refreshed cookie within the same request.
 *
 * Refs:
 *   https://supabase.com/docs/guides/auth/server-side/nextjs?queryGroups=router&router=app
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';
import { publicEnv } from '@/lib/env';
import type { Database } from '@/lib/supabase/types';

export interface SessionResult {
  response: NextResponse;
  user: User | null;
}

export async function updateSession(request: NextRequest): Promise<SessionResult> {
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

  // getUser() validates the JWT against Supabase Auth — required for
  // server-side protection. Cheaper than getSession() which only decodes
  // locally.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}
