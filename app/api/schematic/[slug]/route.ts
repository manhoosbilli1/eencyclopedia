/**
 * /api/schematic/[slug]
 *
 * GET  — fetch shared schematic by slug (public)
 * POST — add comment; body { text: string }, auth required
 * PATCH — toggle like/star; body { action: 'like' | 'star' }, auth required
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

interface RouteContext {
  params: { slug: string };
}

// ---------------------------------------------------------------------------
// GET — public schematic fetch
// ---------------------------------------------------------------------------

export async function GET(
  _req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from('shared_schematics')
    .select('id, slug, owner_id, title, state_json, likes, stars, created_at, updated_at')
    .eq('slug', params.slug)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ schematic: data });
}

// ---------------------------------------------------------------------------
// POST — add comment
// ---------------------------------------------------------------------------

export async function POST(
  req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  // Resolve the schematic id from the slug
  const { data: schematic } = await supabase
    .from('shared_schematics')
    .select('id')
    .eq('slug', params.slug)
    .maybeSingle();

  if (!schematic) {
    return NextResponse.json({ error: 'Schematic not found' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { text } = (body ?? {}) as Record<string, unknown>;

  if (typeof text !== 'string' || text.trim().length === 0) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }
  if (text.trim().length > 2000) {
    return NextResponse.json({ error: 'text too long (max 2000 chars)' }, { status: 400 });
  }

  const { data: comment, error: insertErr } = await supabase
    .from('schematic_comments')
    .insert({
      schematic_id: (schematic as { id: string }).id,
      user_id: user.id,
      text: text.trim(),
    } as never)
    .select('id, schematic_id, user_id, text, created_at')
    .single();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ comment }, { status: 201 });
}

// ---------------------------------------------------------------------------
// PATCH — toggle like or star
// ---------------------------------------------------------------------------

export async function PATCH(
  req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { action } = (body ?? {}) as Record<string, unknown>;
  if (action !== 'like' && action !== 'star') {
    return NextResponse.json({ error: "action must be 'like' or 'star'" }, { status: 400 });
  }

  // Resolve slug → id
  const { data: schematic } = await supabase
    .from('shared_schematics')
    .select('id, likes, stars')
    .eq('slug', params.slug)
    .maybeSingle();

  if (!schematic) {
    return NextResponse.json({ error: 'Schematic not found' }, { status: 404 });
  }

  const row = schematic as { id: string; likes: number; stars: number };
  const field = action === 'like' ? 'likes' : 'stars';
  const currentValue = row[field];
  // Simple increment; no per-user dedup in V0.
  const newValue = currentValue + 1;

  const updatePayload: Record<string, unknown> = { [field]: newValue };

  // Use admin client so any authenticated user can increment likes/stars,
  // not just the owner (RLS "owner update" policy would block non-owners).
  const admin = getSupabaseAdmin();
  const { error: updateErr } = await admin
    .from('shared_schematics')
    .update(updatePayload as never)
    .eq('id', row.id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ [field]: newValue });
}
