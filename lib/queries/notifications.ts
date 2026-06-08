/**
 * In-app notifications — persisted inbox for spot claims and bench promotions.
 */

import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { notifications, events, groups, users } from '@/lib/db/schema';
import { utcToZonedParts } from '@/lib/datetime';
import type { Notification, NotificationType } from '@/lib/types';
import type { Tx } from './_tx';

export type SpotKind = 'primary' | 'plus_one';
export type SpotTransition = 'offered_claimed' | 'bench_promoted';

function formatGameLabel(startsAt: Date, timezone: string, location?: string | null): string {
  const { date, time } = utcToZonedParts(startsAt, timezone);
  const loc = location?.trim();
  return loc ? `${date} ${time} @ ${loc}` : `${date} ${time}`;
}

function buildCopy(params: {
  spotKind: SpotKind;
  transition: SpotTransition;
  eventLabel: string;
  actorName?: string;
}): { title: string; body: string; type: NotificationType } {
  const { spotKind, transition, eventLabel, actorName } = params;

  if (transition === 'offered_claimed') {
    if (spotKind === 'plus_one') {
      return {
        type: 'spot_offered_claimed',
        title: '+1 ride claimed',
        body: actorName
          ? `${actorName} claimed your offered Rider slot on ${eventLabel}.`
          : `Someone claimed your offered Rider slot on ${eventLabel}.`,
      };
    }
    return {
      type: 'spot_offered_claimed',
      title: 'Spot got snatched',
      body: actorName
        ? `${actorName} claimed your open spot on ${eventLabel}.`
        : `Someone claimed your open spot on ${eventLabel}.`,
    };
  }

  if (spotKind === 'plus_one') {
    return {
      type: 'bench_promoted',
      title: "Your Rider's up",
      body: `Off the bench — your Rider's in the run for ${eventLabel}.`,
    };
  }
  return {
    type: 'bench_promoted',
    title: "You're up",
    body: `Off the bench — you're in the run for ${eventLabel}.`,
  };
}

function toNotificationDTO(row: typeof notifications.$inferSelect): Notification {
  return {
    id: row.id,
    groupId: row.groupId,
    eventId: row.eventId,
    type: row.type as NotificationType,
    title: row.title,
    body: row.body,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Universal entry point for spot-claim and bench-promotion notifications.
 * Recipient is always the primary account holder (holderUserId).
 */
export async function notifySpotChange(
  tx: Tx,
  params: {
    holderUserId: string;
    groupId: string;
    eventId: string;
    spotKind: SpotKind;
    transition: SpotTransition;
    actorUserId?: string;
  }
): Promise<void> {
  const { holderUserId, groupId, eventId, spotKind, transition, actorUserId } = params;
  if (actorUserId && actorUserId === holderUserId) return;

  const [event] = await tx
    .select({ startsAt: events.startsAt, location: events.location })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);
  if (!event) return;

  const [group] = await tx
    .select({ timezone: groups.timezone })
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);
  const timezone = group?.timezone ?? 'Europe/Prague';

  let actorName: string | undefined;
  if (actorUserId) {
    const [actor] = await tx
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, actorUserId))
      .limit(1);
    actorName = actor?.displayName;
  }

  const eventLabel = formatGameLabel(event.startsAt, timezone, event.location);
  const { title, body, type } = buildCopy({ spotKind, transition, eventLabel, actorName });

  await tx.insert(notifications).values({
    userId: holderUserId,
    groupId,
    eventId,
    type,
    title,
    body,
  });
}

export async function listNotificationsForUser(
  userId: string,
  opts: { limit?: number } = {}
): Promise<{ notifications: Notification[]; unreadCount: number }> {
  const limit = opts.limit ?? 50;

  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));

  return {
    notifications: rows.map(toNotificationDTO),
    unreadCount: countRow?.count ?? 0,
  };
}

export async function markNotificationRead(
  notificationId: string,
  userId: string
): Promise<Notification | null> {
  const [row] = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
    .returning();
  return row ? toNotificationDTO(row) : null;
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
  const updated = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .returning({ id: notifications.id });
  return updated.length;
}
