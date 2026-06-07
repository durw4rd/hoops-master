/**
 * Hand Rider Spot Over API
 *
 * POST /api/groups/[groupId]/events/[eventId]/hand-rider-over
 *
 * Directly transfers the caller's Rider spot to another crew member who holds
 * a confirmed primary spot but has no rider yet. Zero-sum: caller credited,
 * receiver debited at the event's slot cost.
 *
 * Body: { toUserEmail: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireMember } from '@/lib/apiGuards';
import { getEventRowById, handoverRiderSpot } from '@/lib/queries/events';
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
      return NextResponse.json({ error: 'Cannot modify spots for past events' }, { status: 400 });
    }

    const body = await request.json();
    const { toUserEmail } = body as { toUserEmail?: string };
    if (!toUserEmail) {
      return NextResponse.json({ error: 'toUserEmail is required' }, { status: 400 });
    }

    const members = await getActiveMembersWithUsers(groupId);
    const emailToId = new Map(members.map((m) => [m.email.toLowerCase(), m.membership.userId]));
    const toUserId = emailToId.get(toUserEmail.toLowerCase());
    if (!toUserId) {
      return NextResponse.json(
        { error: 'Target user is not an active member of this group' },
        { status: 400 }
      );
    }

    await handoverRiderSpot({
      eventId,
      fromUserId: ctx.user.id,
      toUserId,
    });

    return NextResponse.json({
      success: true,
      message: 'Rider spot handed over',
    });
  } catch (error) {
    if (error instanceof SpotError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Error handing over Rider spot:', error);
    return NextResponse.json(
      { error: 'Failed to hand over Rider spot', details: String(error) },
      { status: 500 }
    );
  }
}
