/**
 * Drop Rider Spot API
 *
 * POST /api/groups/[groupId]/events/[eventId]/drop-rider
 *
 * Removes the caller's Rider (plus-one) spot, refunding the slot cost.
 * The primary spot is unaffected.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireMember } from '@/lib/apiGuards';
import { getEventRowById, dropRiderSpot } from '@/lib/queries/events';
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
      return NextResponse.json({ error: 'Cannot drop spots for past events' }, { status: 400 });
    }

    await dropRiderSpot({ eventId, userId: ctx.user.id });

    return NextResponse.json({
      success: true,
      message: 'Rider spot dropped and refunded',
    });
  } catch (error) {
    if (error instanceof SpotError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Error dropping Rider spot:', error);
    return NextResponse.json(
      { error: 'Failed to drop Rider spot', details: String(error) },
      { status: 500 }
    );
  }
}
