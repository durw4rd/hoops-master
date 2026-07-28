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
import { getNetChargedByUser, recordTransaction } from './transactions';
import { getSpotChargeAmount, applySlotCostAdjustment } from './pricing';
import {
  assignOpeningToBenchHead,
  getSeatableBenchHead,
  removeUserFromBench,
  transferOpeningToUser,
} from './benchMatching';
import { cancelPendingPromotionsForAttendee } from './benchPromotion';
import { handleSpotOpening, reconcileCapacityWithBench } from './spotOpening';
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
  PricingMode,
  RemainderPolicy,
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
    pricingMode: (row.pricingMode === 'split_total' ? 'split_total' : 'per_spot') as PricingMode,
    totalCost: Number(row.totalCost ?? 0),
    pricingFinalizedAt: row.pricingFinalizedAt ? row.pricingFinalizedAt.toISOString() : null,
    finalizedPerShare: row.finalizedPerShare != null ? Number(row.finalizedPerShare) : null,
    remainderPolicy: (row.remainderPolicy as RemainderPolicy | null) ?? null,
    effectiveTotalCost: row.effectiveTotalCost != null ? Number(row.effectiveTotalCost) : null,
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
    // Left joins: held-open placeholder rows (pending bench approval) have no holder.
    .leftJoin(holder, eq(holder.id, eventAttendees.userId))
    .leftJoin(original, eq(original.id, eventAttendees.originalUserId))
    .leftJoin(users, eq(users.id, eventAttendees.assignedBy))
    .where(eq(eventAttendees.eventId, eventId))
    .orderBy(asc(eventAttendees.assignedAt));

  return rows.map(({ a, holderEmail, holderName, originalEmail, assignedByEmail }) => ({
    attendeeId: a.id,
    eventId: a.eventId,
    userEmail: holderEmail ?? '',
    userName: a.guestDisplayName?.trim() || holderName || 'Held for bench decision',
    guestDisplayName: a.guestDisplayName ?? null,
    isGuestSpot: !!a.guestDisplayName?.trim(),
    // The funding holder behind a guest spot (userId stays the holder), so the
    // UI can show "Guest (Host)". Null for non-guest rows.
    hostName: a.guestDisplayName?.trim() ? holderName ?? null : null,
    originalUserEmail: originalEmail ?? '',
    status: a.status as AttendeeStatus,
    offeredAt: a.offeredAt ? a.offeredAt.toISOString() : null,
    assignedBy: a.assignedBy ? assignedByEmail : null,
    assignedAt: a.assignedAt.toISOString(),
    parentAttendeeId: a.parentAttendeeId ?? null,
    isPlusOne: a.parentAttendeeId !== null,
    noShow: a.noShowAt !== null,
    noShowAt: a.noShowAt ? a.noShowAt.toISOString() : null,
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
  slotCost?: number;
  pricingMode?: PricingMode;
  totalCost?: number;
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

  const pricingMode = input.pricingMode ?? 'per_spot';
  const slotCost = pricingMode === 'split_total' ? 0 : (input.slotCost ?? 0);
  const totalCost = pricingMode === 'split_total' ? (input.totalCost ?? 0) : 0;

  const [row] = await db
    .insert(events)
    .values({
      groupId,
      startsAt,
      endsAt,
      totalSpots: input.totalSpots,
      slotCost: String(slotCost),
      pricingMode,
      totalCost: String(totalCost),
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
    const pricingMode = input.pricingMode ?? 'per_spot';
    const slotCost = pricingMode === 'split_total' ? 0 : (input.slotCost ?? 0);
    const totalCost = pricingMode === 'split_total' ? (input.totalCost ?? 0) : 0;
    return {
      groupId,
      startsAt,
      endsAt,
      totalSpots: input.totalSpots,
      slotCost: String(slotCost),
      pricingMode,
      totalCost: String(totalCost),
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
  pricingMode?: PricingMode;
  totalCost?: number;
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

  const oldSlotCost = Number(current.slotCost);
  const pricingModeChanging =
    input.pricingMode !== undefined && input.pricingMode !== current.pricingMode;
  const switchingToSplitTotal =
    pricingModeChanging &&
    current.pricingMode === 'per_spot' &&
    input.pricingMode === 'split_total';
  const slotCostChanging =
    !pricingModeChanging &&
    input.slotCost !== undefined &&
    input.slotCost !== oldSlotCost &&
    current.pricingMode === 'per_spot';
  const totalSpotsIncreasing =
    input.totalSpots !== undefined && input.totalSpots > current.totalSpots;

  if (slotCostChanging || switchingToSplitTotal || totalSpotsIncreasing) {
    return serializableTx(async (tx) => {
      const [locked] = await tx
        .select()
        .from(events)
        .where(eq(events.id, eventId))
        .for('update')
        .limit(1);
      if (!locked) return null;

      if (slotCostChanging) {
        await applySlotCostAdjustment(tx, locked, oldSlotCost, input.slotCost!);
      } else if (switchingToSplitTotal && !locked.pricingFinalizedAt) {
        await applySlotCostAdjustment(tx, locked, Number(locked.slotCost), 0);
      }

      const patch = buildEventPatch(locked, timezone, input);
      if (input.slotCost !== undefined && !pricingModeChanging) {
        patch.slotCost = String(input.slotCost);
      }

      const [row] = await tx.update(events).set(patch).where(eq(events.id, eventId)).returning();
      if (!row) return null;

      // Freed capacity must go to the bench, never sit open next to it.
      if (totalSpotsIncreasing) {
        await reconcileCapacityWithBench(tx, row);
      }
      return toEventDTO(row, timezone);
    });
  }

  const patch = buildEventPatch(current, timezone, input);
  if (Object.keys(patch).length === 0) return toEventDTO(current, timezone);
  const [row] = await db.update(events).set(patch).where(eq(events.id, eventId)).returning();
  return row ? toEventDTO(row, timezone) : null;
}

function buildEventPatch(
  current: EventRow,
  timezone: string,
  input: UpdateEventInput
): Record<string, unknown> {
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

  const targetMode = (input.pricingMode ?? current.pricingMode) as PricingMode;
  if (input.slotCost !== undefined && targetMode === 'per_spot') {
    patch.slotCost = String(input.slotCost);
  }
  if (input.pricingMode !== undefined) patch.pricingMode = input.pricingMode;
  if (input.totalCost !== undefined && targetMode === 'split_total' && !current.pricingFinalizedAt) {
    patch.totalCost = String(input.totalCost);
  }
  if (input.pricingMode !== undefined && input.pricingMode !== current.pricingMode) {
    if (input.pricingMode === 'split_total') patch.slotCost = '0';
    else patch.totalCost = '0';
  }

  if (input.location !== undefined) patch.location = input.location;
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.bannerUrl !== undefined) patch.bannerUrl = input.bannerUrl;
  if (input.bannerOrientation !== undefined) patch.bannerOrientation = input.bannerOrientation;
  if (input.eventType !== undefined) patch.eventType = input.eventType;
  if (input.assignmentMode !== undefined) patch.assignmentMode = input.assignmentMode;
  if (input.signupOpensAt !== undefined) patch.signupOpensAt = resolveSignupOpensAt(input.signupOpensAt);
  return patch;
}

/**
 * Hard-delete an event. Only allowed while the event has no ledger history —
 * the ledger is append-only, so events with credit movements must be cancelled
 * (cancelEvent) instead.
 */
export async function deleteEvent(eventId: string): Promise<void> {
  await serializableTx(async (tx) => {
    const [txn] = await tx
      .select({ id: spotTransactions.id })
      .from(spotTransactions)
      .where(eq(spotTransactions.eventId, eventId))
      .limit(1);
    if (txn) {
      throw new SpotError('Game has ledger history — cancel it instead of deleting', 409);
    }
    await tx.delete(events).where(eq(events.id, eventId));
  });
}

/** True when the event has any ledger rows (delete forbidden, cancel instead). */
export async function eventHasLedgerHistory(eventId: string): Promise<boolean> {
  const [txn] = await db
    .select({ id: spotTransactions.id })
    .from(spotTransactions)
    .where(eq(spotTransactions.eventId, eventId))
    .limit(1);
  return !!txn;
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
      amount: getSpotChargeAmount(event),
      notes: params.notes,
    });

    await removeUserFromBench(tx, params.eventId, params.toUserId);

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
        amount: getSpotChargeAmount(event),
        notes: params.notes,
      });
      await removeUserFromBench(tx, params.eventId, userId);
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

      // Bench priority: whoever is first in line (and actually seatable) has
      // dibs on any offered spot.
      const head = await getSeatableBenchHead(tx, params.eventId);
      if (head && head.userId !== params.userId) {
        throw new SpotError('Someone is ahead of you on the bench', 409);
      }
      if (head) {
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
      amount: getSpotChargeAmount(event),
    });
    await removeUserFromBench(tx, params.eventId, params.userId);
    return attendee;
  });
}

