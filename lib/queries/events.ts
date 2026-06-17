/**
 * Event + attendee queries, including concurrency-safe spot mutations.
 *
 * Two-row rider model: a player can hold a primary row (parentAttendeeId IS NULL)
 * and optionally a rider row (parentAttendeeId = primary row id). Each row counts
 * as one slot toward event.totalSpots. Both rows can be independently confirmed,
 * offered, and claimed — exactly like any other spot.
 *
 * Capacity rule: occupancy = COUNT(*) across all attendee rows.
 * Claiming an *offered* row is a zero-sum transfer and does not change occupancy.
 *
 * "No free drops" rule: neither players nor admins can remove a spot without
 * providing a replacement. Options are: release to bench, offer to marketplace,
 * or hand over directly. Use adminUnassignSpot only for full cancellations.
 */

import { and, asc, eq, gte, inArray, isNotNull, isNull, lte } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '@/lib/db';
import { events, eventAttendees, eventWaitlist, users, groups, spotTransactions } from '@/lib/db/schema';
import { recordTransaction } from './transactions';
import { notifySpotChange } from './notifications';
import {
  assignOpeningToBenchHead,
  getUnifiedBench,
  removeUserFromBench,
  transferOpeningToUser,
} from './benchMatching';
import { withEventLock, serializableTx, SpotError, type Tx, type EventRow } from './_tx';
import { zonedToUtc, utcToZonedParts, ALWAYS_OPEN_SENTINEL } from '@/lib/datetime';
import type {
  Event,
  EventAttendee,
  EventStatus,
  EventType,
  AssignmentMode,
  AttendeeStatus,
  TransactionType,
  WaitlistEntry,
  BannerOrientation,
} from '@/lib/types';

type AttendeeRow = typeof eventAttendees.$inferSelect;

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

