/**
 * Unassign Event Spot API
 *
 * POST /api/groups/[groupId]/events/[eventId]/unassign
 * Body: { attendeeId: string }
 *
 * Crew Capo / King only. Removes a player from a game with no replacement and
 * reverses the spot's credit effects (the holder is refunded).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireCrewManager } from '@/lib/apiGuards';
import { getEventRowById, adminUnassignSpot } from '@/lib/queries/events';
import { SpotError } from '@/lib/queries/_tx';
import { isPastEvent } from '@/lib/eventRules';

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
    if (isPastEvent(eventRow)) {
      return NextResponse.json({ error: 'Cannot unassign spots for past events' }, { status: 400 });
    }

    const body = await request.json();
    const { attendeeId } = body ?? {};
    if (!attendeeId) {
      return NextResponse.json({ error: 'attendeeId is required' }, { status: 400 });
    }

    await adminUnassignSpot({ eventId, attendeeId });

    return NextResponse.json({ success: true, message: 'Player removed from the game' });
  } catch (error) {
    if (error instanceof SpotError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Error unassigning spot:', error);
    return NextResponse.json(
      { error: 'Failed to unassign spot', details: String(error) },
      { status: 500 }
    );
  }
}
