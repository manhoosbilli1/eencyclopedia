/**
 * /schematic/[slug] — public shared schematic detail page.
 *
 * Server component: fetches the shared schematic and its comments from
 * Supabase, then passes everything to the client SharedSchematicViewer.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { SharedSchematicViewer } from '@/components/schematic/SharedSchematicViewer';
import type { EditorState } from '@/components/schematic/editorTypes';
import { EMPTY_STATE } from '@/components/schematic/editorTypes';
import type { SharedComment } from '@/components/schematic/SharedSchematicViewer';

export const dynamic = 'force-dynamic';

interface Params {
  params: { slug: string };
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from('shared_schematics')
    .select('title')
    .eq('slug', params.slug)
    .maybeSingle();

  if (!data) return { title: 'Schematic not found — eencyclopedia' };

  const title = (data as { title: string }).title;
  return {
    title: `${title} — eencyclopedia`,
    description: `View the shared schematic: ${title}`,
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function SharedSchematicPage({ params }: Params) {
  const supabase = createSupabaseServerClient();

  // Fetch the schematic row, joining the owner's username from profiles.
  const { data: schematicData, error: schematicError } = await supabase
    .from('shared_schematics')
    .select(`
      id,
      slug,
      owner_id,
      title,
      state_json,
      likes,
      stars,
      created_at
    `)
    .eq('slug', params.slug)
    .maybeSingle();

  if (schematicError || !schematicData) {
    notFound();
  }

  const row = schematicData as {
    id: string;
    slug: string;
    owner_id: string;
    title: string;
    state_json: string;
    likes: number;
    stars: number;
    created_at: string;
  };

  // Fetch owner username
  const { data: ownerProfile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', row.owner_id)
    .maybeSingle();

  const ownerUsername =
    ownerProfile && typeof (ownerProfile as { username?: string }).username === 'string'
      ? (ownerProfile as { username: string }).username
      : 'unknown';

  // Check if the current user is the owner
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isOwner = !!user && user.id === row.owner_id;

  // Parse state_json → EditorState (fall back to empty if malformed)
  let initialState: EditorState = EMPTY_STATE;
  try {
    const parsed: unknown = JSON.parse(row.state_json);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      Array.isArray((parsed as Record<string, unknown>)['components'])
    ) {
      initialState = parsed as EditorState;
    }
  } catch {
    // state_json corrupted — show empty canvas
  }

  // Fetch comments for this schematic, joining username from profiles
  const { data: commentData } = await supabase
    .from('schematic_comments')
    .select(`
      id,
      user_id,
      text,
      created_at,
      profiles:user_id (username)
    `)
    .eq('schematic_id', row.id)
    .order('created_at', { ascending: true });

  type CommentRow = {
    id: string;
    user_id: string;
    text: string;
    created_at: string;
    profiles: { username: string } | null;
  };

  const initialComments: SharedComment[] = ((commentData ?? []) as CommentRow[]).map((c) => ({
    id: c.id,
    text: c.text,
    username: c.profiles?.username ?? 'unknown',
    createdAt: c.created_at,
  }));

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-3.5rem)] max-w-3xl flex-col px-6 py-12">
      {/* Page header */}
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{row.title}</h1>
          <div className="mt-1 flex items-center gap-2 font-mono text-xs text-muted-foreground">
            <span>by</span>
            <Link href={`/profile/${ownerUsername}`} className="hover:text-foreground">
              @{ownerUsername}
            </Link>
            <span>·</span>
            <time dateTime={row.created_at}>
              {new Date(row.created_at).toLocaleDateString()}
            </time>
            {isOwner && (
              <span className="ml-2 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider">
                yours
              </span>
            )}
          </div>
        </div>
        <Link
          href="/schematic/new"
          className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground underline hover:text-foreground"
        >
          ← new schematic
        </Link>
      </header>

      {/* Viewer + comments */}
      <SharedSchematicViewer
        slug={row.slug}
        title={row.title}
        ownerUsername={ownerUsername}
        createdAt={row.created_at}
        initialLikes={row.likes}
        initialStars={row.stars}
        initialState={initialState}
        isOwner={isOwner}
        initialComments={initialComments}
      />

      <footer className="mt-auto pt-12 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        AI-assisted output. Verify against datasheets and standards before fabrication.
      </footer>
    </main>
  );
}
