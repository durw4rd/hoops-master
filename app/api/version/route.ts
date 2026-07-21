/**
 * Build-version endpoint for the "reload to update" banner.
 *
 * GET /api/version → { version, buildId }
 *
 * `buildId` is the live deployment's commit SHA. A tab still running an older
 * bundle compares its baked-in APP_BUILD_ID against this and prompts a reload
 * on mismatch. Public, uncached.
 */

import { NextResponse } from 'next/server';
import { APP_VERSION, APP_BUILD_ID } from '@/lib/appVersion';

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(
    { version: APP_VERSION, buildId: APP_BUILD_ID },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
