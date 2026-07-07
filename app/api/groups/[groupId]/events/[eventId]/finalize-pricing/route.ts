/**
 * Finalize split-total pricing for an event.
 *
 * POST /api/groups/[groupId]/events/[eventId]/finalize-pricing
 * Body: { remainderPolicy: 'ignore' | 'admin_absorb_surplus' | 'adjust_total_deficit' }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireCrewManager } from '@/lib/apiGuards';
import { getEventRowById } from '@/lib/queries/events';
import { finalizeSplitPricing } from '@/lib/queries/pricing';
import { SpotError } from '@/lib/queries/_tx';
import type { RemainderPolicy } from '@/lib/types';

interface RouteParams {
  params: Promise<{ groupId: string; eventId: string }>;
}

const VALID_POLICIES: RemainderPolicy[] = ['ignore', 'admin_absorb_surplus', 'adjust_total_deficit'];

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { groupId, eventId } = await params;
  const ctx = await requireCrewManager(groupId);
  if (ctx instanceof NextResponse) return ctx;

  try {
    const eventRow = await getEventRowById(eventId);
    if (!eventRow || eventRow.groupId !== groupId) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const body = await request.json();
    const remainderPolicy = body?.remainderPolicy as RemainderPolicy;
    if (!VALID_POLICIES.includes(remainderPolicy)) {
      return NextResponse.json({ error: 'Invalid remainderPolicy' }, { status: 400 });
    }

    const preview = await finalizeSplitPricing({
      eventId,
      adminUserId: ctx.user.id,
      remainderPolicy,
    });

    return NextResponse.json({
      success: true,
      message: 'Cost split finalized',
      data: preview,
    });
  } catch (error) {
    if (error instanceof SpotError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Error finalizing pricing:', error);
    return NextResponse.json({ error: 'Failed to finalize pricing' }, { status: 500 });
  }
}
