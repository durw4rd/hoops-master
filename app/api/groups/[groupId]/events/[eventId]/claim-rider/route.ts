/**
 * Claim Rider Spot API
 *
 * POST /api/groups/[groupId]/events/[eventId]/claim-rider
 *
 * Body (optional): { targetUserEmail: string } — Capo/King can assign a Rider
 * spot for a player who's already in the event. Omit to claim for yourself.
 *
 * Costs the same as a primary spot for the target user.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireMember, requireCrewManager } from '@/lib/apiGuards';
import { getEventRowById, claimRiderSpot } from '@/lib/queries/events';
import { getUserRowByEmail } from '@/lib/queries/users';
import { SpotError } from '@/lib/queries/_tx';
import { isPastEvent, isSignupOpen } from '@/lib/eventRules';
import { isCrewManager } from '@/lib/roles';

interface RouteParams {
  params: Promise<{ groupId: string; eventId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { groupId, eventId } = await params;
  const ctx = await requireMember(groupId);
  if (ctx instanceof NextResponse) return ctx;

  try {
    const body = await request.json().catch(() => ({}));
    const { targetUserEmail } = body ?? {};

    // Admin-assign path: Capo/King can assign a Rider for someone else.
    if (targetUserEmail) {
      if (!isCrewManager(ctx.member.groupRole)) {
        return NextResponse.json({ error: 'Only Capo or King can assign Rider spots' }, { status: 403 });
      }
      const targetUser = await getUserRowByEmail(targetUserEmail);
      if (!targetUser) {
        return NextResponse.json({ error: 'Player not found' }, { status: 404 });
      }

      const eventRow = await getEventRowById(eventId);
      if (!eventRow || eventRow.groupId !== groupId) {
        return NextResponse.json({ error: 'Event not found' }, { status: 404 });
      }
      if (eventRow.status === 'cancelled') {
        return NextResponse.json({ error: 'This event has been cancelled' }, { status: 400 });
      }
      if (isPastEvent(eventRow)) {
        return NextResponse.json({ error: 'Cannot assign Rider spots for past events' }, { status: 400 });
      }

      const attendee = await claimRiderSpot({ eventId, userId: targetUser.id });
      return NextResponse.json({
        success: true,
        message: `Rider spot assigned for ${targetUser.displayName}`,
        data: { attendeeId: attendee.id },
      });
    }

    // Self-claim path.
    const eventRow = await getEventRowById(eventId);
    if (!eventRow || eventRow.groupId !== groupId) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }
    if (eventRow.status === 'cancelled') {
      return NextResponse.json({ error: 'This event has been cancelled' }, { status: 400 });
    }
    if (isPastEvent(eventRow)) {
      return NextResponse.json({ error: 'Cannot claim spots for past events' }, { status: 400 });
    }
    if (!isSignupOpen(eventRow)) {
      return NextResponse.json(
        { error: 'Signup is not open yet', signupOpensAt: eventRow.signupOpensAt?.toISOString() },
        { status: 400 }
      );
    }

    const attendee = await claimRiderSpot({ eventId, userId: ctx.user.id });
    return NextResponse.json({
      success: true,
      message: "Rider spot claimed — you've got two in this game",
      data: { attendeeId: attendee.id },
    });
  } catch (error) {
    if (error instanceof SpotError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Error claiming Rider spot:', error);
    return NextResponse.json(
      { error: 'Failed to claim Rider spot', details: String(error) },
      { status: 500 }
    );
  }
}
