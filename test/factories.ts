/**
 * Data factories. Every scenario builds a fresh crew/event/users so tests are
 * isolated by construction (no truncation needed).
 */

import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { events, groupMembers, groups, users } from '@/lib/db/schema';
import type { PricingMode } from '@/lib/types';

type UserRow = typeof users.$inferSelect;
type GroupRow = typeof groups.$inferSelect;
type EventRow = typeof events.$inferSelect;

export async function createUser(name = 'Player'): Promise<UserRow> {
  const suffix = randomUUID().slice(0, 8);
  const [row] = await db
    .insert(users)
    .values({
      email: `${name.toLowerCase()}-${suffix}@test.local`,
      displayName: `${name}-${suffix}`,
      onboarded: true,
    })
    .returning();
  return row;
}

export async function addMember(
  groupId: string,
  user: UserRow,
  role: 'admin' | 'coleader' | 'member' = 'member'
): Promise<void> {
  await db.insert(groupMembers).values({ groupId, userId: user.id, groupRole: role });
}

export async function createCrew(): Promise<{ group: GroupRow; capo: UserRow }> {
  const capo = await createUser('Capo');
  const [group] = await db
    .insert(groups)
    .values({
      name: `Test Crew ${randomUUID().slice(0, 8)}`,
      inviteCode: randomUUID(),
      createdBy: capo.id,
    })
    .returning();
  await addMember(group.id, capo, 'admin');
  return { group, capo };
}

export interface CreateEventOpts {
  /** Hours from now until tip-off; <24 exercises the pending-approval branch. */
  startsInHours?: number;
  totalSpots?: number;
  slotCost?: number;
  pricingMode?: PricingMode;
  totalCost?: number;
}

export async function createTestEvent(
  group: GroupRow,
  createdBy: UserRow,
  opts: CreateEventOpts = {}
): Promise<EventRow> {
  const startsInHours = opts.startsInHours ?? 72;
  const startsAt = new Date(Date.now() + startsInHours * 60 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);
  const pricingMode = opts.pricingMode ?? 'per_spot';
  const [row] = await db
    .insert(events)
    .values({
      groupId: group.id,
      startsAt,
      endsAt,
      totalSpots: opts.totalSpots ?? 4,
      slotCost: String(pricingMode === 'per_spot' ? opts.slotCost ?? 5 : 0),
      pricingMode,
      totalCost: String(pricingMode === 'split_total' ? opts.totalCost ?? 0 : 0),
      createdBy: createdBy.id,
    })
    .returning();
  return row;
}

/** Crew with `playerCount` members and one event, ready for scenarios. */
export async function createScenario(opts: CreateEventOpts & { playerCount?: number } = {}) {
  const { group, capo } = await createCrew();
  const players: UserRow[] = [];
  for (let i = 0; i < (opts.playerCount ?? 6); i++) {
    const p = await createUser(`P${i + 1}`);
    await addMember(group.id, p);
    players.push(p);
  }
  const event = await createTestEvent(group, capo, opts);
  return { group, capo, players, event };
}

export async function reloadEvent(eventId: string): Promise<EventRow> {
  const { eq } = await import('drizzle-orm');
  const [row] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!row) throw new Error(`event ${eventId} not found`);
  return row;
}
