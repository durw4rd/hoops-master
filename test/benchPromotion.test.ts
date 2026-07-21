import { describe, expect, it } from 'vitest';
import {
  adminUnassignSpot,
  claimSpot,
  offerSpot,
  updateEvent,
} from '@/lib/queries/events';
import { joinWaitlist, leaveWaitlist, releaseSpot } from '@/lib/queries/waitlist';
import {
  approveBenchPromotion,
  declineBenchPromotion,
  getPendingPromotionForTarget,
} from '@/lib/queries/benchPromotion';
import { createScenario } from './factories';
import { assertInvariants, netChargedByUser } from './invariants';
import { attendeeRows, benchRows, pendingRows } from './helpers';

const COST = 5;
const TZ = 'Europe/Prague';

/** Full 2-seat game starting in 2h with `benchCount` players queued. */
async function lastMinuteScenario(benchCount = 1, opts: { startsInHours?: number } = {}) {
  const scenario = await createScenario({
    totalSpots: 2,
    slotCost: COST,
    playerCount: 3 + benchCount,
    startsInHours: opts.startsInHours ?? 2,
  });
  const { players, event } = scenario;
  await claimSpot({ eventId: event.id, userId: players[0].id });
  await claimSpot({ eventId: event.id, userId: players[1].id });
  for (let i = 0; i < benchCount; i++) {
    await joinWaitlist({ eventId: event.id, userId: players[2 + i].id });
  }
  return scenario;
}

describe('last-minute (≤24h) bench promotion approval', () => {
  it('release inside 24h defers to a pending approval; the releaser keeps funding', async () => {
    const { players, event } = await lastMinuteScenario();

    const result = await releaseSpot({ eventId: event.id, userId: players[0].id });
    expect(result.pendingApproval).toBe(true);

    const rows = await attendeeRows(event.id);
    const mine = rows.find((r) => r.userId === players[0].id);
    expect(mine?.status).toBe('confirmed');
    expect(await pendingRows(event.id)).toHaveLength(1);
    expect((await netChargedByUser(event.id)).get(players[0].id)).toBe(COST);
    await assertInvariants(event.id);
  });

  it('approving transfers the spot zero-sum and clears bench + request', async () => {
    const { players, event } = await lastMinuteScenario();
    await releaseSpot({ eventId: event.id, userId: players[0].id });

    const dto = await getPendingPromotionForTarget(event.id, players[2].id);
    expect(dto).toBeTruthy();
    await approveBenchPromotion({ requestId: dto!.requestId, eventId: event.id, userId: players[2].id });

    const net = await netChargedByUser(event.id);
    expect(net.get(players[0].id)).toBe(0);
    expect(net.get(players[2].id)).toBe(COST);
    expect(await benchRows(event.id)).toHaveLength(0);
    expect(await pendingRows(event.id)).toHaveLength(0);
    await assertInvariants(event.id);
  });

  it('declining removes the decliner from the bench and cascades to the next player', async () => {
    const { players, event } = await lastMinuteScenario(2);
    await releaseSpot({ eventId: event.id, userId: players[0].id });

    const first = await getPendingPromotionForTarget(event.id, players[2].id);
    await declineBenchPromotion({ requestId: first!.requestId, eventId: event.id, userId: players[2].id });

    // Decliner is off the bench; next player has the pending request now.
    const bench = await benchRows(event.id);
    expect(bench.map((b) => b.userId)).toEqual([players[3].id]);
    const second = await getPendingPromotionForTarget(event.id, players[3].id);
    expect(second).toBeTruthy();
    await assertInvariants(event.id);
  });

  it('declining with an exhausted bench opens the spot for anyone (bug 4)', async () => {
    const { players, event } = await lastMinuteScenario(1);
    await releaseSpot({ eventId: event.id, userId: players[0].id });

    const dto = await getPendingPromotionForTarget(event.id, players[2].id);
    await declineBenchPromotion({ requestId: dto!.requestId, eventId: event.id, userId: players[2].id });

    expect(await benchRows(event.id)).toHaveLength(0);
    const rows = await attendeeRows(event.id);
    const opened = rows.find((r) => r.userId === players[0].id);
    expect(opened?.status, 'spot must be marked open when the bench runs dry').toBe('offered');

    // A player who was never on the bench can now claim it.
    await claimSpot({ eventId: event.id, userId: players[3].id, attendeeId: opened!.id });
    const net = await netChargedByUser(event.id);
    expect(net.get(players[0].id)).toBe(0);
    expect(net.get(players[3].id)).toBe(COST);
    await assertInvariants(event.id);
  });

  it('admin unassign inside 24h refunds instantly and holds the spot as a placeholder', async () => {
    const { players, event } = await lastMinuteScenario(1);
    const target = (await attendeeRows(event.id)).find((r) => r.userId === players[0].id)!;

    const { refunded } = await adminUnassignSpot({ eventId: event.id, attendeeId: target.id });
    expect(refunded).toBe(COST);
    expect((await netChargedByUser(event.id)).get(players[0].id)).toBe(0);

    // The spot is a held-open placeholder with a pending request on it.
    const placeholder = (await attendeeRows(event.id)).find((r) => r.userId === null);
    expect(placeholder?.status).toBe('open');
    const dto = await getPendingPromotionForTarget(event.id, players[2].id);
    expect(dto).toBeTruthy();
    await assertInvariants(event.id);

    // Approval fills the placeholder as a fresh debit.
    await approveBenchPromotion({ requestId: dto!.requestId, eventId: event.id, userId: players[2].id });
    const net = await netChargedByUser(event.id);
    expect(net.get(players[2].id)).toBe(COST);
    expect((await attendeeRows(event.id)).every((r) => r.userId !== null)).toBe(true);
    await assertInvariants(event.id);
  });

  it('declining a vacant placeholder with an empty bench dissolves it into capacity', async () => {
    const { players, event } = await lastMinuteScenario(1);
    const target = (await attendeeRows(event.id)).find((r) => r.userId === players[0].id)!;
    await adminUnassignSpot({ eventId: event.id, attendeeId: target.id });

    const dto = await getPendingPromotionForTarget(event.id, players[2].id);
    await declineBenchPromotion({ requestId: dto!.requestId, eventId: event.id, userId: players[2].id });

    // Placeholder is gone — plain free capacity remains, claimable by anyone.
    const rows = await attendeeRows(event.id);
    expect(rows).toHaveLength(1);
    expect(rows.every((r) => r.userId !== null)).toBe(true);
    await claimSpot({ eventId: event.id, userId: players[3].id });
    await assertInvariants(event.id);
  });

  it('a pending target leaving the bench cancels and re-matches the opening', async () => {
    const { players, event } = await lastMinuteScenario(2);
    await releaseSpot({ eventId: event.id, userId: players[0].id });
    expect(await getPendingPromotionForTarget(event.id, players[2].id)).toBeTruthy();

    await leaveWaitlist({ eventId: event.id, userId: players[2].id });

    // Request moved on to the next bench player.
    expect(await getPendingPromotionForTarget(event.id, players[2].id)).toBeNull();
    expect(await getPendingPromotionForTarget(event.id, players[3].id)).toBeTruthy();
    await assertInvariants(event.id);
  });

  it('offer inside 24h defers to pending approval instead of instant transfer', async () => {
    const { players, event } = await lastMinuteScenario(1);
    const result = await offerSpot({ eventId: event.id, userId: players[0].id });
    // Spot stays confirmed with the offerer until the bench player accepts.
    expect(result.status).toBe('confirmed');
    expect(result.userId).toBe(players[0].id);
    expect(await pendingRows(event.id)).toHaveLength(1);
    await assertInvariants(event.id);
  });
});

