import { describe, expect, it } from 'vitest';
import {
  adminUnassignSpot,
  claimSpot,
  offerSpot,
  setAttendeeNoShow,
} from '@/lib/queries/events';
import { joinWaitlist } from '@/lib/queries/waitlist';
import { createScenario, timeTravelEventToPast } from './factories';
import { assertLedgerInvariant, netChargedByUser } from './invariants';
import { attendeeRows, ledgerRows } from './helpers';

const COST = 5;

describe('no-show marking (F5)', () => {
  it('is blocked before tip-off', async () => {
    const { capo, players, event } = await createScenario({ slotCost: COST });
    await claimSpot({ eventId: event.id, userId: players[0].id });
    const [row] = await attendeeRows(event.id);

    await expect(
      setAttendeeNoShow({ eventId: event.id, attendeeId: row.id, noShow: true, byUserId: capo.id })
    ).rejects.toThrow('after tip-off');
  });

  it('toggles after tip-off with zero ledger writes — the player stays charged', async () => {
    const { capo, players, event } = await createScenario({ slotCost: COST });
    await claimSpot({ eventId: event.id, userId: players[0].id });
    await timeTravelEventToPast(event.id);
    const [row] = await attendeeRows(event.id);
    const ledgerBefore = (await ledgerRows(event.id)).length;

    const marked = await setAttendeeNoShow({
      eventId: event.id,
      attendeeId: row.id,
      noShow: true,
      byUserId: capo.id,
    });
    expect(marked.noShowAt).not.toBeNull();
    expect(marked.noShowBy).toBe(capo.id);

    const cleared = await setAttendeeNoShow({
      eventId: event.id,
      attendeeId: row.id,
      noShow: false,
      byUserId: capo.id,
    });
    expect(cleared.noShowAt).toBeNull();
    expect(cleared.noShowBy).toBeNull();

    expect((await ledgerRows(event.id)).length, 'no ledger rows written').toBe(ledgerBefore);
    expect((await netChargedByUser(event.id)).get(players[0].id)).toBe(COST);
    await assertLedgerInvariant(event.id);
  });

  it('rejects offered rows and held-open placeholders', async () => {
    const { capo, players, event } = await createScenario({
      totalSpots: 2,
      slotCost: COST,
      startsInHours: 2,
    });
    await claimSpot({ eventId: event.id, userId: players[0].id });
    await claimSpot({ eventId: event.id, userId: players[1].id });
    await joinWaitlist({ eventId: event.id, userId: players[2].id });

    // Placeholder: admin unassign ≤24h with a bench occupant.
    const target = (await attendeeRows(event.id)).find((r) => r.userId === players[0].id)!;
    await adminUnassignSpot({ eventId: event.id, attendeeId: target.id });
    const placeholder = (await attendeeRows(event.id)).find((r) => r.userId === null)!;

    // Offered row: player 1 offers (bench head has a pending request already,
    // so the offer stays on the marketplace... actually ≤24h creates a second
    // pending; offer instead on a fresh scenario is simpler — just time-travel).
    await timeTravelEventToPast(event.id);

    await expect(
      setAttendeeNoShow({ eventId: event.id, attendeeId: placeholder.id, noShow: true, byUserId: capo.id })
    ).rejects.toThrow('held-open');
  });

  it('rejects rows that are offered rather than confirmed', async () => {
    const { capo, players, event } = await createScenario({ slotCost: COST });
    await claimSpot({ eventId: event.id, userId: players[0].id });
    await offerSpot({ eventId: event.id, userId: players[0].id });
    await timeTravelEventToPast(event.id);
    const [row] = await attendeeRows(event.id);

    await expect(
      setAttendeeNoShow({ eventId: event.id, attendeeId: row.id, noShow: true, byUserId: capo.id })
    ).rejects.toThrow('Only confirmed spots');
  });
});
