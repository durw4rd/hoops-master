/**
 * Last-minute bench promotion approval (<24h before event start).
 */

import { and, eq } from 'drizzle-orm';
import { benchPromotionRequests, eventAttendees, eventWaitlist, events, groups, users } from '@/lib/db/schema';
import { isWithin24HoursOfEvent } from '@/lib/eventTiming';
import {
  assignOpeningToBenchHead,
  getSeatableBenchHead,
  type BenchAssignResult,
  type TransferOptions,
} from './benchMatching';
import type { Tx, EventRow } from './_tx';
import { SpotError } from './_tx';
import type { TransactionType } from '@/lib/types';
import { utcToZonedParts } from '@/lib/datetime';
import { notifications } from '@/lib/db/schema';

type AttendeeRow = typeof eventAttendees.$inferSelect;

export interface PendingBenchPromotionDTO {
  requestId: string;
  attendeeId: string;
  eventId: string;
  releaserName: string;
  spotKind: 'primary' | 'plus_one';
}

function formatGameLabel(startsAt: Date, timezone: string, location?: string | null): string {
  const { date, time } = utcToZonedParts(startsAt, timezone);
  const loc = location?.trim();
  return loc ? `${date} ${time} @ ${loc}` : `${date} ${time}`;
}

async function notifyPromotionPending(
  tx: Tx,
  params: {
    targetUserId: string;
    groupId: string;
    eventId: string;
    spotKind: 'primary' | 'plus_one';
    releaserName: string | null;
  }
): Promise<void> {
  const [event] = await tx
    .select({ startsAt: events.startsAt, location: events.location })
    .from(events)
    .where(eq(events.id, params.eventId))
    .limit(1);
  if (!event) return;

  const [group] = await tx
    .select({ timezone: groups.timezone })
    .from(groups)
    .where(eq(groups.id, params.groupId))
    .limit(1);
  const eventLabel = formatGameLabel(event.startsAt, group?.timezone ?? 'Europe/Prague', event.location);
  const spotLabel = params.spotKind === 'plus_one' ? 'a +1 spot' : 'a spot';
  const opener = params.releaserName
    ? `${params.releaserName} released ${spotLabel}`
    : `${spotLabel[0].toUpperCase()}${spotLabel.slice(1)} opened up`;

  await tx.insert(notifications).values({
    userId: params.targetUserId,
    groupId: params.groupId,
    eventId: params.eventId,
    type: 'bench_promotion_pending',
    title: 'Spot waiting on you',
    body: `${opener} for ${eventLabel}. Accept to get in — or decline to pass it to the next person on the bench.`,
  });
}

export async function createPendingForHead(
  tx: Tx,
  event: EventRow,
  openingRow: AttendeeRow,
  headUserId: string,
  options: TransferOptions
): Promise<void> {
  const existing = await tx
    .select({ id: benchPromotionRequests.id })
    .from(benchPromotionRequests)
    .where(and(
      eq(benchPromotionRequests.attendeeId, openingRow.id),
      eq(benchPromotionRequests.status, 'pending'),
    ))
    .limit(1);
  if (existing.length > 0) {
    throw new SpotError('A promotion approval is already pending for this spot', 409);
  }

  let releaserName: string | null = null;
  if (openingRow.userId) {
    const [releaser] = await tx
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, openingRow.userId))
      .limit(1);
    releaserName = releaser?.displayName ?? null;
  }

  await tx.insert(benchPromotionRequests).values({
    eventId: event.id,
    attendeeId: openingRow.id,
    targetUserId: headUserId,
    status: 'pending',
    transactionType: options.transactionType,
  });

  const spotKind = openingRow.parentAttendeeId ? 'plus_one' : 'primary';
  await notifyPromotionPending(tx, {
    targetUserId: headUserId,
    groupId: event.groupId,
    eventId: event.id,
    spotKind,
    releaserName,
  });

  // A last-minute spot is waiting on this player — email them too.
  const { enqueueEmail } = await import('./emailOutbox');
  await enqueueEmail(tx, {
    userId: headUserId,
    groupId: event.groupId,
    eventId: event.id,
    emailType: 'bench_promotion_pending',
    spotKind,
  });
}

