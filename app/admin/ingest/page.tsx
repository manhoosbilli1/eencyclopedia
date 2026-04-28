/**
 * /admin/ingest — ingest textbooks and documents into the knowledge base.
 *
 * Auth: Admin only (ADMIN_EMAILS)
 *
 * Flow:
 *   1. User picks a PDF file + optionally names it
 *   2. Frontend sends to POST /api/admin/ingest
 *   3. Backend extracts text, chunks, embeds, stores
 *   4. Show success with chunk count
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { serverEnv } from '@/lib/env';
import { IngestForm } from './ingest-form';

export const metadata: Metadata = {
  title: 'Admin · Ingest Documents',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminIngestPage() {
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
          Ingest documents <span className="text-muted-foreground">· admin</span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Upload a PDF textbook or technical document. The system will:
        </p>
        <ol className="mt-3 ml-5 list-decimal space-y-1 text-xs text-muted-foreground">
          <li>Extract all text from the PDF</li>
          <li>
            Split into 300-token chunks with 50-token overlap for context
          </li>
          <li>Generate embeddings for each chunk via Voyage AI</li>
          <li>Store in the knowledge base for RAG retrieval</li>
        </ol>

        <div className="mt-6 space-y-2 rounded-lg bg-blue-50 p-4 text-xs">
          <p className="font-semibold text-blue-900">Expected documents:</p>
          <ul className="ml-5 list-disc space-y-1 text-blue-800">
            <li>
              <strong>Textbooks:</strong> Sedra/Smith (Microelectronics),
              Horowitz/Hill (The Art of Electronics), Razavi (RF Microelectronics)
            </li>
            <li>
              <strong>App notes:</strong> Manufacturer application notes from
              TI, NXP, Analog Devices
            </li>
            <li>
              <strong>Specs:</strong> Component datasheets (currently limits apply
              — each chunk treated equally)
            </li>
          </ul>
        </div>

        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          <li>File size limit: 50 MB</li>
          <li>Format: PDF only (text-based, not scanned images)</li>
          <li>Processing time: ~1-2 min per 100 pages</li>
          <li>
            After ingestion, query <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">/chat</code> with
            topics from the document to verify RAG retrieval
          </li>
        </ul>
      </header>

      <div className="mt-8">
        <IngestForm />
      </div>
    </main>
  );
}
