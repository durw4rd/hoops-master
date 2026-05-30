/**
 * Individual Event API
 *
 * GET    /api/groups/[groupId]/events/[eventId] - Get event with attendees + waitlist
 * DELETE /api/groups/[groupId]/events/[eventId] - Cancel event (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireMember, requireGroupAdmin } from '@/lib/apiGuards';
import {
  getEventRowById,
  getEventAttendees,
  getWaitlistEntries,
  toEventDTO,
  updateEventStatus,
} from '@/lib/queries/events';

interface RouteParams {
  params: Promise<{ groupId: string; eventId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { groupId, eventId } = await params;
  const ctx = await requireMember(groupId);
  if (ctx instanceof NextResponse) return ctx;

  try {
    const eventRow = await getEventRowById(eventId);
    if (!eventRow || eventRow.groupId !== groupId) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const [attendees, waitlist] = await Promise.all([
      getEventAttendees(eventId),
      getWaitlistEntries(eventId),
    ]);

    const dto = toEventDTO(eventRow, ctx.group.timezone);
    const userAttendance = attendees.find(
      (a) => a.userEmail.toLowerCase() === ctx.user.email.toLowerCase()
    );
    const myWaitlist = waitlist.find(
      (w) => w.userEmail.toLowerCase() === ctx.user.email.toLowerCase()
    );

    // Occupancy includes confirmed + offered spots (an offered spot is still held
    // until claimed, so it does not free a general signup slot).
    const occupancy = attendees.filter(
      (a) => a.status === 'confirmed' || a.status === 'offered'
    ).length;
    const availableSpots = Math.max(0, dto.totalSpots - occupancy);

    return NextResponse.json({
      success: true,
      data: {
        ...dto,
        attendees,
        waitlist,
        availableSpots,
        isAttending: !!userAttendance,
        myAttendance: userAttendance || null,
        myWaitlistPosition: myWaitlist ? myWaitlist.position : null,
      },
    });
  } catch (error) {
    console.error('Error fetching event:', error);
    return NextResponse.json(
      { error: 'Failed to fetch event', details: String(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { groupId, eventId } = await params;
  const ctx = await requireGroupAdmin(groupId);
  if (ctx instanceof NextResponse) return ctx;

  try {
    const eventRow = await getEventRowById(eventId);
    if (!eventRow || eventRow.groupId !== groupId) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }
    await updateEventStatus(eventId, 'cancelled');
    return NextResponse.json({ success: true, message: 'Event cancelled successfully' });
  } catch (error) {
    console.error('Error cancelling event:', error);
    return NextResponse.json(
      { error: 'Failed to cancel event', details: String(error) },
      { status: 500 }
    );
  }
}
