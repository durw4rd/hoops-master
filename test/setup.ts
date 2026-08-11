/**
 * Swaps the app's Neon WebSocket db handle for a node-postgres handle pointed
 * at the embedded test server. Everything downstream (lib/queries/*, the
 * serializable withEventLock wrapper, the balance view) runs unmodified.
 */

import { vi } from 'vitest';
import { TEST_DATABASE_URL } from './config';

vi.mock('@/lib/db', async () => {
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const { Pool } = await import('pg');
  const schema = await import('@/lib/db/schema');

  const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 10 });
  const db = drizzle(pool, { schema });

  return { pool, db, schema };
});

// No Edge Config in tests and server LD flags are fail-closed, so force the
// email-notifications kill-switch ON by default (individual tests can override
// via vi.mocked(evalServerFlag)). Fully manual mock — the real module imports
// the LD edge SDK, whose ESM build Node/vitest cannot resolve.
vi.mock('@/lib/launchdarkly', () => ({
  evalServerFlag: vi.fn(async <T,>(flagKey: string, _email: string, defaultValue: T) => {
    if (flagKey === 'email-notifications') return true as T;
    return defaultValue;
  }),
  isServerLdConfigured: () => false,
  getLaunchDarklyServerConfigStatus: () => ({
    hasClientSideId: false,
    hasEdgeConfig: false,
    serverClientReady: false,
  }),
}));
