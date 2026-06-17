/**
 * Event Waitlist API
 *
 * POST   /api/groups/[groupId]/events/[eventId]/waitlist - join (FIFO)
 * DELETE /api/groups/[groupId]/events/[eventId]/waitlist - leave
 *
 * Joining is consent to be auto-assigned (and charged the slot cost) when a spot
 * is released and you are first in line.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireMember } from '@/lib/apiGuards';
import { getEventRowById } from '@/lib/queries/events';
import { joinWaitlist, leaveWaitlist } from '@/lib/queries/waitlist';
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
    if (eventRow.status === 'cancelled') {
      return NextResponse.json({ error: 'This event has been cancelled' }, { status: 400 });
    }
    if (isPastEvent(eventRow)) {
      return NextResponse.json({ error: 'Cannot join the waitlist for past events' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const forRider = body?.forRider === true;

    const result = await joinWaitlist({ eventId, userId: ctx.user.id, forRider });
    if (result.claimed) {
      return NextResponse.json({
        success: true,
        message: 'Spot claimed — you\'re in!',
        data: { position: 0, claimed: true },
      });
    }
    return NextResponse.json({
      success: true,
      message: `You are #${result.position} on the bench`,
      data: { position: result.position, claimed: false },
    });
  } catch (error) {
    if (error instanceof SpotError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Error joining waitlist:', error);
    return NextResponse.json(
      { error: 'Failed to join waitlist', details: String(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { groupId, eventId } = await params;
  const ctx = await requireMember(groupId);
  if (ctx instanceof NextResponse) return ctx;

  try {
    const body = await request.json().catch(() => ({}));
    const forRider = body?.forRider === true;

    await leaveWaitlist({ eventId, userId: ctx.user.id, forRider });
    return NextResponse.json({
      success: true,
      message: forRider ? 'Rider removed from the bench' : 'Left the waitlist',
    });
  } catch (error) {
    console.error('Error leaving waitlist:', error);
    return NextResponse.json(
      { error: 'Failed to leave waitlist', details: String(error) },
      { status: 500 }
    );
  }
}
