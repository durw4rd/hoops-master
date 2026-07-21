/**
 * No-Show Marker API
 *
 * POST /api/groups/[groupId]/events/[eventId]/no-show
 * Body: { attendeeId: string, noShow: boolean }
 *
 * Capo/King only, and only after tip-off. Pure record-keeping: the player
 * stays charged for the spot; no ledger or bench interaction.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireCrewManager } from '@/lib/apiGuards';
import { getEventRowById, setAttendeeNoShow } from '@/lib/queries/events';
import { SpotError } from '@/lib/queries/_tx';

interface RouteParams {
  params: Promise<{ groupId: string; eventId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { groupId, eventId } = await params;
  const ctx = await requireCrewManager(groupId);
  if (ctx instanceof NextResponse) return ctx;

  try {
    const eventRow = await getEventRowById(eventId);
    if (!eventRow || eventRow.groupId !== groupId) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }
    if (eventRow.status === 'cancelled') {
      return NextResponse.json({ error: 'This game has been cancelled' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const attendeeId: string | undefined = body?.attendeeId;
    const noShow = body?.noShow;
    if (!attendeeId || typeof noShow !== 'boolean') {
      return NextResponse.json(
        { error: 'attendeeId and noShow (boolean) are required' },
        { status: 400 }
      );
    }

    await setAttendeeNoShow({ eventId, attendeeId, noShow, byUserId: ctx.user.id });

    return NextResponse.json({
      success: true,
      message: noShow ? 'Marked as a no-show' : 'No-show cleared',
      data: { attendeeId, noShow },
    });
  } catch (error) {
    if (error instanceof SpotError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Error toggling no-show:', error);
    return NextResponse.json(
      { error: 'Failed to update no-show', details: String(error) },
      { status: 500 }
    );
  }
}
