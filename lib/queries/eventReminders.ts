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
import { isEmailNotificationsEnabled, sendEmail } from '@/lib/email/send';
import { gameReminderEmail } from '@/lib/email/templates';
import { utcToZonedParts } from '@/lib/datetime';

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

  let emails = 0;
  for (const event of claimed) {
    try {
      const [group] = await db.select().from(groups).where(eq(groups.id, event.groupId)).limit(1);
      if (!group) continue;

      // Everyone holding a spot: primary holders and +1 bringers (deduped by
      // user — riders share the bringer's userId). Guest-named rows are still
      // funded by the holder, who is attending contextually; offered spots
      // still belong to the holder until claimed. Placeholders have no holder.
      const attendees = await db
        .select({
          email: users.email,
          removedAt: users.removedAt,
          emailGameReminders: users.emailGameReminders,
        })
        .from(eventAttendees)
        .innerJoin(users, eq(users.id, eventAttendees.userId))
        .where(eq(eventAttendees.eventId, event.id));

      const recipients = new Set<string>();
      for (const a of attendees) {
        if (a.removedAt || !a.emailGameReminders) continue;
        recipients.add(a.email);
      }

      const { date, time } = utcToZonedParts(event.startsAt, group.timezone);
      const email = gameReminderEmail({
        crewName: group.name,
        eventName: event.name,
        date,
        time,
        location: event.location,
      });

      const results = await Promise.allSettled(
        [...recipients].map((to) => sendEmail({ to, subject: email.subject, html: email.html }))
      );
      emails += results.filter((r) => r.status === 'fulfilled' && r.value.sent).length;
    } catch (err) {
      // The claim already happened — log and continue; better a missed batch
      // than duplicate blasts on retry.
      console.error(`[email] reminder for event ${event.id} failed:`, err);
    }
  }

  return { events: claimed.length, emails };
}
