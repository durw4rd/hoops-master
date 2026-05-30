/**
 * Reusable API route guards. Each returns either a typed context object or a
 * NextResponse error — callers do `if (ctx instanceof NextResponse) return ctx;`.
 */

import { NextResponse } from 'next/server';
import { getSessionUser, type SessionUser } from '@/lib/session';
import { getGroupRowById, getMemberRow } from '@/lib/queries/groups';
import type { GroupRow, MemberRow } from '@/lib/queries/groups';

export interface MemberContext {
  user: SessionUser;
  group: GroupRow;
  member: MemberRow;
}

export interface AuthContext {
  user: SessionUser;
}

export async function requireAuth(): Promise<AuthContext | NextResponse> {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized - Please sign in' }, { status: 401 });
  }
  return { user };
}

/** Requires an active membership in the group. */
export async function requireMember(groupId: string): Promise<MemberContext | NextResponse> {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized - Please sign in' }, { status: 401 });
  }
  const group = await getGroupRowById(groupId);
  if (!group) {
    return NextResponse.json({ error: 'Group not found' }, { status: 404 });
  }
  const member = await getMemberRow(groupId, user.id);
  if (!member || member.status !== 'active') {
    return NextResponse.json({ error: 'You are not a member of this group' }, { status: 403 });
  }
  return { user, group, member };
}

/** Requires the Crew Capo (group leader) — full crew control. */
export async function requireGroupAdmin(groupId: string): Promise<MemberContext | NextResponse> {
  const ctx = await requireMember(groupId);
  if (ctx instanceof NextResponse) return ctx;
  if (ctx.member.groupRole !== 'admin') {
    return NextResponse.json({ error: 'Only the Crew Capo can perform this action' }, { status: 403 });
  }
  return ctx;
}

/** Requires a crew manager (Capo or King) — manage events + add members. */
export async function requireCrewManager(groupId: string): Promise<MemberContext | NextResponse> {
  const ctx = await requireMember(groupId);
  if (ctx instanceof NextResponse) return ctx;
  if (ctx.member.groupRole !== 'admin' && ctx.member.groupRole !== 'coleader') {
    return NextResponse.json(
      { error: 'Only the Crew Capo or a King can perform this action' },
      { status: 403 }
    );
  }
  return ctx;
}