export function toEventDTO(row: EventRow, timezone: string): Event {
  const start = utcToZonedParts(row.startsAt, timezone);
  const end = utcToZonedParts(row.endsAt, timezone);
  return {
    eventId: row.id,
    groupId: row.groupId,
    date: start.date,
    startTime: start.time,
    endTime: end.time,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    totalSpots: row.totalSpots,
    slotCost: Number(row.slotCost),
    location: row.location ?? '',
    name: row.name ?? '',
    description: row.description ?? '',
    bannerUrl: row.bannerUrl ?? null,
    bannerOrientation: (row.bannerOrientation === 'portrait' ? 'portrait' : 'landscape') as BannerOrientation,
    eventType: (row.eventType === 'tournament' ? 'special' : row.eventType) as EventType,
    assignmentMode: row.assignmentMode as AssignmentMode,
    roundRobinOffset: row.roundRobinOffset,
    status: row.status as EventStatus,
    signupOpensAt: row.signupOpensAt ? row.signupOpensAt.toISOString() : ALWAYS_OPEN_SENTINEL,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getEventRowById(eventId: string): Promise<EventRow | null> {
  const [row] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  return row ?? null;
}

export async function getEventById(eventId: string, timezone: string): Promise<Event | null> {
  const row = await getEventRowById(eventId);
  return row ? toEventDTO(row, timezone) : null;
}

interface GetEventsOpts {
  includePast?: boolean;
  fromIso?: string;
  toIso?: string;
}

export async function getEventRows(groupId: string, opts: GetEventsOpts = {}): Promise<EventRow[]> {
  const conditions = [eq(events.groupId, groupId)];
  if (!opts.includePast) conditions.push(gte(events.startsAt, new Date()));
  if (opts.fromIso) conditions.push(gte(events.startsAt, new Date(opts.fromIso)));
  if (opts.toIso) conditions.push(lte(events.startsAt, new Date(opts.toIso)));
  return db
    .select()
    .from(events)
    .where(and(...conditions))
    .orderBy(asc(events.startsAt));
}

export interface EventCounts {
  confirmed: number;
  offered: number;
  occupancy: number;
}

export async function getCountsForEvents(eventIds: string[]): Promise<Map<string, EventCounts>> {
  const result = new Map<string, EventCounts>();
  if (eventIds.length === 0) return result;
  const rows = await db
    .select({ eventId: eventAttendees.eventId, status: eventAttendees.status })
    .from(eventAttendees)
    .where(inArray(eventAttendees.eventId, eventIds));
  for (const id of eventIds) result.set(id, { confirmed: 0, offered: 0, occupancy: 0 });
  for (const r of rows) {
    const c = result.get(r.eventId)!;
    c.occupancy += 1;
    if (r.status === 'offered') c.offered += 1;
    else c.confirmed += 1;
  }
  return result;
}

/** Per-user attendance flags for a set of events (for list highlighting/filtering). */
export async function getUserStatusForEvents(
  userId: string,
  eventIds: string[]
): Promise<Map<string, { attending: boolean; onWaitlist: boolean; hasRider: boolean }>> {
  const result = new Map<string, { attending: boolean; onWaitlist: boolean; hasRider: boolean }>();
  if (eventIds.length === 0) return result;
  for (const id of eventIds) result.set(id, { attending: false, onWaitlist: false, hasRider: false });

  const attRows = await db
    .select({ eventId: eventAttendees.eventId, parentAttendeeId: eventAttendees.parentAttendeeId })
    .from(eventAttendees)
    .where(and(inArray(eventAttendees.eventId, eventIds), eq(eventAttendees.userId, userId)));
  for (const r of attRows) {
    const s = result.get(r.eventId);
    if (s) {
      s.attending = true;
      if (r.parentAttendeeId !== null) s.hasRider = true;
    }
  }

  const wlRows = await db
    .select({ eventId: eventWaitlist.eventId })
    .from(eventWaitlist)
    .where(and(inArray(eventWaitlist.eventId, eventIds), eq(eventWaitlist.userId, userId)));
  for (const r of wlRows) {
    const s = result.get(r.eventId);
    if (s) s.onWaitlist = true;
  }

  return result;
}

/** Waitlist sizes for a set of events (for the games overview). */
export async function getWaitlistCountsForEvents(eventIds: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (eventIds.length === 0) return result;
  for (const id of eventIds) result.set(id, 0);
  const rows = await db
    .select({ eventId: eventWaitlist.eventId })
    .from(eventWaitlist)
    .where(inArray(eventWaitlist.eventId, eventIds));
  for (const r of rows) result.set(r.eventId, (result.get(r.eventId) ?? 0) + 1);
  return result;
}

export async function getEventAttendees(eventId: string): Promise<EventAttendee[]> {
  const holder = alias(users, 'holder');
  const original = alias(users, 'original');
  const rows = await db
    .select({
      a: eventAttendees,
      holderEmail: holder.email,
      holderName: holder.displayName,
      originalEmail: original.email,
      assignedByEmail: users.email,
    })
    .from(eventAttendees)
    .innerJoin(holder, eq(holder.id, eventAttendees.userId))
    .innerJoin(original, eq(original.id, eventAttendees.originalUserId))
    .leftJoin(users, eq(users.id, eventAttendees.assignedBy))
    .where(eq(eventAttendees.eventId, eventId))
    .orderBy(asc(eventAttendees.assignedAt));

  return rows.map(({ a, holderEmail, holderName, originalEmail, assignedByEmail }) => ({
    attendeeId: a.id,
    eventId: a.eventId,
    userEmail: holderEmail,
    userName: holderName,
    originalUserEmail: originalEmail,
    status: a.status as AttendeeStatus,
    offeredAt: a.offeredAt ? a.offeredAt.toISOString() : null,
    assignedBy: a.assignedBy ? assignedByEmail : null,
    assignedAt: a.assignedAt.toISOString(),
    parentAttendeeId: a.parentAttendeeId ?? null,
    isPlusOne: a.parentAttendeeId !== null,
  }));
}

export async function getWaitlistEntries(eventId: string): Promise<WaitlistEntry[]> {
  const rows = await db
    .select({ w: eventWaitlist, email: users.email, displayName: users.displayName })
    .from(eventWaitlist)
    .innerJoin(users, eq(users.id, eventWaitlist.userId))
    .where(eq(eventWaitlist.eventId, eventId))
    .orderBy(asc(eventWaitlist.joinedAt));
  return rows.map(({ w, email, displayName }, idx) => ({
    userEmail: email,
    displayName,
    position: idx + 1,
    joinedAt: w.joinedAt.toISOString(),
    forRider: w.forRider,
  }));
}

// ---------------------------------------------------------------------------
// Create / update / delete events
// ---------------------------------------------------------------------------

export interface CreateEventInput {
  date: string;
  startTime: string;
  endTime: string;
  totalSpots: number;
  slotCost: number;
  location?: string;
  name?: string;
  description?: string;
  bannerUrl?: string | null;
  bannerOrientation?: BannerOrientation;
  eventType?: EventType;
  assignmentMode?: AssignmentMode;
  signupOpensAt?: string | null;
  roundRobinOffset?: number | null;
}

function resolveSignupOpensAt(input: string | null | undefined): Date | null {
  if (!input) return null;
  const d = new Date(input);
  if (isNaN(d.getTime()) || d.getFullYear() < 2000) return null;
  return d;
}

export async function createEvent(
  groupId: string,
  timezone: string,
  input: CreateEventInput,
  creatorId: string
): Promise<Event> {
  const startsAt = zonedToUtc(input.date, input.startTime, timezone);
  let endsAt = zonedToUtc(input.date, input.endTime, timezone);
  if (endsAt <= startsAt) endsAt = new Date(endsAt.getTime() + 24 * 60 * 60 * 1000);

  const [row] = await db
    .insert(events)
    .values({
      groupId,
      startsAt,
      endsAt,
      totalSpots: input.totalSpots,
      slotCost: String(input.slotCost),
      location: input.location ?? '',
      name: input.name ?? '',
      description: input.description ?? '',
      bannerUrl: input.bannerUrl ?? null,
      bannerOrientation: input.bannerOrientation ?? 'landscape',
      eventType: (input.eventType ?? 'regular') as EventType,
      assignmentMode: (input.assignmentMode ?? 'admin_assign') as AssignmentMode,
      signupOpensAt: resolveSignupOpensAt(input.signupOpensAt),
      roundRobinOffset: input.roundRobinOffset ?? null,
      createdBy: creatorId,
    })
    .returning();
  return toEventDTO(row, timezone);
}

export async function bulkCreateEvents(
  groupId: string,
  timezone: string,
  inputs: CreateEventInput[],
  creatorId: string
): Promise<Event[]> {
  if (inputs.length === 0) return [];
  const values = inputs.map((input) => {
    const startsAt = zonedToUtc(input.date, input.startTime, timezone);
    let endsAt = zonedToUtc(input.date, input.endTime, timezone);
    if (endsAt <= startsAt) endsAt = new Date(endsAt.getTime() + 24 * 60 * 60 * 1000);
    return {
      groupId,
      startsAt,
      endsAt,
      totalSpots: input.totalSpots,
      slotCost: String(input.slotCost),
      location: input.location ?? '',
      name: '',
      description: input.description ?? '',
      bannerUrl: null,
      bannerOrientation: 'landscape',
      eventType: 'regular' as EventType,
      assignmentMode: (input.assignmentMode ?? 'admin_assign') as AssignmentMode,
      signupOpensAt: resolveSignupOpensAt(input.signupOpensAt),
      createdBy: creatorId,
    };
  });
  const rows = await db.insert(events).values(values).returning();
  return rows.map((r) => toEventDTO(r, timezone));
}

export async function updateEventStatus(eventId: string, status: EventStatus): Promise<Event | null> {
  const [row] = await db.update(events).set({ status }).where(eq(events.id, eventId)).returning();
  if (!row) return null;
  const [g] = await db.select({ tz: groups.timezone }).from(groups).where(eq(groups.id, row.groupId));
  return toEventDTO(row, g?.tz ?? 'UTC');
}

export interface UpdateEventInput {
  date?: string;
  startTime?: string;
  endTime?: string;
  totalSpots?: number;
  slotCost?: number;
  location?: string;
  name?: string;
  description?: string;
  bannerUrl?: string | null;
  bannerOrientation?: BannerOrientation;
  eventType?: EventType;
  assignmentMode?: AssignmentMode;
  signupOpensAt?: string | null;
}

export async function updateEvent(
  eventId: string,
  timezone: string,
  input: UpdateEventInput
): Promise<Event | null> {
  const current = await getEventRowById(eventId);
  if (!current) return null;

  const patch: Record<string, unknown> = {};
  if (input.date || input.startTime || input.endTime) {
    const cur = utcToZonedParts(current.startsAt, timezone);
    const curEnd = utcToZonedParts(current.endsAt, timezone);
    const date = input.date ?? cur.date;
    const startTime = input.startTime ?? cur.time;
    const endTime = input.endTime ?? curEnd.time;
    const startsAt = zonedToUtc(date, startTime, timezone);
    let endsAt = zonedToUtc(date, endTime, timezone);
    if (endsAt <= startsAt) endsAt = new Date(endsAt.getTime() + 24 * 60 * 60 * 1000);
    patch.startsAt = startsAt;
    patch.endsAt = endsAt;
  }
  if (input.totalSpots !== undefined) patch.totalSpots = input.totalSpots;
  if (input.slotCost !== undefined) patch.slotCost = String(input.slotCost);
  if (input.location !== undefined) patch.location = input.location;
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.bannerUrl !== undefined) patch.bannerUrl = input.bannerUrl;
  if (input.bannerOrientation !== undefined) patch.bannerOrientation = input.bannerOrientation;
  if (input.eventType !== undefined) patch.eventType = input.eventType;
  if (input.assignmentMode !== undefined) patch.assignmentMode = input.assignmentMode;
  if (input.signupOpensAt !== undefined) patch.signupOpensAt = resolveSignupOpensAt(input.signupOpensAt);

  if (Object.keys(patch).length === 0) return toEventDTO(current, timezone);
  const [row] = await db.update(events).set(patch).where(eq(events.id, eventId)).returning();
  return row ? toEventDTO(row, timezone) : null;
}

export async function deleteEvent(eventId: string): Promise<void> {
  await serializableTx(async (tx) => {
    await tx.delete(spotTransactions).where(eq(spotTransactions.eventId, eventId));
    await tx.delete(events).where(eq(events.id, eventId));
  });
}

// ---------------------------------------------------------------------------
// Internal transaction helpers
// ---------------------------------------------------------------------------

async function occupancyInTx(tx: Tx, eventId: string): Promise<number> {
  const rows = await tx
    .select({ id: eventAttendees.id })
    .from(eventAttendees)
    .where(eq(eventAttendees.eventId, eventId));
  return rows.length;
}

/** Find the primary (non-rider) spot for a user in an event. */
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

/** Find the rider row for a user in an event. */
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

// ---------------------------------------------------------------------------
// Spot mutations — public API
// ---------------------------------------------------------------------------

/**
 * Fill a fresh (previously empty) spot for `toUserId`. Used by admin assign,
 * self-signup, and round-robin. Checks that the user has no primary spot.
 */
export async function fillSpot(params: {
  eventId: string;
  toUserId: string;
  assignedById: string | null;
  type: TransactionType;
  notes?: string;
}): Promise<AttendeeRow> {
  return withEventLock(params.eventId, async (tx, event) => {
    const existing = await getPrimaryAttendeeInTx(tx, params.eventId, params.toUserId);
    if (existing) throw new SpotError('Already holds a spot for this event', 409);

    const occ = await occupancyInTx(tx, params.eventId);
    if (occ >= event.totalSpots) throw new SpotError('Event is full', 409);

    const [attendee] = await tx
      .insert(eventAttendees)
      .values({
        eventId: params.eventId,
        userId: params.toUserId,
        originalUserId: params.toUserId,
        status: 'confirmed',
        assignedBy: params.assignedById,
      })
      .returning();

    await recordTransaction(tx, {
      eventId: params.eventId,
      groupId: event.groupId,
      attendeeId: attendee.id,
      type: params.type,
      fromUserId: null,
      toUserId: params.toUserId,
      amount: Number(event.slotCost),
      notes: params.notes,
    });

    return attendee;
  });
}

/**
 * Batch fill multiple fresh primary spots (admin assign / round-robin).
 * Skips users who already hold any spot. Stops when full.
 */
export async function fillSpots(params: {
  eventId: string;
  toUserIds: string[];
  assignedById: string | null;
  type: TransactionType;
  notes?: string;
}): Promise<{ assigned: string[]; skipped: string[] }> {
  return withEventLock(params.eventId, async (tx, event) => {
    const assigned: string[] = [];
    const skipped: string[] = [];
    let occ = await occupancyInTx(tx, params.eventId);

    const existingRows = await tx
      .select({ userId: eventAttendees.userId })
      .from(eventAttendees)
      .where(and(
        eq(eventAttendees.eventId, params.eventId),
        isNull(eventAttendees.parentAttendeeId),
      ));
    const held = new Set(existingRows.map((r) => r.userId));

    for (const userId of params.toUserIds) {
      if (held.has(userId)) { skipped.push(userId); continue; }
      if (occ >= event.totalSpots) { skipped.push(userId); continue; }
      const [attendee] = await tx
        .insert(eventAttendees)
        .values({
          eventId: params.eventId,
          userId,
          originalUserId: userId,
          status: 'confirmed',
          assignedBy: params.assignedById,
        })
        .returning();
      await recordTransaction(tx, {
        eventId: params.eventId,
        groupId: event.groupId,
        attendeeId: attendee.id,
        type: params.type,
        fromUserId: null,
        toUserId: userId,
        amount: Number(event.slotCost),
        notes: params.notes,
      });
      held.add(userId);
      occ += 1;
      assigned.push(userId);
    }
    return { assigned, skipped };
  });
}

/**
 * Claim a spot. If `attendeeId` is provided, claim that specific offered row
 * (zero-sum transfer). Otherwise self-sign-up into an empty primary slot.
 *
 * When `attendeeId` targets a rider row, the claimer must already hold a
 * confirmed primary and must not yet have a rider. The parentAttendeeId is
 * re-linked to the claimer's own primary.
 */
export async function claimSpot(params: {
  eventId: string;
  userId: string;
  attendeeId?: string;
}): Promise<AttendeeRow> {
  return withEventLock(params.eventId, async (tx, event) => {
    if (params.attendeeId) {
      const [offered] = await tx
        .select()
        .from(eventAttendees)
        .where(and(eq(eventAttendees.id, params.attendeeId), eq(eventAttendees.eventId, params.eventId)))
        .limit(1);
      if (!offered) throw new SpotError('Offered spot not found', 404);
      if (offered.status !== 'offered') throw new SpotError('That spot is no longer available', 409);

      const bench = await getUnifiedBench(tx, params.eventId);
      if (bench.length > 0) {
        const headId = bench[0].userId;
        if (headId !== params.userId) {
          throw new SpotError('Someone is ahead of you on the bench', 409);
        }
        const result = await assignOpeningToBenchHead(tx, event, offered, {
          fromUserId: offered.userId,
          transactionType: 'claim',
          notes: 'Claimed offered spot from bench',
          notifyPreviousHolder: true,
        });
        await removeUserFromBench(tx, params.eventId, params.userId);
        return result.attendee!;
      }

      const updated = await transferOpeningToUser(tx, event, offered, params.userId, {
        fromUserId: offered.userId,
        transactionType: 'claim',
        notes: 'Claimed offered spot',
        notifyPreviousHolder: true,
      });
      await removeUserFromBench(tx, params.eventId, params.userId);
      return updated;
    }

    // Self sign-up into an empty primary slot.
    const already = await getPrimaryAttendeeInTx(tx, params.eventId, params.userId);
    if (already) throw new SpotError('You already have a spot for this event', 409);

    const occ = await occupancyInTx(tx, params.eventId);
    if (occ >= event.totalSpots) throw new SpotError('Event is full', 409);

    const [attendee] = await tx
      .insert(eventAttendees)
      .values({
        eventId: params.eventId,
        userId: params.userId,
        originalUserId: params.userId,
        status: 'confirmed',
        assignedBy: null,
      })
      .returning();

    await recordTransaction(tx, {
      eventId: params.eventId,
      groupId: event.groupId,
      attendeeId: attendee.id,
      type: 'signup',
      fromUserId: null,
      toUserId: params.userId,
      amount: Number(event.slotCost),
    });
    return attendee;
  });
}

/**
 * Mark a spot as offered. Pass `attendeeId` to target a specific row (e.g. a
 * rider row). Without `attendeeId`, targets the caller's primary.
 *
 * Offering the primary is blocked while a rider row is still confirmed — the
 * rider must be offered or released first so both can be managed independently.
 */
export async function offerSpot(params: {
  eventId: string;
  userId: string;
  attendeeId?: string;
}): Promise<AttendeeRow> {
  return withEventLock(params.eventId, async (tx, event) => {
    let attendee: AttendeeRow | null;
    if (params.attendeeId) {
      const [row] = await tx
        .select()
        .from(eventAttendees)
        .where(and(eq(eventAttendees.id, params.attendeeId), eq(eventAttendees.eventId, params.eventId)))
        .limit(1);
      attendee = row ?? null;
    } else {
      attendee = await getPrimaryAttendeeInTx(tx, params.eventId, params.userId);

      // Guard: cannot offer primary while rider row is still confirmed.
      const rider = await getRiderAttendeeInTx(tx, params.eventId, params.userId);
      if (rider && rider.status === 'confirmed') {
        throw new SpotError('Offer or release your +1 first before offering your own spot', 400);
      }

      // Auto-cancel own bench entry when offering primary (leaving the event flow).
      await removeUserFromBench(tx, params.eventId, params.userId);
    }
    if (!attendee) throw new SpotError('Spot not found', 404);
    if (attendee.userId !== params.userId) throw new SpotError('Not your spot', 403);
    if (attendee.status !== 'confirmed') throw new SpotError('Spot is not confirmed', 400);

    const [updated] = await tx
      .update(eventAttendees)
      .set({ status: 'offered', offeredAt: new Date() })
      .where(eq(eventAttendees.id, attendee.id))
      .returning();

    const match = await assignOpeningToBenchHead(tx, event, updated, {
      fromUserId: params.userId,
      transactionType: 'claim',
      notes: params.attendeeId ? 'Offered +1 auto-matched to bench' : 'Offered spot auto-matched to bench',
      notifyPreviousHolder: true,
    });

    if (match.matched && match.attendee) {
      return match.attendee;
    }

    await recordTransaction(tx, {
      eventId: params.eventId,
      groupId: event.groupId,
      attendeeId: updated.id,
      type: 'offer',
      fromUserId: params.userId,
      toUserId: params.userId,
      amount: 0,
      notes: params.attendeeId ? 'Offered +1 to marketplace' : 'Offered spot to marketplace',
    });
    return updated;
  });
}

/**
 * Retract an offered spot before anyone claims it.
 * Pass `attendeeId` to target a specific row (e.g. a rider row).
 */
export async function retractOffer(params: {
  eventId: string;
  userId: string;
  attendeeId?: string;
}): Promise<AttendeeRow> {
  return withEventLock(params.eventId, async (tx, event) => {
    let attendee: AttendeeRow | null;
    if (params.attendeeId) {
      const [row] = await tx
        .select()
        .from(eventAttendees)
        .where(and(eq(eventAttendees.id, params.attendeeId), eq(eventAttendees.eventId, params.eventId)))
        .limit(1);
      attendee = row ?? null;
    } else {
      attendee = await getPrimaryAttendeeInTx(tx, params.eventId, params.userId);
    }
    if (!attendee) throw new SpotError('Spot not found', 404);
    if (attendee.userId !== params.userId) throw new SpotError('Not your spot', 403);
    if (attendee.status !== 'offered') throw new SpotError('Your spot is not currently offered', 400);

    const [updated] = await tx
      .update(eventAttendees)
      .set({ status: 'confirmed', offeredAt: null })
      .where(eq(eventAttendees.id, attendee.id))
      .returning();

    await recordTransaction(tx, {
      eventId: params.eventId,
      groupId: event.groupId,
      attendeeId: updated.id,
      type: 'retract',
      fromUserId: params.userId,
      toUserId: params.userId,
      amount: 0,
      notes: 'Retracted offered spot',
    });
    return updated;
  });
}

/**
 * Claim a Rider (+1) spot for the caller. The caller must already hold a
 * confirmed primary spot, must not yet have a rider, and the event must have
 * capacity. Costs the same as a primary spot.
 *
 * Can also be used by admins to assign a rider for another player (byUserId).
 */
export async function claimRiderSpot(params: {
  eventId: string;
  userId: string;
  byUserId?: string;
}): Promise<AttendeeRow> {
  return withEventLock(params.eventId, async (tx, event) => {
    const primary = await getPrimaryAttendeeInTx(tx, params.eventId, params.userId);
    if (!primary) throw new SpotError('You need a spot in this game before bringing a Rider', 400);
    if (primary.status !== 'confirmed') throw new SpotError('Your spot must be confirmed to bring a Rider', 400);

    const existing = await getRiderAttendeeInTx(tx, params.eventId, params.userId);
    if (existing) throw new SpotError('You already have a Rider in this game', 409);

    const occ = await occupancyInTx(tx, params.eventId);
    if (occ >= event.totalSpots) throw new SpotError('No spots left for a Rider', 409);

    const [attendee] = await tx
      .insert(eventAttendees)
      .values({
        eventId: params.eventId,
        userId: params.userId,
        originalUserId: params.userId,
        status: 'confirmed',
        assignedBy: params.byUserId ?? null,
        parentAttendeeId: primary.id,
      })
      .returning();

    await recordTransaction(tx, {
      eventId: params.eventId,
      groupId: event.groupId,
      attendeeId: attendee.id,
      type: 'signup',
      fromUserId: null,
      toUserId: params.userId,
      amount: Number(event.slotCost),
      notes: params.byUserId ? 'Rider assigned by admin' : 'Rider claimed',
    });
    return attendee;
  });
}

/**
 * Release the caller's Rider slot to the first player on the Rider bench
 * (forRider=true waitlist). Throws if no rider bench entries exist — use
 * offerSpot with the rider attendeeId instead.
 *
 * Credit flows zero-sum to the promoted player (same as a primary release).
 */
export async function releaseRiderSpot(params: {
  eventId: string;
  userId: string;
}): Promise<void> {
  await withEventLock(params.eventId, async (tx, event) => {
    const rider = await getRiderAttendeeInTx(tx, params.eventId, params.userId);
    if (!rider) throw new SpotError('You do not have a +1 in this game', 404);
    if (rider.status !== 'confirmed') throw new SpotError('Only a confirmed +1 can be released to the bench', 400);

    const bench = await getUnifiedBench(tx, params.eventId);
    if (bench.filter((e) => e.userId !== params.userId).length === 0) {
      throw new SpotError(
        'No one is on the bench — offer your +1 instead so it can be claimed',
        400
      );
    }

    await assignOpeningToBenchHead(tx, event, rider, {
      fromUserId: params.userId,
      transactionType: 'waitlist_promote',
      notes: '+1 released to bench',
      notifyPreviousHolder: false,
      excludeUserId: params.userId,
    });
  });
}

/**
 * Reassign a spot to another member. If `fromUserId` is given, transfer that
 * holder's spot (rider-first: their rider row is preferred over primary).
 * If no source is specified, fill a fresh slot for `toUserId`.
 *
 * Guards:
 * - For rider transfer: target must have a confirmed primary and no rider.
 * - For primary transfer: target must not hold any primary spot.
 */
export async function reassignSpot(params: {
  eventId: string;
  toUserId: string;
  fromUserId?: string;
  attendeeId?: string;
  byUserId: string;
  isAdmin: boolean;
}): Promise<AttendeeRow> {
  return withEventLock(params.eventId, async (tx, event) => {
    let source: AttendeeRow | null = null;
    if (params.attendeeId) {
      const [row] = await tx
        .select()
        .from(eventAttendees)
        .where(and(eq(eventAttendees.id, params.attendeeId), eq(eventAttendees.eventId, params.eventId)))
        .limit(1);
      source = row ?? null;
    } else if (params.fromUserId) {
      // Rider-first: prefer the rider row so it must be handled before the primary.
      source =
        (await getRiderAttendeeInTx(tx, params.eventId, params.fromUserId)) ??
        (await getPrimaryAttendeeInTx(tx, params.eventId, params.fromUserId));
    }

    const type: TransactionType = params.isAdmin ? 'admin_reassign' : 'reassign';

    if (source) {
      // Non-admins can only reassign their own spots.
      if (!params.isAdmin && source.userId !== params.byUserId) {
        throw new SpotError('You can only reassign your own spot', 403);
      }

      const isRiderSource = source.parentAttendeeId !== null;
      const previousHolder = source.userId;

      if (isRiderSource) {
        // Second-spot row → assignee gets a primary spot (spot is a spot).
        const targetPrimary = await getPrimaryAttendeeInTx(tx, params.eventId, params.toUserId);
        const targetRider = await getRiderAttendeeInTx(tx, params.eventId, params.toUserId);
        if (targetPrimary || targetRider) {
          throw new SpotError('Recipient already has a spot in this event', 409);
        }

        const [updated] = await tx
          .update(eventAttendees)
          .set({
            userId: params.toUserId,
            originalUserId: params.toUserId,
            status: 'confirmed',
            offeredAt: null,
            assignedBy: null,
            parentAttendeeId: null,
          })
          .where(eq(eventAttendees.id, source.id))
          .returning();
        await recordTransaction(tx, {
          eventId: params.eventId,
          groupId: event.groupId,
          attendeeId: updated.id,
          type,
          fromUserId: previousHolder,
          toUserId: params.toUserId,
          amount: Number(event.slotCost),
          notes: 'Second spot reassigned as primary',
        });
        return updated;
      }

      // Primary reassign: source must not have a confirmed second spot (handle it first).
      const sourceRider = await getRiderAttendeeInTx(tx, params.eventId, source.userId);
      if (sourceRider && sourceRider.status === 'confirmed') {
        throw new SpotError('Hand over or offer your 2nd spot first, then reassign your main spot', 400);
      }

      // Primary reassign: morph to primary or (admin) to recipient's +1.
      const targetPrimary = await getPrimaryAttendeeInTx(tx, params.eventId, params.toUserId);
      const targetRider = await getRiderAttendeeInTx(tx, params.eventId, params.toUserId);

      if (!targetPrimary) {
        const [updated] = await tx
          .update(eventAttendees)
          .set({
            userId: params.toUserId,
            originalUserId: params.toUserId,
            status: 'confirmed',
            offeredAt: null,
            assignedBy: null,
            parentAttendeeId: null,
          })
          .where(eq(eventAttendees.id, source.id))
          .returning();
        await recordTransaction(tx, {
          eventId: params.eventId,
          groupId: event.groupId,
          attendeeId: updated.id,
          type,
          fromUserId: previousHolder,
          toUserId: params.toUserId,
          amount: Number(event.slotCost),
        });
        return updated;
      }

      if (params.isAdmin && !targetRider) {
        if (targetPrimary.id === source.id || targetPrimary.userId === source.userId) {
          throw new SpotError('Cannot assign this spot as a +1 to the same player', 400);
        }
        const [updated] = await tx
          .update(eventAttendees)
          .set({
            userId: params.toUserId,
            originalUserId: params.toUserId,
            status: 'confirmed',
            offeredAt: null,
            assignedBy: null,
            parentAttendeeId: targetPrimary.id,
          })
          .where(eq(eventAttendees.id, source.id))
          .returning();
        await recordTransaction(tx, {
          eventId: params.eventId,
          groupId: event.groupId,
          attendeeId: updated.id,
          type,
          fromUserId: previousHolder,
          toUserId: params.toUserId,
          amount: Number(event.slotCost),
          notes: 'Reassigned as second spot',
        });
        return updated;
      }

      throw new SpotError('Recipient already has a spot in this event', 409);
    }

    // No source → fill a fresh primary slot.
    const occ = await occupancyInTx(tx, params.eventId);
    if (occ >= event.totalSpots) {
      throw new SpotError('No available spots. Specify a spot to reassign.', 400);
    }
    const [attendee] = await tx
      .insert(eventAttendees)
      .values({
        eventId: params.eventId,
        userId: params.toUserId,
        originalUserId: params.toUserId,
        status: 'confirmed',
        assignedBy: params.byUserId,
      })
      .returning();
    await recordTransaction(tx, {
      eventId: params.eventId,
      groupId: event.groupId,
      attendeeId: attendee.id,
      type,
      fromUserId: null,
      toUserId: params.toUserId,
      amount: Number(event.slotCost),
    });
    return attendee;
  });
}

/**
 * Admin: fully remove a player from an event (no replacement). Deletes the
 * attendee row(s) + their transaction chains, reversing all credit effects.
 * If the attendeeId is a primary row that has a rider, both are removed.
 * If it is a rider row, only the rider is removed.
 *
 * This is an exceptional action — for normal spot transfers use reassignSpot,
 * releaseSpot (waitlist), or offerSpot (marketplace).
 */
export async function adminUnassignSpot(params: {
  eventId: string;
  attendeeId: string;
}): Promise<void> {
  await serializableTx(async (tx) => {
    const [attendee] = await tx
      .select()
      .from(eventAttendees)
      .where(and(eq(eventAttendees.id, params.attendeeId), eq(eventAttendees.eventId, params.eventId)))
      .limit(1);
    if (!attendee) throw new SpotError('Spot not found for this event', 404);

    // If this is a primary row, also remove any child rider row.
    if (attendee.parentAttendeeId === null) {
      const [rider] = await tx
        .select({ id: eventAttendees.id })
        .from(eventAttendees)
        .where(and(
          eq(eventAttendees.eventId, params.eventId),
          eq(eventAttendees.userId, attendee.userId),
          isNotNull(eventAttendees.parentAttendeeId),
        ))
        .limit(1);
      if (rider) {
        await tx.delete(spotTransactions).where(eq(spotTransactions.attendeeId, rider.id));
        await tx.delete(eventAttendees).where(eq(eventAttendees.id, rider.id));
      }
    }

    await tx.delete(spotTransactions).where(eq(spotTransactions.attendeeId, params.attendeeId));
    await tx.delete(eventAttendees).where(eq(eventAttendees.id, params.attendeeId));
  });
}

export { serializableTx };
export type { AttendeeRow };
