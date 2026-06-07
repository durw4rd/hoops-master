/**
 * Waitlist queries (FIFO by joined_at) + spot release with auto-promotion.
 *
 * The waitlist is shared between primary-spot seekers (forRider=false) and
 * Rider-spot seekers (forRider=true). Both compete in the same FIFO queue.
 * When a spot opens, the first entry is promoted; if it's a rider entry the
 * released row is converted to a Rider row for that user.
 */

import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm';
import { eventAttendees, eventWaitlist } from '@/lib/db/schema';
import { recordTransaction } from './transactions';
import { withEventLock, SpotError, type Tx } from './_tx';

async function occupancy(tx: Tx, eventId: string): Promise<number> {
  const rows = await tx
    .select({ id: eventAttendees.id })
    .from(eventAttendees)
    .where(eq(eventAttendees.eventId, eventId));
  return rows.length;
}

async function hasPrimarySpot(tx: Tx, eventId: string, userId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: eventAttendees.id })
    .from(eventAttendees)
    .where(and(
      eq(eventAttendees.eventId, eventId),
      eq(eventAttendees.userId, userId),
      isNull(eventAttendees.parentAttendeeId),
    ))
    .limit(1);
  return !!row;
}

/**
 * Join the waitlist.
 *
 * forRider=false (default): only allowed when event is full and user has no spot.
 * forRider=true: only allowed when event is full AND user already has a confirmed
 *   primary spot but no rider spot and no existing rider waitlist entry.
 *
 * Returns the 1-based FIFO position across all waitlist entries.
 * Joining is consent to be auto-assigned (and charged) on promotion.
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
      // Must already have a primary spot to queue for a Rider.
      if (!(await hasPrimarySpot(tx, params.eventId, params.userId))) {
        throw new SpotError('You need a spot in this game before queuing for a Rider', 400);
      }
      // Must not already have a Rider spot.
      const [existingRider] = await tx
        .select({ id: eventAttendees.id })
        .from(eventAttendees)
        .where(and(
          eq(eventAttendees.eventId, params.eventId),
          eq(eventAttendees.userId, params.userId),
          isNotNull(eventAttendees.parentAttendeeId),
        ))
        .limit(1);
      if (existingRider) throw new SpotError('You already have a Rider spot in this game', 409);

      if (occ < event.totalSpots) {
        throw new SpotError('Spots are still available — bring a Rider directly', 400);
      }
    } else {
      // Primary queue: must not already have any spot.
      if (await hasPrimarySpot(tx, params.eventId, params.userId)) {
        throw new SpotError('You already hold a spot for this event', 409);
      }
      if (occ < event.totalSpots) {
        throw new SpotError('Spots are still available — claim one instead of waitlisting', 400);
      }
    }

    // Check for existing waitlist entry of the same type.
    const [existing] = await tx
      .select()
      .from(eventWaitlist)
      .where(and(
        eq(eventWaitlist.eventId, params.eventId),
        eq(eventWaitlist.userId, params.userId),
        eq(eventWaitlist.forRider, forRider),
      ))
      .limit(1);
    if (existing) {
      throw new SpotError(
        forRider ? "Your Rider is already on the bench" : 'You are already on the waitlist',
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

    // Position is global FIFO across all entries (primary + rider).
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
 * Release the caller's spot. If the waitlist is non-empty, auto-promote the
 * earliest-joined member as a zero-sum `waitlist_promote` (releaser credited,
 * promoted charged). Otherwise free the spot (audit-only `release` row).
 */
export async function releaseSpot(params: { eventId: string; userId: string }): Promise<ReleaseResult> {
  return withEventLock(params.eventId, async (tx, event) => {
    // Find the primary spot (rider rows are excluded via IS NULL check).
    const [attendee] = await tx
      .select()
      .from(eventAttendees)
      .where(and(
        eq(eventAttendees.eventId, params.eventId),
        eq(eventAttendees.userId, params.userId),
        isNull(eventAttendees.parentAttendeeId),
      ))
      .limit(1);
    if (!attendee) throw new SpotError('You are not attending this event', 404);

    // Guard: must drop (or offer) rider spot before releasing primary.
    const [confirmedRider] = await tx
      .select({ id: eventAttendees.id })
      .from(eventAttendees)
      .where(and(
        eq(eventAttendees.eventId, params.eventId),
        eq(eventAttendees.userId, params.userId),
        isNotNull(eventAttendees.parentAttendeeId),
        eq(eventAttendees.status, 'confirmed'),
      ))
      .limit(1);
    if (confirmedRider) throw new SpotError("Offer or drop your Rider spot before releasing your own", 400);

    // Find the earliest valid waitlist entry. We may need to skip stale rider
    // entries (user's primary spot was released before their rider promotion).
    const queue = await tx
      .select()
      .from(eventWaitlist)
      .where(eq(eventWaitlist.eventId, params.eventId))
      .orderBy(asc(eventWaitlist.joinedAt));

    if (queue.length === 0) {
      throw new SpotError(
        'No one is on the waitlist. Use "Offer" to make your spot available instead.',
        400
      );
    }

    // Walk the queue to find the first promotable entry.
    let next = queue[0];
    for (const entry of queue) {
      if (!entry.forRider) {
        next = entry;
        break;
      }
      // For a rider entry, verify the user still has a primary spot.
      const [primary] = await tx
        .select({ id: eventAttendees.id })
        .from(eventAttendees)
        .where(and(
          eq(eventAttendees.eventId, params.eventId),
          eq(eventAttendees.userId, entry.userId),
          isNull(eventAttendees.parentAttendeeId),
        ))
        .limit(1);
      if (primary) {
        next = entry;
        break;
      }
      // Stale rider entry — primary spot gone. Remove and try next.
      await tx.delete(eventWaitlist).where(eq(eventWaitlist.id, entry.id));
    }

    const promotedUserId = next.userId;

    if (next.forRider) {
      // Rider promotion: convert the released primary row into a Rider row
      // for the promoted user, parented on their existing primary spot.
      const [primarySpot] = await tx
        .select({ id: eventAttendees.id })
        .from(eventAttendees)
        .where(and(
          eq(eventAttendees.eventId, params.eventId),
          eq(eventAttendees.userId, promotedUserId),
          isNull(eventAttendees.parentAttendeeId),
        ))
        .limit(1);

      const [updated] = await tx
        .update(eventAttendees)
        .set({
          userId: promotedUserId,
          originalUserId: promotedUserId,
          status: 'confirmed',
          offeredAt: null,
          assignedBy: null,
          parentAttendeeId: primarySpot.id,
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
        notes: 'Rider promoted from bench on release',
      });
    } else {
      // Normal primary promotion.
      const [updated] = await tx
        .update(eventAttendees)
        .set({
          userId: promotedUserId,
          originalUserId: promotedUserId,
          status: 'confirmed',
          offeredAt: null,
          assignedBy: null,
          parentAttendeeId: null,
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
    }

    return { promotedUserId };
  });
}
