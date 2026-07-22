import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { fillSpot } from '@/lib/queries/events';
import { sendDueEventReminders } from '@/lib/queries/eventReminders';
import { createScenario, reloadEvent } from './factories';

// sendDueEventReminders claims due events across ALL crews, so assert on the
// target event row rather than the global counts (other test files seed games
// inside the 48h window too). Email sending is disabled in tests (no
// RESEND_API_KEY), so `emails` is always 0 — the batch-collect path still runs.

describe('sendDueEventReminders', () => {
  it('claims a game inside the 48h window exactly once (idempotent)', async () => {
    const { capo, players, event } = await createScenario({ startsInHours: 40, totalSpots: 4 });
    for (const p of players.slice(0, 3)) {
      await fillSpot({ eventId: event.id, toUserId: p.id, assignedById: capo.id, type: 'admin_assign' });
    }

    const first = await sendDueEventReminders();
    expect(first.emails).toBe(0);
    const stampedAt = (await reloadEvent(event.id)).reminderSentAt;
    expect(stampedAt).not.toBeNull();

    // Second run must not re-claim this game (stamp unchanged).
    await sendDueEventReminders();
    expect((await reloadEvent(event.id)).reminderSentAt?.getTime()).toBe(stampedAt?.getTime());
  });

  it('does not claim games outside the 48h window', async () => {
    const { capo, players, event } = await createScenario({ startsInHours: 72, totalSpots: 4 });
    await fillSpot({ eventId: event.id, toUserId: players[0].id, assignedById: capo.id, type: 'admin_assign' });

    await sendDueEventReminders();
    expect((await reloadEvent(event.id)).reminderSentAt).toBeNull();
  });

  it('still claims a due game even when a holder opted out (empty recipient list)', async () => {
    const { capo, players, event } = await createScenario({ startsInHours: 40, totalSpots: 4 });
    await fillSpot({ eventId: event.id, toUserId: players[0].id, assignedById: capo.id, type: 'admin_assign' });
    await db.update(users).set({ emailGameReminders: false }).where(eq(users.id, players[0].id));

    const result = await sendDueEventReminders();
    expect(result.emails).toBe(0);
    expect((await reloadEvent(event.id)).reminderSentAt).not.toBeNull();
  });
});
