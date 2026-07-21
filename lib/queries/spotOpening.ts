/**
 * Unified spot-opening handler.
 *
 * Every action that frees a spot (release, offer, admin unassign, decline
 * cascade, capacity increase) funnels through handleSpotOpening. An opening
 * carries a funding mode which alone decides the ledger entry when it is
 * eventually filled:
 *
 * - holder_funded: the previous holder keeps paying until someone takes over
 *   (release/offer semantics) — fill is a zero-sum transfer.
 * - vacant: the previous holder was refunded (admin unassign) or never existed
 *   (capacity increase) — fill is a fresh debit (fromUserId null).
 *
 * Resolution order (identical for player- and admin-initiated actions):
 * 1. Seatable bench head exists, >24h before start → instant promotion.
 * 2. Seatable bench head exists, ≤24h → pending approval request; a vacant
 *    opening is held as a placeholder row (userId NULL, status 'open').
 * 3. Bench exhausted → holder-funded spots are marked 'offered' (free-for-all
 *    claimable); vacant openings dissolve into plain capacity slack.
 */

import { eq } from 'drizzle-orm';
import { eventAttendees, eventWaitlist } from '@/lib/db/schema';
import { recordTransaction } from './transactions';
import {
  assignOpeningToBenchHeadOrPending,
  cancelPendingPromotionsForAttendee,
} from './benchPromotion';
import type { Tx, EventRow } from './_tx';
import type { TransactionType } from '@/lib/types';

type AttendeeRow = typeof eventAttendees.$inferSelect;

export type OpeningFunding =
  | { kind: 'holder_funded'; fromUserId: string }
  | { kind: 'vacant' };

export interface OpeningContext {
  funding: OpeningFunding;
  /** Ledger type recorded when the opening is filled (now or on approval). */
  transactionType: TransactionType;
  notes?: string;
  /** Skip this user when picking the bench head (e.g. the releasing player). */
  excludeUserId?: string;
  notifyPreviousHolder?: boolean;
}

export type OpeningOutcome =
  | { outcome: 'promoted'; promotedUserId: string; attendee: AttendeeRow }
  | { outcome: 'pending_approval'; targetUserId: string; attendee: AttendeeRow }
  | { outcome: 'offered'; attendee: AttendeeRow }
  | { outcome: 'vacated' };

export async function handleSpotOpening(
  tx: Tx,
  event: EventRow,
  opening: AttendeeRow,
  ctx: OpeningContext
): Promise<OpeningOutcome> {
  let row = opening;

  // A vacant opening has no funder: strip it to a neutral placeholder up front.
  // If the bench match below fills it instantly, the transfer simply overwrites
  // these fields; if it goes pending, the placeholder is what's being held.
  if (ctx.funding.kind === 'vacant' && (row.userId !== null || row.status !== 'open')) {
    const [placeholder] = await tx
      .update(eventAttendees)
      .set({
        userId: null,
        originalUserId: null,
        status: 'open',
        offeredAt: null,
        assignedBy: null,
        parentAttendeeId: null,
        guestDisplayName: null,
      })
      .where(eq(eventAttendees.id, row.id))
      .returning();
    row = placeholder;
  }

  const fromUserId = ctx.funding.kind === 'holder_funded' ? ctx.funding.fromUserId : null;

  const result = await assignOpeningToBenchHeadOrPending(tx, event, row, {
    fromUserId,
    transactionType: ctx.transactionType,
    notes: ctx.notes,
    notifyPreviousHolder: ctx.notifyPreviousHolder,
    excludeUserId: ctx.excludeUserId,
  });

  if (result.matched) {
    return { outcome: 'promoted', promotedUserId: result.promotedUserId!, attendee: result.attendee! };
  }
  if (result.pendingApproval) {
    return { outcome: 'pending_approval', targetUserId: result.promotedUserId!, attendee: row };
  }

  // Bench exhausted.
  if (ctx.funding.kind === 'vacant') {
    await cancelPendingPromotionsForAttendee(tx, row.id);
    await tx.delete(eventAttendees).where(eq(eventAttendees.id, row.id));
    return { outcome: 'vacated' };
  }

  if (row.status === 'offered') {
    return { outcome: 'offered', attendee: row };
  }
  const [offered] = await tx
    .update(eventAttendees)
    .set({ status: 'offered', offeredAt: new Date() })
    .where(eq(eventAttendees.id, row.id))
    .returning();
  await recordTransaction(tx, {
    eventId: event.id,
    groupId: event.groupId,
    attendeeId: offered.id,
    type: 'offer',
    fromUserId: ctx.funding.fromUserId,
    toUserId: ctx.funding.fromUserId,
    amount: 0,
    notes: offered.parentAttendeeId ? 'Offered +1 to marketplace' : 'Offered spot to marketplace',
  });
  return { outcome: 'offered', attendee: offered };
}

/**
 * Invariant enforcement after capacity increases: while the event has free
 * capacity and seatable bench players, keep creating openings for them
 * (instant promotion >24h out, pending approvals within 24h).
 */
export async function reconcileCapacityWithBench(tx: Tx, event: EventRow): Promise<string[]> {
  const touched: string[] = [];

  for (;;) {
    const attendeeRows = await tx
      .select({ id: eventAttendees.id })
      .from(eventAttendees)
      .where(eq(eventAttendees.eventId, event.id));
    if (attendeeRows.length >= event.totalSpots) break;

    const bench = await tx
      .select({ id: eventWaitlist.id })
      .from(eventWaitlist)
      .where(eq(eventWaitlist.eventId, event.id));
    if (bench.length === 0) break;

    const [placeholder] = await tx
      .insert(eventAttendees)
      .values({ eventId: event.id, userId: null, originalUserId: null, status: 'open' })
      .returning();

    const result = await handleSpotOpening(tx, event, placeholder, {
      funding: { kind: 'vacant' },
      transactionType: 'waitlist_promote',
      notes: 'Capacity increased — promoted from bench',
    });

    // 'vacated' means nobody on the bench was seatable — stop.
    if (result.outcome === 'vacated') break;
    if (result.outcome === 'promoted') touched.push(result.promotedUserId);
    if (result.outcome === 'pending_approval') touched.push(result.targetUserId);
  }

  return touched;
}
