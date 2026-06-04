/**
 * Group + membership queries (Neon/Drizzle).
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { groups, groupMembers, users, spotTransactions, payments, events } from '@/lib/db/schema';
import { getUserRowByEmail } from './users';
import type {
  Group,
  GroupMember,
  GroupMembership,
  GroupRole,
  GroupStatus,
  GroupVisibility,
  MemberStatus,
} from '@/lib/types';

type GroupRow = typeof groups.$inferSelect;
type MemberRow = typeof groupMembers.$inferSelect;

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export function toGroupDTO(row: GroupRow): Group {
  return {
    groupId: row.id,
    name: row.name,
    description: row.description ?? '',
    bannerUrl: row.bannerUrl ?? undefined,
    visibility: row.visibility as GroupVisibility,
    timezone: row.timezone,
    defaultEventSpots: row.defaultEventSpots,
    defaultSlotCost: Number(row.defaultSlotCost),
    roundRobinSlide: row.roundRobinSlide,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    inviteCode: row.inviteCode,
    status: row.status as GroupStatus,
  };
}

export async function getGroupRowById(groupId: string): Promise<GroupRow | null> {
  const [row] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
  return row ?? null;
}

export async function getGroupById(groupId: string): Promise<Group | null> {
  const row = await getGroupRowById(groupId);
  return row ? toGroupDTO(row) : null;
}

export async function getGroupByInviteCode(inviteCode: string): Promise<Group | null> {
  const [row] = await db
    .select()
    .from(groups)
    .where(eq(groups.inviteCode, inviteCode.toUpperCase()))
    .limit(1);
  return row ? toGroupDTO(row) : null;
}

export async function getPublicGroups(): Promise<Group[]> {
  const rows = await db
    .select()
    .from(groups)
    .where(and(eq(groups.visibility, 'public'), eq(groups.status, 'active')));
  return rows.map(toGroupDTO);
}

export interface CreateGroupInput {
  name: string;
  description?: string;
  bannerUrl?: string;
  visibility?: GroupVisibility;
  defaultEventSpots?: number;
  defaultSlotCost?: number;
  timezone?: string;
  roundRobinSlide?: number;
}

/**
 * Creates a group and adds the creator as an admin member (single transaction).
 */
export async function createGroup(input: CreateGroupInput, creatorId: string): Promise<Group> {
  return db.transaction(async (tx) => {
    const [group] = await tx
      .insert(groups)
      .values({
        name: input.name,
        description: input.description ?? '',
        bannerUrl: input.bannerUrl ?? null,
        visibility: input.visibility ?? 'private',
        defaultEventSpots: input.defaultEventSpots ?? 10,
        defaultSlotCost: String(input.defaultSlotCost ?? 0),
        timezone: input.timezone ?? 'Europe/Prague',
        roundRobinSlide: input.roundRobinSlide ?? 1,
        inviteCode: generateInviteCode(),
        createdBy: creatorId,
      })
      .returning();

    await tx.insert(groupMembers).values({
      groupId: group.id,
      userId: creatorId,
      groupRole: 'admin',
      status: 'active',
    });

    return toGroupDTO(group);
  });
}

export async function updateGroup(
  groupId: string,
  updates: Partial<{
    visibility: GroupVisibility;
    description: string;
    bannerUrl: string | null;
    defaultEventSpots: number;
    defaultSlotCost: number;
    timezone: string;
    roundRobinSlide: number;
    name: string;
  }>
): Promise<Group | null> {
  const patch: Record<string, unknown> = {};
  if (updates.visibility !== undefined) patch.visibility = updates.visibility;
  if (updates.description !== undefined) patch.description = updates.description;
  if (updates.bannerUrl !== undefined) patch.bannerUrl = updates.bannerUrl;
  if (updates.defaultEventSpots !== undefined) patch.defaultEventSpots = updates.defaultEventSpots;
  if (updates.defaultSlotCost !== undefined) patch.defaultSlotCost = String(updates.defaultSlotCost);
  if (updates.timezone !== undefined) patch.timezone = updates.timezone;
  if (updates.roundRobinSlide !== undefined) patch.roundRobinSlide = updates.roundRobinSlide;
  if (updates.name !== undefined) patch.name = updates.name;
  if (Object.keys(patch).length === 0) return getGroupById(groupId);

  const [row] = await db.update(groups).set(patch).where(eq(groups.id, groupId)).returning();
  return row ? toGroupDTO(row) : null;
}

export async function updateGroupStatus(groupId: string, status: GroupStatus): Promise<Group | null> {
  const [row] = await db.update(groups).set({ status }).where(eq(groups.id, groupId)).returning();
  return row ? toGroupDTO(row) : null;
}

/**
 * Permanently delete a crew and everything tied to it. Ledger rows and payments
 * have no cascade FK, so they're removed first; deleting the group then cascades
 * members, events (→ attendees + waitlist) and the round-robin roster.
 */
export async function deleteGroup(groupId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx.delete(spotTransactions).where(eq(spotTransactions.groupId, groupId));
    await tx.delete(payments).where(eq(payments.groupId, groupId));
    const deleted = await tx.delete(groups).where(eq(groups.id, groupId)).returning();
    return deleted.length > 0;
  });
}

// ---------------------------------------------------------------------------
// Memberships
// ---------------------------------------------------------------------------

interface MemberWithEmail {
  membership: MemberRow;
  email: string;
  displayName: string;
}

