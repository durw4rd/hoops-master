/**
 * Waitlist operations: join, leave, and promote on spot release.
 *
 * Unified bench: one FIFO queue ordered by joinedAt. Any spot opening goes to
 * bench #1; row shape (primary vs +1) is morphed invisibly in benchMatching.ts.
 *
 * "No free drops" rule: release only runs if someone else is on the bench.
 * If the bench is empty the player must use offerSpot instead.
 */

import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { eventAttendees, eventWaitlist } from '@/lib/db/schema';
import {
  assignOpeningToBenchHead,
  getGlobalBenchPosition,
  getUnifiedBench,
  removeUserFromBench,
  tryMatchEarliestOfferToBench,
} from './benchMatching';
import { withEventLock, SpotError } from './_tx';

// ---------------------------------------------------------------------------
// Join / Leave
// ---------------------------------------------------------------------------

export interface JoinWaitlistResult {
  position: number;
  /** True when the user landed on the roster via auto-match (not queued). */
  claimed: boolean;
}

export async function joinWaitlist(params: {
  eventId: string;
  userId: string;
  forRider?: boolean;
}): Promise<JoinWaitlistResult> {
  return withEventLock(params.eventId, async (tx, event) => {
    if (params.forRider) {
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
        throw new SpotError('You need a confirmed spot in this game before joining the bench for a +1', 400);
      }
    }

    const [existing] = await tx
      .select({ id: eventWaitlist.id })
      .from(eventWaitlist)
      .where(and(
        eq(eventWaitlist.eventId, params.eventId),
        eq(eventWaitlist.userId, params.userId),
      ))
      .limit(1);
    if (existing) throw new SpotError('Already on the bench', 409);

    await tx.insert(eventWaitlist).values({
      eventId: params.eventId,
      userId: params.userId,
      forRider: params.forRider ?? false,
    });

    const match = await tryMatchEarliestOfferToBench(tx, event);
    if (match.matched && match.promotedUserId === params.userId) {
      return { position: 0, claimed: true };
    }

    const bench = await getUnifiedBench(tx, params.eventId);
    const idx = bench.findIndex((w) => w.userId === params.userId);
    return { position: idx >= 0 ? idx + 1 : await getGlobalBenchPosition(tx, params.eventId), claimed: false };
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
    ));
}

// ---------------------------------------------------------------------------
// Release primary spot → bench #1
// ---------------------------------------------------------------------------

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
      throw new SpotError('Release or offer your +1 before releasing your own spot', 400);
    }

    const bench = await getUnifiedBench(tx, params.eventId);
    if (bench.filter((e) => e.userId !== params.userId).length === 0) {
      throw new SpotError(
        'No one is on the bench — offer your spot instead so it can be claimed',
        400
      );
    }

    const result = await assignOpeningToBenchHead(tx, event, primary, {
      fromUserId: params.userId,
      transactionType: 'waitlist_promote',
      notes: 'Spot released to bench',
      notifyPreviousHolder: false,
      excludeUserId: params.userId,
    });

    await removeUserFromBench(tx, params.eventId, params.userId);

    return { promotedUserId: result.promotedUserId ?? null };
  });
}
