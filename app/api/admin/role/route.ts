/**
 * App-admin Role API
 *
 * PATCH /api/admin/role - Promote/demote a user between 'admin' and 'user'.
 *   Body: { email: string, role: 'admin' | 'user' }
 *
 * Rules:
 *   - Caller must be an app admin (owner or admin).
 *   - The 'owner' role is protected: an owner cannot be demoted by anyone here,
 *     and 'owner' cannot be granted via this endpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/apiGuards';
import { isAppAdmin } from '@/lib/launchdarkly';
import { getUserRowByEmail, setUserRole } from '@/lib/queries/users';
import type { GlobalRole } from '@/lib/types';

export async function PATCH(request: NextRequest) {
  const ctx = await requireAuth();
  if (ctx instanceof NextResponse) return ctx;

  if (!(await isAppAdmin(ctx.user.email, ctx.user.globalRole))) {
    return NextResponse.json({ error: 'App admin access required' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const role = body?.role as GlobalRole;

    if (!email) return NextResponse.json({ error: 'email is required' }, { status: 400 });
    if (role !== 'admin' && role !== 'user') {
      return NextResponse.json({ error: 'role must be "admin" or "user"' }, { status: 400 });
    }

    const target = await getUserRowByEmail(email);
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    if (target.globalRole === 'owner') {
      return NextResponse.json(
        { error: 'The Owner cannot be demoted' },
        { status: 403 }
      );
    }

    const updated = await setUserRole(target.id, role);
    return NextResponse.json({
      success: true,
      data: { email: updated?.email, globalRole: updated?.globalRole },
      message: `${target.displayName} is now ${role === 'admin' ? 'an Admin' : 'a Player'}`,
    });
  } catch (error) {
    console.error('Error updating user role:', error);
    return NextResponse.json(
      { error: 'Failed to update user role', details: String(error) },
      { status: 500 }
    );
  }
}
