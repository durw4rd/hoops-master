/**
 * Cross-cutting invariants asserted at the end of scenarios.
 *
 * Ledger: for every user, net charged for an event (SUM to_user − SUM from_user)
 * must equal (attendee rows held) × current spot charge. Users no longer in the
 * event must net to zero.
 *
 * Bench: while anyone waits on the bench, the event must have no free capacity
 * and no unclaimed offered spot — except spots frozen behind a pending
 * last-minute promotion approval.
 */

import { and, eq } from 'drizzle-orm';
import { expect } from 'vitest';
import { db } from '@/lib/db';
import {
  benchPromotionRequests,
  eventAttendees,
  eventWaitlist,
  events,
  spotTransactions,
} from '@/lib/db/schema';
import { getSpotChargeAmount } from '@/lib/queries/pricing';

export async function netChargedByUser(eventId: string): Promise<Map<string, number>> {
  const rows = await db
    .select()
    .from(spotTransactions)
    .where(eq(spotTransactions.eventId, eventId));
  const net = new Map<string, number>();
  for (const r of rows) {
    const amount = Number(r.amount);
    net.set(r.toUserId, (net.get(r.toUserId) ?? 0) + amount);
    if (r.fromUserId) net.set(r.fromUserId, (net.get(r.fromUserId) ?? 0) - amount);
  }
  return net;
}

export async function assertLedgerInvariant(
  eventId: string,
  opts: { allowedDeltas?: Record<string, number> } = {}
): Promise<void> {
  const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  expect(event, 'event exists').toBeTruthy();
  const charge = getSpotChargeAmount(event);

  const attendeeRows = await db
    .select()
    .from(eventAttendees)
    .where(eq(eventAttendees.eventId, eventId));
  const held = new Map<string, number>();
  for (const a of attendeeRows) {
    if (!a.userId) continue; // held-open placeholder — nobody funds it
    held.set(a.userId, (held.get(a.userId) ?? 0) + 1);
  }

  const net = await netChargedByUser(eventId);
  const userIds = new Set([...held.keys(), ...net.keys(), ...Object.keys(opts.allowedDeltas ?? {})]);
  for (const userId of userIds) {
    const expected = (held.get(userId) ?? 0) * charge + (opts.allowedDeltas?.[userId] ?? 0);
    expect(
      net.get(userId) ?? 0,
      `net charged for user ${userId} (holds ${held.get(userId) ?? 0} spots @ ${charge})`
    ).toBeCloseTo(expected, 2);
  }
}

export async function assertBenchInvariant(eventId: string): Promise<void> {
  const bench = await db
    .select()
    .from(eventWaitlist)
    .where(eq(eventWaitlist.eventId, eventId));
  if (bench.length === 0) return;

  const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  const attendeeRows = await db
    .select()
    .from(eventAttendees)
    .where(eq(eventAttendees.eventId, eventId));
  const pending = await db
    .select()
    .from(benchPromotionRequests)
    .where(and(
      eq(benchPromotionRequests.eventId, eventId),
      eq(benchPromotionRequests.status, 'pending'),
    ));
  const pendingAttendeeIds = new Set(pending.map((p) => p.attendeeId));

  expect(
    attendeeRows.length,
    'no free capacity while players sit on the bench'
  ).toBeGreaterThanOrEqual(event.totalSpots);

  for (const a of attendeeRows) {
    if (a.status === 'confirmed') continue;
    expect(
      pendingAttendeeIds.has(a.id),
      `spot ${a.id} is '${a.status}' while the bench is non-empty and no promotion approval is pending`
    ).toBe(true);
  }
}

export async function assertInvariants(
  eventId: string,
  opts: { allowedDeltas?: Record<string, number> } = {}
): Promise<void> {
  await assertLedgerInvariant(eventId, opts);
  await assertBenchInvariant(eventId);
}
