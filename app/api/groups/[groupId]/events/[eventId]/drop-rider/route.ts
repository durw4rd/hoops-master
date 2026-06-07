/**
 * Drop Rider API
 *
 * POST /api/groups/[groupId]/events/[eventId]/drop-rider
 *
 * Removes the plusOne from the caller's spot. If a player is on the rider
 * bench, they are auto-promoted (zero-sum). Otherwise the caller is credited.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireMember } from '@/lib/apiGuards';
import { getEventRowById, dropRider } from '@/lib/queries/events';
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

    await dropRider({ eventId, userId: ctx.user.id });

    return NextResponse.json({
      success: true,
      message: 'Rider dropped',
    });
  } catch (error) {
    if (error instanceof SpotError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Error dropping Rider:', error);
    return NextResponse.json(
      { error: 'Failed to drop Rider', details: String(error) },
      { status: 500 }
    );
  }
}
