/**
 * Offer Event Spot API
 *
 * POST /api/groups/[groupId]/events/[eventId]/offer
 * Body (optional): { attendeeId: string }
 *
 * Marks a spot as offered to the marketplace. Providing attendeeId targets a
 * specific row (e.g. a rider row); without it the caller's primary is targeted.
 *
 * Offering the primary is blocked while the rider row is still confirmed — offer
 * or release the rider first.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireMember } from '@/lib/apiGuards';
import { getEventRowById, offerSpot } from '@/lib/queries/events';
import { SpotError } from '@/lib/queries/_tx';
import { isPastEvent } from '@/lib/eventRules';

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
    if (isPastEvent(eventRow)) {
      return NextResponse.json({ error: 'Cannot offer spots for past events' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const attendeeId: string | undefined = body?.attendeeId;

    const attendee = await offerSpot({ eventId, userId: ctx.user.id, attendeeId });
    return NextResponse.json({
      success: true,
      message: 'Spot is now available for others to claim',
      data: { attendeeId: attendee.id },
    });
  } catch (error) {
    if (error instanceof SpotError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Error offering spot:', error);
    return NextResponse.json(
      { error: 'Failed to offer spot', details: String(error) },
      { status: 500 }
    );
  }
}
