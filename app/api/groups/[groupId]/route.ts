/**
 * Individual Group API
 * 
 * GET /api/groups/[groupId] - Get group details
 * PATCH /api/groups/[groupId] - Update group settings (admin only)
 * DELETE /api/groups/[groupId] - Archive group (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { 
  getGroupById,
  getGroupMember,
  getGroupMembers,
  isGroupAdmin,
  updateGroupStatus,
  updateGroup,
} from '@/lib/masterSheet';
import { GroupVisibility } from '@/lib/types';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

/**
 * GET /api/groups/[groupId] - Get group details
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

    // Get the group
    const group = await getGroupById(groupId);
    if (!group) {
      return NextResponse.json(
        { error: 'Group not found' },
        { status: 404 }
      );
    }

    // Check if user is a member (or if group is public)
    const member = await getGroupMember(groupId, userEmail);
    const isMember = member && member.status === 'active';
    const isAdmin = member?.groupRole === 'admin';

    if (!isMember && group.visibility !== 'public') {
      return NextResponse.json(
        { error: 'You do not have access to this group' },
        { status: 403 }
      );
    }

    // Build response based on access level
    const response: Record<string, unknown> = {
      groupId: group.groupId,
      name: group.name,
      description: group.description,
      visibility: group.visibility,
      defaultEventSpots: group.defaultEventSpots,
      createdAt: group.createdAt,
      status: group.status,
    };

    // Include additional info for members
    if (isMember) {
      response.spreadsheetId = group.spreadsheetId;
      response.membership = {
        groupRole: member.groupRole,
        joinedAt: member.joinedAt,
        status: member.status,
      };
    }

    // Include admin-only info
    if (isAdmin) {
      response.inviteCode = group.inviteCode;
      response.createdBy = group.createdBy;
      
      // Get member count
      const members = await getGroupMembers(groupId);
      response.memberCount = members.filter(m => m.status === 'active').length;
    }

    return NextResponse.json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error('Error fetching group:', error);
    return NextResponse.json(
      { error: 'Failed to fetch group' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/groups/[groupId] - Update group settings (admin only)
 * 
 * Body: { visibility?, description?, defaultEventSpots? }
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
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

    // Check if user is group admin
    const isAdmin = await isGroupAdmin(groupId, userEmail);
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Only group admins can update group settings' },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { visibility, description, defaultEventSpots } = body;

    // Validate visibility if provided
    if (visibility && !['public', 'private'].includes(visibility)) {
      return NextResponse.json(
        { error: 'visibility must be "public" or "private"' },
        { status: 400 }
      );
    }

    // Update the group
    const updates: {
      visibility?: GroupVisibility;
      description?: string;
      defaultEventSpots?: number;
    } = {};

    if (visibility) updates.visibility = visibility as GroupVisibility;
    if (description !== undefined) updates.description = description;
    if (defaultEventSpots !== undefined) updates.defaultEventSpots = defaultEventSpots;

    const updatedGroup = await updateGroup(groupId, updates);

    if (!updatedGroup) {
      return NextResponse.json(
        { error: 'Group not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: updatedGroup,
      message: 'Group settings updated successfully',
    });
  } catch (error) {
    console.error('Error updating group:', error);
    return NextResponse.json(
      { error: 'Failed to update group settings' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/groups/[groupId] - Archive group (admin only)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
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

    // Check if user is group admin
    const isAdmin = await isGroupAdmin(groupId, userEmail);
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Only group admins can archive groups' },
        { status: 403 }
      );
    }

    // Archive the group (don't delete, just mark as archived)
    const updatedGroup = await updateGroupStatus(groupId, 'archived');

    if (!updatedGroup) {
      return NextResponse.json(
        { error: 'Group not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Group archived successfully',
    });
  } catch (error) {
    console.error('Error archiving group:', error);
    return NextResponse.json(
      { error: 'Failed to archive group' },
      { status: 500 }
    );
  }
}

