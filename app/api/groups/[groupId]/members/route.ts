/**
 * Group Members API
 *
 * GET   /api/groups/[groupId]/members - List group members
 * POST  /api/groups/[groupId]/members - Add member (Capo / King)
 * PATCH /api/groups/[groupId]/members - Change a member's crew role (Capo only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireMember, requireGroupAdmin, requireCrewManager } from '@/lib/apiGuards';
import {
  addGroupMember,
  getGroupMembers,
  getGroupMember,
  updateMemberRole,
} from '@/lib/queries/groups';
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
      .map((m) => ({
        userEmail: m.userEmail,
        displayName: m.displayName,
        pieceUrl: m.pieceUrl,
        groupRole: m.groupRole,
        joinedAt: m.joinedAt,
      }));

    const isAdmin = ctx.member.groupRole === 'admin';

    return NextResponse.json({
      success: true,
      data: {
        members: activeMembers,
        totalActive: activeMembers.length,
        ...(isAdmin && {
          allMembers: members.map((m) => ({
            userEmail: m.userEmail,
            displayName: m.displayName,
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
  const ctx = await requireCrewManager(groupId);
  if (ctx instanceof NextResponse) return ctx;

  try {
    const body = await request.json();
    const { userEmail, groupRole = 'member' } = body;

    if (!userEmail) return NextResponse.json({ error: 'userEmail is required' }, { status: 400 });
    if (!['admin', 'coleader', 'member'].includes(groupRole)) {
      return NextResponse.json({ error: 'Invalid groupRole' }, { status: 400 });
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
        displayName: member.displayName,
        groupRole: member.groupRole,
        joinedAt: member.joinedAt,
        invitedBy: member.invitedBy,
      },
      message: `${member.displayName} added to the crew`,
    });
  } catch (error) {
    if (String(error).includes('already a member')) {
      return NextResponse.json({ error: 'User is already a member of this crew' }, { status: 409 });
    }
    console.error('Error adding group member:', error);
    return NextResponse.json(
      { error: 'Failed to add group member', details: String(error) },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { groupId } = await params;
  const ctx = await requireGroupAdmin(groupId); // Capo only
  if (ctx instanceof NextResponse) return ctx;

  try {
    const body = await request.json();
    const { userEmail, groupRole } = body;

    if (!userEmail) return NextResponse.json({ error: 'userEmail is required' }, { status: 400 });
    // Capos may promote/demote between King (coleader) and Crew (member).
    if (!['coleader', 'member'].includes(groupRole)) {
      return NextResponse.json({ error: 'groupRole must be "coleader" or "member"' }, { status: 400 });
    }

    const target = await getGroupMember(groupId, userEmail);
    if (!target) {
      return NextResponse.json({ error: 'Member not found in this crew' }, { status: 404 });
    }
    if (target.groupRole === 'admin') {
      return NextResponse.json({ error: 'The Crew Capo role cannot be changed here' }, { status: 400 });
    }

    const member = await updateMemberRole(groupId, userEmail, groupRole as GroupRole);

    return NextResponse.json({
      success: true,
      data: member,
      message: `${member?.displayName ?? userEmail} role updated`,
    });
  } catch (error) {
    console.error('Error updating member role:', error);
    return NextResponse.json(
      { error: 'Failed to update member role', details: String(error) },
      { status: 500 }
    );
  }
}
