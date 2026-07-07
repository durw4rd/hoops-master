/**
 * Undo split-total pricing finalization (before game start).
 *
 * POST /api/groups/[groupId]/events/[eventId]/unfinalize-pricing
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireCrewManager } from '@/lib/apiGuards';
import { getEventRowById } from '@/lib/queries/events';
import { unfinalizeSplitPricing } from '@/lib/queries/pricing';
import { SpotError } from '@/lib/queries/_tx';

interface RouteParams {
  params: Promise<{ groupId: string; eventId: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { groupId, eventId } = await params;
  const ctx = await requireCrewManager(groupId);
  if (ctx instanceof NextResponse) return ctx;

  try {
    const eventRow = await getEventRowById(eventId);
    if (!eventRow || eventRow.groupId !== groupId) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    await unfinalizeSplitPricing(eventId);
    return NextResponse.json({ success: true, message: 'Cost split unfinalized' });
  } catch (error) {
    if (error instanceof SpotError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Error unfinalizing pricing:', error);
    return NextResponse.json({ error: 'Failed to unfinalize pricing' }, { status: 500 });
  }
}
