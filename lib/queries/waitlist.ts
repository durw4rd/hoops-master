/**
 * Waitlist queries (FIFO by joined_at) + spot release with auto-promotion.
 *
 * forRider=false: player has no spot and wants one.
 * forRider=true:  player has a confirmed primary spot and wants a +1 (Rider).
 *
 * When a primary spot is released, only forRider=false entries are promoted.
 * When a rider slot is freed (via dropRider in events.ts), only forRider=true
 * entries are promoted — that logic lives alongside dropRider.
 */

import { and, asc, eq, isNull } from 'drizzle-orm';
import { eventAttendees, eventWaitlist } from '@/lib/db/schema';
import { recordTransaction } from './transactions';
import { withEventLock, SpotError, type Tx } from './_tx';

/**
 * Occupancy = SUM(1 + plusOne) across all attendee rows.
 */
async function occupancy(tx: Tx, eventId: string): Promise<number> {
  const rows = await tx
    .select({ plusOne: eventAttendees.plusOne })
    .from(eventAttendees)
    .where(eq(eventAttendees.eventId, eventId));
  return rows.reduce((sum, r) => sum + 1 + (r.plusOne ? 1 : 0), 0);
}

/**
 * Join the waitlist.
 *
 * forRider=false (default): player must have no spot and event must be full.
 * forRider=true: player must already have a confirmed spot (plusOne=false) and
 *   must not already have a rider, and event must be full.
 */
export async function joinWaitlist(params: {
  eventId: string;
  userId: string;
  forRider?: boolean;
}): Promise<number> {
  const forRider = params.forRider ?? false;
  return withEventLock(params.eventId, async (tx, event) => {
    const occ = await occupancy(tx, params.eventId);

    if (forRider) {
      // Must have a confirmed primary spot (plusOne=false).
      const [attendee] = await tx
        .select()
        .from(eventAttendees)
        .where(and(
          eq(eventAttendees.eventId, params.eventId),
          eq(eventAttendees.userId, params.userId),
        ))
        .limit(1);
      if (!attendee) {
        throw new SpotError('You need a spot in this game before queuing for a Rider', 400);
      }
      if (attendee.status !== 'confirmed') {
        throw new SpotError('Your spot must be confirmed to queue for a Rider', 400);
      }
      if (attendee.plusOne) {
        throw new SpotError('You already have a Rider spot in this game', 409);
      }
      if (occ < event.totalSpots) {
        throw new SpotError('Spots are still available — bring a Rider directly', 400);
      }
    } else {
      // Primary queue: must not already have any spot.
      const [existing] = await tx
        .select({ id: eventAttendees.id })
        .from(eventAttendees)
        .where(and(
          eq(eventAttendees.eventId, params.eventId),
          eq(eventAttendees.userId, params.userId),
        ))
        .limit(1);
      if (existing) {
        throw new SpotError('You already hold a spot for this event', 409);
      }
      if (occ < event.totalSpots) {
        throw new SpotError('Spots are still available — claim one instead of waitlisting', 400);
      }
    }

    // Check for existing waitlist entry of the same type.
    const [existingEntry] = await tx
      .select()
      .from(eventWaitlist)
      .where(and(
        eq(eventWaitlist.eventId, params.eventId),
        eq(eventWaitlist.userId, params.userId),
        eq(eventWaitlist.forRider, forRider),
      ))
      .limit(1);
    if (existingEntry) {
      throw new SpotError(
        forRider ? 'Your Rider is already on the bench' : 'You are already on the waitlist',
        409
      );
    }

    await tx.insert(eventWaitlist).values({
      eventId: params.eventId,
      userId: params.userId,
      forRider,
    });

    const all = await tx
      .select({ id: eventWaitlist.id })
      .from(eventWaitlist)
      .where(eq(eventWaitlist.eventId, params.eventId))
      .orderBy(asc(eventWaitlist.joinedAt));

    const myEntry = await tx
      .select({ id: eventWaitlist.id })
      .from(eventWaitlist)
      .where(and(
        eq(eventWaitlist.eventId, params.eventId),
        eq(eventWaitlist.userId, params.userId),
        eq(eventWaitlist.forRider, forRider),
      ))
      .limit(1);
    return all.findIndex((r) => r.id === myEntry[0]?.id) + 1;
  });
}

export async function leaveWaitlist(params: {
  eventId: string;
  userId: string;
  forRider?: boolean;
}): Promise<void> {
  const forRider = params.forRider ?? false;
  await withEventLock(params.eventId, async (tx) => {
    await tx
      .delete(eventWaitlist)
      .where(and(
        eq(eventWaitlist.eventId, params.eventId),
        eq(eventWaitlist.userId, params.userId),
        eq(eventWaitlist.forRider, forRider),
      ));
  });
}

export interface ReleaseResult {
  promotedUserId: string | null;
}

/**
 * Release the caller's primary spot. Promotes the earliest forRider=false bench
 * entry (zero-sum waitlist_promote). The caller's own rider bench entries are
 * auto-cancelled. Throws if no primary bench entries exist; use offerSpot instead.
 */
export async function releaseSpot(params: { eventId: string; userId: string }): Promise<ReleaseResult> {
  return withEventLock(params.eventId, async (tx, event) => {
    // Find the caller's attendee row.
    const [attendee] = await tx
      .select()
      .from(eventAttendees)
      .where(and(
        eq(eventAttendees.eventId, params.eventId),
        eq(eventAttendees.userId, params.userId),
      ))
      .limit(1);
    if (!attendee) throw new SpotError('You are not attending this event', 404);

    // Guard: cannot release while holding a rider (drop rider first).
    if (attendee.plusOne) {
      throw new SpotError('Drop your Rider spot before releasing your own', 400);
    }

    // Auto-cancel the caller's own rider bench entries (if they had queued for a rider).
    await tx
      .delete(eventWaitlist)
      .where(and(
        eq(eventWaitlist.eventId, params.eventId),
        eq(eventWaitlist.userId, params.userId),
        eq(eventWaitlist.forRider, true),
      ));

    // Find the first promotable primary bench entry (forRider=false), skipping the departing player.
    const queue = await tx
      .select()
      .from(eventWaitlist)
      .where(and(
        eq(eventWaitlist.eventId, params.eventId),
        eq(eventWaitlist.forRider, false),
      ))
      .orderBy(asc(eventWaitlist.joinedAt));

    const primaryQueue = queue.filter((e) => e.userId !== params.userId);

    if (primaryQueue.length === 0) {
      throw new SpotError(
        'No one is on the bench. Use "Offer" to make your spot available instead.',
        400
      );
    }

    const next = primaryQueue[0];
    const promotedUserId = next.userId;

    const [updated] = await tx
      .update(eventAttendees)
      .set({
        userId: promotedUserId,
        originalUserId: promotedUserId,
        status: 'confirmed',
        offeredAt: null,
        assignedBy: null,
        plusOne: false,
      })
      .where(eq(eventAttendees.id, attendee.id))
      .returning();

    await tx.delete(eventWaitlist).where(eq(eventWaitlist.id, next.id));

    await recordTransaction(tx, {
      eventId: params.eventId,
      groupId: event.groupId,
      attendeeId: updated.id,
      type: 'waitlist_promote',
      fromUserId: params.userId,
      toUserId: promotedUserId,
      amount: Number(event.slotCost),
      notes: 'Auto-promoted from waitlist on release',
    });

    return { promotedUserId };
  });
}