/**
 * Mark a spot as offered. Pass `attendeeId` to target a specific row (e.g. a
 * rider row). Without `attendeeId`, targets the caller's primary. Capo/King
 * can offer any player's spot on their behalf (`isAdmin`) — identical bench
 * and credit semantics; the HOLDER keeps funding until someone takes over.
 *
 * Offering a primary is blocked while the holder's rider row is still
 * confirmed — the rider must be offered or released first.
 */
export async function offerSpot(params: {
  eventId: string;
  userId: string;
  attendeeId?: string;
  isAdmin?: boolean;
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

    const holderId = attendee.userId;
    if (holderId === null) {
      throw new SpotError('This spot is held for a pending bench promotion', 400);
    }
    if (!params.isAdmin && holderId !== params.userId) {
      throw new SpotError('Not your spot', 403);
    }
    if (attendee.status !== 'confirmed') throw new SpotError('Spot is not confirmed', 400);
    if (attendee.guestDisplayName?.trim()) {
      throw new SpotError('Clear the guest assignment before offering this spot', 400);
    }

    // Guard: a primary cannot be offered while the holder's rider is still
    // confirmed (row-based so the attendeeId path is covered too).
    if (attendee.parentAttendeeId === null) {
      const rider = await getRiderAttendeeInTx(tx, params.eventId, holderId);
      if (rider && rider.status === 'confirmed') {
        throw new SpotError('Offer or release the +1 first before offering the main spot', 400);
      }
      // Offering the primary means leaving the event flow — clear the
      // holder's bench entries.
      await removeUserFromBench(tx, params.eventId, holderId);
    }

    const onBehalf = !!params.isAdmin && holderId !== params.userId;
    const isRiderRow = attendee.parentAttendeeId !== null;
    const result = await handleSpotOpening(tx, event, attendee, {
      funding: { kind: 'holder_funded', fromUserId: holderId },
      transactionType: 'claim',
      notes: onBehalf
        ? `Offered by admin — ${isRiderRow ? '+1 ' : ''}auto-matched to bench`
        : isRiderRow ? 'Offered +1 auto-matched to bench' : 'Offered spot auto-matched to bench',
      excludeUserId: holderId,
      notifyPreviousHolder: true,
    });

    // 'pending_approval' keeps the spot confirmed with the holder until the
    // invited bench player accepts; 'vacated' cannot happen (holder-funded).
    if (result.outcome === 'vacated') throw new SpotError('Spot not found', 404);
    return result.attendee;
  });
}

