/**
 * Release Spot API
 *
 * POST /api/groups/[groupId]/events/[eventId]/release
 *
 * Gives up your spot. If a waitlist exists, the earliest-joined member is
 * auto-promoted (zero-sum waitlist_promote). Otherwise the spot becomes open.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireMember } from '@/lib/apiGuards';
import { getEventRowById } from '@/lib/queries/events';
import { releaseSpot } from '@/lib/queries/waitlist';
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
      return NextResponse.json({ error: 'Cannot release spots for past events' }, { status: 400 });
    }

    const result = await releaseSpot({ eventId, userId: ctx.user.id });
    return NextResponse.json({
      success: true,
      message: result.promotedUserId
        ? 'Spot released and passed to the next person on the waitlist'
        : 'Spot released and now open',
      data: result,
    });
  } catch (error) {
    if (error instanceof SpotError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Error releasing spot:', error);
    return NextResponse.json(
      { error: 'Failed to release spot', details: String(error) },
      { status: 500 }
    );
  }
}
