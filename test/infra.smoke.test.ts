import { describe, expect, it } from 'vitest';
import { fillSpot, claimSpot } from '@/lib/queries/events';
import { createScenario } from './factories';
import { assertInvariants, netChargedByUser } from './invariants';

describe('test infrastructure', () => {
  it('runs spot mutations against the embedded database', async () => {
    const { capo, players, event } = await createScenario({ slotCost: 5 });

    await fillSpot({ eventId: event.id, toUserId: players[0].id, assignedById: capo.id, type: 'admin_assign' });
    await claimSpot({ eventId: event.id, userId: players[1].id });

    const net = await netChargedByUser(event.id);
    expect(net.get(players[0].id)).toBe(5);
    expect(net.get(players[1].id)).toBe(5);
    await assertInvariants(event.id);
  });

  it('enforces serializable single-winner on the last spot', async () => {
    const { capo, players, event } = await createScenario({ totalSpots: 1, playerCount: 2 });
    void capo;

    const results = await Promise.allSettled([
      claimSpot({ eventId: event.id, userId: players[0].id }),
      claimSpot({ eventId: event.id, userId: players[1].id }),
    ]);
    const wins = results.filter((r) => r.status === 'fulfilled').length;
    expect(wins).toBe(1);
    await assertInvariants(event.id);
  });
});
