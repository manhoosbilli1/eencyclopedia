/**
 * Root not-found.tsx — rendered when any `notFound()` call escapes a
 * segment that doesn't define its own. The /circuit/[id] page already
 * uses `notFound()` for non-UUIDs and missing rows; this is what they
 * land on.
 *
 * Server component on purpose — no useState/useEffect needed.
 */

import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Not found',
  description: 'Whatever you were looking for is not here.',
};

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[calc(100dvh-3.5rem)] max-w-xl flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">404 — not here.</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        The path you tried doesn&rsquo;t resolve to anything we have on file.
        Either it never existed, or the circuit/profile is private, or the
        URL is mistyped.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/"
          className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Go home
        </Link>
        <Link
          href="/library"
          className="inline-flex h-10 items-center rounded-md border border-border bg-background px-4 text-sm font-medium hover:bg-muted"
        >
          Browse library
        </Link>
      </div>
    </main>
  );
}
