/**
 * Root Next.js middleware.
 *
 * Two jobs:
 *   1. Refresh Supabase auth tokens on each request (so users stay logged in
 *      past the 1h JWT TTL).
 *   2. Gate protected paths — redirect anonymous users to /login.
 *
 * The matcher excludes static assets, favicon, and image extensions so we
 * don't waste edge invocations. /api/* IS included so authenticated API
 * routes see fresh cookies.
 *
 * Why JWT validation in middleware: getUser() round-trips to Supabase Auth.
 * That's ~10–50ms per request. For V0 closed-beta traffic this is fine.
 * If/when latency matters, swap to a "is the cookie present?" cheap check
 * here and validate inside route handlers.
 *
 * Refs:
 *   https://nextjs.org/docs/app/building-your-application/routing/middleware
 *   https://supabase.com/docs/guides/auth/server-side/nextjs
 */

import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * Paths that require auth. Each entry is matched as a prefix (so /circuit
 * also covers /circuit/abc-123). /onboarding is also protected — anonymous
 * users get bounced.
 */
const PROTECTED_PREFIXES = [
  '/library',
  '/circuit',
  '/chat',
  // /calc is intentionally PUBLIC — calculators are useful for visitors
  // before they decide to sign in. No DB writes happen there; pure JS.
  '/favorites',
  '/onboarding',
  // /admin/* is gated here for cookie auth; on top of that, each admin
  // page does its own ADMIN_EMAILS check (see app/admin/seed/page.tsx)
  // and 404s non-admins to avoid disclosing the surface.
  '/admin',
];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);

  if (!user && isProtected(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return response;
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
