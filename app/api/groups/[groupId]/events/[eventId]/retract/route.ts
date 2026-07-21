/**
 * Retract Offered Spot API
 *
 * POST /api/groups/[groupId]/events/[eventId]/retract
 * Body (optional): { attendeeId: string }
 *
 * Takes back an offered spot before it is claimed. Providing attendeeId targets
 * a specific row (e.g. a rider row); without it the caller's primary is targeted.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireMember } from '@/lib/apiGuards';
import { getEventRowById, retractOffer } from '@/lib/queries/events';
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

    // Players cannot retract on past/cancelled/locked games; Capo/King may
    // retract on past games to clean up rows stuck 'offered' after tip-off.
    const isAdmin = isCrewManager(ctx.member.groupRole);
    const blocked = spotMutationBlockedMessage(eventRow, { actorIsManager: isAdmin });
    if (blocked) {
      return NextResponse.json({ error: blocked }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const attendeeId: string | undefined = body?.attendeeId;

    const attendee = await retractOffer({ eventId, userId: ctx.user.id, attendeeId, isAdmin });
    return NextResponse.json({
      success: true,
      message: 'Spot offer retracted',
      data: { attendeeId: attendee.id },
    });
  } catch (error) {
    if (error instanceof SpotError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Error retracting offer:', error);
    return NextResponse.json(
      { error: 'Failed to retract offer', details: String(error) },
      { status: 500 }
    );
  }
}