export async function getMemberRow(groupId: string, userId: string): Promise<MemberRow | null> {
  const [row] = await db
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
    .limit(1);
  return row ?? null;
}

/** Look up a member by email (resolves email -> id first). */
export async function getGroupMember(groupId: string, email: string): Promise<GroupMember | null> {
  const user = await getUserRowByEmail(email);
  if (!user) return null;
  const row = await getMemberRow(groupId, user.id);
  if (!row) return null;
  return {
    groupId: row.groupId,
    userEmail: user.email,
    displayName: user.displayName,
    groupRole: row.groupRole as GroupRole,
    joinedAt: row.joinedAt.toISOString(),
    invitedBy: row.invitedBy,
    status: row.status as MemberStatus,
  };
}

/** Set a member's crew role (Capo-only action). Returns updated member. */
export async function updateMemberRole(
  groupId: string,
  email: string,
  groupRole: GroupRole
): Promise<GroupMember | null> {
  const user = await getUserRowByEmail(email);
  if (!user) return null;
  const [row] = await db
    .update(groupMembers)
    .set({ groupRole })
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, user.id)))
    .returning();
  if (!row) return null;
  return {
    groupId: row.groupId,
    userEmail: user.email,
    displayName: user.displayName,
    groupRole: row.groupRole as GroupRole,
    joinedAt: row.joinedAt.toISOString(),
    invitedBy: row.invitedBy,
    status: row.status as MemberStatus,
  };
}

export async function isGroupAdmin(groupId: string, email: string): Promise<boolean> {
  const member = await getGroupMember(groupId, email);
  return !!member && member.status === 'active' && member.groupRole === 'admin';
}

export async function getGroupMembers(groupId: string): Promise<GroupMember[]> {
  const rows = await db
    .select({ m: groupMembers, email: users.email, displayName: users.displayName })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(eq(groupMembers.groupId, groupId));

  return rows.map(({ m, email, displayName }) => ({
    groupId: m.groupId,
    userEmail: email,
    displayName,
    groupRole: m.groupRole as GroupRole,
    joinedAt: m.joinedAt.toISOString(),
    invitedBy: m.invitedBy,
    status: m.status as MemberStatus,
  }));
}

/** Active group members enriched with user id + display name (for assignment). */
export async function getActiveMembersWithUsers(groupId: string): Promise<MemberWithEmail[]> {
  const rows = await db
    .select({ m: groupMembers, u: users })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.status, 'active')));
  return rows.map(({ m, u }) => ({ membership: m, email: u.email, displayName: u.displayName }));
}

/**
 * Add (or reactivate) a member by email. The user must already exist.
 */
export async function addGroupMember(
  groupId: string,
  email: string,
  groupRole: GroupRole = 'member',
  invitedByEmail?: string
): Promise<GroupMember> {
  const user = await getUserRowByEmail(email);
  if (!user) throw new Error('User not found. They must sign in to the app first.');

  const invitedBy = invitedByEmail ? (await getUserRowByEmail(invitedByEmail))?.id ?? null : null;

  const existing = await getMemberRow(groupId, user.id);
  if (existing) {
    if (existing.status === 'active') throw new Error('User is already a member');
    const [row] = await db
      .update(groupMembers)
      .set({ status: 'active', groupRole })
      .where(eq(groupMembers.id, existing.id))
      .returning();
    return {
      groupId: row.groupId,
      userEmail: user.email,
      displayName: user.displayName,
      groupRole: row.groupRole as GroupRole,
      joinedAt: row.joinedAt.toISOString(),
      invitedBy: row.invitedBy,
      status: row.status as MemberStatus,
    };
  }

  const [row] = await db
    .insert(groupMembers)
    .values({ groupId, userId: user.id, groupRole, invitedBy })
    .returning();

  return {
    groupId: row.groupId,
    userEmail: user.email,
    displayName: user.displayName,
    groupRole: row.groupRole as GroupRole,
    joinedAt: row.joinedAt.toISOString(),
    invitedBy: row.invitedBy,
    status: row.status as MemberStatus,
  };
}

/** Memberships for a user (by email), enriched with group name. */
export async function getUserGroups(email: string): Promise<GroupMembership[]> {
  const user = await getUserRowByEmail(email);
  if (!user) return [];
  const rows = await db
    .select({ m: groupMembers, g: groups })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(and(eq(groupMembers.userId, user.id), eq(groupMembers.status, 'active')));

  return rows.map(({ m, g }) => ({
    groupId: g.id,
    groupName: g.name,
    groupRole: m.groupRole as GroupRole,
    status: m.status as MemberStatus,
  }));
}

/** Full group records for a user's active memberships. */
export async function getUserGroupRecords(email: string): Promise<Group[]> {
  const user = await getUserRowByEmail(email);
  if (!user) return [];
  const rows = await db
    .select({ g: groups })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(and(eq(groupMembers.userId, user.id), eq(groupMembers.status, 'active')));

  return Promise.all(
    rows.map(async ({ g }) => {
      const [memberRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, g.id), eq(groupMembers.status, 'active')));
      const [eventRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(events)
        .where(and(eq(events.groupId, g.id), eq(events.status, 'scheduled')));
      return {
        ...toGroupDTO(g),
        memberCount: memberRow?.count ?? 0,
        eventCount: eventRow?.count ?? 0,
      };
    })
  );
}

export type { GroupRow, MemberRow };
