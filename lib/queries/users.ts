/**
 * User queries (Neon/Drizzle).
 */

import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  eventAttendees,
  events,
  groupMembers,
  groups,
  users,
} from '@/lib/db/schema';
import type { AppUser, GlobalRole } from '@/lib/types';

type UserRow = typeof users.$inferSelect;

export interface UserRemovalWarnings {
  confirmedSpotCount: number;
  spotBreakdown: { crewName: string; count: number }[];
  balances: { crewName: string; balance: number }[];
}

function toAppUser(row: UserRow): AppUser {
  return {
    email: row.email,
    displayName: row.displayName,
    pieceUrl: row.pieceUrl ?? undefined,
    globalRole: row.globalRole as GlobalRole,
    onboarded: row.onboarded,
    emailGameReminders: row.emailGameReminders,
    emailBenchPromotions: row.emailBenchPromotions,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getUserById(id: string): Promise<UserRow | null> {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row ?? null;
}

export async function getUserRowByEmail(email: string): Promise<UserRow | null> {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  return row ?? null;
}

export async function getUserByEmail(email: string): Promise<AppUser | null> {
  const row = await getUserRowByEmail(email);
  return row && !row.removedAt ? toAppUser(row) : null;
}

/**
 * Invite a user (app-admin action). Creates an allowlist row that the invitee
 * can later sign in against. They pick their real username during onboarding,
 * so the initial display name is just a placeholder derived from the email.
 * Throws if the email is already invited/registered.
 * Re-activates a previously removed (buffed) user.
 */
export async function inviteUser(email: string, invitedById: string): Promise<UserRow> {
  const normalized = email.trim().toLowerCase();
  const existing = await getUserRowByEmail(normalized);
  if (existing && !existing.removedAt) {
    throw new Error('User is already invited or registered');
  }

  if (existing?.removedAt) {
    const [row] = await db
      .update(users)
      .set({
        removedAt: null,
        removedBy: null,
        onboarded: false,
        displayName: normalized.split('@')[0],
        invitedBy: invitedById,
        invitedAt: new Date(),
      })
      .where(eq(users.id, existing.id))
      .returning();
    return row;
  }

  const [row] = await db
    .insert(users)
    .values({
      email: normalized,
      displayName: normalized.split('@')[0],
      onboarded: false,
      invitedBy: invitedById,
      invitedAt: new Date(),
    })
    .returning();
  return row;
}

/**
 * Complete onboarding: set the chosen username and flip `onboarded` true.
 */
export async function completeOnboarding(userId: string, username: string): Promise<UserRow> {
  const [row] = await db
    .update(users)
    .set({ displayName: username.trim(), onboarded: true })
    .where(eq(users.id, userId))
    .returning();
  return row;
}

/** Update an already-onboarded user's display name (handle/tag). */
export async function updateDisplayName(userId: string, name: string): Promise<UserRow | null> {
  const [row] = await db
    .update(users)
    .set({ displayName: name.trim() })
    .where(eq(users.id, userId))
    .returning();
  return row ?? null;
}

/** Update a user's profile picture ("piece"). Pass null to clear it. */
export async function updatePieceUrl(userId: string, pieceUrl: string | null): Promise<UserRow | null> {
  const [row] = await db
    .update(users)
    .set({ pieceUrl })
    .where(eq(users.id, userId))
    .returning();
  return row ?? null;
}

/** Update per-type email notification opt-outs. */
export async function updateEmailPreferences(
  userId: string,
  prefs: { emailGameReminders?: boolean; emailBenchPromotions?: boolean }
): Promise<UserRow | null> {
  const patch: Partial<typeof users.$inferInsert> = {};
  if (prefs.emailGameReminders !== undefined) patch.emailGameReminders = prefs.emailGameReminders;
  if (prefs.emailBenchPromotions !== undefined) patch.emailBenchPromotions = prefs.emailBenchPromotions;
  if (Object.keys(patch).length === 0) return getUserById(userId);
  const [row] = await db
    .update(users)
    .set(patch)
    .where(eq(users.id, userId))
    .returning();
  return row ?? null;
}

/** Active users on the Black Book wall (excludes buffed/removed). */
export async function listUsers(): Promise<UserRow[]> {
  return db.select().from(users).where(isNull(users.removedAt)).orderBy(users.createdAt);
}

/** Set a user's app-level role ('admin' | 'user'). Returns updated row. */
export async function setUserRole(userId: string, role: GlobalRole): Promise<UserRow | null> {
  const [row] = await db
    .update(users)
    .set({ globalRole: role })
    .where(eq(users.id, userId))
    .returning();
  return row ?? null;
}

export async function getUsersByIds(ids: string[]): Promise<Map<string, UserRow>> {
  if (ids.length === 0) return new Map();
  const rows = await db.select().from(users).where(inArray(users.id, ids));
  return new Map(rows.map((r) => [r.id, r]));
}

/**
 * Update a user's email address (app-admin action).
 * Throws if oldEmail is not found or if newEmail is already taken.
 */
export async function updateUserEmail(oldEmail: string, newEmail: string): Promise<UserRow> {
  const normalized = newEmail.trim().toLowerCase();
  const existing = await getUserRowByEmail(normalized);
  if (existing && !existing.removedAt) throw new Error('Email already in use');

  const [row] = await db
    .update(users)
    .set({ email: normalized })
    .where(eq(users.email, oldEmail.trim().toLowerCase()))
    .returning();
  if (!row) throw new Error('User not found');
  return row;
}

export async function getUsersByEmails(emails: string[]): Promise<Map<string, UserRow>> {
  if (emails.length === 0) return new Map();
  const normalized = emails.map((e) => e.toLowerCase());
  const rows = await db.select().from(users).where(inArray(users.email, normalized));
  return new Map(rows.map((r) => [r.email, r]));
}

/** Cross-crew warnings before buffing a player from the Black Book. */
export async function getUserRemovalWarnings(userId: string): Promise<UserRemovalWarnings> {
  const now = new Date();

  const spotRows = await db
    .select({
      crewName: groups.name,
      count: sql<number>`count(*)::int`,
    })
    .from(eventAttendees)
    .innerJoin(events, eq(events.id, eventAttendees.eventId))
    .innerJoin(groups, eq(groups.id, events.groupId))
    .innerJoin(
      groupMembers,
      and(
        eq(groupMembers.groupId, events.groupId),
        eq(groupMembers.userId, eventAttendees.userId)
      )
    )
    .where(
      and(
        eq(eventAttendees.userId, userId),
        eq(eventAttendees.status, 'confirmed'),
        gt(events.startsAt, now),
        eq(groupMembers.status, 'active')
      )
    )
    .groupBy(groups.id, groups.name);

  const spotBreakdown = spotRows.map((r) => ({
    crewName: r.crewName,
    count: r.count,
  }));
  const confirmedSpotCount = spotBreakdown.reduce((sum, r) => sum + r.count, 0);

  const balanceRows = await db.execute<{
    crew_name: string;
    balance: string;
  }>(sql`
    WITH user_groups AS (
      SELECT DISTINCT group_id FROM group_members WHERE user_id = ${userId}
      UNION
      SELECT DISTINCT group_id FROM payments WHERE user_id = ${userId}
      UNION
      SELECT DISTINCT group_id FROM spot_transactions
        WHERE to_user_id = ${userId} OR from_user_id = ${userId}
    )
    SELECT
      g.name AS crew_name,
      (
        COALESCE((
          SELECT SUM(amount::numeric) FROM payments p
          WHERE p.group_id = ug.group_id AND p.user_id = ${userId}
        ), 0)
        - COALESCE((
          SELECT SUM(amount::numeric) FROM spot_transactions t
          WHERE t.group_id = ug.group_id AND t.to_user_id = ${userId}
        ), 0)
        + COALESCE((
          SELECT SUM(amount::numeric) FROM spot_transactions t
          WHERE t.group_id = ug.group_id AND t.from_user_id = ${userId}
        ), 0)
      )::text AS balance
    FROM user_groups ug
    JOIN groups g ON g.id = ug.group_id
  `);

  const balances = balanceRows.rows
    .map((r) => ({
      crewName: r.crew_name,
      balance: Number(r.balance),
    }))
    .filter((r) => r.balance !== 0);

  return { confirmedSpotCount, spotBreakdown, balances };
}

/**
 * Soft-remove a player from the Black Book (buff). Deactivates all crew memberships.
 * Ledger and event history are preserved.
 */
export async function removeUserFromApp(
  email: string,
  adminUserId: string
): Promise<UserRow> {
  const normalized = email.trim().toLowerCase();
  const target = await getUserRowByEmail(normalized);
  if (!target) throw new Error('User not found');
  if (target.removedAt) throw new Error('User is already removed from the Black Book');
  if (target.globalRole === 'owner') throw new Error('The Owner cannot be removed');
  if (target.id === adminUserId) throw new Error('Cannot remove yourself');

  const [row] = await db
    .update(users)
    .set({ removedAt: new Date(), removedBy: adminUserId })
    .where(eq(users.id, target.id))
    .returning();

  await db
    .update(groupMembers)
    .set({ status: 'inactive' })
    .where(eq(groupMembers.userId, target.id));

  return row;
}

export { toAppUser };
export type { UserRow };
