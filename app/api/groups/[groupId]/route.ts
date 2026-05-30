/**
 * Individual Group API
 *
 * GET    /api/groups/[groupId] - Get group details
 * PATCH  /api/groups/[groupId] - Update group settings (admin only)
 * DELETE /api/groups/[groupId] - Archive group (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireGroupAdmin } from '@/lib/apiGuards';
import { getSessionUser } from '@/lib/session';
import {
  getGroupRowById,
  getMemberRow,
  getGroupMembers,
  toGroupDTO,
  updateGroup,
  updateGroupStatus,
} from '@/lib/queries/groups';
import { GroupVisibility } from '@/lib/types';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized - Please sign in' }, { status: 401 });

  try {
    const { groupId } = await params;
    const groupRow = await getGroupRowById(groupId);
    if (!groupRow) return NextResponse.json({ error: 'Group not found' }, { status: 404 });

    const member = await getMemberRow(groupId, user.id);
    const isMember = member && member.status === 'active';
    const isAdmin = member?.groupRole === 'admin';

    if (!isMember && groupRow.visibility !== 'public') {
      return NextResponse.json({ error: 'You do not have access to this group' }, { status: 403 });
    }

    const group = toGroupDTO(groupRow);
    const response: Record<string, unknown> = {
      groupId: group.groupId,
      name: group.name,
      description: group.description,
      visibility: group.visibility,
      timezone: group.timezone,
      defaultEventSpots: group.defaultEventSpots,
      defaultSlotCost: group.defaultSlotCost,
      roundRobinSlide: group.roundRobinSlide,
      createdAt: group.createdAt,
      status: group.status,
    };

    if (isMember) {
      response.membership = {
        groupRole: member!.groupRole,
        joinedAt: member!.joinedAt.toISOString(),
        status: member!.status,
      };
    }

    if (isAdmin) {
      response.inviteCode = group.inviteCode;
      response.createdBy = group.createdBy;
      const members = await getGroupMembers(groupId);
      response.memberCount = members.filter((m) => m.status === 'active').length;
    }

    return NextResponse.json({ success: true, data: response });
  } catch (error) {
    console.error('Error fetching group:', error);
    return NextResponse.json({ error: 'Failed to fetch group' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { groupId } = await params;
  const ctx = await requireGroupAdmin(groupId);
  if (ctx instanceof NextResponse) return ctx;

  try {
    const body = await request.json();
    const { visibility, description, defaultEventSpots, defaultSlotCost, timezone, roundRobinSlide, name } =
      body;

    if (visibility && !['public', 'private'].includes(visibility)) {
      return NextResponse.json({ error: 'visibility must be "public" or "private"' }, { status: 400 });
    }

    const updated = await updateGroup(groupId, {
      visibility: visibility as GroupVisibility | undefined,
      description,
      defaultEventSpots,
      defaultSlotCost,
      timezone,
      roundRobinSlide,
      name,
    });
    if (!updated) return NextResponse.json({ error: 'Group not found' }, { status: 404 });

    return NextResponse.json({ success: true, data: updated, message: 'Group settings updated' });
  } catch (error) {
    console.error('Error updating group:', error);
    return NextResponse.json({ error: 'Failed to update group settings' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { groupId } = await params;
  const ctx = await requireGroupAdmin(groupId);
  if (ctx instanceof NextResponse) return ctx;

  try {
    const updated = await updateGroupStatus(groupId, 'archived');
    if (!updated) return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    return NextResponse.json({ success: true, message: 'Group archived successfully' });
  } catch (error) {
    console.error('Error archiving group:', error);
    return NextResponse.json({ error: 'Failed to archive group' }, { status: 500 });
  }
}
