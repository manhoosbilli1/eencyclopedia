/**
 * Root Next.js middleware.
 *
 * Sole job in V0: refresh Supabase auth tokens on each request so users stay
 * logged in past the 1h JWT TTL. Anything fancier (rate limiting, geo, A/B)
 * goes through Upstash from inside Route Handlers, not here — middleware
 * runs on the edge and we want it cheap.
 *
 * The matcher excludes static assets and the favicon to avoid wasted edge
 * invocations. /api/* is INCLUDED so authenticated API routes see fresh
 * cookies.
 *
 * Refs:
 *   https://nextjs.org/docs/app/building-your-application/routing/middleware
 *   https://supabase.com/docs/guides/auth/server-side/nextjs?queryGroups=router&router=app
 */

import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match every path EXCEPT:
     *  - _next/static (static assets)
     *  - _next/image  (image optimisation)
     *  - favicon.ico, robots.txt, sitemap.xml
     *  - common image extensions (no auth needed for static media)
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