/**
 * Retract an offered spot before anyone claims it.
 * Pass `attendeeId` to target a specific row (e.g. a rider row).
 * Capo/King can retract on a player's behalf (`isAdmin`) — the zero-amount
 * audit row stays on the HOLDER's line either way.
 */
export async function retractOffer(params: {
  eventId: string;
  userId: string;
  attendeeId?: string;
  isAdmin?: boolean;
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

    const holderId = attendee.userId;
    if (holderId === null) {
      throw new SpotError('This spot is held for a pending bench promotion', 400);
    }
    if (!params.isAdmin && holderId !== params.userId) {
      throw new SpotError('Not your spot', 403);
    }
    if (attendee.status !== 'offered') throw new SpotError('This spot is not currently offered', 400);

    const [updated] = await tx
      .update(eventAttendees)
      .set({ status: 'confirmed', offeredAt: null })
      .where(eq(eventAttendees.id, attendee.id))
      .returning();

    const onBehalf = !!params.isAdmin && holderId !== params.userId;
    await recordTransaction(tx, {
      eventId: params.eventId,
      groupId: event.groupId,
      attendeeId: updated.id,
      type: 'retract',
      fromUserId: holderId,
      toUserId: holderId,
      amount: 0,
      notes: onBehalf ? 'Offer retracted by admin' : 'Retracted offered spot',
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
      amount: getSpotChargeAmount(event),
      notes: params.byUserId ? 'Rider assigned by admin' : 'Rider claimed',
    });
    await removeUserFromBench(tx, params.eventId, params.userId);
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

    const head = await getSeatableBenchHead(tx, params.eventId, { excludeUserId: params.userId });
    if (!head) {
      throw new SpotError(
        'No one is on the bench — offer your +1 instead so it can be claimed',
        400
      );
    }

    await handleSpotOpening(tx, event, rider, {
      funding: { kind: 'holder_funded', fromUserId: params.userId },
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
      if (source.userId === null) {
        throw new SpotError('This spot is held for a pending bench promotion', 400);
      }
      // Non-admins can only reassign their own spots.
      if (!params.isAdmin && source.userId !== params.byUserId) {
        throw new SpotError('You can only reassign your own spot', 403);
      }

      // The spot is changing hands directly: any pending bench promotion on it
      // is moot, and the recipient leaves the bench (they're in the game now).
      await cancelPendingPromotionsForAttendee(tx, source.id);
      await removeUserFromBench(tx, params.eventId, params.toUserId);

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
            guestDisplayName: null,
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
          amount: getSpotChargeAmount(event),
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
            guestDisplayName: null,
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
          amount: getSpotChargeAmount(event),
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
            guestDisplayName: null,
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
          amount: getSpotChargeAmount(event),
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
      amount: getSpotChargeAmount(event),
    });
    await removeUserFromBench(tx, params.eventId, params.toUserId);
    return attendee;
  });
}

