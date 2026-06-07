/**
 * Retract Offered Spot API
 *
 * POST /api/groups/[groupId]/events/[eventId]/retract - Take back your offered spot
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireMember } from '@/lib/apiGuards';
import { getEventRowById, retractOffer } from '@/lib/queries/events';
import { SpotError } from '@/lib/queries/_tx';

interface RouteParams {
  params: Promise<{ groupId: string; eventId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { groupId, eventId } = await params;
  const ctx = await requireMember(groupId);
  if (ctx instanceof NextResponse) return ctx;

  try {
    const eventRow = await getEventRowById(eventId);
    if (!eventRow || eventRow.groupId !== groupId) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const { attendeeId } = body ?? {};

    const attendee = await retractOffer({ eventId, userId: ctx.user.id, attendeeId });
    return NextResponse.json({
      success: true,
      message: attendeeId ? 'Rider spot offer retracted' : 'Your spot offer has been retracted',
      data: { attendeeId: attendee.id },
    });
  } catch (error) {
    if (error instanceof SpotError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Error retracting offer:', error);
    return NextResponse.json(
      { error: 'Failed to retract offer', details: String(error) },
      { status: 500 }
    );
  }
}
