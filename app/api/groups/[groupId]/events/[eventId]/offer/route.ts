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
import { spotMutationBlockedMessage } from '@/lib/eventRules';
import { isCrewManager } from '@/lib/roles';

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

    const body = await request.json().catch(() => ({}));
    const attendeeId: string | undefined = body?.attendeeId;

    // Capo/King may offer any player's spot on their behalf (identical bench
    // + credit semantics; the holder keeps funding until claimed). Offering
    // stays blocked on past games for everyone — the marketplace is
    // meaningless once the game has been played.
    const isAdmin = isCrewManager(ctx.member.groupRole);
    const attendee = await offerSpot({ eventId, userId: ctx.user.id, attendeeId, isAdmin });
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
