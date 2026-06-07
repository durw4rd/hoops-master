/**
 * Claim Rider Spot API
 *
 * POST /api/groups/[groupId]/events/[eventId]/claim-rider
 *
 * Adds a Rider (plus-one) spot for the caller. Requires them to already hold
 * a confirmed primary spot in the event. Costs the same as a primary spot.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireMember } from '@/lib/apiGuards';
import { getEventRowById, claimRiderSpot } from '@/lib/queries/events';
import { SpotError } from '@/lib/queries/_tx';
import { isPastEvent, isSignupOpen } from '@/lib/eventRules';

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
    if (eventRow.status === 'cancelled') {
      return NextResponse.json({ error: 'This event has been cancelled' }, { status: 400 });
    }
    if (isPastEvent(eventRow)) {
      return NextResponse.json({ error: 'Cannot claim spots for past events' }, { status: 400 });
    }
    if (!isSignupOpen(eventRow)) {
      return NextResponse.json(
        { error: 'Signup is not open yet', signupOpensAt: eventRow.signupOpensAt?.toISOString() },
        { status: 400 }
      );
    }

    const attendee = await claimRiderSpot({ eventId, userId: ctx.user.id });

    return NextResponse.json({
      success: true,
      message: "Rider spot claimed — you've got two in this game",
      data: { attendeeId: attendee.id },
    });
  } catch (error) {
    if (error instanceof SpotError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Error claiming Rider spot:', error);
    return NextResponse.json(
      { error: 'Failed to claim Rider spot', details: String(error) },
      { status: 500 }
    );
  }
}
