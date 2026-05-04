/**
 * /login — magic-link sign in.
 *
 * Server component shell that reads the auth state. If the user is already
 * signed in, send them home (or wherever `next` points). The actual form is
 * a client component because we need useFormState for inline errors.
 */

import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isPlaceholderUsername } from '@/lib/auth/username';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to eencyclopedia with a magic link.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; sent?: string };
}) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    // Already signed in — bounce to onboarding if they still have a placeholder
    // username, otherwise the requested next path or the homepage.
    const { data: profile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .single();
    const placeholder =
      typeof profile?.username === 'string' && isPlaceholderUsername(profile.username);
    redirect(placeholder ? '/onboarding' : (searchParams.next ?? '/'));
  }

  return (
    <>
      <div style={{ flex: '1', display: 'grid', placeItems: 'center', padding: '32px 24px' }}>
        <div style={{ width: '100%', maxWidth: '400px' }}>
          <div style={{ position: 'relative', height: '92px', marginBottom: '24px', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border)', background: 'linear-gradient(180deg, var(--bg), var(--muted))' }} className="sch-grid">
            <span style={{ position: 'absolute', left: '14px', top: '12px', fontFamily: 'JetBrains Mono', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted-fg)' }}>authenticate.kicad_sch</span>
            <svg viewBox="0 0 400 92" preserveAspectRatio="xMidYMid meet" style={{ position: 'absolute', inset: '0', width: '100%', height: '100%' }}>
              <path className="sch-trace" d="M20 46 H80" />
              <rect className="sch-ic" x="80" y="32" width="40" height="28" rx="3" />
              <text className="sch-lbl" x="88" y="50">AUTH</text>
              <path className="sch-trace" d="M120 46 H180" />
              <circle className="sch-node" cx="180" cy="46" r="3.5" />
              <path className="sch-trace" d="M180 46 H240 V30 H300" />
              <path className="sch-trace" d="M180 46 H240 V62 H300" />
              <path className="sch-flow" d="M20 46 H180" />
            </svg>
          </div>

          <h1 style={{ fontSize: '22px', fontWeight: '600', letterSpacing: '-0.01em', margin: '0 0 6px' }}>Sign in</h1>
          <p style={{ color: 'var(--muted-fg)', fontSize: '14px', margin: '0 0 22px' }}>We&apos;ll email you a magic link. No passwords.</p>

          <LoginForm next={searchParams.next} />

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '18px 0', color: 'var(--muted-fg)', fontFamily: 'JetBrains Mono', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            <span style={{ flex: '1', height: '1px', background: 'var(--border)' }}></span>
            or
            <span style={{ flex: '1', height: '1px', background: 'var(--border)' }}></span>
          </div>

          <button className="btn btn-ghost" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }} type="button">
            <svg width="14" height="14" viewBox="0 0 24 24"><path fill="#4285F4" d="M21.6 12.2c0-.7-.06-1.4-.18-2.05H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.35z" /><path fill="#34A853" d="M12 22c2.7 0 5-1 6.6-2.5l-3.2-2.5c-.9.6-2 1-3.4 1a5.9 5.9 0 0 1-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" /><path fill="#FBBC05" d="M6.4 13.9a6 6 0 0 1 0-3.8V7.5H3.1a10 10 0 0 0 0 9z" /><path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.9 1.5l2.9-2.9A10 10 0 0 0 3.1 7.5l3.3 2.6A6 6 0 0 1 12 6z" /></svg>
            Continue with Google
          </button>

          <p style={{ fontSize: '12px', color: 'var(--muted-fg)', textAlign: 'center', marginTop: '22px', lineHeight: '1.55' }}>
            By continuing you agree to our <Link href="#" style={{ color: 'var(--fg)', textDecoration: 'underline', textDecorationColor: 'var(--border)' }}>Terms</Link> and <Link href="#" style={{ color: 'var(--fg)', textDecoration: 'underline', textDecorationColor: 'var(--border)' }}>Privacy Policy</Link>. AI output is informational; verify before fabrication.
          </p>
        </div>
      </div>
    </>
  );
}
