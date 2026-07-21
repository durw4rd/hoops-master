import { describe, expect, it } from 'vitest';
import {
  assignSpotToGuest,
  claimRiderSpot,
  claimSpot,
  fillSpot,
  offerSpot,
  reassignSpot,
  releaseRiderSpot,
  retractOffer,
} from '@/lib/queries/events';
import { joinWaitlist, leaveWaitlist, releaseSpot } from '@/lib/queries/waitlist';
import { SpotError } from '@/lib/queries/_tx';
import { createScenario } from './factories';
import { assertInvariants, netChargedByUser } from './invariants';
import { attendeeRows, benchRows, ledgerRows } from './helpers';

const COST = 5;

describe('spot lifecycle basics', () => {
  it('admin assign and self-signup debit the slot cost', async () => {
    const { capo, players, event } = await createScenario({ slotCost: COST });
    await fillSpot({ eventId: event.id, toUserId: players[0].id, assignedById: capo.id, type: 'admin_assign' });
    await claimSpot({ eventId: event.id, userId: players[1].id });

    const net = await netChargedByUser(event.id);
    expect(net.get(players[0].id)).toBe(COST);
    expect(net.get(players[1].id)).toBe(COST);
    await assertInvariants(event.id);
  });

  it('blocks duplicate primary spots and signups beyond capacity', async () => {
    const { players, event } = await createScenario({ totalSpots: 1, slotCost: COST });
    await claimSpot({ eventId: event.id, userId: players[0].id });
    await expect(claimSpot({ eventId: event.id, userId: players[0].id })).rejects.toThrow(SpotError);
    await expect(claimSpot({ eventId: event.id, userId: players[1].id })).rejects.toThrow('Event is full');
    await assertInvariants(event.id);
  });

  it('offer with empty bench lists the spot; claim is a zero-sum transfer', async () => {
    const { players, event } = await createScenario({ slotCost: COST });
    await claimSpot({ eventId: event.id, userId: players[0].id });
    const offered = await offerSpot({ eventId: event.id, userId: players[0].id });
    expect(offered.status).toBe('offered');

    const rows = await ledgerRows(event.id);
    expect(rows.some((r) => r.type === 'offer' && Number(r.amount) === 0)).toBe(true);

    await claimSpot({ eventId: event.id, userId: players[1].id, attendeeId: offered.id });
    const net = await netChargedByUser(event.id);
    expect(net.get(players[0].id)).toBe(0);
    expect(net.get(players[1].id)).toBe(COST);
    await assertInvariants(event.id);
  });

  it('retracting an offer keeps credit untouched', async () => {
    const { players, event } = await createScenario({ slotCost: COST });
    await claimSpot({ eventId: event.id, userId: players[0].id });
    await offerSpot({ eventId: event.id, userId: players[0].id });
    const retracted = await retractOffer({ eventId: event.id, userId: players[0].id });
    expect(retracted.status).toBe('confirmed');
    expect((await netChargedByUser(event.id)).get(players[0].id)).toBe(COST);
    await assertInvariants(event.id);
  });

  it('release requires someone on the bench', async () => {
    const { players, event } = await createScenario({ slotCost: COST });
    await claimSpot({ eventId: event.id, userId: players[0].id });
    await expect(releaseSpot({ eventId: event.id, userId: players[0].id })).rejects.toThrow(
      'No one is on the bench'
    );
  });

  it('release (>24h) promotes the bench head zero-sum', async () => {
    const { players, event } = await createScenario({ totalSpots: 2, slotCost: COST });
    await claimSpot({ eventId: event.id, userId: players[0].id });
    await claimSpot({ eventId: event.id, userId: players[1].id });
    await joinWaitlist({ eventId: event.id, userId: players[2].id });

    const result = await releaseSpot({ eventId: event.id, userId: players[0].id });
    expect(result.promotedUserId).toBe(players[2].id);

    const net = await netChargedByUser(event.id);
    expect(net.get(players[0].id)).toBe(0);
    expect(net.get(players[2].id)).toBe(COST);
    expect(await benchRows(event.id)).toHaveLength(0);
    await assertInvariants(event.id);
  });

  it('offer (>24h) auto-matches the bench head instantly', async () => {
    const { players, event } = await createScenario({ totalSpots: 1, slotCost: COST });
    await claimSpot({ eventId: event.id, userId: players[0].id });
    await joinWaitlist({ eventId: event.id, userId: players[1].id });

    await offerSpot({ eventId: event.id, userId: players[0].id });
    const rows = await attendeeRows(event.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(players[1].id);
    expect(rows[0].status).toBe('confirmed');
    const net = await netChargedByUser(event.id);
    expect(net.get(players[0].id)).toBe(0);
    expect(net.get(players[1].id)).toBe(COST);
    await assertInvariants(event.id);
  });

  it('joining the bench claims an already-offered spot immediately', async () => {
    const { players, event } = await createScenario({ totalSpots: 1, slotCost: COST });
    await claimSpot({ eventId: event.id, userId: players[0].id });
    await offerSpot({ eventId: event.id, userId: players[0].id });

    const result = await joinWaitlist({ eventId: event.id, userId: players[1].id });
    expect(result.claimed).toBe(true);
    await assertInvariants(event.id);
  });

  it('an offered spot never coexists with a seatable bench — the offer is consumed', async () => {
    const { players, event } = await createScenario({ totalSpots: 2, slotCost: COST });
    await claimSpot({ eventId: event.id, userId: players[0].id });
    await claimSpot({ eventId: event.id, userId: players[1].id });
    await joinWaitlist({ eventId: event.id, userId: players[2].id });

    // Offering while the bench is occupied goes straight to the bench head.
    const result = await offerSpot({ eventId: event.id, userId: players[0].id });
    expect(result.userId).toBe(players[2].id);
    expect(result.status).toBe('confirmed');

    // The consumed row is no longer claimable by anyone else.
    await expect(
      claimSpot({ eventId: event.id, userId: players[3].id, attendeeId: result.id })
    ).rejects.toThrow();
    await assertInvariants(event.id);
  });

  it('reassign moves the spot zero-sum and pulls the recipient off the bench (bug 2)', async () => {
    const { capo, players, event } = await createScenario({ totalSpots: 2, slotCost: COST });
    await claimSpot({ eventId: event.id, userId: players[0].id });
    await claimSpot({ eventId: event.id, userId: players[1].id });
    await joinWaitlist({ eventId: event.id, userId: players[2].id });

    // Admin swaps player 0 with player 2, who is sitting on the bench.
    await reassignSpot({
      eventId: event.id,
      toUserId: players[2].id,
      fromUserId: players[0].id,
      byUserId: capo.id,
      isAdmin: true,
    });

    const bench = await benchRows(event.id);
    expect(bench, 'recipient must leave the bench when handed a spot').toHaveLength(0);
    const net = await netChargedByUser(event.id);
    expect(net.get(players[0].id)).toBe(0);
    expect(net.get(players[2].id)).toBe(COST);
    await assertInvariants(event.id);
  });

  it('riders: +1 debits the bringer; releasing the +1 promotes the bench', async () => {
    const { players, event } = await createScenario({ totalSpots: 3, slotCost: COST });
    await claimSpot({ eventId: event.id, userId: players[0].id });
    await claimSpot({ eventId: event.id, userId: players[1].id });
    await claimRiderSpot({ eventId: event.id, userId: players[0].id });
    expect((await netChargedByUser(event.id)).get(players[0].id)).toBe(2 * COST);

    await joinWaitlist({ eventId: event.id, userId: players[2].id });
    await releaseRiderSpot({ eventId: event.id, userId: players[0].id });

    const net = await netChargedByUser(event.id);
    expect(net.get(players[0].id)).toBe(COST);
    expect(net.get(players[2].id)).toBe(COST);
    await assertInvariants(event.id);
  });

  it('rider bench entries can be left with forRider (bug 3) and mismatched leaves fail loud', async () => {
    const { players, event } = await createScenario({ totalSpots: 2, slotCost: COST });
    await claimSpot({ eventId: event.id, userId: players[0].id });
    await claimSpot({ eventId: event.id, userId: players[1].id });

    // player 0 queues for a +1
    await joinWaitlist({ eventId: event.id, userId: players[0].id, forRider: true });
    expect(await benchRows(event.id)).toHaveLength(1);

    // The old broken path: leaving without forRider must NOT silently no-op.
    await expect(
      leaveWaitlist({ eventId: event.id, userId: players[0].id })
    ).rejects.toThrow('not on the bench');
    expect(await benchRows(event.id)).toHaveLength(1);

    await leaveWaitlist({ eventId: event.id, userId: players[0].id, forRider: true });
    expect(await benchRows(event.id)).toHaveLength(0);
    await assertInvariants(event.id);
  });

  it('guest assignment is credit-neutral; the holder keeps funding the spot', async () => {
    const { capo, players, event } = await createScenario({ slotCost: COST });
    await claimSpot({ eventId: event.id, userId: players[0].id });
    const [row] = await attendeeRows(event.id);

    await assignSpotToGuest({
      eventId: event.id,
      attendeeId: row.id,
      guestName: 'Street Baller',
      byUserId: capo.id,
      isAdmin: true,
    });

    const net = await netChargedByUser(event.id);
    expect(net.get(players[0].id)).toBe(COST);
    const rows = await ledgerRows(event.id);
    const guestRow = rows.find((r) => r.type === 'guest_assign');
    expect(guestRow).toBeTruthy();
    expect(Number(guestRow!.amount)).toBe(0);
    await assertInvariants(event.id);
  });
});
