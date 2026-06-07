/**
 * Event + attendee queries, including concurrency-safe spot mutations.
 *
 * Capacity rule: occupancy = SUM(1 + plusOne) across all attendee rows.
 * Each row with plusOne=true counts as 2 toward event.totalSpots.
 * Claiming an *offered* spot is a zero-sum transfer and does not change occupancy.
 */

import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '@/lib/db';
import { events, eventAttendees, eventWaitlist, users, groups, spotTransactions } from '@/lib/db/schema';
import { recordTransaction } from './transactions';
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
    description: row.description ?? '',
    eventType: row.eventType as EventType,
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
  confirmed: number; // slot count (plusOne=true rows count as 2)
  offered: number;   // slot count
  occupancy: number; // total slots used (confirmed + offered)
}

export async function getCountsForEvents(eventIds: string[]): Promise<Map<string, EventCounts>> {
  const result = new Map<string, EventCounts>();
  if (eventIds.length === 0) return result;
  const rows = await db
    .select({ eventId: eventAttendees.eventId, status: eventAttendees.status, plusOne: eventAttendees.plusOne })
    .from(eventAttendees)
    .where(inArray(eventAttendees.eventId, eventIds));
  for (const id of eventIds) result.set(id, { confirmed: 0, offered: 0, occupancy: 0 });
  for (const r of rows) {
    const c = result.get(r.eventId)!;
    const slots = 1 + (r.plusOne ? 1 : 0);
    c.occupancy += slots;
    if (r.status === 'offered') c.offered += slots;
    else c.confirmed += slots;
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
    .select({ eventId: eventAttendees.eventId, plusOne: eventAttendees.plusOne })
    .from(eventAttendees)
    .where(and(inArray(eventAttendees.eventId, eventIds), eq(eventAttendees.userId, userId)));
  for (const r of attRows) {
    const s = result.get(r.eventId);
    if (s) {
      s.attending = true;
      if (r.plusOne) s.hasRider = true;
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
    plusOne: a.plusOne,
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
  description?: string;
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
      description: input.description ?? '',
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
      description: input.description ?? '',
      eventType: (input.eventType ?? 'regular') as EventType,
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
  description?: string;
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
  if (input.description !== undefined) patch.description = input.description;
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
// Spot mutations — internal helpers
// ---------------------------------------------------------------------------

/**
 * Occupancy = SUM(1 + plusOne) across all rows. A plusOne=true row counts as 2.
 */
async function occupancyInTx(tx: Tx, eventId: string): Promise<number> {
  const rows = await tx
    .select({ plusOne: eventAttendees.plusOne })
    .from(eventAttendees)
    .where(eq(eventAttendees.eventId, eventId));
  return rows.reduce((sum, r) => sum + 1 + (r.plusOne ? 1 : 0), 0);
}

/** Find the single attendee row for a user in an event (one row per user). */
async function getAttendeeInTx(tx: Tx, eventId: string, userId: string): Promise<AttendeeRow | null> {
  const [row] = await tx
    .select()
    .from(eventAttendees)
    .where(and(eq(eventAttendees.eventId, eventId), eq(eventAttendees.userId, userId)))
    .limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Spot mutations — public API
// ---------------------------------------------------------------------------

/**
 * Fill a fresh (previously empty) spot for `toUserId`. Used by admin assign,
 * self-signup, and round-robin. Enforces capacity inside the event lock.
 */
export async function fillSpot(params: {
  eventId: string;
  toUserId: string;
  assignedById: string | null;
  type: TransactionType;
  notes?: string;
}): Promise<AttendeeRow> {
  return withEventLock(params.eventId, async (tx, event) => {
    const existing = await getAttendeeInTx(tx, params.eventId, params.toUserId);
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
 * Batch fill multiple fresh spots (admin assign / round-robin). Skips users
 * who already hold a spot. Stops if full.
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
      .where(eq(eventAttendees.eventId, params.eventId));
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
 * Claim a spot. If `attendeeId` is given, claim that *offered* spot (zero-sum
 * transfer). Otherwise self-sign-up into an empty slot.
 *
 * Offered spots always transfer as plusOne=false — the original holder must drop
 * their rider before offering, so there is nothing to carry over.
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

      const already = await getAttendeeInTx(tx, params.eventId, params.userId);
      if (already) throw new SpotError('You already have a spot for this event', 409);

      const previousHolder = offered.userId;
      const [updated] = await tx
        .update(eventAttendees)
        .set({ userId: params.userId, status: 'confirmed', offeredAt: null, plusOne: false })
        .where(eq(eventAttendees.id, offered.id))
        .returning();

      await recordTransaction(tx, {
        eventId: params.eventId,
        groupId: event.groupId,
        attendeeId: updated.id,
        type: 'claim',
        fromUserId: previousHolder,
        toUserId: params.userId,
        amount: Number(event.slotCost),
      });
      return updated;
    }

    // Self sign-up into an empty slot.
    const already = await getAttendeeInTx(tx, params.eventId, params.userId);
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
 * Mark the caller's spot as offered. Blocked if plusOne=true — drop the rider
 * first to keep occupancy accounting clean on transfer.
 */
export async function offerSpot(params: {
  eventId: string;
  userId: string;
}): Promise<AttendeeRow> {
  return withEventLock(params.eventId, async (tx, event) => {
    const attendee = await getAttendeeInTx(tx, params.eventId, params.userId);
    if (!attendee) throw new SpotError('You are not attending this event', 404);
    if (attendee.userId !== params.userId) throw new SpotError('Not your spot', 403);
    if (attendee.status !== 'confirmed') throw new SpotError('Spot is not confirmed', 400);
    if (attendee.plusOne) throw new SpotError('Drop your Rider before offering your spot', 400);

    const [updated] = await tx
      .update(eventAttendees)
      .set({ status: 'offered', offeredAt: new Date() })
      .where(eq(eventAttendees.id, attendee.id))
      .returning();

    await recordTransaction(tx, {
      eventId: params.eventId,
      groupId: event.groupId,
      attendeeId: updated.id,
      type: 'offer',
      fromUserId: params.userId,
      toUserId: params.userId,
      amount: 0,
      notes: 'Offered spot to marketplace',
    });
    return updated;
  });
}

/**
 * Take back an offered spot before anyone claims it.
 */
export async function retractOffer(params: {
  eventId: string;
  userId: string;
}): Promise<AttendeeRow> {
  return withEventLock(params.eventId, async (tx, event) => {
    const attendee = await getAttendeeInTx(tx, params.eventId, params.userId);
    if (!attendee) throw new SpotError('You are not attending this event', 404);
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
 * Add a Rider (+1) to the caller's existing confirmed spot. Sets plusOne=true
 * on their row, consuming one extra slot. Costs the same as a primary spot.
 */
export async function addRider(params: {
  eventId: string;
  userId: string;
  byUserId?: string; // if set, this is an admin assignment
}): Promise<AttendeeRow> {
  return withEventLock(params.eventId, async (tx, event) => {
    const attendee = await getAttendeeInTx(tx, params.eventId, params.userId);
    if (!attendee) throw new SpotError('You need a spot in this game first', 400);
    if (attendee.status !== 'confirmed') throw new SpotError('Your spot must be confirmed to add a Rider', 400);
    if (attendee.plusOne) throw new SpotError('You already have a Rider for this game', 409);

    const occ = await occupancyInTx(tx, params.eventId);
    if (occ >= event.totalSpots) throw new SpotError('No room for a Rider — event is full', 409);

    const [updated] = await tx
      .update(eventAttendees)
      .set({ plusOne: true })
      .where(eq(eventAttendees.id, attendee.id))
      .returning();

    await recordTransaction(tx, {
      eventId: params.eventId,
      groupId: event.groupId,
      attendeeId: updated.id,
      type: 'signup',
      fromUserId: null,
      toUserId: params.userId,
      amount: Number(event.slotCost),
      notes: params.byUserId ? 'Rider assigned by admin' : 'Rider added',
    });
    return updated;
  });
}

/**
 * Drop the Rider (+1) from a spot. Sets plusOne=false on the row, freeing one
 * slot. If a player is waiting on the rider bench, they are auto-promoted
 * (zero-sum transfer). Otherwise the dropper is credited via a negative-amount
 * transaction that offsets their earlier rider debit.
 */
export async function dropRider(params: {
  eventId: string;
  userId: string;
}): Promise<void> {
  await withEventLock(params.eventId, async (tx, event) => {
    const attendee = await getAttendeeInTx(tx, params.eventId, params.userId);
    if (!attendee) throw new SpotError('You are not attending this event', 404);
    if (!attendee.plusOne) throw new SpotError("You don't have a Rider for this game", 400);

    // Clear the rider attribute on the dropper's row.
    await tx
      .update(eventAttendees)
      .set({ plusOne: false })
      .where(eq(eventAttendees.id, attendee.id));

    // Walk rider bench to find the first promotable entry (exclude the dropper themselves).
    const riderBench = await tx
      .select()
      .from(eventWaitlist)
      .where(and(eq(eventWaitlist.eventId, params.eventId), eq(eventWaitlist.forRider, true)))
      .orderBy(asc(eventWaitlist.joinedAt));

    let promoted = false;
    for (const entry of riderBench) {
      if (entry.userId === params.userId) {
        // Stale: dropper is on their own rider bench (shouldn't happen, clean up).
        await tx.delete(eventWaitlist).where(eq(eventWaitlist.id, entry.id));
        continue;
      }
      const recipientRow = await getAttendeeInTx(tx, params.eventId, entry.userId);
      if (!recipientRow || recipientRow.plusOne) {
        // Stale: recipient lost their spot or already has a rider.
        await tx.delete(eventWaitlist).where(eq(eventWaitlist.id, entry.id));
        continue;
      }
      // Promote this recipient.
      await tx
        .update(eventAttendees)
        .set({ plusOne: true })
        .where(eq(eventAttendees.id, recipientRow.id));
      await tx.delete(eventWaitlist).where(eq(eventWaitlist.id, entry.id));
      await recordTransaction(tx, {
        eventId: params.eventId,
        groupId: event.groupId,
        attendeeId: attendee.id,
        type: 'waitlist_promote',
        fromUserId: params.userId,
        toUserId: entry.userId,
        amount: Number(event.slotCost),
        notes: 'Rider slot passed to rider bench',
      });
      promoted = true;
      break;
    }

    if (!promoted) {
      // No rider bench to promote — credit the dropper by reversing the debit.
      // Negative amount reduces total_spent for toUserId, restoring their balance.
      await recordTransaction(tx, {
        eventId: params.eventId,
        groupId: event.groupId,
        attendeeId: attendee.id,
        type: 'release',
        fromUserId: null,
        toUserId: params.userId,
        amount: -Number(event.slotCost),
        notes: 'Rider dropped',
      });
    }
  });
}

/**
 * Reassign a spot to another member. If `fromUserId` is given, transfer that
 * holder's spot (zero-sum). If none, fill a fresh spot for `toUserId`.
 *
 * If the source row has plusOne=true, the rider is automatically dropped first
 * (credit to original holder) before the primary is transferred to the recipient.
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
    // Find the source attendee row.
    let source: AttendeeRow | null = null;
    if (params.attendeeId) {
      const [row] = await tx
        .select()
        .from(eventAttendees)
        .where(and(eq(eventAttendees.id, params.attendeeId), eq(eventAttendees.eventId, params.eventId)))
        .limit(1);
      source = row ?? null;
    } else if (params.fromUserId) {
      source = await getAttendeeInTx(tx, params.eventId, params.fromUserId);
    }

    const type: TransactionType = params.isAdmin ? 'admin_reassign' : 'reassign';

    if (source) {
      const previousHolder = source.userId;

      // Target must not already hold any spot.
      const targetExisting = await getAttendeeInTx(tx, params.eventId, params.toUserId);
      if (targetExisting) throw new SpotError('Recipient already has a spot in this event', 409);

      // If the source row has a rider, auto-drop it first (credit original holder).
      if (source.plusOne) {
        await tx
          .update(eventAttendees)
          .set({ plusOne: false })
          .where(eq(eventAttendees.id, source.id));
        await recordTransaction(tx, {
          eventId: params.eventId,
          groupId: event.groupId,
          attendeeId: source.id,
          type,
          fromUserId: null,
          toUserId: previousHolder,
          amount: -Number(event.slotCost),
          notes: 'Rider dropped on spot reassignment',
        });
      }

      // Transfer the primary row.
      const [updated] = await tx
        .update(eventAttendees)
        .set({ userId: params.toUserId, status: 'confirmed', offeredAt: null, plusOne: false })
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

    // No source → fill a fresh spot (capacity-checked).
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
 * Manager action: remove a player from a game entirely (no replacement). Voids
 * the spot by deleting the row and its transaction chain, which reverses credit.
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

    await tx.delete(spotTransactions).where(eq(spotTransactions.attendeeId, params.attendeeId));
    await tx.delete(eventAttendees).where(eq(eventAttendees.id, params.attendeeId));
  });
}

export { serializableTx };
export type { AttendeeRow };
