'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function starCircuit(circuitId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  const { error } = await supabase
    .from('circuit_stars')
    .insert({ user_id: user.id, schematic_id: circuitId });

  if (error && error.code !== '23505') { // 23505 = unique_violation (already starred)
    return { ok: false, error: error.message };
  }

  revalidatePath(`/circuit/${circuitId}`);
  revalidatePath('/');
  return { ok: true };
}

export async function unstarCircuit(circuitId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  const { error } = await supabase
    .from('circuit_stars')
    .delete()
    .eq('user_id', user.id)
    .eq('schematic_id', circuitId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/circuit/${circuitId}`);
  revalidatePath('/');
  return { ok: true };
}
