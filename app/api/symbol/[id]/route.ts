import { createClient } from '@supabase/supabase-js';
import { serverEnv, publicEnv } from '@/lib/env';

/**
 * GET /api/symbol/[id]
 *
 * Look up a symbol by KiCad lib_id from the `symbol_templates` table.
 * This table is populated by `scripts/loadSymbols.ts` (offline admin script).
 *
 * NOTE: This route is NOT used by the main render pipeline — the glyph-based
 * renderer in `lib/kicad/symbols.ts` is self-contained. This endpoint exists
 * for the WIP `SymbolRenderer` component and future lib_symbols render path.
 */
export async function GET(
  _: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  const supabase = createClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
  );

  const { data } = await supabase
    .from('symbol_templates')
    .select('data')
    .eq('id', params.id)
    .single();

  if (!data) {
    return Response.json({ error: 'Symbol not found' }, { status: 404 });
  }

  return Response.json((data as { data: unknown }).data);
}
