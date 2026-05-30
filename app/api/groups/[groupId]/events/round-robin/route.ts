/**
 * Round-Robin Event Generation API (admin only)
 *
 * POST /api/groups/[groupId]/events/round-robin
 * Body: {
 *   events: [{ date, startTime, endTime, totalSpots?, slotCost?, location?, description? }],
 *   slide?: number,        // defaults to group.roundRobinSlide
 *   startOffset?: number,  // roster start index for the first event (default 0)
 *   preview?: boolean       // if true, do not persist — return planned assignments + counts
 * }
 *
 * Assigns players via a sliding window over the ACTIVE roster. Each assignment
 * records a `round_robin_assign` ledger row (from_user = NULL) so it costs credit.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireGroupAdmin } from '@/lib/apiGuards';
import { createEvent, fillSpots } from '@/lib/queries/events';
import { getActiveRosterUserIds } from '@/lib/queries/roundRobin';
import { getActiveMembersWithUsers } from '@/lib/queries/groups';
import { computeSignupOpensAt } from '@/lib/eventTiming';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

interface RREventInput {
  date: string;
  startTime: string;
  endTime: string;
  totalSpots?: number;
  slotCost?: number;
  location?: string;
  description?: string;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { groupId } = await params;
  const ctx = await requireGroupAdmin(groupId);
  if (ctx instanceof NextResponse) return ctx;

  try {
    const timezone = ctx.group.timezone;
    const body = await request.json();
    const events: RREventInput[] = body?.events;
    const slide: number = body?.slide ?? ctx.group.roundRobinSlide ?? 1;
    const startOffset: number = body?.startOffset ?? 0;
    const preview: boolean = body?.preview === true;

    if (!Array.isArray(events) || events.length === 0) {
      return NextResponse.json({ error: 'events array is required' }, { status: 400 });
    }

    const rosterIds = await getActiveRosterUserIds(groupId);
    if (rosterIds.length === 0) {
      return NextResponse.json(
        { error: 'Round-robin roster is empty. Configure the roster first.' },
        { status: 400 }
      );
    }

    const members = await getActiveMembersWithUsers(groupId);
    const idToEmail = new Map(members.map((m) => [m.membership.userId, m.email]));
    const N = rosterIds.length;

    // Plan windows.
    const counts = new Map<string, number>();
    for (const id of rosterIds) counts.set(id, 0);

    const planned = events.map((ev, k) => {
      const spots = ev.totalSpots ?? ctx.group.defaultEventSpots;
      const take = Math.min(spots, N);
      const start = (((startOffset + k * slide) % N) + N) % N;
      const userIds: string[] = [];
      for (let i = 0; i < take; i++) {
        const id = rosterIds[(start + i) % N];
        userIds.push(id);
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      return { input: ev, offset: start, userIds };
    });

    const fairness = Array.from(counts.entries()).map(([id, count]) => ({
      userEmail: idToEmail.get(id) ?? id,
      count,
    }));

    if (preview) {
      return NextResponse.json({
        success: true,
        preview: true,
        data: {
          rosterSize: N,
          slide,
          fairness,
          events: planned.map((p) => ({
            date: p.input.date,
            startTime: p.input.startTime,
            endTime: p.input.endTime,
            offset: p.offset,
            assignedEmails: p.userIds.map((id) => idToEmail.get(id) ?? id),
          })),
        },
      });
    }

    // Persist: create each event then fill its window.
    const created = [];
    for (const p of planned) {
      const event = await createEvent(
        groupId,
        timezone,
        {
          date: p.input.date,
          startTime: p.input.startTime,
          endTime: p.input.endTime,
          totalSpots: p.input.totalSpots ?? ctx.group.defaultEventSpots,
          slotCost: p.input.slotCost ?? Number(ctx.group.defaultSlotCost),
          location: p.input.location,
          description: p.input.description,
          assignmentMode: 'round_robin',
          signupOpensAt: computeSignupOpensAt(timezone, p.input.date, p.input.startTime, 'immediate'),
          roundRobinOffset: p.offset,
        },
        ctx.user.id
      );
      const res = await fillSpots({
        eventId: event.eventId,
        toUserIds: p.userIds,
        assignedById: ctx.user.id,
        type: 'round_robin_assign',
        notes: 'Round-robin auto-assignment',
      });
      created.push({
        ...event,
        assignedEmails: res.assigned.map((id) => idToEmail.get(id) ?? id),
      });
    }

    return NextResponse.json({
      success: true,
      data: { events: created, fairness, rosterSize: N, slide },
      message: `Created ${created.length} round-robin events`,
    });
  } catch (error) {
    console.error('Error generating round-robin events:', error);
    return NextResponse.json(
      { error: 'Failed to generate round-robin events', details: String(error) },
      { status: 500 }
    );
  }
}
