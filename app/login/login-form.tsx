'use client';

/**
 * Magic-link request form. useFormState gives us the action result without
 * needing client-side fetch boilerplate.
 */

import { useFormState, useFormStatus } from 'react-dom';
import { requestMagicLink, type ActionResult } from '@/lib/auth/actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-primary" style={{ width: '100%' }}>
      {pending ? 'Sending…' : 'Send magic link'}
    </button>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction] = useFormState<ActionResult | null, FormData>(
    requestMagicLink,
    null,
  );

  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }} noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <div style={{ marginBottom: '14px' }}>
        <label className="label" htmlFor="email">Email</label>
        <div className="input-wrap">
          <span className="icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="M3 7l9 6 9-6" />
            </svg>
          </span>
          <input
            className="input with-icon"
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            required
            placeholder="you@domain.com"
          />
        </div>
        <div className="help">We&apos;ll never spam. One-tap unsubscribe on every email.</div>
      </div>

      <SubmitButton />

      {state ? (
        state.ok ? (
          <p
            role="status"
            aria-live="polite"
            style={{ borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--muted)', padding: '14px 16px', fontSize: '13px', color: 'var(--fg)' }}
          >
            {state.message ?? 'Magic link sent. Check your inbox.'}
          </p>
        ) : (
          <p
            role="alert"
            aria-live="assertive"
            style={{ borderRadius: 'var(--radius)', border: '1px solid color-mix(in srgb, var(--destructive) 50%, var(--border))', background: 'color-mix(in srgb, var(--destructive) 10%, transparent)', padding: '14px 16px', fontSize: '13px', color: 'var(--destructive)' }}
          >
            {state.error}
          </p>
        )
      ) : null}
    </form>
  );
}
