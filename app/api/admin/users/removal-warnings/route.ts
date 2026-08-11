/**
 * Pre-removal warnings for buffing a player from the Black Book.
 *
 * GET /api/admin/users/removal-warnings?email=...
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/apiGuards';
import { isAppAdminRole } from '@/lib/roles';
import { getUserRemovalWarnings, getUserRowByEmail } from '@/lib/queries/users';

export async function GET(request: NextRequest) {
  const ctx = await requireAuth();
  if (ctx instanceof NextResponse) return ctx;

  if (!(isAppAdminRole(ctx.user.globalRole))) {
    return NextResponse.json({ error: 'App admin access required' }, { status: 403 });
  }

  const email = request.nextUrl.searchParams.get('email')?.trim().toLowerCase() ?? '';
  if (!email) {
    return NextResponse.json({ error: 'email query parameter is required' }, { status: 400 });
  }

  try {
    const user = await getUserRowByEmail(email);
    if (!user || user.removedAt) {
      return NextResponse.json({ error: 'User not found on the Black Book' }, { status: 404 });
    }

    const warnings = await getUserRemovalWarnings(user.id);
    const hasWarnings =
      warnings.confirmedSpotCount > 0 || warnings.balances.length > 0;

    return NextResponse.json({
      success: true,
      data: { warnings, hasWarnings },
    });
  } catch (error) {
    console.error('Error fetching removal warnings:', error);
    return NextResponse.json({ error: 'Failed to fetch removal warnings' }, { status: 500 });
  }
}
