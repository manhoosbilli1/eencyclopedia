/**
 * GET /api/db-ping
 *
 * Reachability probe for Supabase. Issues a cheap query against `auth.users`
 * via the admin client (count, head-only) and reports latency.
 *
 * Security: returns 200 + booleans only — no row data is leaked. Even so,
 * we gate the detailed body to admin emails. Anonymous callers get a
 * boolean ok/notok plus latency.
 *
 * NOTE: This route uses the service-role key. Do NOT expose anything from
 * its body that depends on caller identity.
 */

import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { serverEnv } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const started = performance.now();
  let ok = false;
  let error: string | undefined;

  try {
    const admin = getSupabaseAdmin();
    // count: 'exact', head: true → no rows transferred, just a HEAD query.
    // We hit `profiles` because it's our own table; pinging auth.users via
    // PostgREST is not allowed (auth schema is hidden by default).
    const { error: e } = await admin
      .from('profiles')
      .select('*', { count: 'exact', head: true });
    if (e) throw e;
    ok = true;
  } catch (e) {
    ok = false;
    error = e instanceof Error ? e.message : 'unknown';
  }

  const elapsed_ms = Math.round(performance.now() - started);

  // Determine if the caller is an admin to decide how much detail to return.
  let isAdmin = false;
  try {
    const supabase = createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    const email = data.user?.email?.toLowerCase();
    if (email && serverEnv.ADMIN_EMAILS.includes(email)) isAdmin = true;
  } catch {
    /* anonymous caller */
  }

  return NextResponse.json(
    isAdmin
      ? { ok, elapsed_ms, error: error ?? null }
      : { ok, elapsed_ms },
    { status: ok ? 200 : 503 },
  );
}
