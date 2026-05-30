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
    globalRole: row.globalRole as GlobalRole,
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
 * Upsert a user on sign-in. Updates display name; never downgrades role.
 */
export async function getOrCreateUser(email: string, displayName: string): Promise<UserRow> {
  const normalized = email.toLowerCase();
  const [row] = await db
    .insert(users)
    .values({ email: normalized, displayName })
    .onConflictDoUpdate({
      target: users.email,
      set: { displayName },
    })
    .returning();
  return row;
}

export async function getUsersByIds(ids: string[]): Promise<Map<string, UserRow>> {
  if (ids.length === 0) return new Map();
  const rows = await db.select().from(users).where(inArray(users.id, ids));
  return new Map(rows.map((r) => [r.id, r]));
}

export async function getUsersByEmails(emails: string[]): Promise<Map<string, UserRow>> {
  if (emails.length === 0) return new Map();
  const normalized = emails.map((e) => e.toLowerCase());
  const rows = await db.select().from(users).where(inArray(users.email, normalized));
  return new Map(rows.map((r) => [r.email, r]));
}

export { toAppUser };
export type { UserRow };
