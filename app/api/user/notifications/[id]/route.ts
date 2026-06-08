/**
 * PATCH /api/user/notifications/[id] — mark one notification read
 */

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/apiGuards';
import { markNotificationRead } from '@/lib/queries/notifications';

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth();
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await params;

  try {
    const notification = await markNotificationRead(id, ctx.user.id);
    if (!notification) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: notification });
  } catch (error) {
    console.error('Error marking notification read:', error);
    return NextResponse.json({ error: 'Failed to update notification' }, { status: 500 });
  }
}
