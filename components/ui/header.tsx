/**
 * Site header — server component, reads the current user once per request and
 * renders the design-system chrome from Claude_Design/.
 *
 * Markup mirrors the .header / .header-inner / .brand / .pill / .nav classes
 * in app/globals.css. Sticky, blurred backdrop, pulsing closed-beta dot.
 *
 * Refs:
 *   - Claude_Design/library.html (canonical example of header markup)
 *   - app/globals.css (.header, .pill, .nav, .btn classes)
 */

import Link from 'next/link';
import { signOut } from '@/lib/auth/actions';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isPlaceholderUsername } from '@/lib/auth/username';
import { serverEnv } from '@/lib/env';

export async function Header() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let username: string | null = null;
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .single();
    if (data && typeof data.username === 'string') {
      username = isPlaceholderUsername(data.username) ? null : data.username;
    }
  }

  const isAdmin =
    !!user &&
    typeof user.email === 'string' &&
    serverEnv.ADMIN_EMAILS.includes(user.email.trim().toLowerCase());

  return (
    <header className="header">
      <div className="header-inner">
        <div className="brand">
          <Link href="/" className="brand-mark">
            eencyclopedia
          </Link>
          <span className="pill">
            <span className="dot" />
            closed beta
          </span>
        </div>

        <nav className="nav">
          {user ? (
            username ? (
              <>
                <Link href="/circuit/new" className="btn btn-primary btn-sm">
                  + Upload
                </Link>
                <Link href="/library">Library</Link>
                <Link href="/calc">Calc</Link>
                <Link href="/chat">Chat</Link>
                <Link href="/favorites" title="Starred circuits">
                  ★
                </Link>
                <Link href={`/profile/${username}`}>@{username}</Link>
                {isAdmin ? (
                  <Link
                    href="/admin/seed"
                    className="pill"
                    title="Admin: bulk seed circuits"
                    style={{ background: '#0d1117', color: '#f85149', borderColor: 'transparent' }}
                  >
                    admin
                  </Link>
                ) : null}
                <span className="sep" aria-hidden />
                <form action={signOut} style={{ display: 'inline' }}>
                  <button type="submit" className="btn btn-ghost btn-sm">
                    Sign out
                  </button>
                </form>
              </>
            ) : (
              <>
                <Link href="/onboarding" className="btn btn-primary btn-sm">
                  Finish setup
                </Link>
                <span className="sep" aria-hidden />
                <form action={signOut} style={{ display: 'inline' }}>
                  <button type="submit" className="btn btn-ghost btn-sm">
                    Sign out
                  </button>
                </form>
              </>
            )
          ) : (
            <>
              <Link href="/calc">Calc</Link>
              <Link href="/login" className="btn btn-primary btn-sm">
                Sign in
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
