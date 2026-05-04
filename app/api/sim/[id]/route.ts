import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { solvedc } from '@/lib/sim/mna';
import { schematicToNetlist } from '@/lib/sim/netlist';
import { parseCanonicalSExp } from '@/lib/kicad/normalise';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'Invalid circuit ID' }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('schematics')
    .select('sexp, visibility, owner_id')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: 'Circuit not found' }, { status: 404 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  const vis = (data as { visibility: string }).visibility;
  const ownerId = (data as { owner_id: string }).owner_id;
  if (vis === 'private' && (!user || user.id !== ownerId)) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 });
  }

  const sexp = (data as { sexp: string }).sexp;
  if (!sexp) return NextResponse.json({ error: 'No schematic data' }, { status: 422 });

  try {
    const canonical = parseCanonicalSExp(sexp);
    const elements = schematicToNetlist(canonical);
    const result = solvedc(elements);

    // Cache result in spice_results column (non-fatal if it fails)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void (supabase.from('schematics') as any)
      .update({ spice_results: result })
      .eq('id', id);

    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Simulation error';
    return NextResponse.json({ error: msg, converged: false }, { status: 500 });
  }
}
