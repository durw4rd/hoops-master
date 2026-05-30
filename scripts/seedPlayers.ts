/**
 * Seed known players (allowlist) into the users table.
 *
 *   pnpm tsx scripts/seedPlayers.ts
 *
 * Inserts each player by email (lowercased). Existing rows are left untouched
 * (onConflictDoNothing) so chosen usernames and roles are never overwritten.
 *
 * Reads env from .env.local / .env. Override DATABASE_URL inline to target prod:
 *   DATABASE_URL="<prod-pooled>" pnpm tsx scripts/seedPlayers.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
import { sql } from 'drizzle-orm';
import * as schema from '../lib/db/schema';

if (typeof WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws;
}

const PLAYERS: { name: string; email: string }[] = [
  { name: 'Nathan', email: 'nathanhoang@gmail.com' },
  { name: 'Amit', email: 'amitme2@gmail.com' },
  { name: 'Micha', email: 'misa.fasa@gmail.com' },
  { name: 'Andreas', email: 'andreasmagalios@gmail.com' },
  { name: 'Bruno', email: 'brunoredsox@gmail.com' },
  { name: 'Mark', email: 'copyrapper@gmail.com' },
  { name: 'Kyle', email: 'kyle.ingerman@gmail.com' },
  { name: 'Vedran', email: 'v.dervisevic@gmail.com' },
  { name: 'Jaime', email: 'jcfilipe216@gmail.com' },
  { name: 'Vic', email: 'faopleyades@gmail.com' },
  { name: 'Shafiq', email: 's.kuttab@gmail.com' },
  { name: 'Chris', email: 'chrathans@gmail.com' },
  { name: 'Antoine', email: 'a.coudard@gmail.com' },
  { name: 'Thibault', email: 'thibaultconstans.t@gmail.com' },
  { name: 'Tasos', email: 'tkokkos@gmail.com' },
  { name: 'Fran', email: 'franmarquezb@gmail.com' },
  { name: 'Romario', email: 'romario@ferrao.co.za' },
  { name: 'Marco', email: 'marconovelli9@gmail.com' },
  { name: 'Mehmet', email: 'karavelioglumehmet@gmail.com' },
  { name: 'Nick', email: 'nfmueller@gmail.com' },
  { name: 'Luuk', email: 'luukvandeven@gmail.com' },
  { name: 'Anita', email: 'sharpeaes@gmail.com' },
  { name: 'Ben', email: 'ben.dryden@gmail.com' },
  { name: 'Ricardo', email: 'sendtoricardoleite@gmail.com' },
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required.');

  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });

  for (const { name, email } of PLAYERS) {
    const normalized = email.trim().toLowerCase();
    await db
      .insert(schema.users)
      .values({ email: normalized, displayName: name })
      .onConflictDoNothing({ target: schema.users.email });
    console.log(`Seeded player: ${name} <${normalized}>`);
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
