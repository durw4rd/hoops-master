/**
 * Cron: 48h game reminders + email outbox sweep.
 *
 * GET /api/cron/event-reminders
 * Secured with CRON_SECRET — Vercel Cron sends it as "Authorization: Bearer <secret>".
 */

import { NextRequest, NextResponse } from 'next/server';
import { sendDueEventReminders } from '@/lib/queries/eventReminders';
import { drainEmailOutbox } from '@/lib/queries/emailOutbox';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const reminders = await sendDueEventReminders();
    const drained = await drainEmailOutbox();
    return NextResponse.json({ success: true, data: { ...reminders, outboxDrained: drained } });
  } catch (error) {
    console.error('Cron event-reminders failed:', error);
    return NextResponse.json({ error: 'Cron run failed', details: String(error) }, { status: 500 });
  }
}
