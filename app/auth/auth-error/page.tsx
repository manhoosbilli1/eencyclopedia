/**
 * /auth/auth-error — landing page for failed magic-link callbacks.
 *
 * The `reason` query param is rendered for debugging in dev. In prod we
 * still show it (the user is already authed via Supabase if the code was
 * validly issued — failure usually means the link was reused or expired).
 */

import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign-in problem',
};

export default function AuthErrorPage({
  searchParams,
}: {
  searchParams: { reason?: string };
}) {
  return (
    <main className="mx-auto flex min-h-[calc(100dvh-3.5rem)] max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">
        That didn&rsquo;t work.
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Magic links expire after one click and after about an hour. Request a
        fresh one and try again.
      </p>
      {searchParams.reason ? (
        <pre className="mt-4 overflow-x-auto rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">
          {searchParams.reason}
        </pre>
      ) : null}
      <Link
        href="/login"
        className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        Send another magic link
      </Link>
    </main>
  );
}
