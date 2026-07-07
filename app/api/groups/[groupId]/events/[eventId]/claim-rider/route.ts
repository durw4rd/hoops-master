/**
 * Claim Rider API
 *
 * POST /api/groups/[groupId]/events/[eventId]/claim-rider
 *
 * Adds a Rider (+1) row for the caller (or for `targetUserEmail` when called by
 * a Capo/King). The caller must already hold a confirmed primary spot and the
 * event must have capacity. Costs the same as a primary spot.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireMember } from '@/lib/apiGuards';
import { getEventRowById, claimRiderSpot } from '@/lib/queries/events';
import { getUserRowByEmail } from '@/lib/queries/users';
import { SpotError } from '@/lib/queries/_tx';
import { spotMutationBlockedMessage, isSignupOpen } from '@/lib/eventRules';
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

    const eventRow = await getEventRowById(eventId);
    if (!eventRow || eventRow.groupId !== groupId) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }
    if (eventRow.status === 'cancelled') {
      return NextResponse.json({ error: 'This event has been cancelled' }, { status: 400 });
    }
    const blocked = spotMutationBlockedMessage(eventRow);
    if (blocked) {
      return NextResponse.json({ error: blocked }, { status: 400 });
    }

    if (targetUserEmail) {
      // Admin-assign path: Capo/King assigns a Rider for another player.
      if (!isCrewManager(ctx.member.groupRole)) {
        return NextResponse.json({ error: 'Only Capo or King can assign Rider spots' }, { status: 403 });
      }
      const targetUser = await getUserRowByEmail(targetUserEmail);
      if (!targetUser) {
        return NextResponse.json({ error: 'Player not found' }, { status: 404 });
      }
      const attendee = await claimRiderSpot({ eventId, userId: targetUser.id, byUserId: ctx.user.id });
      return NextResponse.json({
        success: true,
        message: `Rider added for ${targetUser.displayName}`,
        data: { attendeeId: attendee.id },
      });
    }

    // Self-claim path.
    if (!isSignupOpen(eventRow)) {
      return NextResponse.json(
        { error: 'Signup is not open yet', signupOpensAt: eventRow.signupOpensAt?.toISOString() },
        { status: 400 }
      );
    }
    const attendee = await claimRiderSpot({ eventId, userId: ctx.user.id });
    return NextResponse.json({
      success: true,
      message: "Rider claimed — you've got two in this game",
      data: { attendeeId: attendee.id },
    });
  } catch (error) {
    if (error instanceof SpotError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Error claiming Rider:', error);
    return NextResponse.json(
      { error: 'Failed to claim Rider', details: String(error) },
      { status: 500 }
    );
  }
}
