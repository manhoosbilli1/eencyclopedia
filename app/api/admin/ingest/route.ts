/**
 * POST /api/admin/ingest
 *
 * Ingest a PDF document into the knowledge base.
 * Extracts text, chunks it, embeds each chunk (in batches), and stores
 * in kb_chunks.
 *
 * Auth: Admin only (checked via ADMIN_EMAILS)
 * Body: FormData with `file` (PDF) and `title` (string)
 * Response: { success: true, chunks_inserted: number } or error
 *
 * ---
 * Why we import 'pdf-parse/lib/pdf-parse' instead of 'pdf-parse':
 *   The top-level pdf-parse entrypoint runs a test that reads a sample PDF
 *   from its own node_modules directory. In Next.js serverless/edge builds
 *   that path resolution fails with ENOENT even though pdf-parse itself is
 *   installed. Using the inner lib module skips the self-test.
 *   next.config.js also lists 'pdf-parse' in serverComponentsExternalPackages
 *   so webpack never attempts to bundle it.
 *
 * Why we embed in batches of EMBED_BATCH_SIZE (not Promise.all over all chunks):
 *   Voyage-3 free tier: 300 RPM / 1 M tok per minute. A 600-page textbook
 *   produces ~600 chunks — firing 600 concurrent requests guarantees a 429
 *   cascade. Sequential batches with a small inter-batch delay stay well
 *   within limits.
 */

import { NextRequest, NextResponse } from 'next/server';
import { serverEnv } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { embedBatch } from '@/lib/ai/voyage';
import { buildTextbookKbChunks, ingestTextbookChunks, type KbChunkPayload } from '@/lib/ai/kb';

export const maxDuration = 300; // 5 min Vercel timeout

/** Chunks per Voyage batch request. Voyage supports up to 128 inputs; we use
 *  64 to stay well under token-per-minute limits with typical ~300-token chunks. */
const EMBED_BATCH_SIZE = 64;

/** Delay between batch requests (ms). Keeps us under 300 RPM on the free tier. */
const INTER_BATCH_DELAY_MS = 300;

// ---------------------------------------------------------------------------
// PDF text extraction
// ---------------------------------------------------------------------------

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  // Import the inner module directly to bypass pdf-parse's self-test that
  // reads a fixture file at startup — which fails in Next.js serverless envs.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse/lib/pdf-parse');
  let data: { text?: string };
  try {
    data = await pdfParse(buffer);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`PDF extraction failed: ${msg}`);
  }
  return data.text ?? '';
}

// ---------------------------------------------------------------------------
// Batch embedding helper
// ---------------------------------------------------------------------------

async function embedChunksInBatches(
  chunks: KbChunkPayload[],
): Promise<Array<KbChunkPayload & { embedding: number[] | null }>> {
  const result: Array<KbChunkPayload & { embedding: number[] | null }> = [];

  for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
    const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
    const inputs = batch.map((c) => c.content);

    let embeddings: Array<number[] | null>;
    try {
      embeddings = await embedBatch({ inputs, inputType: 'document' });
    } catch (err) {
      // On any batch failure (rate-limit, network), null-embed the whole batch
      // and log — inserts will still succeed, just without vector search support.
      console.error(
        `[ingest] embed batch ${i / EMBED_BATCH_SIZE + 1} failed:`,
        err instanceof Error ? err.message : err,
      );
      embeddings = batch.map(() => null);
    }

    for (let j = 0; j < batch.length; j++) {
      result.push({ ...batch[j]!, embedding: embeddings[j] ?? null });
    }

    // Don't sleep after the final batch.
    if (i + EMBED_BATCH_SIZE < chunks.length) {
      await new Promise((r) => setTimeout(r, INTER_BATCH_DELAY_MS));
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    // ---- Auth check ----
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized: not logged in' }, { status: 401 });
    }

    const callerEmail = (user.email ?? '').trim().toLowerCase();
    if (!serverEnv.ADMIN_EMAILS.includes(callerEmail)) {
      return NextResponse.json({ error: 'Forbidden: not an admin' }, { status: 403 });
    }

    // ---- Parse request ----
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const title = (formData.get('title') as string | null)?.trim() || 'Untitled Document';

    if (!file) {
      return NextResponse.json({ error: 'Missing file in request' }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 });
    }
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 50 MB)' }, { status: 400 });
    }

    // ---- Extract text ----
    const buffer = Buffer.from(await file.arrayBuffer());
    const text = await extractTextFromPdf(buffer);

    if (!text || text.trim().length < 50) {
      return NextResponse.json(
        {
          error:
            'No usable text extracted. Check that the PDF is text-based (not a scanned image). ' +
            'If it is text-based, the PDF may use non-standard encoding — try re-saving from Acrobat.',
        },
        { status: 400 },
      );
    }

    // ---- Chunk ----
    const chunks = buildTextbookKbChunks({ text, filename: file.name, title });
    if (chunks.length === 0) {
      return NextResponse.json({ error: 'Document too small to chunk' }, { status: 400 });
    }

    console.log(`[ingest] "${title}" → ${chunks.length} chunks, starting batch embedding…`);

    // ---- Embed (batched) ----
    const embeddedChunks = await embedChunksInBatches(chunks);

    const withEmbedding = embeddedChunks.filter((c) => c.embedding !== null).length;
    console.log(
      `[ingest] embedded ${withEmbedding}/${chunks.length} chunks (${chunks.length - withEmbedding} null — lexical only)`,
    );

    // ---- Insert ----
    const insertCount = await ingestTextbookChunks(embeddedChunks as never);

    return NextResponse.json(
      {
        success: true,
        filename: file.name,
        title,
        chunks_extracted: chunks.length,
        chunks_embedded: withEmbedding,
        chunks_inserted: insertCount,
        text_length: text.length,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error('[POST /api/admin/ingest] Error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Server error: ${message}` }, { status: 500 });
  }
}
