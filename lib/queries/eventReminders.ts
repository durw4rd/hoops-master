/**
 * 48h game reminder emails, driven by the cron route.
 *
 * Idempotency: events are CLAIMED atomically (reminder_sent_at set in the same
 * UPDATE that selects them), so overlapping cron runs can never double-send.
 * Events created inside the 48h window are picked up on the next run.
 */

import { and, eq, gt, isNull, lte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { eventAttendees, events, groups, users } from '@/lib/db/schema';
import { FORTY_EIGHT_HOURS_MS } from '@/lib/eventTiming';
import { isEmailNotificationsEnabled, sendBatchEmails, type OutgoingEmail } from '@/lib/email/send';
import { gameReminderEmail, type ReminderGame } from '@/lib/email/templates';
import { relativeDayLabel, utcToZonedFriendlyParts } from '@/lib/datetime';

/** One (recipient, game) pairing collected before consolidation. */
export interface ReminderEntry {
  email: string;
  startsAtMs: number;
  game: ReminderGame;
}

/**
 * Group reminder entries into one email per recipient (games sorted
 * soonest-first). Pure — no DB, no send — so consolidation is unit-testable.
 */
export function buildReminderEmails(entries: ReminderEntry[]): OutgoingEmail[] {
  const byEmail = new Map<string, ReminderEntry[]>();
  for (const entry of entries) {
    const list = byEmail.get(entry.email) ?? [];
    list.push(entry);
    byEmail.set(entry.email, list);
  }

  const emails: OutgoingEmail[] = [];
  for (const [to, list] of byEmail) {
    list.sort((a, b) => a.startsAtMs - b.startsAtMs);
    const { subject, html } = gameReminderEmail(list.map((e) => e.game));
    emails.push({ to, subject, html });
  }
  return emails;
}

export async function sendDueEventReminders(): Promise<{ events: number; emails: number }> {
  // Kill-switch off → don't claim anything; events still inside the 48h window
  // when the flag is enabled get claimed on the next cron run.
  if (!(await isEmailNotificationsEnabled())) return { events: 0, emails: 0 };

  const now = new Date();
  const claimed = await db
    .update(events)
    .set({ reminderSentAt: now })
    .where(and(
      isNull(events.reminderSentAt),
      eq(events.status, 'scheduled'),
      gt(events.startsAt, now),
      lte(events.startsAt, new Date(now.getTime() + FORTY_EIGHT_HOURS_MS)),
    ))
    .returning();

  // Collect one (recipient, game) entry per opted-in holder across all claimed
  // games, then consolidate to one email per player (see buildReminderEmails)
  // and dispatch via the Batch API — one HTTP request per 100 messages.
  const entries: ReminderEntry[] = [];
  for (const event of claimed) {
    try {
      const [group] = await db.select().from(groups).where(eq(groups.id, event.groupId)).limit(1);
      if (!group) continue;

      // A player's primary + rider rows share their userId, so fold per user:
      // one entry per player, with hasRider set when any of their rows is a +1
      // (parentAttendeeId non-null). Guest-named rows keep the holder's userId
      // (they stay responsible); offered spots still belong to the holder;
      // placeholders (userId NULL) are dropped by the inner join.
      const attendees = await db
        .select({
          userId: eventAttendees.userId,
          parentAttendeeId: eventAttendees.parentAttendeeId,
          email: users.email,
          removedAt: users.removedAt,
          emailGameReminders: users.emailGameReminders,
        })
        .from(eventAttendees)
        .innerJoin(users, eq(users.id, eventAttendees.userId))
        .where(eq(eventAttendees.eventId, event.id));

      const byEmail = new Map<string, { optedIn: boolean; hasRider: boolean }>();
      for (const a of attendees) {
        const optedIn = !a.removedAt && a.emailGameReminders;
        const prev = byEmail.get(a.email) ?? { optedIn, hasRider: false };
        prev.optedIn = optedIn; // same user → same value
        if (a.parentAttendeeId !== null) prev.hasRider = true;
        byEmail.set(a.email, prev);
      }

      const { date, time } = utcToZonedFriendlyParts(event.startsAt, group.timezone);
      const relative = relativeDayLabel(event.startsAt, now, group.timezone);
      for (const [email, flags] of byEmail) {
        if (!flags.optedIn) continue;
        entries.push({
          email,
          startsAtMs: event.startsAt.getTime(),
          game: {
            crewName: group.name,
            eventName: event.name,
            date,
            time,
            location: event.location,
            relative,
            hasRider: flags.hasRider,
          },
        });
      }
    } catch (err) {
      // The claim already happened — log and continue; better a missed batch
      // than duplicate blasts on retry.
      console.error(`[email] reminder for event ${event.id} failed:`, err);
    }
  }

  const { sent } = await sendBatchEmails(buildReminderEmails(entries));
  return { events: claimed.length, emails: sent };
}
