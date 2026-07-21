/**
 * Unified bench: one FIFO queue (global joinedAt order).
 * Any spot opening goes to bench #1; row shape is morphed invisibly for primary vs +1.
 */

import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm';
import { benchPromotionRequests, eventAttendees, eventWaitlist } from '@/lib/db/schema';
import { recordTransaction } from './transactions';
import { getSpotChargeAmount } from './pricing';
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

export interface TransferOptions {
  /** Previous funder of the spot; null for vacant openings (fresh debit). */
  fromUserId: string | null;
  transactionType: TransactionType;
  notes?: string;
  notifyPreviousHolder?: boolean;
  /** Skip this user when picking bench #1 (e.g. the player releasing a spot). */
  excludeUserId?: string;
}

/**
 * First bench entry that can actually be seated: not excluded, not already the
 * target of a pending promotion approval, and not holding both a primary and a
 * +1 already.
 */
export async function getSeatableBenchHead(
  tx: Tx,
  eventId: string,
  opts: { excludeUserId?: string } = {}
): Promise<WaitlistRow | null> {
  const bench = await getUnifiedBench(tx, eventId);
  const pendingRows = await tx
    .select({ targetUserId: benchPromotionRequests.targetUserId })
    .from(benchPromotionRequests)
    .where(and(
      eq(benchPromotionRequests.eventId, eventId),
      eq(benchPromotionRequests.status, 'pending'),
    ));
  const pendingTargets = new Set(pendingRows.map((r) => r.targetUserId));

  for (const entry of bench) {
    if (opts.excludeUserId && entry.userId === opts.excludeUserId) continue;
    if (pendingTargets.has(entry.userId)) continue;
    const primary = await getPrimaryAttendeeInTx(tx, eventId, entry.userId);
    const rider = await getRiderAttendeeInTx(tx, eventId, entry.userId);
    if (primary && rider) continue; // already holds a full spot — unseatable
    return entry;
  }
  return null;
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
      guestDisplayName: null,
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
    amount: getSpotChargeAmount(event),
    notes: options.notes,
  });

  const notifyPrevious =
    options.notifyPreviousHolder ?? options.transactionType === 'claim';

  if (notifyPrevious && previousHolder && previousHolder !== toUserId) {
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
    // Bench→game promotions also email the player (drained after commit).
    const { enqueueEmail } = await import('./emailOutbox');
    await enqueueEmail(tx, {
      userId: toUserId,
      groupId: event.groupId,
      eventId: event.id,
      emailType: 'bench_promotion',
      spotKind,
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
 * Assign opening to the first seatable bench entry. Returns matched:false if
 * nobody on the bench can take the spot.
 */
export async function assignOpeningToBenchHead(
  tx: Tx,
  event: EventRow,
  openingRow: AttendeeRow,
  options: TransferOptions
): Promise<BenchAssignResult> {
  const head = await getSeatableBenchHead(tx, event.id, { excludeUserId: options.excludeUserId });
  if (!head) return { matched: false };

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
