/**
 * User Profile API
 *
 * GET   /api/user/profile - Current user's profile with group memberships
 * PATCH /api/user/profile - Update the current user's handle/tag (displayName)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getUserByEmail, updateDisplayName } from '@/lib/queries/users';
import { getUserGroups } from '@/lib/queries/groups';
import { requireAuth } from '@/lib/apiGuards';
import { UserProfile } from '@/lib/types';

const MAX_USERNAME = 30;

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized - Please sign in' }, { status: 401 });
    }

    const email = session.user.email;

    // Invite-only: the row must already exist (created by an admin invite or seed).
    const user = await getUserByEmail(email);
    if (!user) {
      return NextResponse.json({ error: 'No account for this email' }, { status: 403 });
    }
    const groups = await getUserGroups(email);

    const profile: UserProfile = {
      email: user.email,
      displayName: user.displayName,
      globalRole: user.globalRole,
      onboarded: user.onboarded,
      createdAt: user.createdAt,
      groups,
    };

    return NextResponse.json({ success: true, data: profile });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return NextResponse.json({ error: 'Failed to fetch user profile' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const ctx = await requireAuth();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const body = await request.json();
    const name = typeof body?.displayName === 'string' ? body.displayName.trim() : '';

    if (name.length < 2) {
      return NextResponse.json(
        { error: 'Your tag must be at least 2 characters' },
        { status: 400 }
      );
    }
    if (name.length > MAX_USERNAME) {
      return NextResponse.json(
        { error: `Your tag must be at most ${MAX_USERNAME} characters` },
        { status: 400 }
      );
    }

    const row = await updateDisplayName(ctx.user.id, name);
    if (!row) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: { displayName: row.displayName } });
  } catch (error) {
    console.error('Error updating profile:', error);
    return NextResponse.json(
      { error: 'Failed to update profile', details: String(error) },
      { status: 500 }
    );
  }
}
