/**
 * Neon database client (WebSocket Pool driver).
 *
 * The Pool/WebSocket driver is required (not neon-http) because spot mutations
 * run inside interactive multi-statement transactions with SELECT ... FOR UPDATE
 * (see plan 4.0). The pool is created at module scope so it is reused across
 * warm serverless invocations.
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
import * as schema from './schema';

// In Node.js runtimes (and during local dev / migrations) the global WebSocket
// is not available, so wire up the `ws` implementation. In Edge/Vercel the
// platform provides a global WebSocket and this is a harmless no-op fallback.
if (typeof WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws;
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  // Fail loudly at first use rather than silently producing a broken client.
  console.warn('[db] DATABASE_URL is not set — database calls will fail.');
}

export const pool = new Pool({ connectionString });

export const db = drizzle(pool, { schema });

export { schema };
export type DB = typeof db;
