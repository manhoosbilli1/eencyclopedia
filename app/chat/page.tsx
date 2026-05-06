/**
 * /chat is intentionally disabled in the closed beta.
 *
 * The original streaming chat had reliability issues (provider auth, RAG
 * tuning, and prompt-injection hardening still WIP). Rather than ship a
 * half-working flow, we surface a clear "open to contributions" panel and
 * point interested folks at the GitHub repo. Re-enabling is a matter of
 * restoring the old chat-client.tsx call-site once the underlying issues
 * are resolved.
 */

import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Chat — coming soon',
  description: 'AI chat is paused while we figure out the pipeline.',
  robots: { index: false, follow: false },
};

const REPO_URL = 'https://github.com/manhoosbilli1/eencyclopedia';

export default function ChatPage() {
  return (
    <main className="mx-auto flex min-h-[calc(100dvh-3.5rem)] max-w-2xl flex-col items-center justify-center px-6 py-16 text-center">
      <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        /chat — paused
      </span>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
        We haven&apos;t figured this one out yet.
      </h1>
      <p className="mt-5 max-w-prose text-base leading-relaxed text-muted-foreground">
        The streaming RAG chat surface is intentionally disabled while we
        sort out provider routing, retrieval tuning, and prompt-injection
        hardening. Rather than ship a flaky chat we&apos;d rather show you
        nothing — and ask for help.
      </p>
      <p className="mt-3 max-w-prose text-base leading-relaxed text-muted-foreground">
        If you&apos;d like to wire it back up, the source is on GitHub and
        contributions are very welcome.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 items-center gap-2 rounded-md bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
        >
          ↗ Contribute on GitHub
        </a>
        <Link
          href="/library"
          className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-medium hover:bg-muted"
        >
          Browse the library
        </Link>
        <Link
          href="/calc"
          className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-medium hover:bg-muted"
        >
          Use the calculators
        </Link>
      </div>

      <p className="mt-12 max-w-prose font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
        Tracked on the <Link href="/features" className="underline hover:text-foreground">features page</Link>.
      </p>
    </main>
  );
}
