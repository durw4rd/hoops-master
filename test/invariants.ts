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
  playerCreditBalances,
  settlementPairings,
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
  // Bench matching is skipped for past events — capacity slack next to an
  // occupied bench is legal once the game has been played.
  if (event.startsAt.getTime() < Date.now()) return;
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

/** Sum of every active member's crew balance — settlement must never move it. */
export async function groupBalanceSum(groupId: string): Promise<number> {
  const rows = await db
    .select({ balance: playerCreditBalances.balance })
    .from(playerCreditBalances)
    .where(eq(playerCreditBalances.groupId, groupId));
  return rows.reduce((sum, r) => sum + Number(r.balance), 0);
}

/**
 * Settlement invariants, valid at any point in a settlement's life:
 *
 * 1. Every live pairing carries a positive amount.
 * 2. No player is on the hook for more than the balance they had when the
 *    settlement was cut. Their balance at that moment is reconstructed from the
 *    current one by undoing the paid pairings (a paid pairing moves the debtor
 *    up and the creditor down by the same amount).
 * 3. Squaring up is zero-sum: the crew's balances still add to `expectedSum`.
 */
export async function assertSettlementInvariant(
  groupId: string,
  settlementId: string,
  opts: { expectedSum?: number } = {}
): Promise<void> {
  const pairings = await db
    .select()
    .from(settlementPairings)
    .where(eq(settlementPairings.settlementId, settlementId));

  const balanceRows = await db
    .select({ userId: playerCreditBalances.userId, balance: playerCreditBalances.balance })
    .from(playerCreditBalances)
    .where(eq(playerCreditBalances.groupId, groupId));
  const currentBalance = new Map(balanceRows.map((r) => [r.userId, Number(r.balance)]));

  const allocated = new Map<string, number>();
  const paidDelta = new Map<string, number>();
  for (const p of pairings) {
    if (p.status === 'cancelled') continue;
    const amount = Number(p.amount);
    expect(amount, `pairing ${p.id} amount is positive`).toBeGreaterThan(0);
    allocated.set(p.debtorUserId, (allocated.get(p.debtorUserId) ?? 0) + amount);
    allocated.set(p.creditorUserId, (allocated.get(p.creditorUserId) ?? 0) + amount);
    if (p.status === 'paid') {
      paidDelta.set(p.debtorUserId, (paidDelta.get(p.debtorUserId) ?? 0) + amount);
      paidDelta.set(p.creditorUserId, (paidDelta.get(p.creditorUserId) ?? 0) - amount);
    }
  }

  for (const [userId, total] of allocated) {
    const balanceAtCreation =
      (currentBalance.get(userId) ?? 0) - (paidDelta.get(userId) ?? 0);
    expect(
      Math.abs(balanceAtCreation) + 1e-9,
      `user ${userId} is paired for ${total} against a ${balanceAtCreation} balance`
    ).toBeGreaterThanOrEqual(total);
  }

  expect(await groupBalanceSum(groupId), 'crew balances stay zero-sum').toBeCloseTo(
    opts.expectedSum ?? 0,
    2
  );
}
