// /app/api/symbol/[id]/route.ts
import { createClient } from '@supabase/supabase-js';
import { serverEnv } from '@/lib/env';

export async function GET(_: Request, { params }) {
  const supabase = createClient(serverEnv.NEXT_PUBLIC_SUPABASE_URL, serverEnv.SUPABASE_SERVICE_ROLE_KEY);

  const { data } = await supabase
    .from('symbol_templates')
    .select('data')
    .eq('id', params.id)
    .single();

  if (!data) {
    return Response.json({ error: 'Symbol not found' }, { status: 404 });
  }

  return Response.json(data.data);
}