/**
 * Boots an embedded Postgres (real server binaries, no Docker needed) and
 * applies the app's drizzle migrations, so tests exercise the exact schema —
 * including the player_credit_balances view — against genuine Postgres
 * semantics (serializable isolation, SELECT ... FOR UPDATE).
 */

import { rmSync } from 'node:fs';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { TEST_DATABASE_URL, TEST_PG_DIR, TEST_PG_PORT } from './config';

export default async function globalSetup() {
  const databaseDir = path.resolve(TEST_PG_DIR);
  rmSync(databaseDir, { recursive: true, force: true });

  const pg = new EmbeddedPostgres({
    databaseDir,
    user: 'postgres',
    password: 'password',
    port: TEST_PG_PORT,
    persistent: false,
  });

  await pg.initialise();
  await pg.start();
  await pg.createDatabase('hoops_test');

  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  try {
    await migrate(drizzle(pool), { migrationsFolder: 'lib/db/migrations' });
  } finally {
    await pool.end();
  }

  return async () => {
    await pg.stop();
    rmSync(databaseDir, { recursive: true, force: true });
  };
}
