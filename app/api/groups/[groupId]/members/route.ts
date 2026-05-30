/**
 * Group Members API
 *
 * GET  /api/groups/[groupId]/members - List group members
 * POST /api/groups/[groupId]/members - Add member (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireMember, requireGroupAdmin } from '@/lib/apiGuards';
import { addGroupMember, getGroupMembers, getGroupMember } from '@/lib/queries/groups';
import { getUserByEmail } from '@/lib/queries/users';
import { GroupRole } from '@/lib/types';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { groupId } = await params;
  const ctx = await requireMember(groupId);
  if (ctx instanceof NextResponse) return ctx;

  try {
    const members = await getGroupMembers(groupId);
    const activeMembers = members
      .filter((m) => m.status === 'active')
      .map((m) => ({ userEmail: m.userEmail, groupRole: m.groupRole, joinedAt: m.joinedAt }));

    const isAdmin = ctx.member.groupRole === 'admin';

    return NextResponse.json({
      success: true,
      data: {
        members: activeMembers,
        totalActive: activeMembers.length,
        ...(isAdmin && {
          allMembers: members.map((m) => ({
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
    return NextResponse.json({ error: 'Failed to fetch group members' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { groupId } = await params;
  const ctx = await requireGroupAdmin(groupId);
  if (ctx instanceof NextResponse) return ctx;

  try {
    const body = await request.json();
    const { userEmail, groupRole = 'member' } = body;

    if (!userEmail) return NextResponse.json({ error: 'userEmail is required' }, { status: 400 });
    if (!['admin', 'member'].includes(groupRole)) {
      return NextResponse.json({ error: 'groupRole must be "admin" or "member"' }, { status: 400 });
    }

    const user = await getUserByEmail(userEmail);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found. They must sign in to the app first.' },
        { status: 404 }
      );
    }

    const member = await addGroupMember(groupId, userEmail, groupRole as GroupRole, ctx.user.email);

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
    if (String(error).includes('already a member')) {
      return NextResponse.json({ error: 'User is already a member of this group' }, { status: 409 });
    }
    console.error('Error adding group member:', error);
    return NextResponse.json(
      { error: 'Failed to add group member', details: String(error) },
      { status: 500 }
    );
  }
}
