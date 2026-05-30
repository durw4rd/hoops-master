/**
 * User Profile API
 *
 * GET /api/user/profile - Current user's profile with group memberships
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getUserByEmail } from '@/lib/queries/users';
import { getUserGroups } from '@/lib/queries/groups';
import { UserProfile } from '@/lib/types';

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
