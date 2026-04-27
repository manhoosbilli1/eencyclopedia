import { createHash } from 'node:crypto';

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
  source_type: 'user_circuit_summary';
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