/**
 * Assign a spot to an external guest (display-only; no credit movement).
 */
export async function assignSpotToGuest(params: {
  eventId: string;
  attendeeId: string;
  guestName: string;
  byUserId: string;
  isAdmin: boolean;
}): Promise<AttendeeRow> {
  const GUEST_NAME_MAX = 40;
  return withEventLock(params.eventId, async (tx, event) => {
    const name = params.guestName.trim();
    if (!name) throw new SpotError('Guest name is required', 400);
    if (name.length > GUEST_NAME_MAX) {
      throw new SpotError(`Guest name must be at most ${GUEST_NAME_MAX} characters`, 400);
    }

    const [source] = await tx
      .select()
      .from(eventAttendees)
      .where(and(eq(eventAttendees.id, params.attendeeId), eq(eventAttendees.eventId, params.eventId)))
      .limit(1);
    if (!source) throw new SpotError('Spot not found', 404);
    if (source.userId === null) {
      throw new SpotError('This spot is held for a pending bench promotion', 400);
    }
    if (!params.isAdmin && source.userId !== params.byUserId) {
      throw new SpotError('You can only assign your own spot to a guest', 403);
    }
    if (source.status === 'offered') {
      throw new SpotError('Retract the offer before assigning a guest', 400);
    }

    const [updated] = await tx
      .update(eventAttendees)
      .set({
        guestDisplayName: name,
        status: 'confirmed',
        offeredAt: null,
      })
      .where(eq(eventAttendees.id, source.id))
      .returning();

    await recordTransaction(tx, {
      eventId: params.eventId,
      groupId: event.groupId,
      attendeeId: updated.id,
      type: 'guest_assign',
      fromUserId: source.userId,
      toUserId: source.userId,
      amount: 0,
      notes: `Guest: ${name}`,
    });

    return updated;
  });
}

/**
 * Admin: fully remove a player from an event (no replacement provided by the
 * admin). Append-only: the player's actual net charge for the removed rows is
 * reversed with a visible 'unassign_refund' ledger entry (this also absorbs
 * price adjustments and legacy rows), and each freed row goes through the
 * unified opening handler so the bench is auto-matched like any other opening.
 * If the attendeeId is a primary row that has a rider, both are removed.
 * If it is a rider row, only the rider is removed.
 */
