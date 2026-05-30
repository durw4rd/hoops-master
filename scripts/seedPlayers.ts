/**
 * Seed known players (allowlist) into the users table.
 *
 *   pnpm tsx scripts/seedPlayers.ts
 *
 * Upserts each player by email (lowercased). Updates the display name but never
 * downgrades an existing role (so the seeded admin stays an admin).
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
      .onConflictDoUpdate({
        target: schema.users.email,
        set: { displayName: name }, // never touches global_role
      });
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
