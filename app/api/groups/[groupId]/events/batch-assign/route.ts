/**
 * Batch Assign API (admin only)
 *
 * POST /api/groups/[groupId]/events/batch-assign
 * Body: { eventIds: string[], userEmails: string[] }
 *
 * Assigns the given users to each listed event (capacity-checked per event).
 * Each fill records an `admin_assign` ledger row (from_user = NULL).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireCrewManager } from '@/lib/apiGuards';
import { getEventRowById, fillSpots } from '@/lib/queries/events';
import { getActiveMembersWithUsers } from '@/lib/queries/groups';
import { spotMutationBlockedMessage } from '@/lib/eventRules';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { groupId } = await params;
  const ctx = await requireCrewManager(groupId);
  if (ctx instanceof NextResponse) return ctx;

  try {
    const body = await request.json();
    const { eventIds, userEmails } = body ?? {};
    if (!Array.isArray(eventIds) || !Array.isArray(userEmails) || !eventIds.length || !userEmails.length) {
      return NextResponse.json(
        { error: 'eventIds and userEmails are required non-empty arrays' },
        { status: 400 }
      );
    }

    const members = await getActiveMembersWithUsers(groupId);
    const emailToId = new Map(members.map((m) => [m.email.toLowerCase(), m.membership.userId]));
    const toUserIds = userEmails
      .map((e: string) => emailToId.get(String(e).toLowerCase()))
      .filter((id: string | undefined): id is string => !!id);

    if (!toUserIds.length) {
      return NextResponse.json({ error: 'No valid active members in userEmails' }, { status: 400 });
    }

    const results: Record<string, { assigned: number; skipped: number }> = {};
    for (const eventId of eventIds) {
      const eventRow = await getEventRowById(eventId);
      if (!eventRow || eventRow.groupId !== groupId) {
        results[eventId] = { assigned: 0, skipped: toUserIds.length };
        continue;
      }
      // Managers may backfill past games; cancelled + cost-finalized stay locked.
      if (spotMutationBlockedMessage(eventRow, { actorIsManager: true })) {
        results[eventId] = { assigned: 0, skipped: toUserIds.length };
        continue;
      }
      const res = await fillSpots({
        eventId,
        toUserIds,
        assignedById: ctx.user.id,
        type: 'admin_assign',
      });
      results[eventId] = { assigned: res.assigned.length, skipped: res.skipped.length };
    }

    return NextResponse.json({ success: true, data: results, message: 'Batch assignment complete' });
  } catch (error) {
    console.error('Error in batch assign:', error);
    return NextResponse.json(
      { error: 'Failed to batch assign', details: String(error) },
      { status: 500 }
    );
  }
}
