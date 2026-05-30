/**
 * App-admin Invite API
 *
 * GET  /api/admin/invite - List all users with invite/onboarding status (app-admin).
 * POST /api/admin/invite - Invite a player by email (app-admin).
 *   Body: { email: string }
 *
 * Invite-only access: only emails added here (or seeded) can sign in. The invitee
 * picks their username during onboarding on first sign-in.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/apiGuards';
import { isAppAdmin } from '@/lib/launchdarkly';
import { inviteUser, listUsers } from '@/lib/queries/users';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET() {
  const ctx = await requireAuth();
  if (ctx instanceof NextResponse) return ctx;

  if (!(await isAppAdmin(ctx.user.email, ctx.user.globalRole))) {
    return NextResponse.json({ error: 'App admin access required' }, { status: 403 });
  }

  try {
    const users = await listUsers();
    return NextResponse.json({
      success: true,
      data: users.map((u) => ({
        email: u.email,
        displayName: u.displayName,
        globalRole: u.globalRole,
        onboarded: u.onboarded,
        invitedAt: u.invitedAt ? u.invitedAt.toISOString() : null,
        createdAt: u.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Error listing users:', error);
    return NextResponse.json({ error: 'Failed to list users' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireAuth();
  if (ctx instanceof NextResponse) return ctx;

  if (!(await isAppAdmin(ctx.user.email, ctx.user.globalRole))) {
    return NextResponse.json({ error: 'App admin access required' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
    }

    const row = await inviteUser(email, ctx.user.id);
    return NextResponse.json({
      success: true,
      data: { email: row.email, onboarded: row.onboarded },
      message: `${email} can now sign in to create their account`,
    });
  } catch (error) {
    if (String(error).includes('already invited')) {
      return NextResponse.json(
        { error: 'That email is already invited or registered' },
        { status: 409 }
      );
    }
    console.error('Error inviting user:', error);
    return NextResponse.json(
      { error: 'Failed to invite user', details: String(error) },
      { status: 500 }
    );
  }
}
