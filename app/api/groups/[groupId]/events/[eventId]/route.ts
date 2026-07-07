/**
 * Individual Event API
 *
 * GET    /api/groups/[groupId]/events/[eventId] - Get event with attendees + waitlist
 * PATCH  /api/groups/[groupId]/events/[eventId] - Edit event (Capo / King)
 * DELETE /api/groups/[groupId]/events/[eventId] - Delete event (Capo / King)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireMember, requireCrewManager } from '@/lib/apiGuards';
import {
  getEventRowById,
  getEventAttendees,
  getWaitlistEntries,
  toEventDTO,
  updateEvent,
  deleteEvent,
} from '@/lib/queries/events';
import { computeSignupOpensAt } from '@/lib/eventTiming';
import type { AssignmentMode, RemainderPolicy } from '@/lib/types';
import { computeSplitFinalize } from '@/lib/queries/pricing';

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
    // Primary row: userEmail matches and it is not a rider row (parentAttendeeId is null).
    const userAttendance = attendees.find(
      (a) => a.userEmail.toLowerCase() === ctx.user.email.toLowerCase() && !a.isPlusOne
    );
    const myBenchEntry = waitlist.find(
      (w) => w.userEmail.toLowerCase() === ctx.user.email.toLowerCase()
    );

    // Occupancy = one slot per attendee row (each rider row is a separate row).
    // Offered spots still count toward occupancy (held until claimed).
    const occupancy = attendees.length;
    const availableSpots = Math.max(0, dto.totalSpots - occupancy);
    const splitPreview =
      dto.pricingMode === 'split_total' && !dto.pricingFinalizedAt
        ? computeSplitFinalize(eventRow, occupancy)
        : null;

    return NextResponse.json({
      success: true,
      data: {
        ...dto,
        attendees,
        waitlist,
        availableSpots,
        occupancy,
        splitPreview,
        isAttending: !!userAttendance,
        myAttendance: userAttendance || null,
        myWaitlistPosition: myBenchEntry ? myBenchEntry.position : null,
        myRiderWaitlistPosition: null,
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

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { groupId, eventId } = await params;
  const ctx = await requireCrewManager(groupId);
  if (ctx instanceof NextResponse) return ctx;

  try {
    const timezone = ctx.group.timezone;
    const eventRow = await getEventRowById(eventId);
    if (!eventRow || eventRow.groupId !== groupId) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const body = await request.json();
    const {
      date,
      startTime,
      endTime,
      totalSpots,
      slotCost,
      pricingMode,
      totalCost,
      location,
      name,
      description,
      bannerUrl,
      bannerOrientation,
      eventType: rawEventType,
      assignmentMode,
      signupOpenType,
      signupOpenValue,
    } = body;

    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'date must be in YYYY-MM-DD format' }, { status: 400 });
    }
    if ((startTime && !/^\d{2}:\d{2}$/.test(startTime)) || (endTime && !/^\d{2}:\d{2}$/.test(endTime))) {
      return NextResponse.json({ error: 'times must be in HH:MM format' }, { status: 400 });
    }

    let signupOpensAt: string | null | undefined;
    if (signupOpenType !== undefined) {
      const start = toEventDTO(eventRow, timezone);
      signupOpensAt = computeSignupOpensAt(
        timezone,
        date ?? start.date,
        startTime ?? start.startTime,
        signupOpenType,
        signupOpenValue
      );
    }

    const eventType =
      rawEventType === 'special' || rawEventType === 'tournament'
        ? 'special'
        : rawEventType === 'regular'
          ? 'regular'
          : undefined;
    if (bannerOrientation && bannerOrientation !== 'landscape' && bannerOrientation !== 'portrait') {
      return NextResponse.json({ error: 'bannerOrientation must be landscape or portrait' }, { status: 400 });
    }

    const updated = await updateEvent(eventId, timezone, {
      date,
      startTime,
      endTime,
      totalSpots,
      slotCost,
      pricingMode,
      totalCost,
      location,
      ...(eventType === 'regular' ? { name: '' } : name !== undefined ? { name } : {}),
      description,
      bannerUrl: bannerUrl !== undefined ? bannerUrl : undefined,
      bannerOrientation,
      eventType,
      assignmentMode: assignmentMode as AssignmentMode | undefined,
      signupOpensAt,
    });

    return NextResponse.json({ success: true, data: updated, message: 'Event updated' });
  } catch (error) {
    console.error('Error updating event:', error);
    return NextResponse.json(
      { error: 'Failed to update event', details: String(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { groupId, eventId } = await params;
  const ctx = await requireCrewManager(groupId);
  if (ctx instanceof NextResponse) return ctx;

  try {
    const eventRow = await getEventRowById(eventId);
    if (!eventRow || eventRow.groupId !== groupId) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }
    await deleteEvent(eventId);
    return NextResponse.json({ success: true, message: 'Event deleted successfully' });
  } catch (error) {
    console.error('Error deleting event:', error);
    return NextResponse.json(
      { error: 'Failed to delete event', details: String(error) },
      { status: 500 }
    );
  }
}