/**
 * Auto-promote bench #1, or defer with pending approval when within 24h of start.
 */
export async function assignOpeningToBenchHeadOrPending(
  tx: Tx,
  event: EventRow,
  openingRow: AttendeeRow,
  options: TransferOptions
): Promise<BenchAssignResult & { pendingApproval?: boolean }> {
  if (!isWithin24HoursOfEvent(event)) {
    return assignOpeningToBenchHead(tx, event, openingRow, options);
  }

  const head = await getSeatableBenchHead(tx, event.id, { excludeUserId: options.excludeUserId });
  if (!head) return { matched: false };

  await createPendingForHead(tx, event, openingRow, head.userId, options);
  return { matched: false, pendingApproval: true, promotedUserId: head.userId };
}

export async function cancelPendingPromotionsForAttendee(
  tx: Tx,
  attendeeId: string
): Promise<void> {
  await tx
    .update(benchPromotionRequests)
    .set({ status: 'cancelled', respondedAt: new Date() })
    .where(and(
      eq(benchPromotionRequests.attendeeId, attendeeId),
      eq(benchPromotionRequests.status, 'pending'),
    ));
}

export async function getPendingPromotionForTarget(
  eventId: string,
  targetUserId: string
): Promise<PendingBenchPromotionDTO | null> {
  const { db } = await import('@/lib/db');
  const [row] = await db
    .select({
      r: benchPromotionRequests,
      releaserName: users.displayName,
      parentAttendeeId: eventAttendees.parentAttendeeId,
    })
    .from(benchPromotionRequests)
    .innerJoin(eventAttendees, eq(eventAttendees.id, benchPromotionRequests.attendeeId))
    .leftJoin(users, eq(users.id, eventAttendees.userId))
    .where(and(
      eq(benchPromotionRequests.eventId, eventId),
      eq(benchPromotionRequests.targetUserId, targetUserId),
      eq(benchPromotionRequests.status, 'pending'),
    ))
    .limit(1);

  if (!row) return null;
  return {
    requestId: row.r.id,
    attendeeId: row.r.attendeeId,
    eventId: row.r.eventId,
    releaserName: row.releaserName ?? 'A player',
    spotKind: row.parentAttendeeId ? 'plus_one' : 'primary',
  };
}

export async function hasPendingHandoffForUser(
  eventId: string,
  userId: string
): Promise<boolean> {
  const { db } = await import('@/lib/db');
  const [row] = await db
    .select({ id: benchPromotionRequests.id })
    .from(benchPromotionRequests)
    .innerJoin(eventAttendees, eq(eventAttendees.id, benchPromotionRequests.attendeeId))
    .where(and(
      eq(benchPromotionRequests.eventId, eventId),
      eq(eventAttendees.userId, userId),
      eq(benchPromotionRequests.status, 'pending'),
    ))
    .limit(1);
  return !!row;
}

export async function approveBenchPromotion(params: {
  requestId: string;
  eventId: string;
  userId: string;
}): Promise<void> {
  const { withEventLock } = await import('./_tx');
  const { transferOpeningToUser } = await import('./benchMatching');

  await withEventLock(params.eventId, async (tx, event) => {
    const [req] = await tx
      .select()
      .from(benchPromotionRequests)
      .where(and(
        eq(benchPromotionRequests.id, params.requestId),
        eq(benchPromotionRequests.eventId, params.eventId),
        eq(benchPromotionRequests.status, 'pending'),
      ))
      .limit(1);
    if (!req) throw new SpotError('Promotion request not found', 404);
    if (req.targetUserId !== params.userId) {
      throw new SpotError('Only the invited player can accept this promotion', 403);
    }

    const [opening] = await tx
      .select()
      .from(eventAttendees)
      .where(eq(eventAttendees.id, req.attendeeId))
      .limit(1);
    if (!opening) throw new SpotError('Spot not found', 404);

    await transferOpeningToUser(tx, event, opening, req.targetUserId, {
      fromUserId: opening.userId,
      transactionType: req.transactionType as TransactionType,
      notes: 'Bench promotion approved',
      notifyPreviousHolder: false,
    });

    await tx
      .delete(eventWaitlist)
      .where(and(
        eq(eventWaitlist.eventId, params.eventId),
        eq(eventWaitlist.userId, req.targetUserId),
      ));

    await tx
      .update(benchPromotionRequests)
      .set({ status: 'approved', respondedAt: new Date() })
      .where(eq(benchPromotionRequests.id, req.id));
  });
}

