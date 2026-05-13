'use server';

/**
 * Server actions for circuit upload + AI summary generation.
 *
 * Pipeline (PLAN §6, V0 cuts noted in DAY3 task brief):
 *   1. Validate the uploaded .kicad_sch (size, MIME, looks-like-kicad)
 *   2. Parse → KiCad AST (lib/kicad/parse.ts)
 *   3. Normalise → eencyc canonical AST (lib/kicad/normalise.ts)
 *   4. Render → SVG string (lib/kicad/render.ts)
 *   5. Upload original + SVG to Storage at <user_uuid>/<schematic_uuid>.{kicad_sch,svg}
 *   6. Insert into `schematics` row (sexp, raw_kicad_url, svg_url, component_count,
 *      visibility, ai_summary[null until step 7])
 *   7. Inline-call Anthropic to produce ai_summary + ai_summary_struct (12s cap).
 *      If this fails or times out, the schematic still exists; user can hit
 *      "Regenerate" on the circuit page.
 *   8. revalidatePath, redirect to /circuit/[id]
 *
 * What's NOT here (deferred):
 *   - Async queue / Inngest worker — V0 runs inline.
 */

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  KiCadParseError,
  parseKiCadSchematic,
  looksLikeKiCadSchematic,
  MAX_COMPONENTS_V0,
} from '@/lib/kicad/parse';
import {
  normalise,
  toCanonicalSExp,
  toPromptJson,
  type CanonicalSchematic,
} from '@/lib/kicad/normalise';
import { renderSvg } from '@/lib/kicad/render';
import { applyBoundingBoxIngest } from '@/lib/kicad/boundingBox';
import { MAX_CIRCUITS_PER_USER } from '@/lib/circuits/constants';
// Provider-agnostic LLM dispatch (Anthropic vs Gemini, controlled by
// AI_PROVIDER in env). LlmError is the unified error type — code names
// match what the circuit page surfaces ('AUTH', 'RATE_LIMIT', etc.).
import { messages, LlmError as AnthropicError } from '@/lib/ai/llm';
import { syncCircuitSummaryKbChunk } from '@/lib/ai/kb';
import { CIRCUIT_SUMMARY_PROMPT } from '@/lib/ai/system-prompts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ActionResult =
  | { ok: true; circuitId: string; warnings?: string[] }
  | { ok: false; error: string };

interface DerivedArtifacts {
  canonical: CanonicalSchematic;
  canonicalSexp: string;
  canonicalJson: string;
  svg: string;
  componentCount: number;
  warnings: string[];
  promptJson: string;
}