export async function adminUnassignSpot(params: {
  eventId: string;
  attendeeId: string;
}): Promise<{ refunded: number }> {
  return withEventLock(params.eventId, async (tx, event) => {
    const [attendee] = await tx
      .select()
      .from(eventAttendees)
      .where(and(eq(eventAttendees.id, params.attendeeId), eq(eventAttendees.eventId, params.eventId)))
      .limit(1);
    if (!attendee) throw new SpotError('Spot not found for this event', 404);
    const holderId = attendee.userId;
    if (holderId === null) {
      throw new SpotError('This spot is held for a pending bench promotion — resolve or cancel it first', 400);
    }

    // Rows being removed: the target row, plus the child rider when removing a primary.
    const rowsToRemove: AttendeeRow[] = [];
    if (attendee.parentAttendeeId === null) {
      const [rider] = await tx
        .select()
        .from(eventAttendees)
        .where(and(
          eq(eventAttendees.eventId, params.eventId),
          eq(eventAttendees.userId, holderId),
          isNotNull(eventAttendees.parentAttendeeId),
        ))
        .limit(1);
      if (rider) rowsToRemove.push(rider);
    }
    rowsToRemove.push(attendee);

    // Refund = everything the holder has netted for this event beyond the rows
    // they keep. Net-based so price adjustments and split rows are covered.
    const heldRows = await tx
      .select({ id: eventAttendees.id })
      .from(eventAttendees)
      .where(and(eq(eventAttendees.eventId, params.eventId), eq(eventAttendees.userId, holderId)));
    const remaining = heldRows.length - rowsToRemove.length;
    const net = (await getNetChargedByUser(tx, params.eventId)).get(holderId) ?? 0;
    const refund = Math.round((net - getSpotChargeAmount(event) * remaining) * 100) / 100;
    if (refund !== 0) {
      await recordTransaction(tx, {
        eventId: params.eventId,
        groupId: event.groupId,
        attendeeId: attendee.id,
        type: 'unassign_refund',
        fromUserId: null,
        toUserId: holderId,
        amount: -refund,
        notes: 'Removed from game by admin — charges reversed',
      });
    }

    // Free each removed row through the unified opening flow (vacant: the
    // holder was refunded, so a bench fill is a fresh debit).
    for (const row of rowsToRemove) {
      await cancelPendingPromotionsForAttendee(tx, row.id);
      await handleSpotOpening(tx, event, row, {
        funding: { kind: 'vacant' },
        transactionType: 'waitlist_promote',
        notes: 'Promoted from bench after admin removal',
        excludeUserId: holderId,
      });
    }

    return { refunded: refund };
  });
}

/**
 * Toggle a no-show marker on a confirmed attendee row (Capo/King, after
 * tip-off). Pure record-keeping: no ledger entry, no bench interaction, no
 * credit effect — the holder stays charged for the spot they burned.
 */
export async function setAttendeeNoShow(params: {
  eventId: string;
  attendeeId: string;
  noShow: boolean;
  byUserId: string;
}): Promise<AttendeeRow> {
  return withEventLock(params.eventId, async (tx, event) => {
    if (event.startsAt.getTime() > Date.now()) {
      throw new SpotError('No-shows can only be marked after tip-off', 400);
    }

    const [attendee] = await tx
      .select()
      .from(eventAttendees)
      .where(and(eq(eventAttendees.id, params.attendeeId), eq(eventAttendees.eventId, params.eventId)))
      .limit(1);
    if (!attendee) throw new SpotError('Spot not found for this game', 404);
    if (attendee.userId === null) {
      throw new SpotError('Cannot mark a held-open spot as a no-show', 400);
    }
    if (attendee.status !== 'confirmed') {
      throw new SpotError('Only confirmed spots can be marked as no-show', 400);
    }

    const [updated] = await tx
      .update(eventAttendees)
      .set({
        noShowAt: params.noShow ? new Date() : null,
        noShowBy: params.noShow ? params.byUserId : null,
      })
      .where(eq(eventAttendees.id, attendee.id))
      .returning();
    return updated;
  });
}

/**
 * Cancel an event append-only: every player's net charge is reversed with an
 * 'event_cancelled_refund' entry, pending promotions are cancelled, and the
 * event is marked cancelled (which blocks further spot mutations).
 */
export async function cancelEvent(eventId: string): Promise<void> {
  await withEventLock(eventId, async (tx, event) => {
    if (event.status === 'cancelled') throw new SpotError('Game is already cancelled', 409);

    const net = await getNetChargedByUser(tx, eventId);
    for (const [userId, amount] of net) {
      if (Math.abs(amount) < 0.005) continue;
      await recordTransaction(tx, {
        eventId,
        groupId: event.groupId,
        attendeeId: null,
        type: 'event_cancelled_refund',
        fromUserId: null,
        toUserId: userId,
        amount: -amount,
        notes: 'Game cancelled — charges reversed',
      });
    }

    const { benchPromotionRequests } = await import('@/lib/db/schema');
    await tx
      .update(benchPromotionRequests)
      .set({ status: 'cancelled', respondedAt: new Date() })
      .where(and(
        eq(benchPromotionRequests.eventId, eventId),
        eq(benchPromotionRequests.status, 'pending'),
      ));

    await tx.update(events).set({ status: 'cancelled' }).where(eq(events.id, eventId));
  });
}

export { serializableTx };
export type { AttendeeRow };
