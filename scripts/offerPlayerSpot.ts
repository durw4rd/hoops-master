/**
 * Offer a player's primary spot on an event (marketplace / "grab" flow).
 *
 *   PLAYER="Kyle" EVENT_ID=<uuid> pnpm tsx scripts/offerPlayerSpot.ts
 *
 * Or find by local start time in the crew timezone:
 *   PLAYER="Kyle" EVENT_LOCAL="2026-07-22T18:00" pnpm tsx scripts/offerPlayerSpot.ts
 *
 * Reads DATABASE_URL from .env.local (override inline for prod).
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { ilike, sql } from 'drizzle-orm';
import * as schema from '../lib/db/schema';

if (typeof WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws;
}

async function resolveEventId(
  db: ReturnType<typeof drizzle>,
  eventId: string | undefined,
  eventLocal: string | undefined
): Promise<string> {
  if (eventId?.trim()) return eventId.trim();

  if (!eventLocal?.trim()) {
    throw new Error('Set EVENT_ID or EVENT_LOCAL (e.g. 2026-07-22T18:00)');
  }

  const result = await db.execute(sql`
    SELECT e.id, e.starts_at, g.name as group_name, g.timezone
    FROM events e
    JOIN groups g ON g.id = e.group_id
    WHERE (e.starts_at AT TIME ZONE g.timezone)::timestamp >= (${eventLocal}::timestamp - interval '30 minutes')
      AND (e.starts_at AT TIME ZONE g.timezone)::timestamp < (${eventLocal}::timestamp + interval '30 minutes')
    ORDER BY e.starts_at
  `);
  const list = (result.rows ?? []) as { id: string; starts_at: string; group_name: string; timezone: string }[];
  if (list.length === 0) throw new Error(`No event near local time ${eventLocal}`);
  if (list.length > 1) {
    console.log('Multiple matches — pass EVENT_ID explicitly:\n', list);
    throw new Error('Ambiguous EVENT_LOCAL');
  }
  console.log(`Event: ${list[0].group_name} @ ${list[0].starts_at} (${list[0].timezone}) → ${list[0].id}`);
  return list[0].id;
}

async function main() {
  const player = (process.env.PLAYER ?? '').trim();
  if (!player) throw new Error('Set PLAYER (display name, case-insensitive partial match)');

  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  const [user] = await db
    .select()
    .from(schema.users)
    .where(ilike(schema.users.displayName, player));
  if (!user) throw new Error(`No user matching display name: ${player}`);

  const eventId = await resolveEventId(db, process.env.EVENT_ID, process.env.EVENT_LOCAL);

  await pool.end();

  // Load offerSpot after DATABASE_URL is set (lib/db reads env at import time).
  const { offerSpot } = await import('../lib/queries/events');

  const attendee = await offerSpot({ eventId, userId: user.id });
  console.log(
    `Done — ${user.displayName}'s spot is ${attendee.status}` +
      (attendee.status === 'offered' ? ' (open for claims)' : '')
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
