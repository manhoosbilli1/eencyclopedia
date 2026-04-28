/**
 * Voyage AI embeddings client.
 *
 * Two public functions:
 *   embedText   — single input, used for query-time embedding in RAG
 *   embedBatch  — N inputs in one HTTP request, used during KB ingest
 *
 * Voyage /v1/embeddings accepts a string OR an array of strings as `input`.
 * The response always has a `data` array ordered by index, so the mapping
 * is stable (response[i].embedding === embedding for inputs[i]).
 *
 * Rate limits (voyage-3, as of 2026-04):
 *   Free tier:  300 RPM, 1 M tokens/min
 *   Pro tier:   3 000 RPM, 10 M tokens/min
 *
 * A 300-token chunk is ~1 200 chars; a 64-item batch is ~19 200 chars ≈
 * ~76 800 tokens. That's well within the 1 M/min envelope at ≤ 3 req/s.
 * The ingest route adds a 300 ms inter-batch delay to keep well under RPM.
 *
 * Ref: https://docs.voyageai.com/reference/embeddings-api
 */

import { z } from 'zod';

export type VoyageInputType = 'query' | 'document';

/** Maximum inputs per batch request (Voyage hard limit is 128; we use 64). */
export const VOYAGE_MAX_BATCH = 64;

// ---------------------------------------------------------------------------
// Response schema — shared by single and batch requests
// ---------------------------------------------------------------------------

const EmbeddingResponseSchema = z.object({
  data: z
    .array(
      z.object({
        embedding: z.array(z.number()),
        index: z.number().optional(),
      }),
    )
    .min(1),
});

export class VoyageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VoyageError';
  }
}

// ---------------------------------------------------------------------------
// Internal fetch helper
// ---------------------------------------------------------------------------

async function callEmbeddings(args: {
  input: string | string[];
  inputType: VoyageInputType;
}): Promise<z.infer<typeof EmbeddingResponseSchema>> {
  const { serverEnv } = await import('@/lib/env');

  const response = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serverEnv.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      input: args.input,
      model: serverEnv.VOYAGE_MODEL,
      input_type: args.inputType,
      output_dimension: serverEnv.VOYAGE_EMBED_DIM,
      truncation: true,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new VoyageError(
      `Voyage embeddings failed: HTTP ${response.status}${body ? ` — ${body.slice(0, 200)}` : ''}`,
    );
  }

  const raw = await response.json();
  const parsed = EmbeddingResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new VoyageError('Voyage returned an unexpected embeddings payload.');
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Embed a single string. Primarily used at query time in RAG retrieval.
 */
export async function embedText(args: {
  input: string;
  inputType: VoyageInputType;
}): Promise<number[]> {
  const result = await callEmbeddings({ input: args.input, inputType: args.inputType });
  return result.data[0]?.embedding ?? [];
}

/**
 * Embed an array of strings in a single HTTP request.
 *
 * Returns an array of embeddings in the same order as `inputs`.
 * Throws VoyageError on any HTTP-level failure — callers should catch and
 * decide whether to null-embed the batch (ingest) or surface the error (chat).
 *
 * Inputs longer than VOYAGE_MAX_BATCH (64) will be rejected: split upstream
 * into batches and call this per batch.
 */
export async function embedBatch(args: {
  inputs: string[];
  inputType: VoyageInputType;
}): Promise<number[][]> {
  if (args.inputs.length === 0) return [];
  if (args.inputs.length > VOYAGE_MAX_BATCH) {
    throw new VoyageError(
      `embedBatch: too many inputs (${args.inputs.length}); max is ${VOYAGE_MAX_BATCH}. ` +
        'Split into smaller batches before calling.',
    );
  }

  const result = await callEmbeddings({ input: args.inputs, inputType: args.inputType });

  // Voyage returns results in index order but double-check by sorting anyway.
  const sorted = [...result.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

  // Guard: if the API returns fewer items than we sent, null-pad.
  const embeddings: number[][] = [];
  for (let i = 0; i < args.inputs.length; i++) {
    embeddings.push(sorted[i]?.embedding ?? []);
  }
  return embeddings;
}
