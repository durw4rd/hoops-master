/**
 * Join Group API
 *
 * POST /api/groups/join - Join a group (public by id, or via invite code)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/apiGuards';
import {
  getGroupById,
  getGroupByInviteCode,
  getGroupMember,
  addGroupMember,
} from '@/lib/queries/groups';

interface JoinGroupRequest {
  groupId?: string;
  inviteCode?: string;
}

export async function POST(request: NextRequest) {
  const ctx = await requireAuth();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const body: JoinGroupRequest = await request.json();
    const { groupId, inviteCode } = body;

    if (!groupId && !inviteCode) {
      return NextResponse.json({ error: 'Either groupId or inviteCode is required' }, { status: 400 });
    }

    let group = inviteCode
      ? await getGroupByInviteCode(inviteCode)
      : groupId
        ? await getGroupById(groupId)
        : null;

    if (inviteCode && !group) {
      return NextResponse.json({ error: 'Invalid invite code' }, { status: 404 });
    }
    if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 });

    if (!inviteCode && group.visibility !== 'public') {
      return NextResponse.json(
        { error: 'This group is private. Use an invite code to join.' },
        { status: 403 }
      );
    }
    if (group.status !== 'active') {
      return NextResponse.json({ error: 'This group is no longer active' }, { status: 403 });
    }

    const existingMember = await getGroupMember(group.groupId, ctx.user.email);
    if (existingMember) {
      if (existingMember.status === 'active') {
        return NextResponse.json({ error: 'You are already a member of this group' }, { status: 409 });
      }
      if (existingMember.status === 'banned') {
        return NextResponse.json({ error: 'You are not allowed to join this group' }, { status: 403 });
      }
    }

    const member = await addGroupMember(group.groupId, ctx.user.email, 'member');

    return NextResponse.json({
      success: true,
      data: {
        group,
        membership: { groupRole: member.groupRole, joinedAt: member.joinedAt },
      },
      message: `Successfully joined ${group.name}`,
    });
  } catch (error) {
    if (String(error).includes('already a member')) {
      return NextResponse.json({ error: 'You are already a member of this group' }, { status: 409 });
    }
    console.error('Error joining group:', error);
    return NextResponse.json(
      { error: 'Failed to join group', details: String(error) },
      { status: 500 }
    );
  }
}
