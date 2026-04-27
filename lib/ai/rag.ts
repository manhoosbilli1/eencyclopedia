export interface RetrievalChunk {
  source_type: string;
  source_id: string;
  content: string;
  metadata?: Record<string, unknown>;
}

interface RankedChunk extends RetrievalChunk {
  key: string;
}

const DEFAULT_LIMIT = 8;
const FETCH_LIMIT = 12;
const RRF_K = 60;

/**
 * V0 retrieval: lexical search over kb_chunks fused with vector search over
 * embedded kb_chunks.
 */
export async function retrieveRelevantChunks(args: {
  query: string;
  limit?: number;
}): Promise<RetrievalChunk[]> {
  const { createSupabaseServerClient } = await import('@/lib/supabase/server');
  const query = toWebsearchQuery(args.query);
  if (!query) return [];

  const limit = Math.max(1, Math.min(args.limit ?? DEFAULT_LIMIT, FETCH_LIMIT));
  const supabase = createSupabaseServerClient();

  const lexicalPromise = supabase
    .from('kb_chunks')
    .select('source_type, source_id, content, metadata')
    .textSearch('content', query, { config: 'english', type: 'websearch' })
    .limit(FETCH_LIMIT);

  const lexicalRows = await lexicalPromise;
  const queryEmbedding = await embedQuery(query).catch(() => null);
  const vectorRows = queryEmbedding
    ? await supabase.rpc('match_kb_chunks' as never, {
        query_embedding: queryEmbedding,
        match_count: FETCH_LIMIT,
      } as never)
    : ({ data: [], error: null } as { data: unknown[]; error: null });

  const lexicalChunks = normalizeRows(
    (lexicalRows.data ?? []) as Array<{
      source_type: unknown;
      source_id: unknown;
      content: unknown;
      metadata?: unknown;
    }>,
  );
  const vectorChunks = normalizeRows(
    ((vectorRows as { data?: unknown[] | null }).data ?? []) as Array<{
      source_type: unknown;
      source_id: unknown;
      content: unknown;
      metadata?: unknown;
    }>,
  );

  return reciprocalRankFusion([lexicalChunks, vectorChunks], limit);
}

export function reciprocalRankFusion(
  lists: ReadonlyArray<ReadonlyArray<RankedChunk>>,
  limit = DEFAULT_LIMIT,
): RetrievalChunk[] {
  const scores = new Map<string, { score: number; row: RankedChunk }>();

  for (const list of lists) {
    list.forEach((row, index) => {
      const existing = scores.get(row.key);
      const score = 1 / (RRF_K + index + 1);
      if (existing) {
        existing.score += score;
      } else {
        scores.set(row.key, { score, row });
      }
    });
  }

  return Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ row }) => ({
      source_type: row.source_type,
      source_id: row.source_id,
      content: row.content,
      metadata: row.metadata,
    }));
}

function normalizeRows(
  rows: Array<{
    source_type: unknown;
    source_id: unknown;
    content: unknown;
    metadata?: unknown;
  }>,
): RankedChunk[] {
  const normalized: RankedChunk[] = [];

  for (const row of rows) {
    const sourceType = typeof row.source_type === 'string' ? row.source_type : null;
    const sourceId = typeof row.source_id === 'string' ? row.source_id : null;
    const content = typeof row.content === 'string' ? row.content.trim() : '';
    const metadata =
      row.metadata && typeof row.metadata === 'object'
        ? (row.metadata as Record<string, unknown>)
        : undefined;

    if (!sourceType || !sourceId || content.length === 0) continue;
    normalized.push({
      key: `${sourceType}:${sourceId}`,
      source_type: sourceType,
      source_id: sourceId,
      content,
      metadata,
    });
  }

  return normalized;
}

async function embedQuery(query: string): Promise<number[] | null> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return null;

  const { embedText } = await import('@/lib/ai/voyage');
  return await embedText({
    input: trimmed,
    inputType: 'query',
  });
}

function toWebsearchQuery(input: string): string {
  return input
    .trim()
    .replace(/[^\p{L}\p{N}\s"'._:+\-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 256);
}
