'use server';

/**
 * Server actions for the interactive schematic editor.
 *
 * Two flows:
 *   - saveSchematicEdits — overwrites an EXISTING circuit you own.
 *   - forkSchematic       — creates a NEW circuit row that links back to the
 *                           original via fork_of (and fork_root_id, set by the
 *                           db trigger from migration 0010). Anyone signed in
 *                           can fork any circuit they can read.
 *
 * Both reuse the parse → normalise → render pipeline.
 *
 * Returns { ok: true, ... } | { ok: false, error: string } — never throws.
 */

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { parseKiCadSchematic, looksLikeKiCadSchematic, KiCadParseError } from '@/lib/kicad/parse';
import { normalise, toCanonicalSExp } from '@/lib/kicad/normalise';
import { renderSvg } from '@/lib/kicad/render';
import { MAX_CIRCUITS_PER_USER } from '@/lib/circuits/constants';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MiB — matches createSchematic

// ---------------------------------------------------------------------------
// saveSchematicEdits — owner overwrite
// ---------------------------------------------------------------------------

export async function saveSchematicEdits(
  _prev: { ok: boolean; error?: string } | null,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: 'Session expired. Sign in again.' };
  }

  const circuitId = formData.get('circuit_id');
  const source = formData.get('source');

  if (typeof circuitId !== 'string' || circuitId.trim().length < 30) {
    return { ok: false, error: 'Invalid circuit_id.' };
  }
  if (typeof source !== 'string' || source.trim().length === 0) {
    return { ok: false, error: 'No source provided.' };
  }
  if (source.length > MAX_FILE_BYTES) {
    return { ok: false, error: `Source too large (max ${(MAX_FILE_BYTES / 1024 / 1024).toFixed(1)} MiB).` };
  }

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
    return {
      ok: false,
      error: 'You do not own this circuit. Use the Fork button to save a spinoff.',
    };
  }

  if (!looksLikeKiCadSchematic(source)) {
    return {
      ok: false,
      error: 'Source does not look like a .kicad_sch file. Top form must be (kicad_sch …).',
    };
  }

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

  const { error: deleteErr } = await supabase
    .from('schematic_components')
    .delete()
    .eq('schematic_id', circuitId);

  if (deleteErr) {
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
        // eslint-disable-next-line no-console
        console.warn('[editor.save] schematic_components insert failed:', insertErr.message);
      }
    }
  }

  revalidatePath(`/circuit/${circuitId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// forkSchematic — anyone signed in can fork any readable circuit.
// Creates a NEW row with fork_of set; the trigger derives fork_root_id and
// bumps the parent's fork_count.
// ---------------------------------------------------------------------------

export type ForkResult =
  | { ok: true; circuitId: string }
  | { ok: false; error: string };

export async function forkSchematic(
  _prev: ForkResult | null,
  formData: FormData,
): Promise<ForkResult> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: 'Sign in to save a spinoff.' };
  }

  const parentId = formData.get('parent_id');
  const source = formData.get('source');
  const requestedTitle = formData.get('title');

  if (typeof parentId !== 'string' || parentId.trim().length < 30) {
    return { ok: false, error: 'Invalid parent circuit id.' };
  }
  if (typeof source !== 'string' || source.trim().length === 0) {
    return { ok: false, error: 'No source provided.' };
  }
  if (source.length > MAX_FILE_BYTES) {
    return { ok: false, error: `Source too large (max ${(MAX_FILE_BYTES / 1024 / 1024).toFixed(1)} MiB).` };
  }

  // Per-user circuit cap applies to forks too.
  const { count: ownedCount } = await supabase
    .from('schematics')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', user.id);
  if (typeof ownedCount === 'number' && ownedCount >= MAX_CIRCUITS_PER_USER) {
    return {
      ok: false,
      error: `You're at the ${MAX_CIRCUITS_PER_USER}-circuit closed-beta limit. Delete one from /library before saving another fork.`,
    };
  }

  // Read parent — RLS already enforces visibility (public/unlisted/own).
  const { data: parentRow, error: parentErr } = await supabase
    .from('schematics')
    .select('id, title, description, visibility, fork_root_id')
    .eq('id', parentId)
    .maybeSingle();

  if (parentErr || !parentRow) {
    return { ok: false, error: 'Original circuit not found or not visible.' };
  }

  const parentTitle = (parentRow as { title: string }).title;
  const parentDescription =
    (parentRow as { description: string | null }).description ?? null;
  const parentVisibility =
    (parentRow as { visibility: 'public' | 'unlisted' | 'private' }).visibility;

  if (!looksLikeKiCadSchematic(source)) {
    return {
      ok: false,
      error: 'Source does not look like a .kicad_sch file.',
    };
  }

  const title =
    typeof requestedTitle === 'string' && requestedTitle.trim().length > 0
      ? requestedTitle.trim().slice(0, 200)
      : `Fork of ${parentTitle}`;

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
    console.error('[editor.fork] parse pipeline failed:', err);
    return {
      ok: false,
      error: 'Could not parse the edited schematic.',
    };
  }

  // Insert the new fork. fork_root_id is set by the trigger.
  const insertVisibility =
    parentVisibility === 'public' ? 'public' : 'private';
  const { data: inserted, error: insertErr } = await supabase
    .from('schematics')
    .insert({
      owner_id: user.id,
      title,
      description: parentDescription
        ? `Forked from "${parentTitle}". ${parentDescription}`
        : `Forked from "${parentTitle}".`,
      sexp: canonicalSexp,
      component_count: componentCount,
      visibility: insertVisibility,
      fork_of: parentId,
    } as never)
    .select('id')
    .single();

  if (insertErr || !inserted) {
    // eslint-disable-next-line no-console
    console.error('[editor.fork] insert failed:', insertErr?.message);
    return { ok: false, error: insertErr?.message ?? 'Could not create fork.' };
  }
  const newId = (inserted as { id: string }).id;

  // Upload artefacts under the new owner / new id.
  const rawPath = `${user.id}/${newId}.kicad_sch`;
  const svgPath = `${user.id}/${newId}.svg`;
  const [rawUpload, svgUpload] = await Promise.all([
    supabase.storage
      .from('schematics')
      .upload(rawPath, source, { contentType: 'text/plain', upsert: true }),
    supabase.storage
      .from('schematics')
      .upload(svgPath, svg, { contentType: 'image/svg+xml', upsert: true }),
  ]);
  if (rawUpload.error || svgUpload.error) {
    // Roll back the row so we don't leave a half-baked fork.
    await supabase.from('schematics').delete().eq('id', newId);
    return {
      ok: false,
      error: `Storage upload failed: ${(rawUpload.error ?? svgUpload.error)!.message}`,
    };
  }

  const { data: rawUrlData } = supabase.storage.from('schematics').getPublicUrl(rawPath);
  const { data: svgUrlData } = supabase.storage.from('schematics').getPublicUrl(svgPath);

  await supabase
    .from('schematics')
    .update({
      raw_kicad_url: rawUrlData.publicUrl,
      svg_url: svgUrlData.publicUrl,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', newId);

  // Components index for the fork.
  const compRows = canonical.components.map((comp) => ({
    schematic_id: newId,
    designator: comp.designator,
    value: comp.value,
  }));
  if (compRows.length > 0) {
    await supabase.from('schematic_components').insert(compRows as never);
  }

  revalidatePath('/library');
  revalidatePath(`/circuit/${newId}`);
  revalidatePath(`/circuit/${parentId}`);

  return { ok: true, circuitId: newId };
}
