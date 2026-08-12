/**
 * App-admin Invite API
 *
 * GET   /api/admin/invite - List all users with invite/onboarding status (app-admin).
 * POST  /api/admin/invite - Invite a player by email (app-admin).
 *   Body: { email: string }
 * PATCH /api/admin/invite - Change a registered player's email (app-admin).
 *   Body: { oldEmail: string, newEmail: string }
 * DELETE /api/admin/invite - Buff a player from the Black Book (app-admin soft-remove).
 *   Body: { email: string }
 *
 * Invite-only access: only emails added here (or seeded) can sign in. The invitee
 * picks their username during onboarding on first sign-in.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/apiGuards';
import { isAppAdminRole } from '@/lib/roles';
import { inviteUser, listUsers, updateUserEmail, removeUserFromApp } from '@/lib/queries/users';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET() {
  const ctx = await requireAuth();
  if (ctx instanceof NextResponse) return ctx;

  if (!(isAppAdminRole(ctx.user.globalRole))) {
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

  if (!(isAppAdminRole(ctx.user.globalRole))) {
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

export async function PATCH(request: NextRequest) {
  const ctx = await requireAuth();
  if (ctx instanceof NextResponse) return ctx;

  if (!(isAppAdminRole(ctx.user.globalRole))) {
    return NextResponse.json({ error: 'App admin access required' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const oldEmail = typeof body?.oldEmail === 'string' ? body.oldEmail.trim().toLowerCase() : '';
    const newEmail = typeof body?.newEmail === 'string' ? body.newEmail.trim().toLowerCase() : '';

    if (!EMAIL_RE.test(oldEmail) || !EMAIL_RE.test(newEmail)) {
      return NextResponse.json({ error: 'Both oldEmail and newEmail must be valid email addresses' }, { status: 400 });
    }

    await updateUserEmail(oldEmail, newEmail);
    return NextResponse.json({
      success: true,
      message: `Email updated from ${oldEmail} to ${newEmail}. The player will need to sign in again with their new address.`,
    });
  } catch (error) {
    if (String(error).includes('already in use')) {
      return NextResponse.json({ error: 'That email is already in use' }, { status: 409 });
    }
    if (String(error).includes('not found')) {
      return NextResponse.json({ error: 'No user found with that email' }, { status: 404 });
    }
    console.error('Error updating user email:', error);
    return NextResponse.json({ error: 'Failed to update email', details: String(error) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const ctx = await requireAuth();
  if (ctx instanceof NextResponse) return ctx;

  if (!(isAppAdminRole(ctx.user.globalRole))) {
    return NextResponse.json({ error: 'App admin access required' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (!email) {
      return NextResponse.json({ error: 'email is required' }, { status: 400 });
    }

    const row = await removeUserFromApp(email, ctx.user.id);

    return NextResponse.json({
      success: true,
      message: `${row.displayName || email} buffed from the Black Book`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('not found')) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    if (
      msg.includes('Owner') ||
      msg.includes('yourself') ||
      msg.includes('already removed')
    ) {
      return NextResponse.json({ error: msg }, { status: 403 });
    }
    console.error('Error removing user from Black Book:', error);
    return NextResponse.json({ error: 'Failed to remove user', details: msg }, { status: 500 });
  }
}
