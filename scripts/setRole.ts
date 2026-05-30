/**
 * Set a user's app-level role.
 *
 *   EMAIL="misa.fasa@gmail.com" ROLE="owner" pnpm tsx scripts/setRole.ts
 *
 * Reads env from .env.local / .env. Override DATABASE_URL inline to target prod.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
import { eq } from 'drizzle-orm';
import * as schema from '../lib/db/schema';

if (typeof WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws;
}

async function main() {
  const email = (process.env.EMAIL ?? '').trim().toLowerCase();
  const role = (process.env.ROLE ?? '').trim();
  if (!email || !['owner', 'admin', 'user'].includes(role)) {
    throw new Error('Set EMAIL and ROLE (owner|admin|user)');
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  const [row] = await db
    .update(schema.users)
    .set({ globalRole: role })
    .where(eq(schema.users.email, email))
    .returning();

  if (!row) {
    console.error(`No user found for ${email}`);
  } else {
    console.log(`Updated ${row.email} -> ${row.globalRole}`);
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
