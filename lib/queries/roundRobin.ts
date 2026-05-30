/**
 * Round-robin roster management + sliding-window assignment (plan 4.1).
 *
 * Roster order is defined by sort_key (gapped doubles) so reordering touches a
 * single row. Inactive players are filtered out before windowing so toggling a
 * player off cleanly shrinks the rotation.
 */

import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { roundRobinRosters, users } from '@/lib/db/schema';
import { getUserRowByEmail } from './users';
import type { RosterEntry } from '@/lib/types';

const SORT_GAP = 1000;

export async function getRoster(groupId: string): Promise<RosterEntry[]> {
  const rows = await db
    .select({ r: roundRobinRosters, email: users.email, name: users.displayName })
    .from(roundRobinRosters)
    .innerJoin(users, eq(users.id, roundRobinRosters.userId))
    .where(eq(roundRobinRosters.groupId, groupId))
    .orderBy(asc(roundRobinRosters.sortKey));
  return rows.map(({ r, email, name }) => ({
    userEmail: email,
    displayName: name,
    sortKey: r.sortKey,
    isActive: r.isActive,
  }));
}

/** Active roster user ids in order (for assignment). */
export async function getActiveRosterUserIds(groupId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: roundRobinRosters.userId })
    .from(roundRobinRosters)
    .where(and(eq(roundRobinRosters.groupId, groupId), eq(roundRobinRosters.isActive, true)))
    .orderBy(asc(roundRobinRosters.sortKey));
  return rows.map((r) => r.userId);
}

export interface RosterInput {
  userEmail: string;
  isActive: boolean;
}

/**
 * Replace the roster ordering for a group. Entries are given in display order;
 * sort_key is assigned as index * SORT_GAP. Rows for users not in the input set
 * are removed.
 */
export async function setRoster(groupId: string, entries: RosterInput[]): Promise<RosterEntry[]> {
  return db.transaction(async (tx) => {
    const resolved: { userId: string; isActive: boolean; sortKey: number }[] = [];
    for (let i = 0; i < entries.length; i++) {
      const u = await getUserRowByEmail(entries[i].userEmail);
      if (!u) continue;
      resolved.push({ userId: u.id, isActive: entries[i].isActive, sortKey: i * SORT_GAP });
    }

    // Remove existing rows for this group, then re-insert in order.
    await tx.delete(roundRobinRosters).where(eq(roundRobinRosters.groupId, groupId));
    if (resolved.length) {
      await tx.insert(roundRobinRosters).values(
        resolved.map((r) => ({
          groupId,
          userId: r.userId,
          isActive: r.isActive,
          sortKey: r.sortKey,
        }))
      );
    }
    return undefined as unknown as RosterEntry[];
  }).then(() => getRoster(groupId));
}

export interface RoundRobinWindow {
  offset: number;
  userIds: string[];
}

/**
 * Compute the sliding window assignment for a sequence of events.
 *
 * For the k-th event: start = (startOffset + k*slide) mod N, assign the next
 * min(S, N) players cyclically.
 */
export function computeRoundRobin(
  activeUserIds: string[],
  spotsPerEvent: number,
  slide: number,
  eventCount: number,
  startOffset = 0
): { windows: RoundRobinWindow[]; counts: Map<string, number> } {
  const N = activeUserIds.length;
  const windows: RoundRobinWindow[] = [];
  const counts = new Map<string, number>();
  for (const id of activeUserIds) counts.set(id, 0);

  if (N === 0) {
    return { windows: Array.from({ length: eventCount }, () => ({ offset: 0, userIds: [] })), counts };
  }

  const take = Math.min(spotsPerEvent, N);
  for (let k = 0; k < eventCount; k++) {
    const start = (((startOffset + k * slide) % N) + N) % N;
    const userIds: string[] = [];
    for (let i = 0; i < take; i++) {
      const id = activeUserIds[(start + i) % N];
      userIds.push(id);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    windows.push({ offset: start, userIds });
  }
  return { windows, counts };
}