export async function declineBenchPromotion(params: {
  requestId: string;
  eventId: string;
  userId: string;
}): Promise<void> {
  const { withEventLock } = await import('./_tx');

  await withEventLock(params.eventId, async (tx, event) => {
    const [req] = await tx
      .select()
      .from(benchPromotionRequests)
      .where(and(
        eq(benchPromotionRequests.id, params.requestId),
        eq(benchPromotionRequests.eventId, params.eventId),
        eq(benchPromotionRequests.status, 'pending'),
      ))
      .limit(1);
    if (!req) throw new SpotError('Promotion request not found', 404);
    if (req.targetUserId !== params.userId) {
      throw new SpotError('Only the invited player can decline this promotion', 403);
    }

    const [opening] = await tx
      .select()
      .from(eventAttendees)
      .where(eq(eventAttendees.id, req.attendeeId))
      .limit(1);
    if (!opening) throw new SpotError('Spot not found', 404);

    await tx
      .update(benchPromotionRequests)
      .set({ status: 'declined', respondedAt: new Date() })
      .where(eq(benchPromotionRequests.id, req.id));

    await tx
      .delete(eventWaitlist)
      .where(and(
        eq(eventWaitlist.eventId, params.eventId),
        eq(eventWaitlist.userId, params.userId),
      ));

    // Cascade: next seatable bench player gets a pending request; if the bench
    // is exhausted the spot opens up (or the placeholder dissolves into free
    // capacity). Dynamic import avoids a module cycle with spotOpening.
    const { handleSpotOpening } = await import('./spotOpening');
    await handleSpotOpening(tx, event, opening, {
      funding: opening.userId
        ? { kind: 'holder_funded', fromUserId: opening.userId }
        : { kind: 'vacant' },
      transactionType: req.transactionType as TransactionType,
      notes: 'Cascade after decline',
      excludeUserId: opening.userId ?? undefined,
    });
  });
}

/**
 * Cancel any pending promotion requests that target `userId` in this event
 * (because they left the bench, or landed a spot some other way), then
 * re-resolve each affected opening: next bench player, or open/dissolve.
 */
export async function cancelPendingTargetsForUser(
  tx: Tx,
  event: EventRow,
  userId: string
): Promise<void> {
  const pending = await tx
    .select()
    .from(benchPromotionRequests)
    .where(and(
      eq(benchPromotionRequests.eventId, event.id),
      eq(benchPromotionRequests.targetUserId, userId),
      eq(benchPromotionRequests.status, 'pending'),
    ));
  if (pending.length === 0) return;

  const { handleSpotOpening } = await import('./spotOpening');
  for (const req of pending) {
    await tx
      .update(benchPromotionRequests)
      .set({ status: 'cancelled', respondedAt: new Date() })
      .where(eq(benchPromotionRequests.id, req.id));

    const [opening] = await tx
      .select()
      .from(eventAttendees)
      .where(eq(eventAttendees.id, req.attendeeId))
      .limit(1);
    if (!opening) continue;

    await handleSpotOpening(tx, event, opening, {
      funding: opening.userId
        ? { kind: 'holder_funded', fromUserId: opening.userId }
        : { kind: 'vacant' },
      transactionType: req.transactionType as TransactionType,
      notes: 'Re-matched after pending target left the bench',
      excludeUserId: opening.userId ?? undefined,
    });
  }
}
