/**
 * Reassign Event Spot API
 *
 * POST /api/groups/[groupId]/events/[eventId]/reassign
 * Body: { attendeeId?: string, fromUserEmail?: string, toUserEmail: string }
 *
 * Members may reassign their OWN spot. Group admins may reassign any spot
 * (or fill a fresh one if capacity allows).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireMember } from '@/lib/apiGuards';
import { getEventRowById, reassignSpot } from '@/lib/queries/events';
import { getActiveMembersWithUsers } from '@/lib/queries/groups';
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
      return NextResponse.json({ error: 'Cannot reassign spots for past events' }, { status: 400 });
    }

    const body = await request.json();
    const { attendeeId, fromUserEmail, toUserEmail } = body ?? {};
    if (!toUserEmail) {
      return NextResponse.json({ error: 'toUserEmail is required' }, { status: 400 });
    }

    const members = await getActiveMembersWithUsers(groupId);
    const emailToId = new Map(members.map((m) => [m.email.toLowerCase(), m.membership.userId]));

    const toUserId = emailToId.get(String(toUserEmail).toLowerCase());
    if (!toUserId) {
      return NextResponse.json(
        { error: 'Target user is not an active member of this group' },
        { status: 400 }
      );
    }

    const isAdmin = ctx.member.groupRole === 'admin';
    const fromUserId = fromUserEmail ? emailToId.get(String(fromUserEmail).toLowerCase()) : undefined;

    // Non-admins may only give up their own spot.
    if (!isAdmin) {
      if (attendeeId) {
        return NextResponse.json(
          { error: 'Only admins can reassign by attendee id' },
          { status: 403 }
        );
      }
      if (fromUserId && fromUserId !== ctx.user.id) {
        return NextResponse.json({ error: 'You can only reassign your own spot' }, { status: 403 });
      }
    }

    const effectiveFromUserId = isAdmin ? fromUserId : ctx.user.id;

    const attendee = await reassignSpot({
      eventId,
      toUserId,
      fromUserId: effectiveFromUserId,
      attendeeId: isAdmin ? attendeeId : undefined,
      byUserId: ctx.user.id,
      isAdmin,
    });

    return NextResponse.json({
      success: true,
      message: `Spot reassigned to ${toUserEmail}`,
      data: { eventId, attendeeId: attendee.id, newHolder: toUserEmail },
    });
  } catch (error) {
    if (error instanceof SpotError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Error reassigning spot:', error);
    return NextResponse.json(
      { error: 'Failed to reassign spot', details: String(error) },
      { status: 500 }
    );
  }
}
