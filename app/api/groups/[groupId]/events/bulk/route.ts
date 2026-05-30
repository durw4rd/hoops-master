/**
 * Bulk Create Events API
 *
 * POST /api/groups/[groupId]/events/bulk - Create multiple recurring events (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireGroupAdmin } from '@/lib/apiGuards';
import { bulkCreateEvents } from '@/lib/queries/events';
import { computeSignupOpensAt } from '@/lib/eventTiming';
import { AssignmentMode, EventType } from '@/lib/types';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

/** Generate YYYY-MM-DD strings for a weekly recurrence (computed in UTC to avoid tz drift). */
function generateRecurringDates(startDate: string, endDate: string, dayOfWeek: number): string[] {
  const dates: string[] = [];
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);
  const cur = new Date(Date.UTC(sy, sm - 1, sd));
  const end = new Date(Date.UTC(ey, em - 1, ed));
  while (cur.getUTCDay() !== dayOfWeek) cur.setUTCDate(cur.getUTCDate() + 1);
  while (cur <= end) {
    dates.push(cur.toISOString().split('T')[0]);
    cur.setUTCDate(cur.getUTCDate() + 7);
  }
  return dates;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { groupId } = await params;
  const ctx = await requireGroupAdmin(groupId);
  if (ctx instanceof NextResponse) return ctx;

  try {
    const timezone = ctx.group.timezone;
    const body = await request.json();
    const {
      startDate,
      endDate,
      dayOfWeek,
      startTime,
      endTime,
      totalSpots,
      slotCost,
      location,
      description,
      eventType,
      assignmentMode = 'player_signup',
      signupOpenType = 'immediate',
      signupOpenValue,
    } = body;

    if (!startDate || !endDate || dayOfWeek === undefined || !startTime || !endTime) {
      return NextResponse.json(
        { error: 'startDate, endDate, dayOfWeek, startTime, and endTime are required' },
        { status: 400 }
      );
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return NextResponse.json({ error: 'dates must be in YYYY-MM-DD format' }, { status: 400 });
    }
    if (dayOfWeek < 0 || dayOfWeek > 6) {
      return NextResponse.json({ error: 'dayOfWeek must be 0-6 (Sunday-Saturday)' }, { status: 400 });
    }
    if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
      return NextResponse.json({ error: 'times must be in HH:MM format' }, { status: 400 });
    }

    const dates = generateRecurringDates(startDate, endDate, dayOfWeek);
    if (dates.length === 0) {
      return NextResponse.json(
        { error: 'No dates found in the specified range for the given day of week' },
        { status: 400 }
      );
    }

    const inputs = dates.map((date) => ({
      date,
      startTime,
      endTime,
      totalSpots: totalSpots || ctx.group.defaultEventSpots,
      slotCost: slotCost ?? Number(ctx.group.defaultSlotCost),
      location,
      description,
      eventType: eventType as EventType,
      assignmentMode: assignmentMode as AssignmentMode,
      signupOpensAt: computeSignupOpensAt(timezone, date, startTime, signupOpenType, signupOpenValue),
    }));

    const created = await bulkCreateEvents(groupId, timezone, inputs, ctx.user.id);

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return NextResponse.json({
      success: true,
      data: created,
      count: created.length,
      message: `Created ${created.length} events for ${dayNames[dayOfWeek]}s`,
    });
  } catch (error) {
    console.error('Error creating bulk events:', error);
    return NextResponse.json(
      { error: 'Failed to create events', details: String(error) },
      { status: 500 }
    );
  }
}
