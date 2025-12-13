/**
 * User Profile API
 * 
 * GET /api/user/profile - Get current user's profile with group memberships
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getUserByEmail, getUserGroups, getOrCreateUser } from '@/lib/masterSheet';
import { UserProfile } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    // Get authenticated session
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in' },
        { status: 401 }
      );
    }

    const email = session.user.email;
    const displayName = session.user.name || email.split('@')[0];

    // Get or create user in AppUsers sheet
    const user = await getOrCreateUser(email, displayName);

    // Get user's group memberships
    const groups = await getUserGroups(email);

    // Build profile response
    const profile: UserProfile = {
      email: user.email,
      displayName: user.displayName,
      globalRole: user.globalRole,
      createdAt: user.createdAt,
      groups,
    };

    return NextResponse.json({
      success: true,
      data: profile,
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user profile' },
      { status: 500 }
    );
  }
}

