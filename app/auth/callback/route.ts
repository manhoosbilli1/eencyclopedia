/**
 * /auth/callback — magic-link landing page.
 *
 * Supabase magic links arrive as `?code=...`. We swap the code for a session
 * (PKCE: the verifier is in the cookie set by signInWithOtp) and redirect.
 *
 * Routing decisions:
 *   - No code, error, or session exchange failure → /auth/auth-error
 *   - Placeholder username (fresh signup) → /onboarding
 *   - Otherwise → `next` query param if safe, else /
 *
 * Refs:
 *   https://supabase.com/docs/guides/auth/server-side/nextjs?queryGroups=router&router=app
 *   https://supabase.com/docs/reference/javascript/auth-exchangecodeforsession
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isPlaceholderUsername } from '@/lib/auth/username';
import { publicEnv } from '@/lib/env';

/**
 * Validate the `next` redirect target so an attacker can't craft
 * /auth/callback?code=...&next=https://evil.com to phish via our domain.
 * Only allow same-origin paths starting with `/`.
 */
function safeNextPath(next: string | null): string | null {
  if (!next) return null;
  if (!next.startsWith('/') || next.startsWith('//')) return null;
  // Don't bounce back to auth routes — would create loops.
  if (next.startsWith('/auth/') || next === '/login') return null;
  return next;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const errorDesc = url.searchParams.get('error_description');
  const next = safeNextPath(url.searchParams.get('next'));

  const origin = publicEnv.NEXT_PUBLIC_SITE_URL;

  if (errorDesc || !code) {
    const errUrl = new URL('/auth/auth-error', origin);
    if (errorDesc) errUrl.searchParams.set('reason', errorDesc);
    return NextResponse.redirect(errUrl);
  }

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[auth/callback] exchangeCodeForSession failed:', error.message);
    const errUrl = new URL('/auth/auth-error', origin);
    errUrl.searchParams.set('reason', error.message);
    return NextResponse.redirect(errUrl);
  }

  // Decide where to send them. Fresh signups have placeholder usernames.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL('/auth/auth-error?reason=no_session', origin));
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .single();

  const placeholder =
    typeof profile?.username === 'string' && isPlaceholderUsername(profile.username);

  const target = placeholder ? '/onboarding' : (next ?? '/');
  return NextResponse.redirect(new URL(target, origin));
}
