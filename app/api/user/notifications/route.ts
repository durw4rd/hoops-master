/**
 * GET /api/user/notifications — list inbox + unread count
 */

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/apiGuards';
import { listNotificationsForUser } from '@/lib/queries/notifications';

export async function GET() {
  const ctx = await requireAuth();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const data = await listNotificationsForUser(ctx.user.id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
  }
}
