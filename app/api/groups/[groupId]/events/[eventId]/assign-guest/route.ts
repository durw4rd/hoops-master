/**
 * POST /api/groups/[groupId]/events/[eventId]/assign-guest
 * Assign a spot to an external guest (LaunchDarkly flag: guest-spots).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireMember } from '@/lib/apiGuards';
import { isCrewManager } from '@/lib/roles';
import { evalServerFlag } from '@/lib/launchdarkly';
import { getEventRowById, assignSpotToGuest } from '@/lib/queries/events';
import { SpotError } from '@/lib/queries/_tx';
import { spotMutationBlockedMessage } from '@/lib/eventRules';

interface RouteParams {
  params: Promise<{ groupId: string; eventId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { groupId, eventId } = await params;
  const ctx = await requireMember(groupId);
  if (ctx instanceof NextResponse) return ctx;

  const enabled = await evalServerFlag('guest-spots', ctx.user.email, false);
  if (!enabled) {
    return NextResponse.json({ error: 'Guest spots are not enabled' }, { status: 403 });
  }

  try {
    const eventRow = await getEventRowById(eventId);
    if (!eventRow || eventRow.groupId !== groupId) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }
    const blocked = spotMutationBlockedMessage(eventRow);
    if (blocked) {
      return NextResponse.json({ error: blocked }, { status: 400 });
    }

    const body = await request.json();
    const attendeeId = body?.attendeeId as string | undefined;
    const guestName = body?.guestName as string | undefined;
    if (!attendeeId || !guestName) {
      return NextResponse.json({ error: 'attendeeId and guestName are required' }, { status: 400 });
    }

    const isAdmin = isCrewManager(ctx.member.groupRole);
    await assignSpotToGuest({
      eventId,
      attendeeId,
      guestName,
      byUserId: ctx.user.id,
      isAdmin,
    });

    return NextResponse.json({ success: true, message: 'Guest assigned to spot' });
  } catch (error) {
    if (error instanceof SpotError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Error assigning guest:', error);
    return NextResponse.json(
      { error: 'Failed to assign guest', details: String(error) },
      { status: 500 }
    );
  }
}