interface SummarySyncContext {
  ownerId: string;
  title: string;
  visibility: 'public' | 'unlisted' | 'private';
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const VISIBILITY = z.enum(['public', 'unlisted', 'private']);

const UploadSchema = z.object({
  title: z.string().trim().min(1, 'Title is required.').max(200, 'Title too long.'),
  description: z
    .string()
    .trim()
    .min(1, 'Description is required.')
    .max(2000, 'Description too long.'),
  visibility: VISIBILITY.default('private'),
});

// 5 MiB upload ceiling. Real-world full-project schematics easily exceed
// 1 MiB once lib_symbols are inlined. Server-action body limit in
// next.config.js is 5 MB. Storage bucket capacity is set per-project via
// the Supabase dashboard; bump it there in lockstep.
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_FILE_KB_LABEL = `${(MAX_FILE_BYTES / 1024 / 1024).toFixed(1)} MiB`;
const ALLOWED_EXT = '.kicad_sch';
// V0 closed-beta soft quota: each user can own at most 10 circuits at a time.
// Past that, they need to delete one before uploading another. The cap is
// product-side only — RLS doesn't enforce it, but the upload action does.
// Admin uploads via /admin/seed bypass this (different action).

// ---------------------------------------------------------------------------
// createSchematic — server action
// ---------------------------------------------------------------------------

export async function createSchematic(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  // 1. Auth
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: 'Session expired. Sign in again.' };
  }

  // 2. Form fields
  const fields = UploadSchema.safeParse({
    title: formData.get('title'),
    description: formData.get('description') ?? undefined,
    visibility: formData.get('visibility') ?? 'public',
  });
  if (!fields.success) {
    return { ok: false, error: fields.error.issues[0]?.message ?? 'Invalid input.' };
  }

  // 2b. Per-user 10-circuit cap. RLS already scopes the count to owned rows
  // (head=true means just the count, no payload — cheap query).
  const { count: ownedCount } = await supabase
    .from('schematics')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', user.id);
  if (typeof ownedCount === 'number' && ownedCount >= MAX_CIRCUITS_PER_USER) {
    return {
      ok: false,
      error: `You're at the ${MAX_CIRCUITS_PER_USER}-circuit closed-beta limit. Delete one from /library before uploading another.`,
    };
  }

  // 3. File: either an uploaded File OR a pasted textarea content.
  const file = formData.get('file');
  const pasted = formData.get('pasted_source');
  let source = '';
  let originalName: string | null = null;

  if (file && typeof file !== 'string' && file instanceof Blob && file.size > 0) {
    if (file.size > MAX_FILE_BYTES) {
      return { ok: false, error: `File too large (max ${MAX_FILE_KB_LABEL}). Tip: shrink the file or surround the sub-circuit you want to share with a rectangle labelled "eencyclopedia" so only that region is ingested.` };
    }
    if (file instanceof File && !file.name.toLowerCase().endsWith(ALLOWED_EXT)) {
      return { ok: false, error: `File must end in ${ALLOWED_EXT}.` };
    }
    source = await file.text();
    originalName = file instanceof File ? file.name : 'upload.kicad_sch';
  } else if (typeof pasted === 'string' && pasted.trim().length > 0) {
    if (pasted.length > MAX_FILE_BYTES) {
      return { ok: false, error: 'Pasted source too large.' };
    }
    source = pasted;
    originalName = 'pasted.kicad_sch';
  } else {
    return { ok: false, error: 'Provide a .kicad_sch file or paste its contents.' };
  }

  if (!looksLikeKiCadSchematic(source)) {
    return {
      ok: false,
      error: 'That does not look like a .kicad_sch file. Top form must be (kicad_sch ...).',
    };
  }

  // 4. Parse + normalise + render. Each can throw a KiCadParseError with a
  //    user-readable message; surface those directly.
  let derived: DerivedArtifacts;
  try {
    derived = buildDerivedArtifacts(source, fields.data.title);
  } catch (err: unknown) {
    if (err instanceof KiCadParseError) {
      return { ok: false, error: err.message };
    }
    // eslint-disable-next-line no-console
    console.error('[circuits.create] parse pipeline failed:', err);
    return {
      ok: false,
      error: 'Could not parse this schematic. Check it opens correctly in KiCad, then try again.',
    };
  }

  // 5. Insert the schematics row first — we need its UUID for the storage
  //    paths. We update with raw_kicad_url + svg_url after upload.
  const { data: inserted, error: insertErr } = await supabase
    .from('schematics')
    .insert({
      owner_id: user.id,
      title: fields.data.title,
      description: fields.data.description ?? null,
      sexp: derived.canonicalSexp,
      component_count: derived.componentCount,
      visibility: fields.data.visibility,
    } as never)
    .select('id')
    .single();

  if (insertErr || !inserted) {
    // eslint-disable-next-line no-console
    console.error('[circuits.create] schematics insert failed:', insertErr?.message);
    return { ok: false, error: 'Could not save circuit. Try again.' };
  }
  const circuitId = (inserted as { id: string }).id;

  // 6. Upload 4 files to Storage:
  //      <uid>/<circuitId>.kicad_sch    — verbatim original
  //      <uid>/<circuitId>.eencyc.sexp  — canonical normalised S-exp
  //      <uid>/<circuitId>.eencyc.json  — full parsed AST + meta + lib_symbols
  //                                        (a development corpus — useful when
  //                                        we want to debug parser/renderer
  //                                        against real-world schematics later)
  //      <uid>/<circuitId>.svg          — rendered SVG
  //
  //    Path layout matches the RLS rule in 0002_storage_schematics.sql:
  //    `auth.uid()::text = (storage.foldername(name))[1]`. The DB-side
  //    `schematics` row only tracks raw_kicad_url and svg_url for now;
  //    the .eencyc.{sexp,json} files are addressable by deterministic path
  //    (same dir, same uuid, different extension) so we don't need extra
  //    columns to find them.
  let urls: StorageUrls;
  try {
    urls = await uploadDerivedArtifacts(supabase, user.id, circuitId, source, derived);
  } catch (err: unknown) {
    // eslint-disable-next-line no-console
    console.error('[circuits.create] storage upload failed:', {
      error: (err as Error).message,
    });
    await supabase.from('schematics').delete().eq('id', circuitId);
    return { ok: false, error: `Storage upload failed: ${(err as Error).message}` };
  }

  await supabase
    .from('schematics')
    .update({
      raw_kicad_url: urls.rawUrl,
      svg_url: urls.svgUrl,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', circuitId);

  await syncSchematicComponents(supabase, circuitId, derived.canonical).catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.warn('[circuits.create] schematic_components sync failed:', (err as Error).message);
  });

  // 7. Inline AI summary — best-effort. We swallow errors and let the page
  //    show "summary pending" so the user isn't blocked by Anthropic flakes.
  await refreshSummaryFromPromptJson(
    supabase,
    circuitId,
    fields.data.title,
    fields.data.description ?? null,
    derived.promptJson,
    '[circuits.create]',
    {
      ownerId: user.id,
      title: fields.data.title,
      visibility: fields.data.visibility,
    },
  );

  // 8. Revalidate caches and redirect.
  revalidatePath('/library');
  revalidatePath(`/circuit/${circuitId}`);
  // Note: we never reach the return after redirect throws.
  redirect(`/circuit/${circuitId}`);
}

