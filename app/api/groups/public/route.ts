/**
 * Public Groups API
 * 
 * GET /api/groups/public - List all public groups (for discovery)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPublicGroups } from '@/lib/masterSheet';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in' },
        { status: 401 }
      );
    }

    const groups = await getPublicGroups();

    // Return groups without sensitive info (like invite codes)
    const publicGroups = groups.map(group => ({
      groupId: group.groupId,
      name: group.name,
      description: group.description,
      visibility: group.visibility,
      defaultEventSpots: group.defaultEventSpots,
      createdAt: group.createdAt,
      status: group.status,
    }));

    return NextResponse.json({
      success: true,
      data: publicGroups,
    });
  } catch (error) {
    console.error('Error fetching public groups:', error);
    return NextResponse.json(
      { error: 'Failed to fetch public groups' },
      { status: 500 }
    );
  }
}

