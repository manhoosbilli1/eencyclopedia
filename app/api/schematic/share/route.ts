/**
 * POST /api/schematic/share
 *
 * Creates a shared schematic record from an EditorState JSON blob.
 * Auth required — returns 401 if not signed in.
 *
 * Body: { title: string; stateJson: string }
 * Response: { url: string } — e.g. { url: '/schematic/abc12345' }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { EditorState } from '@/components/schematic/editorTypes';

/** Generate a random 8-char alphanumeric slug (no external dep needed). */
function generateSlug(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let slug = '';
  // Use crypto.getRandomValues for better randomness when available (Node 20+)
  const bytes = new Uint8Array(8);
  if (typeof globalThis.crypto !== 'undefined') {
    globalThis.crypto.getRandomValues(bytes);
    for (const b of bytes) {
      slug += chars[b % chars.length];
    }
  } else {
    for (let i = 0; i < 8; i++) {
      slug += chars[Math.floor(Math.random() * chars.length)];
    }
  }
  return slug;
}

function isValidEditorState(obj: unknown): obj is EditorState {
  if (typeof obj !== 'object' || obj === null) return false;
  const s = obj as Record<string, unknown>;
  return Array.isArray(s['components']);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
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

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Body must be an object' }, { status: 400 });
  }

  const { title, stateJson } = body as Record<string, unknown>;

  if (typeof title !== 'string' || title.trim().length === 0) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }
  if (title.trim().length > 200) {
    return NextResponse.json({ error: 'title too long (max 200 chars)' }, { status: 400 });
  }
  if (typeof stateJson !== 'string') {
    return NextResponse.json({ error: 'stateJson must be a string' }, { status: 400 });
  }

  // Validate stateJson is parseable and has the expected shape
  let parsedState: unknown;
  try {
    parsedState = JSON.parse(stateJson);
  } catch {
    return NextResponse.json({ error: 'stateJson is not valid JSON' }, { status: 400 });
  }

  if (!isValidEditorState(parsedState)) {
    return NextResponse.json(
      { error: 'stateJson must be an EditorState object with a components array' },
      { status: 400 },
    );
  }

  // Try up to 3 times to find a unique slug (collision probability is ~1 in 36^8 ≈ 2.8T)
  let slug: string | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const candidate = generateSlug();
    const { data: existing } = await supabase
      .from('shared_schematics')
      .select('slug')
      .eq('slug', candidate)
      .maybeSingle();
    if (!existing) {
      slug = candidate;
      break;
    }
  }

  if (!slug) {
    return NextResponse.json({ error: 'Could not generate unique slug' }, { status: 500 });
  }

  const { error: insertErr } = await supabase
    .from('shared_schematics')
    .insert({
      slug,
      owner_id: user.id,
      title: title.trim(),
      state_json: stateJson,
    } as never);

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ url: `/schematic/${slug}` });
}
