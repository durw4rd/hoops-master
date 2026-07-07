/**
 * Bulk Create Events API
 *
 * POST /api/groups/[groupId]/events/bulk - Create multiple recurring events (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireCrewManager } from '@/lib/apiGuards';
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
  const ctx = await requireCrewManager(groupId);
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
      events: explicitBlocks,
    } = body;

    // Resolve the concrete event blocks: either an explicit list (multi-slot /
    // block-split weekly schedule computed by the client) or a single weekly
    // recurrence (legacy single day/time).
    let blocks: { date: string; startTime: string; endTime: string }[];

    if (Array.isArray(explicitBlocks) && explicitBlocks.length > 0) {
      for (const b of explicitBlocks) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(b?.date ?? '')) {
          return NextResponse.json({ error: 'each block needs a YYYY-MM-DD date' }, { status: 400 });
        }
        if (!/^\d{2}:\d{2}$/.test(b?.startTime ?? '') || !/^\d{2}:\d{2}$/.test(b?.endTime ?? '')) {
          return NextResponse.json({ error: 'each block needs HH:MM times' }, { status: 400 });
        }
      }
      blocks = explicitBlocks.map((b) => ({
        date: b.date,
        startTime: b.startTime,
        endTime: b.endTime,
      }));
    } else {
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
      blocks = generateRecurringDates(startDate, endDate, dayOfWeek).map((date) => ({
        date,
        startTime,
        endTime,
      }));
    }

    if (blocks.length === 0) {
      return NextResponse.json(
        { error: 'No games found for the specified schedule and date range' },
        { status: 400 }
      );
    }

    if (eventType === 'special' || eventType === 'tournament') {
      return NextResponse.json(
        { error: 'Special events can only be created one at a time via Drop It' },
        { status: 400 }
      );
    }

    const pricingMode =
      body.pricingMode === 'split_total' || body.pricingMode === 'per_spot'
        ? body.pricingMode
        : ctx.group.defaultPricingMode === 'split_total'
          ? 'split_total'
          : 'per_spot';

    const inputs = blocks.map((b) => ({
      date: b.date,
      startTime: b.startTime,
      endTime: b.endTime,
      totalSpots: totalSpots || ctx.group.defaultEventSpots,
      pricingMode,
      slotCost:
        pricingMode === 'per_spot'
          ? (slotCost ?? Number(ctx.group.defaultSlotCost))
          : 0,
      totalCost:
        pricingMode === 'split_total'
          ? (body.totalCost ?? Number(ctx.group.defaultTotalCost))
          : 0,
      location,
      description,
      eventType: eventType as EventType,
      assignmentMode: assignmentMode as AssignmentMode,
      signupOpensAt: computeSignupOpensAt(timezone, b.date, b.startTime, signupOpenType, signupOpenValue),
    }));

    const created = await bulkCreateEvents(groupId, timezone, inputs, ctx.user.id);

    return NextResponse.json({
      success: true,
      data: created,
      count: created.length,
      message: `Created ${created.length} games`,
    });
  } catch (error) {
    console.error('Error creating bulk events:', error);
    return NextResponse.json(
      { error: 'Failed to create events', details: String(error) },
      { status: 500 }
    );
  }
}
