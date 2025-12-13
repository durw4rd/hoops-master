/**
 * Join Group API
 * 
 * POST /api/groups/join - Join a group (public or via invite code)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { 
  getUserByEmail, 
  getGroupById, 
  getGroupByInviteCode,
  getGroupMember,
  addGroupMember,
} from '@/lib/masterSheet';

interface JoinGroupRequest {
  groupId?: string;      // For public groups
  inviteCode?: string;   // For private groups
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in' },
        { status: 401 }
      );
    }

    const userEmail = session.user.email;

    // Check if user exists
    const user = await getUserByEmail(userEmail);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found. Please sign in again.' },
        { status: 404 }
      );
    }

    // Parse request body
    const body: JoinGroupRequest = await request.json();
    const { groupId, inviteCode } = body;

    if (!groupId && !inviteCode) {
      return NextResponse.json(
        { error: 'Either groupId or inviteCode is required' },
        { status: 400 }
      );
    }

    let group;

    if (inviteCode) {
      // Join via invite code (for private groups)
      group = await getGroupByInviteCode(inviteCode);
      if (!group) {
        return NextResponse.json(
          { error: 'Invalid invite code' },
          { status: 404 }
        );
      }
    } else if (groupId) {
      // Join public group by ID
      group = await getGroupById(groupId);
      if (!group) {
        return NextResponse.json(
          { error: 'Group not found' },
          { status: 404 }
        );
      }

      // Check if group is public
      if (group.visibility !== 'public') {
        return NextResponse.json(
          { error: 'This group is private. Use an invite code to join.' },
          { status: 403 }
        );
      }
    }

    if (!group) {
      return NextResponse.json(
        { error: 'Group not found' },
        { status: 404 }
      );
    }

    // Check if group is active
    if (group.status !== 'active') {
      return NextResponse.json(
        { error: 'This group is no longer active' },
        { status: 403 }
      );
    }

    // Check if already a member
    const existingMember = await getGroupMember(group.groupId, userEmail);
    if (existingMember) {
      if (existingMember.status === 'active') {
        return NextResponse.json(
          { error: 'You are already a member of this group' },
          { status: 409 }
        );
      } else if (existingMember.status === 'banned') {
        return NextResponse.json(
          { error: 'You are not allowed to join this group' },
          { status: 403 }
        );
      }
      // If inactive, they can rejoin - handled below
    }

    // Add as member
    const member = await addGroupMember(group.groupId, userEmail, 'member');

    return NextResponse.json({
      success: true,
      data: {
        group,
        membership: {
          groupRole: member.groupRole,
          joinedAt: member.joinedAt,
        },
      },
      message: `Successfully joined ${group.name}`,
    });
  } catch (error) {
    console.error('Error joining group:', error);
    
    // Handle "already a member" error from addGroupMember
    if (String(error).includes('already a member')) {
      return NextResponse.json(
        { error: 'You are already a member of this group' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to join group', details: String(error) },
      { status: 500 }
    );
  }
}

