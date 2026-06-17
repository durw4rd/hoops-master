/**
 * Unified bench: one FIFO queue (global joinedAt order).
 * Any spot opening goes to bench #1; row shape is morphed invisibly for primary vs +1.
 */

import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm';
import { eventAttendees, eventWaitlist } from '@/lib/db/schema';
import { recordTransaction } from './transactions';
import { notifySpotChange } from './notifications';
import type { Tx, EventRow } from './_tx';
import { SpotError } from './_tx';
import type { TransactionType } from '@/lib/types';

type AttendeeRow = typeof eventAttendees.$inferSelect;
type WaitlistRow = typeof eventWaitlist.$inferSelect;

export async function getUnifiedBench(tx: Tx, eventId: string): Promise<WaitlistRow[]> {
  return tx
    .select()
    .from(eventWaitlist)
    .where(eq(eventWaitlist.eventId, eventId))
    .orderBy(asc(eventWaitlist.joinedAt));
}

export async function getGlobalBenchPosition(tx: Tx, eventId: string): Promise<number> {
  const bench = await getUnifiedBench(tx, eventId);
  return bench.length;
}

export async function removeUserFromBench(tx: Tx, eventId: string, userId: string): Promise<void> {
  await tx
    .delete(eventWaitlist)
    .where(and(eq(eventWaitlist.eventId, eventId), eq(eventWaitlist.userId, userId)));
}

async function getPrimaryAttendeeInTx(tx: Tx, eventId: string, userId: string): Promise<AttendeeRow | null> {
  const [row] = await tx
    .select()
    .from(eventAttendees)
    .where(and(
      eq(eventAttendees.eventId, eventId),
      eq(eventAttendees.userId, userId),
      isNull(eventAttendees.parentAttendeeId),
    ))
    .limit(1);
  return row ?? null;
}

async function getRiderAttendeeInTx(tx: Tx, eventId: string, userId: string): Promise<AttendeeRow | null> {
  const [row] = await tx
    .select()
    .from(eventAttendees)
    .where(and(
      eq(eventAttendees.eventId, eventId),
      eq(eventAttendees.userId, userId),
      isNotNull(eventAttendees.parentAttendeeId),
    ))
    .limit(1);
  return row ?? null;
}

export async function getEarliestOfferedSpot(tx: Tx, eventId: string): Promise<AttendeeRow | null> {
  const [row] = await tx
    .select()
    .from(eventAttendees)
    .where(and(eq(eventAttendees.eventId, eventId), eq(eventAttendees.status, 'offered')))
    .orderBy(asc(eventAttendees.offeredAt))
    .limit(1);
  return row ?? null;
}

interface TransferOptions {
  fromUserId: string;
  transactionType: TransactionType;
  notes?: string;
  notifyPreviousHolder?: boolean;
  /** Skip this user when picking bench #1 (e.g. the player releasing a spot). */
  excludeUserId?: string;
}
export async function transferOpeningToUser(
  tx: Tx,
  event: EventRow,
  openingRow: AttendeeRow,
  toUserId: string,
  options: TransferOptions
): Promise<AttendeeRow> {
  const waiterPrimary = await getPrimaryAttendeeInTx(tx, event.id, toUserId);
  const waiterRider = await getRiderAttendeeInTx(tx, event.id, toUserId);

  let parentAttendeeId: string | null;
  let spotKind: 'primary' | 'plus_one';

  if (!waiterPrimary) {
    parentAttendeeId = null;
    spotKind = 'primary';
  } else if (!waiterRider) {
    parentAttendeeId = waiterPrimary.id;
    spotKind = 'plus_one';
  } else {
    throw new SpotError('Next person on the bench already has a full spot', 409);
  }

  const previousHolder = openingRow.userId;

  const [updated] = await tx
    .update(eventAttendees)
    .set({
      userId: toUserId,
      originalUserId: toUserId,
      status: 'confirmed',
      offeredAt: null,
      assignedBy: null,
      parentAttendeeId,
    })
    .where(eq(eventAttendees.id, openingRow.id))
    .returning();

  await recordTransaction(tx, {
    eventId: event.id,
    groupId: event.groupId,
    attendeeId: updated.id,
    type: options.transactionType,
    fromUserId: options.fromUserId,
    toUserId,
    amount: Number(event.slotCost),
    notes: options.notes,
  });

  const notifyPrevious =
    options.notifyPreviousHolder ?? options.transactionType === 'claim';

  if (notifyPrevious && previousHolder !== toUserId) {
    await notifySpotChange(tx, {
      holderUserId: previousHolder,
      groupId: event.groupId,
      eventId: event.id,
      spotKind,
      transition: 'offered_claimed',
      actorUserId: toUserId,
    });
  }

  if (options.transactionType === 'waitlist_promote') {
    await notifySpotChange(tx, {
      holderUserId: toUserId,
      groupId: event.groupId,
      eventId: event.id,
      spotKind,
      transition: 'bench_promoted',
    });
  }

  return updated;
}

export interface BenchAssignResult {
  matched: boolean;
  promotedUserId?: string;
  attendee?: AttendeeRow;
}

/**
 * Assign opening to bench #1 (never skip). Returns matched:false if bench empty.
 */
export async function assignOpeningToBenchHead(
  tx: Tx,
  event: EventRow,
  openingRow: AttendeeRow,
  options: TransferOptions
): Promise<BenchAssignResult> {
  let bench = await getUnifiedBench(tx, event.id);
  if (options.excludeUserId) {
    bench = bench.filter((w) => w.userId !== options.excludeUserId);
  }
  if (bench.length === 0) return { matched: false };

  const head = bench[0];
  const attendee = await transferOpeningToUser(tx, event, openingRow, head.userId, options);
  await tx.delete(eventWaitlist).where(eq(eventWaitlist.id, head.id));

  return { matched: true, promotedUserId: head.userId, attendee };
}

/** Try to match earliest offered spot to bench #1. */
export async function tryMatchEarliestOfferToBench(
  tx: Tx,
  event: EventRow
): Promise<BenchAssignResult> {
  const offered = await getEarliestOfferedSpot(tx, event.id);
  if (!offered) return { matched: false };

  return assignOpeningToBenchHead(tx, event, offered, {
    fromUserId: offered.userId,
    transactionType: 'claim',
    notes: 'Auto-matched offered spot to bench',
  });
}

export function isUserOnBench(bench: WaitlistRow[], userId: string): boolean {
  return bench.some((w) => w.userId === userId);
}

export function getBenchHeadUserId(bench: WaitlistRow[]): string | null {
  return bench.length > 0 ? bench[0].userId : null;
}
