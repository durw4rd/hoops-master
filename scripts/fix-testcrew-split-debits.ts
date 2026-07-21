/**
 * One-time data fix (2026-07): the "Test crew" split-total event was switched
 * from per_spot to split_total before the pricing-mode-switch compensation fix
 * existed, leaving 4 players with an erroneous 5.00 debit each. This writes
 * compensating -5.00 price_adjustment entries (append-only, visible in the
 * Spot Ledger) so every player's event net returns to 0.
 *
 *   pnpm tsx scripts/fix-testcrew-split-debits.ts           # dry run (default)
 *   pnpm tsx scripts/fix-testcrew-split-debits.ts --apply   # write corrections
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-serverless';

if (typeof WebSocket === 'undefined') neonConfig.webSocketConstructor = ws;

const EVENT_ID = '08060273-5e9d-43d3-b356-6f66f5d500bd';
const EXPECTED_DEBIT = 5.0;
const EXPECTED_PLAYER_COUNT = 4;

async function main() {
  const apply = process.argv.includes('--apply');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  const db = drizzle(pool);

  const eventRes = await db.execute(sql`
    SELECT e.id, e.pricing_mode, e.pricing_finalized_at, e.group_id, g.name AS crew
    FROM events e JOIN groups g ON g.id = e.group_id
    WHERE e.id = ${EVENT_ID}
  `);
  const event = eventRes.rows[0] as
    | { id: string; pricing_mode: string; pricing_finalized_at: string | null; group_id: string; crew: string }
    | undefined;
  if (!event) throw new Error(`Event ${EVENT_ID} not found`);
  if (event.pricing_mode !== 'split_total' || event.pricing_finalized_at !== null) {
    throw new Error(
      `Preconditions changed: pricing_mode=${event.pricing_mode}, finalized=${event.pricing_finalized_at} — aborting`
    );
  }
  console.log(`Event ${EVENT_ID} (${event.crew}): split_total, unfinalized ✓`);

  // Players on this event whose net charge is exactly the erroneous debit.
  const netRes = await db.execute(sql`
    WITH flows AS (
      SELECT to_user_id AS user_id, amount::numeric AS amt
      FROM spot_transactions WHERE event_id = ${EVENT_ID}
      UNION ALL
      SELECT from_user_id, -amount::numeric
      FROM spot_transactions WHERE event_id = ${EVENT_ID} AND from_user_id IS NOT NULL
    )
    SELECT f.user_id, u.display_name, u.email, SUM(f.amt) AS net
    FROM flows f JOIN users u ON u.id = f.user_id
    GROUP BY f.user_id, u.display_name, u.email
    HAVING ABS(SUM(f.amt) - ${EXPECTED_DEBIT}) < 0.001
    ORDER BY u.display_name
  `);
  const affected = netRes.rows as { user_id: string; display_name: string; email: string; net: string }[];

  console.log(`\nPlayers with an exact ${EXPECTED_DEBIT.toFixed(2)} net debit:`);
  for (const p of affected) console.log(`  - ${p.display_name} <${p.email}> net=${p.net}`);

  if (affected.length !== EXPECTED_PLAYER_COUNT) {
    throw new Error(
      `Expected exactly ${EXPECTED_PLAYER_COUNT} affected players, found ${affected.length} — aborting (re-audit first)`
    );
  }

  if (!apply) {
    console.log('\nDry run — no changes written. Re-run with --apply to write the corrections.');
    await pool.end();
    return;
  }

  for (const p of affected) {
    await db.execute(sql`
      INSERT INTO spot_transactions
        (event_id, attendee_id, group_id, type, from_user_id, to_user_id, amount, notes)
      VALUES
        (${EVENT_ID}, NULL, ${event.group_id}, 'price_adjustment', NULL, ${p.user_id},
         ${-EXPECTED_DEBIT},
         'Correction: erroneous 5.00 debit left over from pre-fix pricing-mode switch (2026-07 data fix)')
    `);
    console.log(`  ✓ credited ${p.display_name} ${EXPECTED_DEBIT.toFixed(2)}`);
  }

  // Verify: every player's net for this event should now be 0.
  const verify = await db.execute(sql`
    WITH flows AS (
      SELECT to_user_id AS user_id, amount::numeric AS amt
      FROM spot_transactions WHERE event_id = ${EVENT_ID}
      UNION ALL
      SELECT from_user_id, -amount::numeric
      FROM spot_transactions WHERE event_id = ${EVENT_ID} AND from_user_id IS NOT NULL
    )
    SELECT u.display_name, SUM(f.amt) AS net
    FROM flows f JOIN users u ON u.id = f.user_id
    GROUP BY u.display_name ORDER BY u.display_name
  `);
  console.log('\nPost-fix event nets:');
  for (const r of verify.rows as { display_name: string; net: string }[]) {
    console.log(`  ${r.display_name}: ${r.net}`);
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
