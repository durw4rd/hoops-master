import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  benchPromotionRequests,
  eventAttendees,
  eventWaitlist,
  spotTransactions,
} from '@/lib/db/schema';

export async function attendeeRows(eventId: string) {
  return db.select().from(eventAttendees).where(eq(eventAttendees.eventId, eventId));
}

export async function benchRows(eventId: string) {
  return db.select().from(eventWaitlist).where(eq(eventWaitlist.eventId, eventId));
}

export async function pendingRows(eventId: string) {
  const rows = await db
    .select()
    .from(benchPromotionRequests)
    .where(eq(benchPromotionRequests.eventId, eventId));
  return rows.filter((r) => r.status === 'pending');
}

export async function ledgerRows(eventId: string) {
  return db.select().from(spotTransactions).where(eq(spotTransactions.eventId, eventId));
}
