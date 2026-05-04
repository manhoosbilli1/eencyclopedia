/**
 * Local embeddings using @huggingface/transformers.
 *
 * Replaces the Voyage AI remote API with a fully local inference step.
 * Model: Xenova/all-MiniLM-L6-v2 (384-d, ~90MB first download).
 *
 * The pipeline is lazy-loaded and cached as a module-level singleton so
 * only the first call pays the startup cost (~200ms warm, ~3s cold).
 *
 * Drop-in replacement for the old voyage.ts: same embedText / embedBatch
 * signatures, same return types. The only breaking change is the vector
 * dimension (384 vs 1024) — migration 0007 handles the DB columns.
 *
 * Note: only usable server-side (Node.js). Not compatible with the edge
 * runtime. All callers (rag.ts, ingest actions) are already server-only.
 */

// Re-export the input-type alias so existing call-sites compile unchanged.
export type EmbeddingInputType = 'query' | 'document';

/** Batch limit — model can handle longer but we keep parity with old voyage.ts */
export const EMBED_MAX_BATCH = 64;

export class EmbeddingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmbeddingError';
  }
}

// ---------------------------------------------------------------------------
// Model singleton
// ---------------------------------------------------------------------------

let _pipeline: ((input: string | string[], opts: Record<string, unknown>) => Promise<{ data: Float32Array }>) | null = null;

async function getPipeline() {
  if (_pipeline) return _pipeline;

  // Dynamic import so Next.js doesn't try to bundle it for the edge runtime.
  const { pipeline, env } = await import('@huggingface/transformers');

  // Cache models to disk (Next.js write-permitted paths vary by environment;
  // we set cacheDir to /tmp as a universal fallback for server-side use).
  env.cacheDir = process.env.HF_CACHE_DIR ?? '/tmp/hf_models';
  const localPath = process.env.HF_LOCAL_PATH;
  if (localPath) env.localModelPath = localPath;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _pipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2') as any;
  return _pipeline!;
}

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

async function runEmbedding(inputs: string | string[]): Promise<number[][]> {
  const pipe = await getPipeline();

  const batch = Array.isArray(inputs) ? inputs : [inputs];
  const output = await pipe(batch, { pooling: 'mean', normalize: true });

  // output.data is Float32Array of length (batch_size × 384)
  const dim = 384;
  const results: number[][] = [];
  for (let i = 0; i < batch.length; i++) {
    results.push(Array.from(output.data.slice(i * dim, (i + 1) * dim)));
  }
  return results;
}

// ---------------------------------------------------------------------------
// Public API — matches old voyage.ts signatures
// ---------------------------------------------------------------------------

/**
 * Embed a single string. Used at query time in RAG retrieval.
 */
export async function embedText(args: {
  input: string;
  inputType: EmbeddingInputType;
}): Promise<number[]> {
  const [embedding] = await runEmbedding(args.input);
  if (!embedding) throw new EmbeddingError('embedText: model returned no output');
  return embedding;
}

/**
 * Embed an array of strings in one batch. Used during KB ingest.
 * Max EMBED_MAX_BATCH items; split upstream if larger.
 */
export async function embedBatch(args: {
  inputs: string[];
  inputType: EmbeddingInputType;
}): Promise<number[][]> {
  if (args.inputs.length === 0) return [];
  if (args.inputs.length > EMBED_MAX_BATCH) {
    throw new EmbeddingError(
      `embedBatch: too many inputs (${args.inputs.length}); max is ${EMBED_MAX_BATCH}.`,
    );
  }
  return runEmbedding(args.inputs);
}
