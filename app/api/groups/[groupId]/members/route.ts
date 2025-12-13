/**
 * Group Members API
 * 
 * GET /api/groups/[groupId]/members - List group members
 * POST /api/groups/[groupId]/members - Add member (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { 
  getGroupMember,
  getGroupMembers,
  addGroupMember,
  getUserByEmail,
  isGroupAdmin,
} from '@/lib/masterSheet';
import { GroupRole } from '@/lib/types';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

/**
 * GET /api/groups/[groupId]/members - List group members
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in' },
        { status: 401 }
      );
    }

    const { groupId } = await params;
    const userEmail = session.user.email;

    // Check if user is a member
    const currentMember = await getGroupMember(groupId, userEmail);
    if (!currentMember || currentMember.status !== 'active') {
      return NextResponse.json(
        { error: 'You are not a member of this group' },
        { status: 403 }
      );
    }

    // Get all members
    const members = await getGroupMembers(groupId);

    // Filter to active members and format response
    const activeMembers = members
      .filter(m => m.status === 'active')
      .map(m => ({
        userEmail: m.userEmail,
        groupRole: m.groupRole,
        joinedAt: m.joinedAt,
      }));

    // Admins can see all members including inactive
    const isAdmin = currentMember.groupRole === 'admin';
    
    return NextResponse.json({
      success: true,
      data: {
        members: activeMembers,
        totalActive: activeMembers.length,
        ...(isAdmin && {
          allMembers: members.map(m => ({
            userEmail: m.userEmail,
            groupRole: m.groupRole,
            joinedAt: m.joinedAt,
            invitedBy: m.invitedBy,
            status: m.status,
          })),
        }),
      },
    });
  } catch (error) {
    console.error('Error fetching group members:', error);
    return NextResponse.json(
      { error: 'Failed to fetch group members' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/groups/[groupId]/members - Add member (admin only)
 * 
 * Body: { userEmail, groupRole }
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in' },
        { status: 401 }
      );
    }

    const { groupId } = await params;
    const adminEmail = session.user.email;

    // Check if current user is group admin
    const isAdmin = await isGroupAdmin(groupId, adminEmail);
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Only group admins can add members' },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { userEmail, groupRole = 'member' } = body;

    if (!userEmail) {
      return NextResponse.json(
        { error: 'userEmail is required' },
        { status: 400 }
      );
    }

    // Validate role
    if (!['admin', 'member'].includes(groupRole)) {
      return NextResponse.json(
        { error: 'groupRole must be "admin" or "member"' },
        { status: 400 }
      );
    }

    // Check if user exists in the system
    const user = await getUserByEmail(userEmail);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found. They must sign in to the app first.' },
        { status: 404 }
      );
    }

    // Add the member
    const member = await addGroupMember(
      groupId,
      userEmail,
      groupRole as GroupRole,
      adminEmail
    );

    return NextResponse.json({
      success: true,
      data: {
        userEmail: member.userEmail,
        groupRole: member.groupRole,
        joinedAt: member.joinedAt,
        invitedBy: member.invitedBy,
      },
      message: `${userEmail} added to the group`,
    });
  } catch (error) {
    console.error('Error adding group member:', error);
    
    if (String(error).includes('already a member')) {
      return NextResponse.json(
        { error: 'User is already a member of this group' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to add group member', details: String(error) },
      { status: 500 }
    );
  }
}

