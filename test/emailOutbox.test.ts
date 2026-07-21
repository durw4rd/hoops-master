import { describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { emailOutbox } from '@/lib/db/schema';
import { claimSpot } from '@/lib/queries/events';
import { joinWaitlist, releaseSpot } from '@/lib/queries/waitlist';
import { drainEmailOutbox } from '@/lib/queries/emailOutbox';
import { evalServerFlag } from '@/lib/launchdarkly';
import { createScenario } from './factories';

async function outboxRowsFor(eventId: string) {
  return db.select().from(emailOutbox).where(eq(emailOutbox.eventId, eventId));
}

describe('email outbox', () => {
  it('queues a bench_promotion email when a player is promoted (>24h)', async () => {
    const { players, event } = await createScenario({ totalSpots: 1, slotCost: 5 });
    await claimSpot({ eventId: event.id, userId: players[0].id });
    await joinWaitlist({ eventId: event.id, userId: players[1].id });
    await releaseSpot({ eventId: event.id, userId: players[0].id });

    const rows = await outboxRowsFor(event.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].emailType).toBe('bench_promotion');
    expect(rows[0].userId).toBe(players[1].id);
    expect(rows[0].sentAt).toBeNull();
  });

  it('queues a bench_promotion_pending email for last-minute openings (≤24h)', async () => {
    const { players, event } = await createScenario({
      totalSpots: 1,
      slotCost: 5,
      startsInHours: 2,
    });
    await claimSpot({ eventId: event.id, userId: players[0].id });
    await joinWaitlist({ eventId: event.id, userId: players[1].id });
    await releaseSpot({ eventId: event.id, userId: players[0].id });

    const rows = await outboxRowsFor(event.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].emailType).toBe('bench_promotion_pending');
    expect(rows[0].userId).toBe(players[1].id);
  });

  it('leaves rows unclaimed while the email-notifications flag is off', async () => {
    const { players, event } = await createScenario({ totalSpots: 1, slotCost: 5 });
    await claimSpot({ eventId: event.id, userId: players[0].id });
    await joinWaitlist({ eventId: event.id, userId: players[1].id });
    await releaseSpot({ eventId: event.id, userId: players[0].id });

    vi.mocked(evalServerFlag).mockResolvedValueOnce(false); // kill-switch off
    const sent = await drainEmailOutbox(100);
    expect(sent).toBe(0);
    const rows = await outboxRowsFor(event.id);
    expect(rows.every((r) => r.sentAt === null), 'rows must stay queued for later').toBe(true);

    // Flag back on (default mock) → the queued row is claimed on the next drain.
    await drainEmailOutbox(100);
    const after = await outboxRowsFor(event.id);
    expect(after.every((r) => r.sentAt !== null)).toBe(true);
  });

  it('drain claims rows exactly once (idempotent under repeated runs)', async () => {
    const { players, event } = await createScenario({ totalSpots: 1, slotCost: 5 });
    await claimSpot({ eventId: event.id, userId: players[0].id });
    await joinWaitlist({ eventId: event.id, userId: players[1].id });
    await releaseSpot({ eventId: event.id, userId: players[0].id });

    // No RESEND_API_KEY in tests → nothing actually sends, but rows are claimed.
    await drainEmailOutbox(100);
    const afterFirst = await outboxRowsFor(event.id);
    expect(afterFirst.every((r) => r.sentAt !== null)).toBe(true);

    // Second drain finds nothing to claim.
    await drainEmailOutbox(100);
    const afterSecond = await outboxRowsFor(event.id);
    expect(afterSecond).toHaveLength(afterFirst.length);
  });
});
