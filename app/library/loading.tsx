/**
 * Loading skeleton for /library. Shows the same shell as the real page
 * (header + 6 placeholder cards) so the layout doesn't shift when content
 * arrives. Pure server component, no JS shipped.
 */

export default function LibraryLoading() {
  return (
    <main className="mx-auto flex min-h-[calc(100dvh-3.5rem)] max-w-5xl flex-col px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
          <div className="mt-2 h-3 w-72 animate-pulse rounded bg-muted" />
        </div>
      </header>

      <div className="mt-6 flex h-9 w-full max-w-md animate-pulse rounded-md bg-muted" />

      <section className="mt-10">
        <div className="mb-4 h-3 w-32 animate-pulse rounded bg-muted" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <article
              key={i}
              className="flex h-44 flex-col gap-2 rounded-lg border border-border bg-card p-4"
            >
              <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
              <div className="mt-2 h-20 animate-pulse rounded bg-muted/50" />
              <div className="mt-auto h-2 w-1/3 animate-pulse rounded bg-muted" />
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
