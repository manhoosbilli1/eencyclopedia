'use server';

/**
 * Server actions for saving schematic edits made in the interactive editor.
 *
 * Flow:
 *   1. Auth check — must be signed in.
 *   2. Parse formData: circuit_id (UUID) + source (kicad_sch string).
 *   3. Ownership check: schematics.owner_id must equal auth.uid().
 *   4. Validate & parse the source through the full pipeline:
 *        looksLikeKiCadSchematic → parseKiCadSchematic → normalise → renderSvg
 *   5. Re-upload .kicad_sch and .svg to Storage (upsert = true).
 *   6. Update schematics row: sexp, svg_url, component_count, updated_at.
 *   7. Delete + re-insert schematic_components rows.
 *   8. revalidatePath(`/circuit/${circuitId}`).
 *
 * Returns { ok: true } or { ok: false, error: string } — never throws.
 */

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { parseKiCadSchematic, looksLikeKiCadSchematic, KiCadParseError } from '@/lib/kicad/parse';
import { normalise, toCanonicalSExp } from '@/lib/kicad/normalise';
import { renderSvg } from '@/lib/kicad/render';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FILE_BYTES = 256 * 1024; // 256 KiB

// ---------------------------------------------------------------------------
// Public action
// ---------------------------------------------------------------------------

export async function saveSchematicEdits(
  _prev: { ok: boolean; error?: string } | null,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  // 1. Auth
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: 'Session expired. Sign in again.' };
  }

  // 2. Extract formData
  const circuitId = formData.get('circuit_id');
  const source = formData.get('source');

  if (typeof circuitId !== 'string' || circuitId.trim().length < 30) {
    return { ok: false, error: 'Invalid circuit_id.' };
  }
  if (typeof source !== 'string' || source.trim().length === 0) {
    return { ok: false, error: 'No source provided.' };
  }
  if (source.length > MAX_FILE_BYTES) {
    return { ok: false, error: `Source too large (max ${MAX_FILE_BYTES / 1024} KiB).` };
  }

  // 3. Ownership check
  const { data: row, error: rowErr } = await supabase
    .from('schematics')
    .select('id, owner_id, title')
    .eq('id', circuitId)
    .single();

  if (rowErr || !row) {
    return { ok: false, error: 'Circuit not found.' };
  }
  const ownerId = (row as { owner_id: string }).owner_id;
  const title = (row as { title: string }).title;

  if (ownerId !== user.id) {
    return { ok: false, error: 'You do not own this circuit.' };
  }

  // 4. Validate source looks like a .kicad_sch file
  if (!looksLikeKiCadSchematic(source)) {
    return {
      ok: false,
      error: 'Source does not look like a .kicad_sch file. Top form must be (kicad_sch …).',
    };
  }

  // 5. Full parse → normalise → render pipeline
  let canonicalSexp: string;
  let svg: string;
  let componentCount: number;
  let canonical: ReturnType<typeof normalise>;

  try {
    const ast = parseKiCadSchematic(source);
    canonical = normalise(ast);
    canonicalSexp = toCanonicalSExp(canonical);
    svg = renderSvg(canonical, { title });
    componentCount = canonical.components.length;
  } catch (err: unknown) {
    if (err instanceof KiCadParseError) {
      return { ok: false, error: err.message };
    }
    // eslint-disable-next-line no-console
    console.error('[editor.save] parse pipeline failed:', err);
    return {
      ok: false,
      error: 'Could not parse the schematic. The source may be malformed.',
    };
  }

  // 6. Re-upload .kicad_sch and .svg to Storage (upsert so we overwrite the old files)
  const rawPath = `${ownerId}/${circuitId}.kicad_sch`;
  const svgPath = `${ownerId}/${circuitId}.svg`;

  const [rawUpload, svgUpload] = await Promise.all([
    supabase.storage
      .from('schematics')
      .upload(rawPath, source, { contentType: 'text/plain', upsert: true }),
    supabase.storage
      .from('schematics')
      .upload(svgPath, svg, { contentType: 'image/svg+xml', upsert: true }),
  ]);

  if (rawUpload.error) {
    // eslint-disable-next-line no-console
    console.error('[editor.save] raw upload failed:', rawUpload.error.message);
    return { ok: false, error: `Storage upload failed: ${rawUpload.error.message}` };
  }
  if (svgUpload.error) {
    // eslint-disable-next-line no-console
    console.error('[editor.save] svg upload failed:', svgUpload.error.message);
    return { ok: false, error: `SVG upload failed: ${svgUpload.error.message}` };
  }

  const { data: svgUrlData } = supabase.storage.from('schematics').getPublicUrl(svgPath);
  const svgUrl = svgUrlData.publicUrl;

  // 7. Update schematics row
  const { error: updateErr } = await supabase
    .from('schematics')
    .update({
      sexp: canonicalSexp,
      svg_url: svgUrl,
      component_count: componentCount,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', circuitId);

  if (updateErr) {
    // eslint-disable-next-line no-console
    console.error('[editor.save] schematics update failed:', updateErr.message);
    return { ok: false, error: `Database update failed: ${updateErr.message}` };
  }

  // 8. Delete + re-insert schematic_components
  const { error: deleteErr } = await supabase
    .from('schematic_components')
    .delete()
    .eq('schematic_id', circuitId);

  if (deleteErr) {
    // Non-fatal: log and continue — the main circuit row is already updated.
    // eslint-disable-next-line no-console
    console.warn('[editor.save] schematic_components delete failed:', deleteErr.message);
  } else {
    const compRows = canonical.components.map((comp) => ({
      schematic_id: circuitId,
      designator: comp.designator,
      value: comp.value,
    }));
    if (compRows.length > 0) {
      const { error: insertErr } = await supabase
        .from('schematic_components')
        .insert(compRows as never);
      if (insertErr) {
        // Non-fatal
        // eslint-disable-next-line no-console
        console.warn('[editor.save] schematic_components insert failed:', insertErr.message);
      }
    }
  }

  // 9. Revalidate the circuit detail page
  revalidatePath(`/circuit/${circuitId}`);

  return { ok: true };
}
