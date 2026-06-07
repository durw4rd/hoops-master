/**
 * Release Rider Spot API
 *
 * POST /api/groups/[groupId]/events/[eventId]/drop-rider
 *
 * Passes the caller's Rider spot to the first player on the Rider bench.
 * Requires at least one forRider=true waitlist entry — if the bench is empty,
 * the caller must use "Offer Rider" or "Hand Rider Over" instead.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireMember } from '@/lib/apiGuards';
import { getEventRowById, releaseRiderSpot } from '@/lib/queries/events';
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
      return NextResponse.json({ error: 'Cannot modify spots for past events' }, { status: 400 });
    }

    await releaseRiderSpot({ eventId, userId: ctx.user.id });

    return NextResponse.json({
      success: true,
      message: 'Rider spot passed to next on the bench',
    });
  } catch (error) {
    if (error instanceof SpotError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Error releasing Rider spot:', error);
    return NextResponse.json(
      { error: 'Failed to release Rider spot', details: String(error) },
      { status: 500 }
    );
  }
}
