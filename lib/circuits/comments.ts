'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function addComment(args: {
  circuitId: string;
  content: string;
  parentId?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const content = args.content.trim();
  if (!content || content.length > 4000) return { ok: false, error: 'Invalid content' };

  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('circuit_comments') as any).insert({
    schematic_id: args.circuitId,
    user_id: user.id,
    content,
    parent_id: args.parentId ?? null,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/circuit/${args.circuitId}`);
  return { ok: true };
}

export async function deleteComment(args: {
  commentId: string;
  circuitId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  const { error } = await supabase
    .from('circuit_comments')
    .delete()
    .eq('id', args.commentId)
    .eq('user_id', user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/circuit/${args.circuitId}`);
  return { ok: true };
}
