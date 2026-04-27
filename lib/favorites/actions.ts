'use server';

/**
 * Server actions for circuit favoriting. Backed by the `circuit_favorites`
 * table from migration 0005. RLS scopes everything to `auth.uid()` —
 * users can only see/touch their own rows.
 *
 * Exposed actions:
 *   - toggleCircuitFavorite(circuitId) — flip the favorite state.
 *     Returns the new state so client UI can update without a refetch.
 *   - removeCircuitFavorite(circuitId) — explicit remove (used by /favorites).
 */

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type FavoriteToggleResult =
  | { ok: true; favorited: boolean }
  | { ok: false; error: string };

export async function toggleCircuitFavorite(
  circuitId: string,
): Promise<FavoriteToggleResult> {
  if (!isUuid(circuitId)) return { ok: false, error: 'Invalid circuit id.' };

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sign in to save favorites.' };

  // Check current state. RLS scopes to user_id = auth.uid() so we always see
  // exactly our own row (or nothing).
  const { data: existing } = await supabase
    .from('circuit_favorites')
    .select('user_id')
    .eq('user_id', user.id)
    .eq('circuit_id', circuitId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('circuit_favorites')
      .delete()
      .eq('user_id', user.id)
      .eq('circuit_id', circuitId);
    if (error) {
      // eslint-disable-next-line no-console
      console.error('[favorites] delete failed:', error.message);
      return { ok: false, error: 'Could not remove favorite.' };
    }
    revalidatePath('/favorites');
    revalidatePath(`/circuit/${circuitId}`);
    return { ok: true, favorited: false };
  }

  const { error } = await supabase
    .from('circuit_favorites')
    .insert({ user_id: user.id, circuit_id: circuitId } as never);
  if (error) {
    // 23505 = unique_violation — race condition where two clicks landed
    // simultaneously. Treat the second as a no-op success.
    if ((error as { code?: string }).code !== '23505') {
      // eslint-disable-next-line no-console
      console.error('[favorites] insert failed:', error.message);
      return { ok: false, error: 'Could not save favorite.' };
    }
  }
  revalidatePath('/favorites');
  revalidatePath(`/circuit/${circuitId}`);
  return { ok: true, favorited: true };
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
