import { describe, expect, it } from 'vitest';
import { assignSpotToGuest, claimSpot, getEventAttendees } from '@/lib/queries/events';
import { createScenario } from './factories';

describe('guest spot DTO', () => {
  it('surfaces the guest name and the funding host on a guest row', async () => {
    const { capo, players, event } = await createScenario({ slotCost: 5 });
    await claimSpot({ eventId: event.id, userId: players[0].id }); // host = players[0]
    await claimSpot({ eventId: event.id, userId: players[1].id }); // normal row

    const before = await getEventAttendees(event.id);
    const hostSpot = before.find((r) => r.userEmail === players[0].email)!;

    await assignSpotToGuest({
      eventId: event.id,
      attendeeId: hostSpot.attendeeId,
      guestName: 'Tom',
      byUserId: capo.id,
      isAdmin: true,
    });

    const after = await getEventAttendees(event.id);
    const guest = after.find((r) => r.isGuestSpot)!;
    expect(guest.guestDisplayName).toBe('Tom');
    expect(guest.userName).toBe('Tom');
    expect(guest.hostName).toBe(players[0].displayName); // funding player behind the guest

    // A normal (non-guest) row carries no host.
    const normal = after.find((r) => r.userEmail === players[1].email && !r.isGuestSpot)!;
    expect(normal.hostName).toBeNull();
  });
});
