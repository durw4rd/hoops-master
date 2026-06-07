/**
 * User queries (Neon/Drizzle).
 */

import { eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import type { AppUser, GlobalRole } from '@/lib/types';

type UserRow = typeof users.$inferSelect;

function toAppUser(row: UserRow): AppUser {
  return {
    email: row.email,
    displayName: row.displayName,
    pieceUrl: row.pieceUrl ?? undefined,
    globalRole: row.globalRole as GlobalRole,
    onboarded: row.onboarded,
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
  return row ? toAppUser(row) : null;
}

/**
 * Invite a user (app-admin action). Creates an allowlist row that the invitee
 * can later sign in against. They pick their real username during onboarding,
 * so the initial display name is just a placeholder derived from the email.
 * Throws if the email is already invited/registered.
 */
export async function inviteUser(email: string, invitedById: string): Promise<UserRow> {
  const normalized = email.trim().toLowerCase();
  const existing = await getUserRowByEmail(normalized);
  if (existing) throw new Error('User is already invited or registered');

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

/** All users (app-admin view: invite management). Ordered by created date. */
export async function listUsers(): Promise<UserRow[]> {
  return db.select().from(users).orderBy(users.createdAt);
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
  if (existing) throw new Error('Email already in use');

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

export { toAppUser };
export type { UserRow };