describe('capacity reconciliation', () => {
  it('increasing totalSpots (>24h) promotes bench players as fresh debits', async () => {
    const { players, event } = await createScenario({ totalSpots: 2, slotCost: COST });
    await claimSpot({ eventId: event.id, userId: players[0].id });
    await claimSpot({ eventId: event.id, userId: players[1].id });
    await joinWaitlist({ eventId: event.id, userId: players[2].id });
    await joinWaitlist({ eventId: event.id, userId: players[3].id });

    await updateEvent(event.id, TZ, { totalSpots: 3 });

    const rows = await attendeeRows(event.id);
    expect(rows).toHaveLength(3);
    expect(rows.some((r) => r.userId === players[2].id)).toBe(true);
    const net = await netChargedByUser(event.id);
    expect(net.get(players[2].id)).toBe(COST);
    // player 4 still waits — only one seat opened.
    expect((await benchRows(event.id)).map((b) => b.userId)).toEqual([players[3].id]);
    await assertInvariants(event.id);
  });

  it('increasing totalSpots inside 24h creates held placeholders pending approval', async () => {
    const { players, event } = await lastMinuteScenario(1);
    await updateEvent(event.id, TZ, { totalSpots: 3 });

    const rows = await attendeeRows(event.id);
    expect(rows).toHaveLength(3);
    const placeholder = rows.find((r) => r.userId === null);
    expect(placeholder?.status).toBe('open');
    expect(await getPendingPromotionForTarget(event.id, players[2].id)).toBeTruthy();
    await assertInvariants(event.id);
  });
});
