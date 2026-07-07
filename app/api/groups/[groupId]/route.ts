/**
 * Individual Group API
 *
 * GET    /api/groups/[groupId] - Get group details
 * PATCH  /api/groups/[groupId] - Update group settings (admin only)
 * DELETE /api/groups/[groupId] - Archive group (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireCrewManager } from '@/lib/apiGuards';
import { getSessionUser } from '@/lib/session';
import {
  getGroupRowById,
  getMemberRow,
  getGroupMembers,
  toGroupDTO,
  updateGroup,
  deleteGroup,
} from '@/lib/queries/groups';
import { getUserRowByEmail } from '@/lib/queries/users';
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
      bannerUrl: group.bannerUrl,
      bannerOrientation: group.bannerOrientation,
      visibility: group.visibility,
      timezone: group.timezone,
      defaultEventSpots: group.defaultEventSpots,
      defaultSlotCost: group.defaultSlotCost,
      defaultPricingMode: group.defaultPricingMode,
      defaultTotalCost: group.defaultTotalCost,
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
  const ctx = await requireCrewManager(groupId);
  if (ctx instanceof NextResponse) return ctx;

  try {
    const body = await request.json();
    const { visibility, description, bannerUrl, bannerOrientation, defaultEventSpots, defaultSlotCost, defaultPricingMode, defaultTotalCost, timezone, roundRobinSlide, name } =
      body;

    if (visibility && !['public', 'private'].includes(visibility)) {
      return NextResponse.json({ error: 'visibility must be "public" or "private"' }, { status: 400 });
    }
    if (defaultPricingMode && !['per_spot', 'split_total'].includes(defaultPricingMode)) {
      return NextResponse.json({ error: 'defaultPricingMode must be per_spot or split_total' }, { status: 400 });
    }

    const updated = await updateGroup(groupId, {
      visibility: visibility as GroupVisibility | undefined,
      description,
      bannerUrl,
      bannerOrientation,
      defaultEventSpots,
      defaultSlotCost,
      defaultPricingMode,
      defaultTotalCost,
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
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized - Please sign in' }, { status: 401 });

  try {
    const groupRow = await getGroupRowById(groupId);
    if (!groupRow) return NextResponse.json({ error: 'Crew not found' }, { status: 404 });

    // The Owner can delete any crew; a Capo can delete their own crew.
    // Read the DB role (the JWT may be stale right after a promotion).
    const dbUser = await getUserRowByEmail(user.email);
    const isOwner = dbUser?.globalRole === 'owner';
    const member = await getMemberRow(groupId, user.id);
    const isCapo = member?.status === 'active' && member?.groupRole === 'admin';

    if (!isOwner && !isCapo) {
      return NextResponse.json(
        { error: 'Only the Owner or this crew\'s Capo can delete it' },
        { status: 403 }
      );
    }

    const ok = await deleteGroup(groupId);
    if (!ok) return NextResponse.json({ error: 'Crew not found' }, { status: 404 });
    return NextResponse.json({ success: true, message: 'Crew deleted' });
  } catch (error) {
    console.error('Error deleting crew:', error);
    return NextResponse.json({ error: 'Failed to delete crew', details: String(error) }, { status: 500 });
  }
}
