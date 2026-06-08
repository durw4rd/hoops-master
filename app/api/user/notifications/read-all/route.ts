/**
 * POST /api/user/notifications/read-all — mark all notifications read
 */

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/apiGuards';
import { listNotificationsForUser, markAllNotificationsRead } from '@/lib/queries/notifications';

export async function POST() {
  const ctx = await requireAuth();
  if (ctx instanceof NextResponse) return ctx;

  try {
    await markAllNotificationsRead(ctx.user.id);
    const data = await listNotificationsForUser(ctx.user.id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error marking all notifications read:', error);
    return NextResponse.json({ error: 'Failed to clear notifications' }, { status: 500 });
  }
}
