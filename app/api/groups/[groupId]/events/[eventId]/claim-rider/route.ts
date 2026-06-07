/**
 * Add Rider API
 *
 * POST /api/groups/[groupId]/events/[eventId]/claim-rider
 *
 * Body (optional): { targetUserEmail: string } — Capo/King can assign a Rider
 * for a player already in the event. Omit to add for yourself.
 *
 * Sets plusOne=true on the attendee row, consuming one extra slot.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireMember } from '@/lib/apiGuards';
import { getEventRowById, addRider } from '@/lib/queries/events';
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

    if (targetUserEmail) {
      // Admin-assign path: Capo/King assigns a Rider for someone else.
      if (!isCrewManager(ctx.member.groupRole)) {
        return NextResponse.json({ error: 'Only Capo or King can assign Rider spots' }, { status: 403 });
      }
      const targetUser = await getUserRowByEmail(targetUserEmail);
      if (!targetUser) {
        return NextResponse.json({ error: 'Player not found' }, { status: 404 });
      }
      const attendee = await addRider({ eventId, userId: targetUser.id, byUserId: ctx.user.id });
      return NextResponse.json({
        success: true,
        message: `Rider added for ${targetUser.displayName}`,
        data: { attendeeId: attendee.id },
      });
    }

    // Self-add path.
    if (!isSignupOpen(eventRow)) {
      return NextResponse.json(
        { error: 'Signup is not open yet', signupOpensAt: eventRow.signupOpensAt?.toISOString() },
        { status: 400 }
      );
    }
    const attendee = await addRider({ eventId, userId: ctx.user.id });
    return NextResponse.json({
      success: true,
      message: "Rider added — you've got two in this game",
      data: { attendeeId: attendee.id },
    });
  } catch (error) {
    if (error instanceof SpotError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Error adding Rider:', error);
    return NextResponse.json(
      { error: 'Failed to add Rider', details: String(error) },
      { status: 500 }
    );
  }
}
