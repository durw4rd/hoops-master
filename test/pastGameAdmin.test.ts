import { describe, expect, it } from 'vitest';
import {
  adminUnassignSpot,
  claimSpot,
  reassignSpot,
  updateEvent,
} from '@/lib/queries/events';
import { joinWaitlist, releaseSpot } from '@/lib/queries/waitlist';
import {
  declineBenchPromotion,
  getPendingPromotionForTarget,
} from '@/lib/queries/benchPromotion';
import { spotMutationBlockedMessage } from '@/lib/eventRules';
import { createScenario, reloadEvent, timeTravelEventToPast } from './factories';
import { assertLedgerInvariant, netChargedByUser } from './invariants';
import { attendeeRows, benchRows, ledgerRows, pendingRows } from './helpers';

const COST = 5;
const TZ = 'Europe/Prague';

describe('admin edits on past games (F4)', () => {
  it('admin unassign on a past game refunds without pending requests or promotions', async () => {
    const { players, event } = await createScenario({ totalSpots: 2, slotCost: COST });
    await claimSpot({ eventId: event.id, userId: players[0].id });
    await claimSpot({ eventId: event.id, userId: players[1].id });
    await joinWaitlist({ eventId: event.id, userId: players[2].id });
    await timeTravelEventToPast(event.id);

    const target = (await attendeeRows(event.id)).find((r) => r.userId === players[0].id)!;
    const { refunded } = await adminUnassignSpot({ eventId: event.id, attendeeId: target.id });
    expect(refunded).toBe(COST);

    // The freed spot dissolves into capacity slack — no bench matching after tip-off.
    const rows = await attendeeRows(event.id);
    expect(rows).toHaveLength(1);
    expect(rows.every((r) => r.userId !== null)).toBe(true);
    expect(await pendingRows(event.id)).toHaveLength(0);
    expect(await benchRows(event.id), 'bench untouched').toHaveLength(1);

    const net = await netChargedByUser(event.id);
    expect(net.get(players[0].id)).toBe(0);
    expect((await ledgerRows(event.id)).map((r) => r.type)).toContain('unassign_refund');
    await assertLedgerInvariant(event.id);
  });

  it('admin reassign on a past game transfers the spot zero-sum', async () => {
    const { capo, players, event } = await createScenario({ slotCost: COST });
    await claimSpot({ eventId: event.id, userId: players[0].id });
    await timeTravelEventToPast(event.id);

    await reassignSpot({
      eventId: event.id,
      toUserId: players[1].id,
      fromUserId: players[0].id,
      byUserId: capo.id,
      isAdmin: true,
    });

    const net = await netChargedByUser(event.id);
    expect(net.get(players[0].id)).toBe(0);
    expect(net.get(players[1].id)).toBe(COST);
    await assertLedgerInvariant(event.id);
  });

  it('decline cascade after tip-off never creates a new pending request', async () => {
    const { players, event } = await createScenario({
      totalSpots: 2,
      slotCost: COST,
      playerCount: 6,
      startsInHours: 2,
    });
    await claimSpot({ eventId: event.id, userId: players[0].id });
    await claimSpot({ eventId: event.id, userId: players[1].id });
    await joinWaitlist({ eventId: event.id, userId: players[2].id });
    await joinWaitlist({ eventId: event.id, userId: players[3].id });

    await releaseSpot({ eventId: event.id, userId: players[0].id });
    const dto = await getPendingPromotionForTarget(event.id, players[2].id);
    expect(dto).toBeTruthy();

    await timeTravelEventToPast(event.id);
    await declineBenchPromotion({ requestId: dto!.requestId, eventId: event.id, userId: players[2].id });

    // No cascade to players[3] — the game is over. The holder-funded opening
    // falls to 'offered' instead.
    expect(await pendingRows(event.id)).toHaveLength(0);
    const opened = (await attendeeRows(event.id)).find((r) => r.userId === players[0].id);
    expect(opened?.status).toBe('offered');
    await assertLedgerInvariant(event.id);
  });

  it('capacity increases on a past game dissolve instead of promoting the bench', async () => {
    const { players, event } = await createScenario({ totalSpots: 2, slotCost: COST });
    await claimSpot({ eventId: event.id, userId: players[0].id });
    await claimSpot({ eventId: event.id, userId: players[1].id });
    await joinWaitlist({ eventId: event.id, userId: players[2].id });
    await timeTravelEventToPast(event.id);

    await updateEvent(event.id, TZ, { totalSpots: 3 });

    expect((await reloadEvent(event.id)).totalSpots).toBe(3);
    const rows = await attendeeRows(event.id);
    expect(rows, 'no placeholder or promotion minted').toHaveLength(2);
    expect(await pendingRows(event.id)).toHaveLength(0);
    expect((await netChargedByUser(event.id)).get(players[2].id) ?? 0).toBe(0);
    await assertLedgerInvariant(event.id);
  });

  it('eventRules matrix: past blocked for players, open for managers; cancelled/locked for both', async () => {
    const { event: pastEvent } = await createScenario({ startsInHours: -2 });
    expect(spotMutationBlockedMessage(pastEvent)).toContain('past events');
    expect(spotMutationBlockedMessage(pastEvent, { actorIsManager: true })).toBeNull();

    const { event: upcoming } = await createScenario();
    expect(spotMutationBlockedMessage(upcoming)).toBeNull();
    expect(spotMutationBlockedMessage(upcoming, { actorIsManager: true })).toBeNull();

    // Cancelled + finalized-pricing stay locked for BOTH actors (past events
    // report the past-message first for players, so probe on upcoming rows).
    const cancelled = { ...upcoming, status: 'cancelled' };
    expect(spotMutationBlockedMessage(cancelled)).toContain('cancelled');
    expect(spotMutationBlockedMessage(cancelled, { actorIsManager: true })).toContain('cancelled');
    expect(
      spotMutationBlockedMessage({ ...pastEvent, status: 'cancelled' }, { actorIsManager: true })
    ).toContain('cancelled');

    const locked = {
      ...upcoming,
      pricingMode: 'split_total',
      pricingFinalizedAt: new Date(),
    };
    expect(spotMutationBlockedMessage(locked)).toContain('finalized');
    expect(spotMutationBlockedMessage(locked, { actorIsManager: true })).toContain('finalized');
    expect(
      spotMutationBlockedMessage(
        { ...pastEvent, pricingMode: 'split_total', pricingFinalizedAt: new Date() },
        { actorIsManager: true }
      )
    ).toContain('finalized');
  });
});
