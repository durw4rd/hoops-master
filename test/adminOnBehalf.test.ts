import { describe, expect, it } from 'vitest';
import {
  adminUnassignSpot,
  claimRiderSpot,
  claimSpot,
  offerSpot,
  retractOffer,
} from '@/lib/queries/events';
import { joinWaitlist } from '@/lib/queries/waitlist';
import { createScenario } from './factories';
import { assertInvariants, netChargedByUser } from './invariants';
import { attendeeRows, ledgerRows, pendingRows } from './helpers';

const COST = 5;

describe('admin offer/retract on behalf (F2)', () => {
  it('admin offers a player spot; bench head auto-claims zero-sum', async () => {
    const { capo, players, event } = await createScenario({ totalSpots: 2, slotCost: COST });
    await claimSpot({ eventId: event.id, userId: players[0].id });
    await claimSpot({ eventId: event.id, userId: players[1].id });
    await joinWaitlist({ eventId: event.id, userId: players[2].id });

    const row = (await attendeeRows(event.id)).find((r) => r.userId === players[0].id)!;
    const result = await offerSpot({
      eventId: event.id,
      userId: capo.id,
      attendeeId: row.id,
      isAdmin: true,
    });
    expect(result.userId).toBe(players[2].id);
    expect(result.status).toBe('confirmed');

    const net = await netChargedByUser(event.id);
    expect(net.get(players[0].id)).toBe(0);
    expect(net.get(players[2].id)).toBe(COST);
    await assertInvariants(event.id);
  });

  it('admin offer with empty bench lists the spot; a later claim is zero-sum', async () => {
    const { capo, players, event } = await createScenario({ slotCost: COST });
    await claimSpot({ eventId: event.id, userId: players[0].id });
    const row = (await attendeeRows(event.id))[0];

    const offered = await offerSpot({
      eventId: event.id,
      userId: capo.id,
      attendeeId: row.id,
      isAdmin: true,
    });
    expect(offered.status).toBe('offered');
    const offerRow = (await ledgerRows(event.id)).find((r) => r.type === 'offer');
    expect(offerRow?.fromUserId, 'offer audit row stays on the holder').toBe(players[0].id);

    await claimSpot({ eventId: event.id, userId: players[1].id, attendeeId: offered.id });
    const net = await netChargedByUser(event.id);
    expect(net.get(players[0].id)).toBe(0);
    expect(net.get(players[1].id)).toBe(COST);
    await assertInvariants(event.id);
  });

  it('admin offer within 24h defers to a pending approval', async () => {
    const { capo, players, event } = await createScenario({
      totalSpots: 2,
      slotCost: COST,
      startsInHours: 2,
    });
    await claimSpot({ eventId: event.id, userId: players[0].id });
    await claimSpot({ eventId: event.id, userId: players[1].id });
    await joinWaitlist({ eventId: event.id, userId: players[2].id });

    const row = (await attendeeRows(event.id)).find((r) => r.userId === players[0].id)!;
    const result = await offerSpot({ eventId: event.id, userId: capo.id, attendeeId: row.id, isAdmin: true });

    // Spot stays confirmed with the holder until the bench player accepts.
    expect(result.status).toBe('confirmed');
    expect(result.userId).toBe(players[0].id);
    expect(await pendingRows(event.id)).toHaveLength(1);
    await assertInvariants(event.id);
  });

  it('non-admins cannot offer or retract someone else’s row', async () => {
    const { players, event } = await createScenario({ slotCost: COST });
    await claimSpot({ eventId: event.id, userId: players[0].id });
    const row = (await attendeeRows(event.id))[0];

    await expect(
      offerSpot({ eventId: event.id, userId: players[1].id, attendeeId: row.id })
    ).rejects.toThrow('Not your spot');

    await offerSpot({ eventId: event.id, userId: players[0].id });
    await expect(
      retractOffer({ eventId: event.id, userId: players[1].id, attendeeId: row.id })
    ).rejects.toThrow('Not your spot');
  });

  it('admin retract-on-behalf restores the spot and stays credit-neutral on the holder', async () => {
    const { capo, players, event } = await createScenario({ slotCost: COST });
    await claimSpot({ eventId: event.id, userId: players[0].id });
    await offerSpot({ eventId: event.id, userId: players[0].id });
    const row = (await attendeeRows(event.id))[0];

    const restored = await retractOffer({
      eventId: event.id,
      userId: capo.id,
      attendeeId: row.id,
      isAdmin: true,
    });
    expect(restored.status).toBe('confirmed');

    const retractRow = (await ledgerRows(event.id)).find((r) => r.type === 'retract')!;
    expect(retractRow.fromUserId).toBe(players[0].id);
    expect(retractRow.toUserId).toBe(players[0].id);
    expect((await netChargedByUser(event.id)).get(players[0].id)).toBe(COST);
    await assertInvariants(event.id);
  });

  it('admin cannot offer a primary while the holder’s +1 is confirmed (row-based guard)', async () => {
    const { capo, players, event } = await createScenario({ totalSpots: 3, slotCost: COST });
    await claimSpot({ eventId: event.id, userId: players[0].id });
    await claimRiderSpot({ eventId: event.id, userId: players[0].id });
    const primary = (await attendeeRows(event.id)).find((r) => r.parentAttendeeId === null)!;

    await expect(
      offerSpot({ eventId: event.id, userId: capo.id, attendeeId: primary.id, isAdmin: true })
    ).rejects.toThrow('Offer or release the +1 first');
  });

  it('offering a held-open placeholder row is rejected', async () => {
    const { capo, players, event } = await createScenario({
      totalSpots: 2,
      slotCost: COST,
      startsInHours: 2,
    });
    await claimSpot({ eventId: event.id, userId: players[0].id });
    await claimSpot({ eventId: event.id, userId: players[1].id });
    await joinWaitlist({ eventId: event.id, userId: players[2].id });

    // Admin unassign ≤24h with a bench creates a held-open placeholder.
    const target = (await attendeeRows(event.id)).find((r) => r.userId === players[0].id)!;
    await adminUnassignSpot({ eventId: event.id, attendeeId: target.id });
    const placeholder = (await attendeeRows(event.id)).find((r) => r.userId === null)!;

    await expect(
      offerSpot({ eventId: event.id, userId: capo.id, attendeeId: placeholder.id, isAdmin: true })
    ).rejects.toThrow('held for a pending bench promotion');
  });
});