// ---------------------------------------------------------------------------
// regenerateSummary — for circuits where the inline call failed
// ---------------------------------------------------------------------------

export async function regenerateSummary(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const id = formData.get('circuit_id');
  if (typeof id !== 'string' || id.length < 30) {
    return { ok: false, error: 'Invalid circuit id.' };
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sign in again.' };

  const { data: row, error } = await supabase
    .from('schematics')
    .select('id, owner_id, title, description, visibility, sexp')
    .eq('id', id)
    .single();
  if (error || !row) return { ok: false, error: 'Circuit not found.' };
  if ((row as { owner_id: string }).owner_id !== user.id) {
    return { ok: false, error: 'Not your circuit.' };
  }

  // Re-run the prompt against the stored canonical S-exp. We don't have the
  // JSON form persisted; rebuild it from the S-exp by re-parsing into our
  // own grammar. Cheap; canonical is always smaller than the original.
  // For V0 we just send the S-exp text — it's already token-cheap (<400 tokens).
  try {
    const r = await messages({
      endpoint: 'summary',
      system: CIRCUIT_SUMMARY_PROMPT,
      user:
        `eencyc-schematic S-exp:\n` +
        '```\n' +
        (row as { sexp: string }).sexp +
        '\n```\n' +
        `Title: ${(row as { title: string }).title}\n` +
        ((row as { description: string | null }).description
          ? `User description: ${(row as { description: string }).description}\n`
          : '') +
        `Return JSON only.`,
      maxTokens: 1500,
      schematicId: id,
      timeoutMs: 12_000,
    });
    const parsed = extractJson(r.text);
    if (!parsed) return { ok: false, error: 'AI returned non-JSON.' };
    await persistSummary(supabase, id, parsed, {
      ownerId: (row as { owner_id: string }).owner_id,
      title: (row as { title: string }).title,
      visibility: (row as { visibility: 'public' | 'unlisted' | 'private' }).visibility,
    });
  } catch (err: unknown) {
    if (err instanceof AnthropicError) {
      return { ok: false, error: `AI ${err.code.toLowerCase()}: ${err.message}` };
    }
    return { ok: false, error: (err as Error).message };
  }

  revalidatePath(`/circuit/${id}`);
  return { ok: true, circuitId: id };
}

// ---------------------------------------------------------------------------
// backfillMyCircuits — regenerate ai_summary + ai_summary_struct + embedding
// for every circuit owned by the calling user that's missing one of those.
//
// Why this exists: the user uploaded a batch of circuits before the Gemini
// switch, all of which have ai_summary=null (Anthropic was AUTH-failing).
// Without this they'd have to click Regenerate on each circuit page one at
// a time — 9+ clicks. With this, one button on /library scans + fixes them.
//
// Pacing: Gemini free tier caps at ~10 RPM on flash, 30 on flash-lite. We
// sleep 3.5s between calls to stay safely under both. Failures don't abort
// the loop — each call's error code is captured per-circuit and we report
// the count at the end. A circuit-level failure also writes a row to
// ai_calls (via gemini.ts logFailure) so the user can drill down later.
// ---------------------------------------------------------------------------

export interface BackfillResult {
  ok: true;
  total: number;
  succeeded: number;
  failed: number;
  errors: Array<{ circuitId: string; title: string; code: string }>;
}

export type BackfillActionResult = BackfillResult | { ok: false; error: string };

const BACKFILL_DELAY_MS = 3_500;
const BACKFILL_BATCH_LIMIT = 25; // hard cap per call so we never run for >2min

export async function backfillMyCircuits(
  _prev: BackfillActionResult | null,
  _formData: FormData,
): Promise<BackfillActionResult> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sign in to run backfill.' };

  // Find the user's stuck circuits — missing summary OR missing embedding.
  // RLS scopes to owned rows already (write own / read public-or-own).
  const { data: stuckRaw, error: queryErr } = await supabase
    .from('schematics')
    .select('id, title, sexp, description, owner_id, visibility, ai_summary, summary_embedding')
    .eq('owner_id', user.id)
    .or('ai_summary.is.null,summary_embedding.is.null')
    .order('created_at', { ascending: true })
    .limit(BACKFILL_BATCH_LIMIT);

  if (queryErr) {
    // eslint-disable-next-line no-console
    console.error('[backfill] query failed:', queryErr.message);
    return { ok: false, error: 'Could not list circuits to backfill.' };
  }

  const stuck = (stuckRaw ?? []) as Array<{
    id: string;
    title: string;
    sexp: string;
    description: string | null;
    owner_id: string;
    visibility: 'public' | 'unlisted' | 'private';
  }>;

  if (stuck.length === 0) {
    return { ok: true, total: 0, succeeded: 0, failed: 0, errors: [] };
  }

  let succeeded = 0;
  const errors: BackfillResult['errors'] = [];

  for (let i = 0; i < stuck.length; i++) {
    const row = stuck[i]!;
    try {
      const r = await messages({
        endpoint: 'summary',
        system: CIRCUIT_SUMMARY_PROMPT,
        user:
          `eencyc-schematic S-exp:\n` +
          '```\n' +
          row.sexp +
          '\n```\n' +
          `Title: ${row.title}\n` +
          (row.description ? `User description: ${row.description}\n` : '') +
          `Return JSON only.`,
        maxTokens: 1500,
        schematicId: row.id,
        timeoutMs: 15_000,
      });
      const parsed = extractJson(r.text);
      if (!parsed) {
        errors.push({ circuitId: row.id, title: row.title, code: 'NON_JSON' });
        continue;
      }
      await persistSummary(supabase, row.id, parsed, {
        ownerId: row.owner_id,
        title: row.title,
        visibility: row.visibility,
      });
      succeeded += 1;
    } catch (err: unknown) {
      const code =
        err instanceof AnthropicError
          ? err.code
          : err instanceof Error
            ? err.name.toUpperCase()
            : 'UNKNOWN';
      errors.push({ circuitId: row.id, title: row.title, code: String(code) });
    }
    // Throttle — even on error, so Gemini's RPM bucket has time to recover.
    if (i < stuck.length - 1) {
      await sleep(BACKFILL_DELAY_MS);
    }
  }

  // One revalidate at the end so /library + each circuit page picks up the
  // fresh summaries. revalidating per-circuit was redundant.
  revalidatePath('/library');
  for (const row of stuck) {
    revalidatePath(`/circuit/${row.id}`);
  }

  return {
    ok: true,
    total: stuck.length,
    succeeded,
    failed: errors.length,
    errors,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// rebuildDerivedArtifacts — refresh canonical S-exp, SVG, component rows,
// and AI summary from the stored raw .kicad_sch
// ---------------------------------------------------------------------------

export async function rebuildDerivedArtifacts(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const id = formData.get('circuit_id');
  if (typeof id !== 'string' || id.length < 30) {
    return { ok: false, error: 'Invalid circuit id.' };
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sign in again.' };

  const { data: row, error } = await supabase
    .from('schematics')
    .select('id, owner_id, title, description, visibility, raw_kicad_url')
    .eq('id', id)
    .single();
  if (error || !row) return { ok: false, error: 'Circuit not found.' };
  const ownerId = (row as { owner_id: string }).owner_id;
  if (ownerId !== user.id) return { ok: false, error: 'Not your circuit.' };

  let source = '';
  try {
    source = await loadStoredRawSource(
      supabase,
      ownerId,
      id,
      (row as { raw_kicad_url: string | null }).raw_kicad_url,
    );
  } catch (err: unknown) {
    return { ok: false, error: (err as Error).message };
  }

  let derived: DerivedArtifacts;
  try {
    derived = buildDerivedArtifacts(source, (row as { title: string }).title);
  } catch (err: unknown) {
    if (err instanceof KiCadParseError) {
      return { ok: false, error: err.message };
    }
    return {
      ok: false,
      error: `Could not rebuild circuit artifacts: ${(err as Error).message}`,
    };
  }

  try {
    const urls = await uploadDerivedArtifacts(supabase, ownerId, id, source, derived);
    await supabase
      .from('schematics')
      .update({
        sexp: derived.canonicalSexp,
        raw_kicad_url: urls.rawUrl,
        svg_url: urls.svgUrl,
        component_count: derived.componentCount,
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', id);

    await syncSchematicComponents(supabase, id, derived.canonical);
  } catch (err: unknown) {
    return { ok: false, error: `Rebuild failed: ${(err as Error).message}` };
  }

  await refreshSummaryFromPromptJson(
    supabase,
    id,
    (row as { title: string }).title,
    (row as { description: string | null }).description ?? null,
    derived.promptJson,
    '[circuits.rebuild]',
    {
      ownerId,
      title: (row as { title: string }).title,
      visibility: (row as { visibility: 'public' | 'unlisted' | 'private' }).visibility,
    },
  );

  revalidatePath('/library');
  revalidatePath(`/circuit/${id}`);
  return {
    ok: true,
    circuitId: id,
    warnings: derived.warnings.length > 0 ? derived.warnings : undefined,
  };
}

// ---------------------------------------------------------------------------
// bulkSeedCircuits — admin-only multi-file ingest
//
// Use case: ship 20–30 reference circuits as the seed library so the
// /library page isn't empty for first-time visitors. The admin uploads a
// folder of .kicad_sch files via /admin/seed; this action runs the full
// parse+normalise+render+upload pipeline against each, inserts as
// visibility=public, but DOES NOT call the AI summary (Gemini free-tier
// RPM caps would gate it). After seeding, the admin clicks Backfill on
// /library to fill in summaries+embeddings on a paced schedule.
//
// Auth model: caller must be authed AND their email must be in
// `serverEnv.ADMIN_EMAILS`. We don't use the service-role client — the
// regular cookie-bound client + RLS already permits a user to insert their
// own rows.
// ---------------------------------------------------------------------------

export interface BulkSeedResult {
  ok: true;
  total: number;
  succeeded: number;
  failed: number;
  errors: Array<{ filename: string; code: string; message: string }>;
  created: Array<{ filename: string; circuitId: string; title: string }>;
}

export type BulkSeedActionResult = BulkSeedResult | { ok: false; error: string };

const SEED_BATCH_LIMIT = 30; // hard cap per click — V0 §2 says "20–30" seed circuits

export async function bulkSeedCircuits(
  _prev: BulkSeedActionResult | null,
  formData: FormData,
): Promise<BulkSeedActionResult> {
  // Lazy-import the env so we don't pull serverEnv into the module top
  // (which would crash if anyone ever imported actions.ts from a client
  // boundary by mistake).
  const { serverEnv } = await import('@/lib/env');

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sign in to seed circuits.' };

  // Admin gate. Email comparison is case-insensitive on the env-side
  // (the transform in lib/env.ts lowercases entries), so lowercase here too.
  const callerEmail = (user.email ?? '').trim().toLowerCase();
  if (!serverEnv.ADMIN_EMAILS.includes(callerEmail)) {
    return { ok: false, error: 'Admin only.' };
  }

  const visibility = (formData.get('visibility') ?? 'public') as
    | 'public'
    | 'unlisted'
    | 'private';
  if (visibility !== 'public' && visibility !== 'unlisted' && visibility !== 'private') {
    return { ok: false, error: 'Invalid visibility.' };
  }

  // Collect all uploaded files. The form sends them as a single field
  // `files` repeated, OR as `file_0` / `file_1` / … . We accept both.
  const fileEntries: File[] = [];
  for (const v of formData.getAll('files')) {
    if (v && typeof v !== 'string' && v instanceof File && v.size > 0) {
      fileEntries.push(v);
    }
  }
  if (fileEntries.length === 0) {
    return { ok: false, error: 'No files were uploaded.' };
  }
  if (fileEntries.length > SEED_BATCH_LIMIT) {
    return {
      ok: false,
      error: `Seed limit per request is ${SEED_BATCH_LIMIT}; you submitted ${fileEntries.length}.`,
    };
  }

  const errors: BulkSeedResult['errors'] = [];
  const created: BulkSeedResult['created'] = [];

  for (const file of fileEntries) {
    const filename = file.name || 'unnamed.kicad_sch';
    try {
      if (!filename.toLowerCase().endsWith(ALLOWED_EXT)) {
        errors.push({ filename, code: 'BAD_EXT', message: 'Not a .kicad_sch file.' });
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        errors.push({ filename, code: 'TOO_LARGE', message: `> ${MAX_FILE_KB_LABEL}` });
        continue;
      }
      const source = await file.text();
      if (!looksLikeKiCadSchematic(source)) {
        errors.push({ filename, code: 'NOT_KICAD', message: 'Top form isn’t (kicad_sch …).' });
        continue;
      }

      // Title derives from the filename (strip extension, replace underscores).
      // Admin can rename later via direct DB or a future edit UI.
      const title = filename
        .replace(/\.kicad_sch$/i, '')
        .replace(/[_\-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim() || 'Untitled circuit';
      const description = `Seed circuit imported from ${filename} on ${new Date().toISOString().slice(0, 10)}.`;

      let derived: DerivedArtifacts;
      try {
        derived = buildDerivedArtifacts(source, title);
      } catch (err: unknown) {
        if (err instanceof KiCadParseError) {
          errors.push({ filename, code: err.code, message: err.message });
        } else {
          errors.push({ filename, code: 'PARSE', message: (err as Error).message });
        }
        continue;
      }

      // Insert row first (need its UUID for storage paths).
      const { data: inserted, error: insertErr } = await supabase
        .from('schematics')
        .insert({
          owner_id: user.id,
          title,
          description,
          sexp: derived.canonicalSexp,
          component_count: derived.componentCount,
          visibility,
        } as never)
        .select('id')
        .single();

      if (insertErr || !inserted) {
        errors.push({
          filename,
          code: 'INSERT_FAIL',
          message: insertErr?.message ?? 'unknown',
        });
        continue;
      }
      const circuitId = (inserted as { id: string }).id;

      // Upload 4 files. On failure we roll back the row.
      let urls: StorageUrls;
      try {
        urls = await uploadDerivedArtifacts(supabase, user.id, circuitId, source, derived);
      } catch (err: unknown) {
        await supabase.from('schematics').delete().eq('id', circuitId);
        errors.push({
          filename,
          code: 'UPLOAD_FAIL',
          message: (err as Error).message,
        });
        continue;
      }

      await supabase
        .from('schematics')
        .update({
          raw_kicad_url: urls.rawUrl,
          svg_url: urls.svgUrl,
          updated_at: new Date().toISOString(),
        } as never)
        .eq('id', circuitId);

      await syncSchematicComponents(supabase, circuitId, derived.canonical).catch(
        (err: unknown) => {
          // eslint-disable-next-line no-console
          console.warn('[bulk-seed] components sync failed:', filename, (err as Error).message);
        },
      );

      created.push({ filename, circuitId, title });
    } catch (err: unknown) {
      errors.push({
        filename,
        code: 'UNCAUGHT',
        message: (err as Error).message ?? 'unknown',
      });
    }
  }

  // Single revalidate at the end — library + each new circuit page.
  revalidatePath('/library');
  for (const c of created) revalidatePath(`/circuit/${c.circuitId}`);

  return {
    ok: true,
    total: fileEntries.length,
    succeeded: created.length,
    failed: errors.length,
    errors,
    created,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface StoragePaths {
  rawPath: string;
  sexpPath: string;
  jsonPath: string;
  svgPath: string;
}

interface StorageUrls {
  rawUrl: string;
  svgUrl: string;
}

function buildDerivedArtifacts(source: string, title: string): DerivedArtifacts {
  const rawAst = parseKiCadSchematic(source);

  // Bounding-box ingest: if the file contains a sheet rectangle whose top-left
  // is labelled "eencyclopedia", crop ingestion to that rectangle. Otherwise
  // ingest the whole sheet as before.
  const ingest = applyBoundingBoxIngest(rawAst);
  const ast = ingest.schematic;

  if (ast.symbols.length === 0) {
    if (ingest.matched) {
      throw new KiCadParseError(
        'NO_COMPONENTS_IN_BOX',
        'The "eencyclopedia" bounding box contains no components. Move the rectangle to surround the components you want to share.',
      );
    }
    throw new KiCadParseError('NO_COMPONENTS', 'No components found in this schematic.');
  }
  if (ast.symbols.length > MAX_COMPONENTS_V0) {
    throw new KiCadParseError(
      'TOO_MANY_COMPONENTS',
      ingest.matched
        ? `The "eencyclopedia" box contains ${ast.symbols.length} components; closed-beta cap is ${MAX_COMPONENTS_V0}. Shrink the box around a smaller sub-circuit, or split your design into multiple uploads.`
        : `This schematic has ${ast.symbols.length} components; closed-beta cap is ${MAX_COMPONENTS_V0}. Tip: in KiCad, draw a rectangle around the sub-circuit you want to share and add a text annotation reading "eencyclopedia" near its top-left corner — re-export and only that region will be ingested.`,
    );
  }

  const canonical = normalise(ast);
  const warnings = ast.warnings;
  return {
    canonical,
    canonicalSexp: toCanonicalSExp(canonical),
    svg: renderSvg(canonical, { title }),
    componentCount: canonical.components.length,
    warnings,
    promptJson: JSON.stringify(toPromptJson(canonical)),
    canonicalJson: JSON.stringify(
      {
        meta: ast.meta,
        warnings,
        canonical,
        libSymbols: Object.fromEntries(ast.libSymbols),
      },
      null,
      2,
    ),
  };
}

function storagePaths(ownerId: string, circuitId: string): StoragePaths {
  const dir = `${ownerId}`;
  return {
    rawPath: `${dir}/${circuitId}.kicad_sch`,
    sexpPath: `${dir}/${circuitId}.eencyc.sexp`,
    jsonPath: `${dir}/${circuitId}.eencyc.json`,
    svgPath: `${dir}/${circuitId}.svg`,
  };
}

async function uploadDerivedArtifacts(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  ownerId: string,
  circuitId: string,
  source: string,
  derived: DerivedArtifacts,
): Promise<StorageUrls> {
  const paths = storagePaths(ownerId, circuitId);
  const uploads = await Promise.all([
    supabase.storage
      .from('schematics')
      .upload(paths.rawPath, source, { contentType: 'text/plain', upsert: true }),
    supabase.storage
      .from('schematics')
      .upload(paths.sexpPath, derived.canonicalSexp, { contentType: 'text/plain', upsert: true }),
    supabase.storage
      .from('schematics')
      .upload(paths.jsonPath, derived.canonicalJson, { contentType: 'text/plain', upsert: true }),
    supabase.storage
      .from('schematics')
      .upload(paths.svgPath, derived.svg, { contentType: 'image/svg+xml', upsert: true }),
  ]);
  const [rawUpload, sexpUpload, jsonUpload, svgUpload] = uploads;
  const firstErr =
    rawUpload.error || sexpUpload.error || jsonUpload.error || svgUpload.error;
  if (firstErr) throw new Error(firstErr.message);

  const { data: rawUrl } = supabase.storage.from('schematics').getPublicUrl(paths.rawPath);
  const { data: svgUrl } = supabase.storage.from('schematics').getPublicUrl(paths.svgPath);
  return { rawUrl: rawUrl.publicUrl, svgUrl: svgUrl.publicUrl };
}

async function syncSchematicComponents(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  circuitId: string,
  canonical: CanonicalSchematic,
): Promise<void> {
  const { error: deleteErr } = await supabase
    .from('schematic_components')
    .delete()
    .eq('schematic_id', circuitId);
  if (deleteErr) {
    throw new Error(`Could not clear old component rows: ${deleteErr.message}`);
  }

  const rows = canonical.components.map((component) => ({
    schematic_id: circuitId,
    designator: component.designator,
    value: component.value,
  }));
  if (rows.length === 0) return;

  const { error: insertErr } = await supabase
    .from('schematic_components')
    .insert(rows as never);
  if (insertErr) {
    throw new Error(`Could not persist component rows: ${insertErr.message}`);
  }
}

async function loadStoredRawSource(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  ownerId: string,
  circuitId: string,
  rawUrl: string | null,
): Promise<string> {
  const paths = storagePaths(ownerId, circuitId);
  const { data, error } = await supabase.storage.from('schematics').download(paths.rawPath);
  if (!error && data) {
    return await data.text();
  }

  if (rawUrl) {
    const res = await fetch(rawUrl, { cache: 'no-store' });
    if (res.ok) return await res.text();
  }

  throw new Error('Could not load the stored raw .kicad_sch for this circuit.');
}

async function refreshSummaryFromPromptJson(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  circuitId: string,
  title: string,
  description: string | null,
  promptJson: string,
  logPrefix: string,
  syncContext: SummarySyncContext,
): Promise<void> {
  try {
    const r = await messages({
      endpoint: 'summary',
      system: CIRCUIT_SUMMARY_PROMPT,
      user:
        `eencyc-schematic JSON:\n` +
        '```json\n' +
        promptJson +
        '\n```\n' +
        `Title: ${title}\n` +
        (description ? `User description: ${description}\n` : '') +
        `Return JSON only.`,
      maxTokens: 1500,
      schematicId: circuitId,
      timeoutMs: 12_000,
    });
    const parsedSummary = extractJson(r.text);
    if (!parsedSummary) return;
    await persistSummary(supabase, circuitId, parsedSummary, syncContext);
  } catch (err: unknown) {
    if (err instanceof AnthropicError) {
      // eslint-disable-next-line no-console
      console.warn(`${logPrefix} summary deferred:`, err.code, err.message);
    } else {
      // eslint-disable-next-line no-console
      console.warn(`${logPrefix} summary failed:`, (err as Error).message);
    }
  }
}

async function persistSummary(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  circuitId: string,
  parsedSummary: Record<string, unknown>,
  syncContext: SummarySyncContext,
): Promise<void> {
  const summaryText =
    typeof parsedSummary['summary_text'] === 'string'
      ? (parsedSummary['summary_text'] as string)
      : null;
  const summaryEmbedding =
    summaryText && summaryText.trim().length > 0
      ? await embedSummaryText(summaryText).catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.warn('[circuits.summary] embedding deferred:', (err as Error).message);
        return null;
      })
      : null;

  const updatePayload: Record<string, unknown> = {
    ai_summary: summaryText,
    ai_summary_struct: parsedSummary,
    updated_at: new Date().toISOString(),
  };
  if (summaryText === null) {
    updatePayload['summary_embedding'] = null;
  } else if (summaryEmbedding) {
    updatePayload['summary_embedding'] = summaryEmbedding;
  }

  await supabase
    .from('schematics')
    .update(updatePayload as never)
    .eq('id', circuitId);

  await syncCircuitSummaryKbChunk({
    circuitId,
    ownerId: syncContext.ownerId,
    title: syncContext.title,
    visibility: syncContext.visibility,
    aiSummary: summaryText,
    aiSummaryStruct: parsedSummary,
    embedding: summaryEmbedding,
  });
}

async function embedSummaryText(summaryText: string): Promise<number[] | null> {
  const trimmed = summaryText.trim();
  if (trimmed.length === 0) return null;

  const { embedText } = await import('@/lib/ai/voyage');
  return await embedText({
    input: trimmed,
    inputType: 'document',
  });
}

/**
 * Anthropic occasionally wraps JSON in fenced code blocks even when asked
 * not to. Strip a leading/trailing fence if present, then JSON.parse.
 * Returns null on any failure.
 */
function extractJson(s: string): Record<string, unknown> | null {
  let t = s.trim();
  // Strip ```json … ``` or ``` … ```
  const fence = /^```(?:json)?\s*\n([\s\S]*?)\n```$/m;
  const m = t.match(fence);
  if (m && m[1]) t = m[1].trim();
  try {
    const v = JSON.parse(t) as unknown;
    return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// Note: 'use server' files can ONLY export async functions per Next 14
// constraint. Non-function exports (constants, types-via-runtime-values)
// must live in a sibling file. Types are still fine because they're erased.
