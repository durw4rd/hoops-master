import { describe, expect, it } from 'vitest';
import {
  adminUnassignSpot,
  cancelEvent,
  claimRiderSpot,
  claimSpot,
  deleteEvent,
  updateEvent,
} from '@/lib/queries/events';
import { joinWaitlist } from '@/lib/queries/waitlist';
import { finalizeSplitPricing, unfinalizeSplitPricing } from '@/lib/queries/pricing';
import { createScenario, reloadEvent } from './factories';
import { assertInvariants, assertLedgerInvariant, netChargedByUser } from './invariants';
import { attendeeRows, ledgerRows } from './helpers';

const COST = 5;
const TZ = 'Europe/Prague';

describe('append-only ledger', () => {
  it('admin unassign refunds the exact net charge (incl. price adjustments) with a visible entry', async () => {
    const { players, event } = await createScenario({ slotCost: COST });
    await claimSpot({ eventId: event.id, userId: players[0].id });

    // Slot cost changes 5 → 7 while the player is in: they now net 7.
    await updateEvent(event.id, TZ, { slotCost: 7 });
    expect((await netChargedByUser(event.id)).get(players[0].id)).toBe(7);

    const { refunded } = await adminUnassignSpot({
      eventId: event.id,
      attendeeId: (await attendeeRows(event.id))[0].id,
    });
    expect(refunded).toBe(7);

    // Player is out, netted to zero, and history is preserved — nothing deleted.
    expect(await attendeeRows(event.id)).toHaveLength(0);
    expect((await netChargedByUser(event.id)).get(players[0].id)).toBe(0);
    const rows = await ledgerRows(event.id);
    expect(rows.map((r) => r.type)).toContain('unassign_refund');
    expect(rows.map((r) => r.type)).toContain('signup');
    expect(rows.map((r) => r.type)).toContain('price_adjustment');
    await assertInvariants(event.id);
  });

  it('admin unassign of a primary removes the rider too and refunds both charges', async () => {
    const { players, event } = await createScenario({ slotCost: COST });
    await claimSpot({ eventId: event.id, userId: players[0].id });
    await claimRiderSpot({ eventId: event.id, userId: players[0].id });

    const primary = (await attendeeRows(event.id)).find((r) => r.parentAttendeeId === null)!;
    const { refunded } = await adminUnassignSpot({ eventId: event.id, attendeeId: primary.id });
    expect(refunded).toBe(2 * COST);
    expect(await attendeeRows(event.id)).toHaveLength(0);
    expect((await netChargedByUser(event.id)).get(players[0].id)).toBe(0);
    await assertInvariants(event.id);
  });

  it('admin unassign (>24h) with a bench refunds the leaver and fresh-debits the promoted player', async () => {
    const { players, event } = await createScenario({ totalSpots: 2, slotCost: COST });
    await claimSpot({ eventId: event.id, userId: players[0].id });
    await claimSpot({ eventId: event.id, userId: players[1].id });
    await joinWaitlist({ eventId: event.id, userId: players[2].id });

    const target = (await attendeeRows(event.id)).find((r) => r.userId === players[0].id)!;
    await adminUnassignSpot({ eventId: event.id, attendeeId: target.id });

    const net = await netChargedByUser(event.id);
    expect(net.get(players[0].id)).toBe(0);
    expect(net.get(players[2].id)).toBe(COST);
    const promo = (await ledgerRows(event.id)).find(
      (r) => r.type === 'waitlist_promote' && r.toUserId === players[2].id
    );
    expect(promo?.fromUserId, 'promotion after refund is a fresh debit').toBeNull();
    await assertInvariants(event.id);
  });

  it('split-total: finalize settles per player; unfinalize reverses append-only; re-finalize works', async () => {
    const { capo, players, event } = await createScenario({
      pricingMode: 'split_total',
      totalCost: 20,
      totalSpots: 4,
    });
    for (const p of players.slice(0, 4)) {
      await claimSpot({ eventId: event.id, userId: p.id });
    }
    // Unfinalized split-total: nobody is charged yet.
    await assertLedgerInvariant(event.id);

    await finalizeSplitPricing({ eventId: event.id, adminUserId: capo.id, remainderPolicy: 'ignore' });
    let net = await netChargedByUser(event.id);
    for (const p of players.slice(0, 4)) expect(net.get(p.id)).toBe(5);
    await assertInvariants(event.id);

    await unfinalizeSplitPricing(event.id);
    net = await netChargedByUser(event.id);
    for (const p of players.slice(0, 4)) expect(net.get(p.id) ?? 0).toBe(0);
    const rows = await ledgerRows(event.id);
    expect(rows.filter((r) => r.type === 'split_settle')).toHaveLength(4);
    expect(rows.filter((r) => r.type === 'split_unsettle')).toHaveLength(4);
    await assertInvariants(event.id);

    await finalizeSplitPricing({ eventId: event.id, adminUserId: capo.id, remainderPolicy: 'ignore' });
    net = await netChargedByUser(event.id);
    for (const p of players.slice(0, 4)) expect(net.get(p.id)).toBe(5);
    await assertInvariants(event.id);
  });

  it('split-total surplus can be absorbed by the admin as a credit', async () => {
    const { capo, players, event } = await createScenario({
      pricingMode: 'split_total',
      totalCost: 20,
      totalSpots: 3,
    });
    for (const p of players.slice(0, 3)) {
      await claimSpot({ eventId: event.id, userId: p.id });
    }
    // 20 / 3 → 6.7 per head → 20.1 collected → 0.1 surplus to the admin.
    await finalizeSplitPricing({
      eventId: event.id,
      adminUserId: capo.id,
      remainderPolicy: 'admin_absorb_surplus',
    });
    const net = await netChargedByUser(event.id);
    expect(net.get(capo.id)).toBeCloseTo(-0.1, 2);
    await assertLedgerInvariant(event.id, { allowedDeltas: { [capo.id]: -0.1 } });
  });

  it('cancelEvent zeroes every player net with visible refund entries', async () => {
    const { players, event } = await createScenario({ slotCost: COST });
    await claimSpot({ eventId: event.id, userId: players[0].id });
    await claimSpot({ eventId: event.id, userId: players[1].id });

    await cancelEvent(event.id);

    const net = await netChargedByUser(event.id);
    expect(net.get(players[0].id)).toBe(0);
    expect(net.get(players[1].id)).toBe(0);
    const rows = await ledgerRows(event.id);
    expect(rows.filter((r) => r.type === 'event_cancelled_refund')).toHaveLength(2);
    expect((await reloadEvent(event.id)).status).toBe('cancelled');
  });

  it('deleteEvent is blocked once ledger history exists, allowed when clean', async () => {
    const { players, event } = await createScenario({ slotCost: COST });
    await claimSpot({ eventId: event.id, userId: players[0].id });
    await expect(deleteEvent(event.id)).rejects.toThrow('ledger history');

    const { event: cleanEvent } = await createScenario({ slotCost: COST });
    await deleteEvent(cleanEvent.id);
    await expect(reloadEvent(cleanEvent.id)).rejects.toThrow('not found');
  });
});
