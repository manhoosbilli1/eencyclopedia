/**
 * /admin/seed — bulk-import seed circuits.
 *
 * Auth model:
 *   - Cookie auth (middleware) gates /admin/* to authed users.
 *   - On top of that, this page checks `serverEnv.ADMIN_EMAILS` against
 *     the caller's email. Non-admin authed users get a 404 (not 403 — we
 *     don't want to disclose the existence of the admin surface).
 *
 * Why not a script: a server action keeps everything inside Next's runtime
 * with full TypeScript + the existing parse/normalise/render/storage
 * helpers. The admin uploads a folder via multi-file picker; the action
 * loops them through bulkSeedCircuits.
 *
 * AI summaries are NOT generated inline — Gemini's free-tier RPM (10/min
 * on flash) would gate a 30-circuit seed at ~3 minutes. After seeding,
 * click `↻ Backfill stuck circuits` on /library to fill summaries
 * +embeddings on a paced schedule.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { serverEnv } from '@/lib/env';
import { SeedForm } from './seed-form';

export const metadata: Metadata = {
  title: 'Admin · Seed circuits',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminSeedPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const callerEmail = (user.email ?? '').trim().toLowerCase();
  if (!serverEnv.ADMIN_EMAILS.includes(callerEmail)) {
    notFound();
  }

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-3.5rem)] max-w-3xl flex-col px-6 py-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Seed circuits <span className="text-muted-foreground">· admin</span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Drop in a folder of <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">.kicad_sch</code>{' '}
          files. Each is parsed, rendered, uploaded, and inserted as a new
          circuit owned by you. Title is derived from the filename. AI
          summaries are NOT generated here — once seeded, hit{' '}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">↻ Backfill</code>{' '}
          on <a href="/library" className="underline">/library</a> to fill
          them in on Gemini&rsquo;s rate-limit budget.
        </p>

        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          <li>Per-file cap: 256 KiB. Storage bucket cap: 512 KiB.</li>
          <li>Per-file component cap: 5 (V0 limit, parser-enforced).</li>
          <li>Per-request cap: 30 files.</li>
          <li>
            Existing public circuits with the same title will not be deduped —
            you&rsquo;ll get duplicate rows. Clean up manually or skip files.
          </li>
        </ul>
      </header>

      <div className="mt-8">
        <SeedForm />
      </div>
    </main>
  );
}
