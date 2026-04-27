'use client';

/**
 * Route-level error boundary.
 *
 * Caught by Next at any route segment under app/ that doesn't have its own
 * error.tsx. Renders a small EE-flavored fallback with a reset button (which
 * re-runs the segment's render) and a link home.
 *
 * What it does NOT do:
 *   - Send to Sentry / LogRocket / etc. — telemetry will be wired in V1.
 *   - Show stack traces. We surface `error.digest` (Next's per-error hash)
 *     so support can correlate with server logs without exposing the trace.
 */

import { useEffect } from 'react';
import Link from 'next/link';

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalRouteError({ error, reset }: Props) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[route-error]', error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-3.5rem)] max-w-xl flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">
        Something failed on the way through.
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        This page hit an unhandled exception. The fault is captured in the
        server logs; you can retry, or jump back home.
      </p>
      {error.digest ? (
        <pre className="mt-4 overflow-x-auto rounded-md border border-border bg-muted px-3 py-2 font-mono text-[11px] text-muted-foreground">
          digest: {error.digest}
        </pre>
      ) : null}
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Retry this page
        </button>
        <Link
          href="/"
          className="inline-flex h-10 items-center rounded-md border border-border bg-background px-4 text-sm font-medium hover:bg-muted"
        >
          Go home
        </Link>
      </div>
    </main>
  );
}
