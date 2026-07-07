/**
 * Release Rider API
 *
 * POST /api/groups/[groupId]/events/[eventId]/drop-rider
 *
 * Releases the caller's confirmed Rider slot to the first player on the Rider
 * bench (forRider=true waitlist). Throws a 400 if the bench is empty — the
 * player should use the offer endpoint with their rider's attendeeId instead.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireMember } from '@/lib/apiGuards';
import { getEventRowById, releaseRiderSpot } from '@/lib/queries/events';
import { SpotError } from '@/lib/queries/_tx';
import { spotMutationBlockedMessage } from '@/lib/eventRules';

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
    const blocked = spotMutationBlockedMessage(eventRow);
    if (blocked) {
      return NextResponse.json({ error: blocked }, { status: 400 });
    }

    await releaseRiderSpot({ eventId, userId: ctx.user.id });

    return NextResponse.json({
      success: true,
      message: 'Rider released to the Rider bench',
    });
  } catch (error) {
    if (error instanceof SpotError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Error releasing Rider:', error);
    return NextResponse.json(
      { error: 'Failed to release Rider', details: String(error) },
      { status: 500 }
    );
  }
}
