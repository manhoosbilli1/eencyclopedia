import { createHash } from 'node:crypto';

/**
 * Text chunking for KB ingest (textbooks, datasheets, etc.)
 *
 * Strategy: fixed-size chunks with overlap for context continuity.
 * Default: 300 tokens per chunk, 50-token overlap.
 *
 * Rough token count: ~4 chars per token (conservative for English prose).
 */
export interface TextChunkArgs {
  text: string;
  chunkSizeTokens?: number;
  overlapTokens?: number;
}

export interface TextChunk {
  content: string;
  startIndex: number;
  endIndex: number;
  chunkIndex: number;
}

export function chunkText(args: TextChunkArgs): TextChunk[] {
  const { text, chunkSizeTokens = 300, overlapTokens = 50 } = args;

  // Conservative: assume 4 chars per token
  const chunkSizeChars = chunkSizeTokens * 4;
  const overlapChars = overlapTokens * 4;
  const stride = Math.max(1, chunkSizeChars - overlapChars);

  const chunks: TextChunk[] = [];
  let position = 0;
  let chunkIndex = 0;

  while (position < text.length) {
    const chunkStart = Math.max(0, position - overlapChars);
    const chunkEnd = Math.min(text.length, chunkStart + chunkSizeChars);

    // Avoid mid-sentence split: find next newline or period within last 100 chars
    let actualEnd = chunkEnd;
    if (chunkEnd < text.length) {
      const searchStart = Math.max(chunkEnd - 100, chunkStart);
      const searchRegion = text.substring(searchStart, chunkEnd);
      const breakMatch = searchRegion.match(/[.!?\n]\s+/);
      if (breakMatch) {
        actualEnd = searchStart + breakMatch.index! + breakMatch[0].length;
      }
    }

    const content = text.substring(chunkStart, actualEnd).trim();
    if (content.length > 50) { // Skip tiny chunks
      chunks.push({
        content,
        startIndex: chunkStart,
        endIndex: actualEnd,
        chunkIndex,
      });
      chunkIndex++;
    }

    position += stride;
  }

  return chunks;
}

export interface CircuitSummaryKbSyncArgs {
  circuitId: string;
  ownerId: string;
  title: string;
  visibility: 'public' | 'unlisted' | 'private';
  aiSummary: string | null;
  aiSummaryStruct: Record<string, unknown> | null;
  embedding?: number[] | null;
}

export interface KbChunkPayload {
  source_type: 'user_circuit_summary' | 'textbook' | 'datasheet';
  source_id: string;
  content: string;
  content_sha256: string;
  embedding?: number[] | null;
  metadata: Record<string, unknown>;
}

export function circuitSummarySourceId(circuitId: string): string {
  return `schematic:${circuitId}`;
}

export function buildCircuitSummaryKbChunk(
  args: CircuitSummaryKbSyncArgs,
): KbChunkPayload | null {
  if (args.visibility !== 'public') return null;

  const struct = args.aiSummaryStruct ?? {};
  const summaryText = stringField(struct['summary_text']) ?? trimOrNull(args.aiSummary);
  if (!summaryText) return null;

  const topology = stringField(struct['topology']);
  const intent = stringField(struct['intent']);
  const category = stringField(struct['category']);
  const rails = arrayOfStrings(struct['rails']);
  const concerns = arrayOfStrings(struct['concerns']);
  const designNotes = stringField(struct['design_notes']);
  const keyComponents = arrayOfObjects(struct['key_components']).map((component) => ({
    designator: stringField(component['designator']) ?? '?',
    value: stringField(component['value']),
    mpn: stringField(component['mpn']),
    role: stringField(component['role']),
  }));

  const preamble = [
    `Circuit: ${args.title}.`,
    topology ? `Topology: ${topology}.` : null,
    intent ? `Intent: ${intent}.` : null,
    rails.length > 0 ? `Rails: ${rails.join(', ')}.` : null,
    category ? `Category: ${category}.` : null,
  ]
    .filter(Boolean)
    .join(' ');

  const content = `${preamble} ${summaryText}`.trim();
  const metadata: Record<string, unknown> = {
    schematic_id: args.circuitId,
    owner_id: args.ownerId,
    title: args.title,
    visibility: args.visibility,
    topology,
    intent,
    category,
    rails,
    concerns,
    design_notes: designNotes,
    key_components: keyComponents,
  };

  return {
    source_type: 'user_circuit_summary',
    source_id: circuitSummarySourceId(args.circuitId),
    content,
    content_sha256: sha256(content),
    embedding: args.embedding ?? null,
    metadata,
  };
}

export async function syncCircuitSummaryKbChunk(
  args: CircuitSummaryKbSyncArgs,
): Promise<void> {
  const { getSupabaseAdmin } = await import('@/lib/supabase/admin');
  const admin = getSupabaseAdmin();
  const sourceId = circuitSummarySourceId(args.circuitId);

  const { error: deleteErr } = await admin
    .from('kb_chunks')
    .delete()
    .eq('source_type', 'user_circuit_summary')
    .eq('source_id', sourceId);
  if (deleteErr) {
    throw new Error(`Could not clear old KB summary rows: ${deleteErr.message}`);
  }

  const payload = buildCircuitSummaryKbChunk(args);
  if (!payload) return;

  const { error: insertErr } = await admin.from('kb_chunks').insert(payload as never);
  if (insertErr) {
    throw new Error(`Could not persist KB summary row: ${insertErr.message}`);
  }
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function trimOrNull(value: string | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function stringField(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function arrayOfObjects(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is Record<string, unknown> =>
          typeof entry === 'object' && entry !== null,
      )
    : [];
}

/**
 * Build KB chunks from a textbook or document.
 * Each chunk gets embedded and stored separately.
 */
export function buildTextbookKbChunks(args: {
  text: string;
  filename: string;
  title: string;
}): KbChunkPayload[] {
  const chunks = chunkText({ text: args.text });

  return chunks.map((chunk) => ({
    source_type: 'textbook' as const,
    source_id: `textbook:${args.filename}:${chunk.chunkIndex}`,
    content: chunk.content,
    content_sha256: sha256(chunk.content),
    metadata: {
      filename: args.filename,
      title: args.title,
      chunk_index: chunk.chunkIndex,
      char_range: `${chunk.startIndex}-${chunk.endIndex}`,
    },
  }));
}

/**
 * Insert textbook chunks into kb_chunks table.
 * Returns the count of chunks inserted.
 */
export async function ingestTextbookChunks(chunks: KbChunkPayload[]): Promise<number> {
  if (chunks.length === 0) return 0;

  const { getSupabaseAdmin } = await import('@/lib/supabase/admin');
  const admin = getSupabaseAdmin();

  const { error } = await admin
    .from('kb_chunks')
    .insert(chunks as never);

  if (error) {
    throw new Error(`Failed to insert KB chunks: ${error.message}`);
  }

  return chunks.length;
}
