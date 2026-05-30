/**
 * Spot transaction ledger (append-only).
 *
 * Balance math depends ONLY on from_user_id / to_user_id (plan 3.7). `type` is
 * recorded for display/audit. Every spot action records exactly one row with a
 * non-null to_user_id; from_user_id is NULL when a previously-empty spot is filled.
 */

import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { spotTransactions, events, users } from '@/lib/db/schema';
import type { Tx } from './_tx';
import type { CreditTransaction, TransactionType } from '@/lib/types';

export interface RecordTransactionInput {
  eventId: string;
  groupId: string;
  attendeeId: string | null;
  type: TransactionType;
  fromUserId: string | null;
  toUserId: string;
  amount: number;
  notes?: string;
}

/**
 * Insert a ledger row. MUST be called within the same transaction (`tx`) as the
 * attendee/waitlist mutation it records, so the ledger never desyncs.
 */
export async function recordTransaction(tx: Tx, input: RecordTransactionInput) {
  const [row] = await tx
    .insert(spotTransactions)
    .values({
      eventId: input.eventId,
      groupId: input.groupId,
      attendeeId: input.attendeeId,
      type: input.type,
      fromUserId: input.fromUserId,
      toUserId: input.toUserId,
      amount: String(input.amount),
      notes: input.notes ?? '',
    })
    .returning();
  return row;
}

/**
 * Transaction history for a single user within a group (received or given up).
 */
export async function getUserTransactions(
  groupId: string,
  userId: string
): Promise<CreditTransaction[]> {
  const fromUsers = users;
  const rows = await db
    .select({
      t: spotTransactions,
      toEmail: users.email,
    })
    .from(spotTransactions)
    .innerJoin(users, eq(users.id, spotTransactions.toUserId))
    .where(eq(spotTransactions.groupId, groupId))
    .orderBy(desc(spotTransactions.createdAt));

  // Resolve from-user emails in a second pass (nullable join is messy inline).
  const fromIds = Array.from(
    new Set(rows.map((r) => r.t.fromUserId).filter((id): id is string => !!id))
  );
  const fromMap = new Map<string, string>();
  if (fromIds.length) {
    const fromRows = await db.select().from(fromUsers).where(inArray(fromUsers.id, fromIds));
    for (const u of fromRows) fromMap.set(u.id, u.email);
  }

  return rows
    .filter((r) => r.t.toUserId === userId || r.t.fromUserId === userId)
    .map((r) => ({
      transactionId: r.t.id,
      eventId: r.t.eventId,
      type: r.t.type as TransactionType,
      fromUserEmail: r.t.fromUserId ? fromMap.get(r.t.fromUserId) ?? null : null,
      toUserEmail: r.toEmail,
      amount: Number(r.t.amount),
      createdAt: r.t.createdAt.toISOString(),
      notes: r.t.notes ?? '',
    }));
}

/** All transactions in a group (for CSV export / audit). */
export async function getGroupTransactions(groupId: string) {
  const rows = await db
    .select({
      t: spotTransactions,
      toEmail: users.email,
      starts: events.startsAt,
    })
    .from(spotTransactions)
    .innerJoin(users, eq(users.id, spotTransactions.toUserId))
    .innerJoin(events, eq(events.id, spotTransactions.eventId))
    .where(eq(spotTransactions.groupId, groupId))
    .orderBy(desc(spotTransactions.createdAt));
  return rows;
}

export { and };
