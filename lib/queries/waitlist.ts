/**
 * Waitlist operations: join, leave, and auto-promote on spot release.
 *
 * Two queues share the same `event_waitlist` table:
 *   forRider=false  Primary queue (player wants their own slot)
 *   forRider=true   Rider bench (player already has a primary; wants a +1)
 *
 * releaseSpot (primary release) surgical fix:
 *   - Only promotes forRider=false entries — never forRider=true. The Rider bench
 *     is exclusively drained by releaseRiderSpot / offerSpot (rider row).
 *   - Auto-cancels the departing player's own forRider=true bench entry (if any),
 *     preventing the "rider in but primary out" invalid state.
 *
 * "No free drops" rule: releaseSpot only runs if someone is on the primary bench.
 * If the bench is empty the player must use offerSpot (marketplace) instead.
 * Likewise releaseRiderSpot only runs if someone is on the rider bench (see events.ts).
 */

import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { eventAttendees, eventWaitlist } from '@/lib/db/schema';
import { recordTransaction } from './transactions';
import { withEventLock, SpotError } from './_tx';

// ---------------------------------------------------------------------------
// Join / Leave
// ---------------------------------------------------------------------------

export async function joinWaitlist(params: {
  eventId: string;
  userId: string;
  forRider?: boolean;
}): Promise<number> {
  return withEventLock(params.eventId, async (tx) => {
    if (params.forRider) {
      // Must have a confirmed primary to join the Rider bench.
      const [primary] = await tx
        .select({ id: eventAttendees.id, status: eventAttendees.status })
        .from(eventAttendees)
        .where(and(
          eq(eventAttendees.eventId, params.eventId),
          eq(eventAttendees.userId, params.userId),
          isNull(eventAttendees.parentAttendeeId),
        ))
        .limit(1);
      if (!primary || primary.status !== 'confirmed') {
        throw new SpotError('You need a confirmed spot in this game before joining the Rider bench', 400);
      }
    }

    // No duplicate entries.
    const [existing] = await tx
      .select({ id: eventWaitlist.id })
      .from(eventWaitlist)
      .where(and(
        eq(eventWaitlist.eventId, params.eventId),
        eq(eventWaitlist.userId, params.userId),
        eq(eventWaitlist.forRider, params.forRider ?? false),
      ))
      .limit(1);
    if (existing) throw new SpotError('Already on the waitlist', 409);

    await tx.insert(eventWaitlist).values({
      eventId: params.eventId,
      userId: params.userId,
      forRider: params.forRider ?? false,
    });

    const all = await tx
      .select({ id: eventWaitlist.id })
      .from(eventWaitlist)
      .where(and(
        eq(eventWaitlist.eventId, params.eventId),
        eq(eventWaitlist.forRider, params.forRider ?? false),
      ))
      .orderBy(asc(eventWaitlist.joinedAt));
    return all.length;
  });
}

export async function leaveWaitlist(params: {
  eventId: string;
  userId: string;
  forRider?: boolean;
}): Promise<void> {
  await db
    .delete(eventWaitlist)
    .where(and(
      eq(eventWaitlist.eventId, params.eventId),
      eq(eventWaitlist.userId, params.userId),
      eq(eventWaitlist.forRider, params.forRider ?? false),
    ));
}

// ---------------------------------------------------------------------------
// Release primary spot → auto-promote from bench
// ---------------------------------------------------------------------------

/**
 * Release the caller's primary spot.
 *
 * Requires someone on the primary bench (forRider=false); throws otherwise.
 * Caller must not have a confirmed rider row — handle the rider first.
 *
 * Safety fixes applied vs. the original implementation:
 *   1. Guard: rider row must not be in 'confirmed' state before releasing primary.
 *   2. Only promote forRider=false entries — the rider bench is its own flow.
 *   3. Auto-cancel caller's own forRider=true bench entry on departure.
 */
export async function releaseSpot(params: {
  eventId: string;
  userId: string;
}): Promise<{ promotedUserId: string | null }> {
  return withEventLock(params.eventId, async (tx, event) => {
    const [primary] = await tx
      .select()
      .from(eventAttendees)
      .where(and(
        eq(eventAttendees.eventId, params.eventId),
        eq(eventAttendees.userId, params.userId),
        isNull(eventAttendees.parentAttendeeId),
      ))
      .limit(1);
    if (!primary) throw new SpotError('You do not have a spot in this event', 404);

    // Must handle rider row first (offer or release) before releasing primary.
    const [rider] = await tx
      .select({ id: eventAttendees.id, status: eventAttendees.status })
      .from(eventAttendees)
      .where(and(
        eq(eventAttendees.eventId, params.eventId),
        eq(eventAttendees.userId, params.userId),
        eq(eventAttendees.parentAttendeeId, primary.id),
      ))
      .limit(1);
    if (rider && rider.status === 'confirmed') {
      throw new SpotError('Release or offer your Rider before releasing your own spot', 400);
    }

    // Find the primary bench (forRider=false), excluding the departing player.
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
        'No one is on the bench — offer your spot instead so it can be claimed',
        400
      );
    }

    const next = primaryQueue[0];

    // Transfer the primary row to the next bench person.
    const [promoted] = await tx
      .update(eventAttendees)
      .set({
        userId: next.userId,
        originalUserId: next.userId,
        status: 'confirmed',
        offeredAt: null,
        assignedBy: null,
        parentAttendeeId: null,
      })
      .where(eq(eventAttendees.id, primary.id))
      .returning();

    // Remove them from the bench.
    await tx.delete(eventWaitlist).where(eq(eventWaitlist.id, next.id));

    // Auto-cancel the departing player's own forRider=true bench entry (if any).
    await tx
      .delete(eventWaitlist)
      .where(and(
        eq(eventWaitlist.eventId, params.eventId),
        eq(eventWaitlist.userId, params.userId),
        eq(eventWaitlist.forRider, true),
      ));

    await recordTransaction(tx, {
      eventId: params.eventId,
      groupId: event.groupId,
      attendeeId: promoted.id,
      type: 'waitlist_promote',
      fromUserId: params.userId,
      toUserId: next.userId,
      amount: Number(event.slotCost),
      notes: 'Spot released and auto-promoted from bench',
    });

    return { promotedUserId: next.userId };
  });
}
