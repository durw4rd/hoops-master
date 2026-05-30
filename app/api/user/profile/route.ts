/**
 * User Profile API
 *
 * GET /api/user/profile - Current user's profile with group memberships
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOrCreateUser, toAppUser } from '@/lib/queries/users';
import { getUserGroups } from '@/lib/queries/groups';
import { UserProfile } from '@/lib/types';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized - Please sign in' }, { status: 401 });
    }

    const email = session.user.email;
    const displayName = session.user.name || email.split('@')[0];

    // Upsert ensures the user row exists (and refreshes display name).
    const userRow = await getOrCreateUser(email, displayName);
    const user = toAppUser(userRow);
    const groups = await getUserGroups(email);

    const profile: UserProfile = {
      email: user.email,
      displayName: user.displayName,
      globalRole: user.globalRole,
      createdAt: user.createdAt,
      groups,
    };

    return NextResponse.json({ success: true, data: profile });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return NextResponse.json({ error: 'Failed to fetch user profile' }, { status: 500 });
  }
}
