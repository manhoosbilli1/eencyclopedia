/**
 * Loading skeleton for /circuit/[id]. Mirrors the live shell so the
 * layout doesn't shift when the SVG fetch + DB queries resolve.
 *
 * The circuit page does TWO server-side fetches (DB row + SVG content) on
 * top of two profile lookups, so a small render delay is normal even on
 * fast networks.
 */

export default function CircuitLoading() {
  return (
    <main className="mx-auto flex min-h-[calc(100dvh-3.5rem)] max-w-3xl flex-col px-6 py-12">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="h-7 w-64 animate-pulse rounded bg-muted" />
        <div className="h-3 w-48 animate-pulse rounded bg-muted" />
      </header>
      <div className="mt-2 h-3 w-32 animate-pulse rounded bg-muted" />

      <section className="mt-8 rounded-lg border border-border bg-card p-4">
        <div className="mb-3 h-3 w-40 animate-pulse rounded bg-muted" />
        <div className="h-72 w-full animate-pulse rounded bg-muted/50" />
      </section>

      <section className="mt-8 rounded-lg border border-border bg-card p-4">
        <div className="mb-3 h-3 w-40 animate-pulse rounded bg-muted" />
        <div className="space-y-2">
          <div className="h-3 w-full animate-pulse rounded bg-muted" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-muted" />
          <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
        </div>
      </section>
    </main>
  );
}
