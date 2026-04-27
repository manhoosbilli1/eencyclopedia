/**
 * /chat is auth-gated and the auth check is round-trip-fast — but we still
 * surface a loading state so a flash-of-empty doesn't make the page feel
 * broken when Supabase is cold.
 */

export default function ChatLoading() {
  return (
    <main className="mx-auto flex min-h-[calc(100dvh-3.5rem)] max-w-5xl flex-col px-6 py-10">
      <header>
        <div className="h-7 w-32 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-3 w-72 animate-pulse rounded bg-muted" />
      </header>
      <div className="mt-8 flex-1 rounded-lg border border-border bg-card p-4">
        <div className="space-y-2">
          <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
        </div>
      </div>
    </main>
  );
}
