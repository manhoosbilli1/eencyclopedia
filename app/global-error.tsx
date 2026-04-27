'use client';

/**
 * Global error boundary — catches errors thrown in the root layout itself
 * (e.g. font loader, env validation, top-level provider). Per Next 14:
 *   https://nextjs.org/docs/app/building-your-application/routing/error-handling
 *
 * MUST include its own <html>/<body> because the root layout is unmounted
 * when this fires.
 */

import { useEffect } from 'react';

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[global-error]', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
          backgroundColor: '#0b0d10',
          color: '#e6e8ec',
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          textAlign: 'center',
        }}
      >
        <h1 style={{ fontSize: '1.4rem', margin: 0 }}>
          eencyclopedia couldn&rsquo;t load.
        </h1>
        <p style={{ maxWidth: '34rem', marginTop: '0.75rem', opacity: 0.75 }}>
          The root layout itself failed — likely a misconfigured environment
          variable or a build-time crash. Check the server logs and restart
          the dev server.
        </p>
        {error.digest ? (
          <pre
            style={{
              marginTop: '1rem',
              padding: '0.5rem 0.75rem',
              border: '1px solid #2a2d33',
              borderRadius: '0.4rem',
              fontFamily: 'ui-monospace, SFMono-Regular, monospace',
              fontSize: '0.7rem',
              color: '#a0a4ad',
            }}
          >
            digest: {error.digest}
          </pre>
        ) : null}
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: '1rem',
            background: '#e6e8ec',
            color: '#0b0d10',
            border: 'none',
            borderRadius: '0.35rem',
            padding: '0.5rem 1rem',
            cursor: 'pointer',
            fontSize: '0.85rem',
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
