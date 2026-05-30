/**
 * Bootstrap script.
 *
 *   pnpm db:seed
 *
 * 1. Applies pending Drizzle migrations (idempotent).
 * 2. Upserts the app admin(s) listed in SEED_ADMIN_EMAILS as global_role='admin',
 *    so the app is usable before any LaunchDarkly flag is configured.
 *
 * Reads env from .env.local / .env.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { migrate } from 'drizzle-orm/neon-serverless/migrator';
import ws from 'ws';
import { sql } from 'drizzle-orm';
import * as schema from '../lib/db/schema';

if (typeof WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to seed the database.');
  }

  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });

  console.log('Applying migrations...');
  await migrate(db, { migrationsFolder: './lib/db/migrations' });
  console.log('Migrations applied.');

  const adminEmails = (process.env.SEED_ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  for (const email of adminEmails) {
    const displayName = email.split('@')[0];
    await db
      .insert(schema.users)
      .values({ email, displayName, globalRole: 'admin' })
      .onConflictDoUpdate({
        target: schema.users.email,
        set: { globalRole: 'admin' },
      });
    console.log(`Seeded app admin: ${email}`);
  }

  if (adminEmails.length === 0) {
    console.log('No SEED_ADMIN_EMAILS set — skipped admin seeding.');
  }

  const result = await db.execute(sql`SELECT COUNT(*)::int AS count FROM users`);
  const count = (result.rows?.[0] as { count: number } | undefined)?.count;
  console.log(`Done. Users in DB: ${count ?? 'unknown'}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
