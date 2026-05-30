/**
 * Transaction helpers for concurrency-safe spot mutations (plan 4.0).
 *
 * All spot-mutating operations run inside a serializable transaction that locks
 * the target event row (SELECT ... FOR UPDATE) so concurrent writers for the
 * same event are serialized. Requires the Neon WebSocket Pool driver.
 */

import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { events } from '@/lib/db/schema';

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type EventRow = typeof events.$inferSelect;

const SERIALIZATION_FAILURE = '40001';
const MAX_RETRIES = 3;

/**
 * Run `fn` in a serializable transaction, retrying on serialization failures.
 */
export async function serializableTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await db.transaction(fn, { isolationLevel: 'serializable' });
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === SERIALIZATION_FAILURE && attempt < MAX_RETRIES - 1) {
        lastErr = err;
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

/**
 * Lock an event row for the duration of the transaction and pass it to `fn`.
 * Throws if the event does not exist.
 */
export async function withEventLock<T>(
  eventId: string,
  fn: (tx: Tx, event: EventRow) => Promise<T>
): Promise<T> {
  return serializableTx(async (tx) => {
    const [event] = await tx
      .select()
      .from(events)
      .where(eq(events.id, eventId))
      .for('update')
      .limit(1);
    if (!event) throw new SpotError('Event not found', 404);
    return fn(tx, event);
  });
}

/**
 * Domain error with an HTTP status hint, so API routes can map cleanly.
 */
export class SpotError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'SpotError';
    this.status = status;
  }
}

export { sql };
