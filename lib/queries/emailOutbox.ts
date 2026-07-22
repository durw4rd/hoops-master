/**
 * Transactional email outbox.
 *
 * Rows are enqueued INSIDE the serializable spot-mutation transaction, so a
 * rolled-back (or retried) mutation never leaves a stray email. Sending
 * happens after commit: withEventLock schedules a drain via next/server
 * `after()`, and the reminders cron sweeps any leftovers.
 *
 * Claiming uses FOR UPDATE SKIP LOCKED and marks rows sent BEFORE dispatch:
 * at-most-once semantics (a lost email is tolerable, a duplicate is not).
 */

import { sql } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { emailOutbox, events, groups, users } from '@/lib/db/schema';
import { isEmailNotificationsEnabled, sendBatchEmails, type OutgoingEmail } from '@/lib/email/send';
import { benchPromotionEmail, benchPromotionPendingEmail } from '@/lib/email/templates';
import { utcToZonedFriendlyParts } from '@/lib/datetime';
import type { Tx } from './_tx';

export type OutboxEmailType = 'bench_promotion' | 'bench_promotion_pending';

export async function enqueueEmail(
  tx: Tx,
  params: {
    userId: string;
    groupId: string;
    eventId: string;
    emailType: OutboxEmailType;
    spotKind: 'primary' | 'plus_one';
  }
): Promise<void> {
  await tx.insert(emailOutbox).values(params);
}

type OutboxRow = typeof emailOutbox.$inferSelect;

export async function drainEmailOutbox(limit = 20): Promise<number> {
  // Kill-switch off → leave rows unclaimed; the sweep picks them up once the
  // flag is enabled (rows for already-started games are then claimed but
  // skipped below, so enabling the flag never blasts a stale backlog).
  if (!(await isEmailNotificationsEnabled())) return 0;

  const claimed = await db.execute<OutboxRow & { user_id: string }>(sql`
    UPDATE email_outbox SET sent_at = now()
    WHERE id IN (
      SELECT id FROM email_outbox
      WHERE sent_at IS NULL
      ORDER BY created_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, user_id, group_id, event_id, email_type, spot_kind
  `);

  // Build the messages that still pass their send-time checks, then dispatch
  // them in one Batch API request (≤100) instead of one HTTP call per row —
  // keeps promotion bursts (cascades, capacity bumps) under Resend's rate limit.
  const outgoing: OutgoingEmail[] = [];
  for (const raw of claimed.rows) {
    const row = raw as unknown as {
      user_id: string;
      group_id: string;
      event_id: string;
      email_type: OutboxEmailType;
      spot_kind: 'primary' | 'plus_one';
    };
    try {
      const [user] = await db.select().from(users).where(eq(users.id, row.user_id)).limit(1);
      if (!user || user.removedAt || !user.emailBenchPromotions) continue;

      const [event] = await db.select().from(events).where(eq(events.id, row.event_id)).limit(1);
      if (!event || event.status === 'cancelled') continue;
      if (event.startsAt.getTime() < Date.now()) continue; // game already started — stale

      const [group] = await db.select().from(groups).where(eq(groups.id, row.group_id)).limit(1);
      if (!group) continue;

      const { date, time } = utcToZonedFriendlyParts(event.startsAt, group.timezone);
      const ctx = {
        crewName: group.name,
        eventName: event.name,
        date,
        time,
        location: event.location,
        spotKind: row.spot_kind,
      };
      const email =
        row.email_type === 'bench_promotion_pending'
          ? benchPromotionPendingEmail(ctx)
          : benchPromotionEmail(ctx);

      outgoing.push({ to: user.email, subject: email.subject, html: email.html });
    } catch (err) {
      // Row already claimed — log and move on rather than failing the batch.
      console.error('[email] outbox row failed:', err);
    }
  }

  const { sent } = await sendBatchEmails(outgoing);
  return sent;
}
