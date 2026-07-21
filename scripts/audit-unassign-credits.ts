/**
 * Audit upcoming games for credit/ledger inconsistencies after admin unassign.
 *
 *   pnpm tsx scripts/audit-unassign-credits.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-serverless';

if (typeof WebSocket === 'undefined') neonConfig.webSocketConstructor = ws;

const CREDIT_TYPES = sql.raw(`
  'admin_assign', 'round_robin_assign', 'signup', 'claim', 'reassign',
  'admin_reassign', 'release', 'waitlist_promote', 'split_settle',
  'split_remainder', 'price_adjustment'
`);

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  const db = drizzle(pool);

  console.log('=== 1) Orphan ledger rows (attendee deleted, txn remains) — upcoming events ===\n');
  const orphans = await db.execute(sql`
    SELECT
      g.name AS crew,
      e.id AS event_id,
      e.starts_at,
      (e.starts_at AT TIME ZONE g.timezone) AS local_start,
      t.id AS txn_id,
      t.type,
      t.amount,
      t.attendee_id,
      u_to.display_name AS charged_to,
      u_from.display_name AS credit_from,
      t.notes,
      t.created_at
    FROM spot_transactions t
    JOIN events e ON e.id = t.event_id
    JOIN groups g ON g.id = e.group_id
    JOIN users u_to ON u_to.id = t.to_user_id
    LEFT JOIN users u_from ON u_from.id = t.from_user_id
  LEFT JOIN event_attendees ea ON ea.id = t.attendee_id
    WHERE e.starts_at > now()
      AND t.attendee_id IS NOT NULL
      AND ea.id IS NULL
      AND t.type IN (${CREDIT_TYPES})
    ORDER BY e.starts_at, t.created_at
  `);
  console.log(orphans.rows);
  console.log(`Count: ${orphans.rows.length}\n`);

  console.log('=== 2) Charged for upcoming game but not on roster (to_user debits) ===\n');
  const chargedNotOnRoster = await db.execute(sql`
    WITH upcoming AS (
      SELECT e.id AS event_id, e.group_id, e.starts_at, g.name AS crew, g.timezone
      FROM events e
      JOIN groups g ON g.id = e.group_id
      WHERE e.starts_at > now()
    ),
    debits AS (
      SELECT
        t.event_id,
        t.to_user_id AS user_id,
        SUM(t.amount::numeric) AS net_debit
      FROM spot_transactions t
      JOIN upcoming u ON u.event_id = t.event_id
      WHERE t.type IN (${CREDIT_TYPES})
      GROUP BY t.event_id, t.to_user_id
      HAVING SUM(
        CASE WHEN t.to_user_id IS NOT NULL THEN t.amount::numeric ELSE 0 END
      ) > 0
    ),
    credits AS (
      SELECT
        t.event_id,
        t.from_user_id AS user_id,
        SUM(t.amount::numeric) AS net_credit
      FROM spot_transactions t
      JOIN upcoming u ON u.event_id = t.event_id
      WHERE t.from_user_id IS NOT NULL
        AND t.type IN (${CREDIT_TYPES})
      GROUP BY t.event_id, t.from_user_id
    ),
    net AS (
      SELECT
        d.event_id,
        d.user_id,
        COALESCE(d.net_debit, 0) - COALESCE(c.net_credit, 0) AS net_charged
      FROM debits d
      LEFT JOIN credits c ON c.event_id = d.event_id AND c.user_id = d.user_id
    )
    SELECT
      u.crew,
      u.event_id,
      u.starts_at,
      (u.starts_at AT TIME ZONE u.timezone) AS local_start,
      usr.display_name,
      usr.email,
      n.net_charged,
      EXISTS (
        SELECT 1 FROM event_attendees ea
        WHERE ea.event_id = n.event_id AND ea.user_id = n.user_id
      ) AS on_roster
    FROM net n
    JOIN upcoming u ON u.event_id = n.event_id
    JOIN users usr ON usr.id = n.user_id
    WHERE n.net_charged > 0.001
      AND NOT EXISTS (
        SELECT 1 FROM event_attendees ea
        WHERE ea.event_id = n.event_id AND ea.user_id = n.user_id
      )
    ORDER BY u.starts_at, usr.display_name
  `);
  console.log(chargedNotOnRoster.rows);
  console.log(`Count: ${chargedNotOnRoster.rows.length}\n`);

  console.log('=== 3) Upcoming events: occupancy vs net ledger debits (possible double-charge) ===\n');
  const eventSummary = await db.execute(sql`
    WITH upcoming AS (
      SELECT e.id AS event_id, e.starts_at, g.name AS crew, g.timezone,
             e.total_spots, e.slot_cost, e.pricing_mode
      FROM events e
      JOIN groups g ON g.id = e.group_id
      WHERE e.starts_at > now()
    ),
    occ AS (
      SELECT event_id, COUNT(*)::int AS seats_filled
      FROM event_attendees
      GROUP BY event_id
    ),
    ledger AS (
      SELECT
        t.event_id,
        SUM(t.amount::numeric) FILTER (WHERE t.type IN (${CREDIT_TYPES})) AS sum_all_amounts,
        COUNT(*) FILTER (WHERE t.type IN (${CREDIT_TYPES}) AND t.amount::numeric > 0) AS charge_rows
      FROM spot_transactions t
      GROUP BY t.event_id
    )
    SELECT
      u.crew,
      u.event_id,
      (u.starts_at AT TIME ZONE u.timezone) AS local_start,
      u.pricing_mode,
      COALESCE(o.seats_filled, 0) AS seats_filled,
      u.total_spots,
      COALESCE(l.charge_rows, 0) AS ledger_charge_rows,
      COALESCE(l.sum_all_amounts, 0) AS ledger_sum_amounts
    FROM upcoming u
    LEFT JOIN occ o ON o.event_id = u.event_id
    LEFT JOIN ledger l ON l.event_id = u.event_id
    ORDER BY u.starts_at
  `);
  console.log(eventSummary.rows);

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
