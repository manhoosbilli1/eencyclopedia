/**
 * GET /api/health
 *
 * Liveness probe — returns 200 with build info as long as the Node runtime is
 * up and env validation passed. Used by Vercel deploy verification, uptime
 * monitors, and CI smoke tests. Does NOT touch Supabase (that's /api/db-ping).
 */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // never cache; we want fresh status

export function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'eencyclopedia',
    timestamp: new Date().toISOString(),
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? 'local',
    region: process.env.VERCEL_REGION ?? 'local',
  });
}
