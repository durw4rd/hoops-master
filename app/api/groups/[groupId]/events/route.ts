/**
 * Group Events API
 *
 * GET  /api/groups/[groupId]/events - List events for a group
 * POST /api/groups/[groupId]/events - Create a new event (admin only)
 *
 * Assignment modes: admin_assign | player_signup | round_robin.
 * For admin_assign, pass `assignedUsers: [email, ...]` to pre-fill spots.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireMember, requireCrewManager } from '@/lib/apiGuards';
import {
  getEventRows,
  createEvent,
  getCountsForEvents,
  getUserStatusForEvents,
  getWaitlistCountsForEvents,
  toEventDTO,
  fillSpots,
} from '@/lib/queries/events';
import { getActiveMembersWithUsers } from '@/lib/queries/groups';
import { computeSignupOpensAt } from '@/lib/eventTiming';
import { AssignmentMode } from '@/lib/types';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { groupId } = await params;
  const ctx = await requireMember(groupId);
  if (ctx instanceof NextResponse) return ctx;

  try {
    const sp = request.nextUrl.searchParams;
    const includePast = sp.get('includePast') === 'true';

    const rows = (await getEventRows(groupId, { includePast })).filter((e) => e.status !== 'cancelled');
    const ids = rows.map((r) => r.id);
    const counts = await getCountsForEvents(ids);
    const myStatus = await getUserStatusForEvents(ctx.user.id, ids);
    const waitlistCounts = await getWaitlistCountsForEvents(ids);

    const data = rows.map((row) => {
      const dto = toEventDTO(row, ctx.group.timezone);
      const c = counts.get(row.id) ?? { confirmed: 0, offered: 0, occupancy: 0 };
      const s = myStatus.get(row.id) ?? { attending: false, onWaitlist: false, hasRider: false };
      return {
        ...dto,
        attendeeCount: c.confirmed,
        offeredCount: c.offered,
        availableSpots: row.totalSpots - c.occupancy,
        waitlistCount: waitlistCounts.get(row.id) ?? 0,
        isAttending: s.attending,
        onWaitlist: s.onWaitlist,
        hasRider: s.hasRider,
      };
    });

    return NextResponse.json({ success: true, data, count: data.length });
  } catch (error) {
    console.error('Error fetching events:', error);
    return NextResponse.json(
      { error: 'Failed to fetch events', details: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { groupId } = await params;
  const ctx = await requireCrewManager(groupId);
  if (ctx instanceof NextResponse) return ctx;

  try {
    const timezone = ctx.group.timezone;
    const body = await request.json();
    const {
      date,
      startTime,
      endTime,
      totalSpots,
      slotCost,
      location,
      name,
      description,
      bannerUrl,
      bannerOrientation,
      eventType: rawEventType,
      assignmentMode = 'admin_assign',
      assignedUsers,
      signupOpenType = 'immediate',
      signupOpenValue,
    } = body;

    if (!date || !startTime || !endTime) {
      return NextResponse.json({ error: 'date, startTime, and endTime are required' }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'date must be in YYYY-MM-DD format' }, { status: 400 });
    }
    if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
      return NextResponse.json({ error: 'times must be in HH:MM format' }, { status: 400 });
    }

    const signupOpensAt = computeSignupOpensAt(timezone, date, startTime, signupOpenType, signupOpenValue);

    const eventType =
      rawEventType === 'special' || rawEventType === 'tournament'
        ? 'special'
        : rawEventType === 'regular'
          ? 'regular'
          : 'regular';
    if (bannerOrientation && bannerOrientation !== 'landscape' && bannerOrientation !== 'portrait') {
      return NextResponse.json({ error: 'bannerOrientation must be landscape or portrait' }, { status: 400 });
    }

    const event = await createEvent(
      groupId,
      timezone,
      {
        date,
        startTime,
        endTime,
        totalSpots: totalSpots || ctx.group.defaultEventSpots,
        slotCost: slotCost ?? Number(ctx.group.defaultSlotCost),
        location,
        name: eventType === 'special' ? (name ?? '') : '',
        description,
        bannerUrl: eventType === 'special' ? (bannerUrl ?? null) : null,
        bannerOrientation: eventType === 'special' ? (bannerOrientation ?? 'landscape') : 'landscape',
        eventType,
        assignmentMode: assignmentMode as AssignmentMode,
        signupOpensAt,
      },
      ctx.user.id
    );

    // Pre-assign players for admin_assign mode.
    let assigned: string[] = [];
    if (assignmentMode === 'admin_assign' && Array.isArray(assignedUsers) && assignedUsers.length) {
      const members = await getActiveMembersWithUsers(groupId);
      const emailToId = new Map(members.map((m) => [m.email.toLowerCase(), m.membership.userId]));
      const toUserIds = assignedUsers
        .map((e: string) => emailToId.get(String(e).toLowerCase()))
        .filter((id: string | undefined): id is string => !!id);
      if (toUserIds.length) {
        const res = await fillSpots({
          eventId: event.eventId,
          toUserIds,
          assignedById: ctx.user.id,
          type: 'admin_assign',
        });
        assigned = res.assigned;
      }
    }

    return NextResponse.json({
      success: true,
      data: { ...event, assignedCount: assigned.length },
      message: 'Event created successfully',
    });
  } catch (error) {
    console.error('Error creating event:', error);
    return NextResponse.json(
      { error: 'Failed to create event', details: String(error) },
      { status: 500 }
    );
  }
}
