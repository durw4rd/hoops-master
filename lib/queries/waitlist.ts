/**
 * Waitlist queries (FIFO by joined_at) + spot release with auto-promotion.
 */

import { and, asc, eq } from 'drizzle-orm';
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

async function isAttending(tx: Tx, eventId: string, userId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: eventAttendees.id })
    .from(eventAttendees)
    .where(and(eq(eventAttendees.eventId, eventId), eq(eventAttendees.userId, userId)))
    .limit(1);
  return !!row;
}

/**
 * Join the waitlist. Only allowed when the event is full. Returns 1-based position.
 * Joining is consent to be auto-assigned (and charged) on promotion.
 */
export async function joinWaitlist(params: { eventId: string; userId: string }): Promise<number> {
  return withEventLock(params.eventId, async (tx, event) => {
    if (await isAttending(tx, params.eventId, params.userId)) {
      throw new SpotError('You already hold a spot for this event', 409);
    }
    const occ = await occupancy(tx, params.eventId);
    if (occ < event.totalSpots) {
      throw new SpotError('Spots are still available — claim one instead of waitlisting', 400);
    }

    const [existing] = await tx
      .select()
      .from(eventWaitlist)
      .where(and(eq(eventWaitlist.eventId, params.eventId), eq(eventWaitlist.userId, params.userId)))
      .limit(1);
    if (existing) throw new SpotError('You are already on the waitlist', 409);

    await tx.insert(eventWaitlist).values({ eventId: params.eventId, userId: params.userId });

    const all = await tx
      .select({ userId: eventWaitlist.userId })
      .from(eventWaitlist)
      .where(eq(eventWaitlist.eventId, params.eventId))
      .orderBy(asc(eventWaitlist.joinedAt));
    return all.findIndex((r) => r.userId === params.userId) + 1;
  });
}

export async function leaveWaitlist(params: { eventId: string; userId: string }): Promise<void> {
  await withEventLock(params.eventId, async (tx) => {
    await tx
      .delete(eventWaitlist)
      .where(and(eq(eventWaitlist.eventId, params.eventId), eq(eventWaitlist.userId, params.userId)));
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
    const [attendee] = await tx
      .select()
      .from(eventAttendees)
      .where(and(eq(eventAttendees.eventId, params.eventId), eq(eventAttendees.userId, params.userId)))
      .limit(1);
    if (!attendee) throw new SpotError('You are not attending this event', 404);

    // Earliest waitlist member, if any.
    const [next] = await tx
      .select()
      .from(eventWaitlist)
      .where(eq(eventWaitlist.eventId, params.eventId))
      .orderBy(asc(eventWaitlist.joinedAt))
      .limit(1);

    if (next) {
      const promotedUserId = next.userId;
      const [updated] = await tx
        .update(eventAttendees)
        .set({
          userId: promotedUserId,
          originalUserId: promotedUserId,
          status: 'confirmed',
          offeredAt: null,
          assignedBy: null,
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
    }

    // No waitlist: free the spot. Audit-only row (from == to => no credit move).
    await tx.delete(eventAttendees).where(eq(eventAttendees.id, attendee.id));
    await recordTransaction(tx, {
      eventId: params.eventId,
      groupId: event.groupId,
      attendeeId: null,
      type: 'release',
      fromUserId: params.userId,
      toUserId: params.userId,
      amount: Number(event.slotCost),
      notes: 'Released spot (no waitlist)',
    });
    return { promotedUserId: null };
  });
}
