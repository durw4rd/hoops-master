/**
 * Claim Event Spot API
 *
 * POST /api/groups/[groupId]/events/[eventId]/claim
 * Body: { attendeeId?: string }
 *  - attendeeId present: claim that offered spot (transfer, zero-sum)
 *  - absent: self sign-up into an empty spot (signup, from_user = NULL)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireMember } from '@/lib/apiGuards';
import { getEventRowById, claimSpot } from '@/lib/queries/events';
import { SpotError } from '@/lib/queries/_tx';
import { spotMutationBlockedMessage, isSignupOpen } from '@/lib/eventRules';

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
    const blocked = spotMutationBlockedMessage(eventRow);
    if (blocked) {
      return NextResponse.json({ error: blocked }, { status: 400 });
    }
    if (!isSignupOpen(eventRow)) {
      return NextResponse.json(
        { error: 'Signup is not open yet', signupOpensAt: eventRow.signupOpensAt?.toISOString() },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { attendeeId } = body ?? {};

    const attendee = await claimSpot({ eventId, userId: ctx.user.id, attendeeId });

    return NextResponse.json({
      success: true,
      message: attendeeId ? 'Successfully claimed the offered spot' : 'Successfully claimed a spot',
      data: { attendeeId: attendee.id },
    });
  } catch (error) {
    if (error instanceof SpotError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Error claiming spot:', error);
    return NextResponse.json(
      { error: 'Failed to claim spot', details: String(error) },
      { status: 500 }
    );
  }
}
