/**
 * /api/calc/[op] — deterministic calculator REST endpoint.
 *
 * Wraps lib/calc/index.ts. All units are SI base units (V, A, Ω, F, H, Hz, s).
 * Clients should convert at their boundary (use lib/calc/units.ts on the front-end).
 *
 * Supported ops (matches CalcOp in lib/calc/index.ts):
 *   ohm, voltageDivider, currentDivider, rcTau, rlTau, ledResistor,
 *   opampGain.inverting, opampGain.nonInverting,
 *   reactance.Xc, reactance.Xl, resonance, cutoffFreq
 *
 * Request: POST /api/calc/[op]
 *   Body: JSON object of arguments (see lib/calc/index.ts per-function docs).
 *   All fields are plain numbers in SI base units. No unit strings.
 *
 * Response: 200 { value, unit, steps, citation?, caveats? }
 *           400 { error: string }  — validation or CalcError
 *           404 { error: string }  — unknown op
 *
 * No auth required — deterministic calculations have no per-user data and no
 * AI cost. Rate limiting at the edge level (Vercel / Upstash) if needed.
 */

import { NextResponse } from 'next/server';
import {
  calc,
  CalcError,
  type CalcOp,
} from '@/lib/calc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Ordered from most-specific to least-specific so the router regex matches
// "opampGain.inverting" before "opampGain".
const VALID_OPS: ReadonlySet<CalcOp> = new Set<CalcOp>([
  'ohm',
  'voltageDivider',
  'currentDivider',
  'rcTau',
  'rlTau',
  'ledResistor',
  'opampGain.inverting',
  'opampGain.nonInverting',
  'reactance.Xc',
  'reactance.Xl',
  'resonance',
  'cutoffFreq',
]);

export async function POST(
  request: Request,
  { params }: { params: { op: string } },
) {
  const op = params.op;

  if (!VALID_OPS.has(op as CalcOp)) {
    return NextResponse.json(
      {
        error: `Unknown calculator op: "${op}". Valid ops: ${[...VALID_OPS].join(', ')}`,
      },
      { status: 404 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: 'Request body must be a JSON object.' }, { status: 400 });
  }

  const args = body as Record<string, unknown>;

  try {
    const result = runOp(op as CalcOp, args);
    return NextResponse.json(result);
  } catch (err: unknown) {
    if (err instanceof CalcError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Calculation failed.' }, { status: 500 });
  }
}

// Also allow GET with query-string args for convenience / debugging.
export async function GET(
  request: Request,
  { params }: { params: { op: string } },
) {
  const op = params.op;

  if (!VALID_OPS.has(op as CalcOp)) {
    return NextResponse.json(
      {
        error: `Unknown calculator op: "${op}". Valid ops: ${[...VALID_OPS].join(', ')}`,
      },
      { status: 404 },
    );
  }

  const url = new URL(request.url);
  const args: Record<string, unknown> = {};
  url.searchParams.forEach((value, key) => {
    const n = Number(value);
    args[key] = Number.isFinite(n) ? n : value;
  });

  try {
    const result = runOp(op as CalcOp, args);
    return NextResponse.json(result);
  } catch (err: unknown) {
    if (err instanceof CalcError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Calculation failed.' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

function num(args: Record<string, unknown>, key: string): number {
  const v = args[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new CalcError(`"${key}" must be a finite number (received ${JSON.stringify(v)})`, args);
  }
  return v;
}

function optNum(args: Record<string, unknown>, key: string): number | undefined {
  const v = args[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new CalcError(`"${key}" must be a finite number or omitted (received ${JSON.stringify(v)})`, args);
  }
  return v;
}

function runOp(op: CalcOp, args: Record<string, unknown>) {
  switch (op) {
    case 'ohm':
      return calc.ohm({
        V: optNum(args, 'V'),
        I: optNum(args, 'I'),
        R: optNum(args, 'R'),
      });

    case 'voltageDivider':
      return calc.voltageDivider({
        Vin: num(args, 'Vin'),
        R1: num(args, 'R1'),
        R2: num(args, 'R2'),
      });

    case 'currentDivider':
      return calc.currentDivider({
        Itotal: num(args, 'Itotal'),
        R1: num(args, 'R1'),
        R2: num(args, 'R2'),
      });

    case 'rcTau':
      return calc.rcTau({
        R: num(args, 'R'),
        C: num(args, 'C'),
      });

    case 'rlTau':
      return calc.rlTau({
        R: num(args, 'R'),
        L: num(args, 'L'),
      });

    case 'ledResistor':
      return calc.ledResistor({
        Vsupply: num(args, 'Vsupply'),
        Vf: num(args, 'Vf'),
        If: num(args, 'If'),
      });

    case 'opampGain.inverting':
      return calc.opampGain.inverting(num(args, 'Rf'), num(args, 'Rin'));

    case 'opampGain.nonInverting':
      return calc.opampGain.nonInverting(num(args, 'Rf'), num(args, 'Rg'));

    case 'reactance.Xc':
      return calc.reactance.Xc(num(args, 'f'), num(args, 'C'));

    case 'reactance.Xl':
      return calc.reactance.Xl(num(args, 'f'), num(args, 'L'));

    case 'resonance':
      return calc.resonance({
        L: num(args, 'L'),
        C: num(args, 'C'),
      });

    case 'cutoffFreq':
      return calc.cutoffFreq({
        R: num(args, 'R'),
        C: num(args, 'C'),
      });
  }
}
