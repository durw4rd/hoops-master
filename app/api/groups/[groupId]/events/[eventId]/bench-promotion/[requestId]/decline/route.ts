import { NextRequest, NextResponse } from 'next/server';
import { requireMember } from '@/lib/apiGuards';
import { getEventRowById } from '@/lib/queries/events';
import { declineBenchPromotion } from '@/lib/queries/benchPromotion';
import { SpotError } from '@/lib/queries/_tx';

interface RouteParams {
  params: Promise<{ groupId: string; eventId: string; requestId: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { groupId, eventId, requestId } = await params;
  const ctx = await requireMember(groupId);
  if (ctx instanceof NextResponse) return ctx;

  try {
    const eventRow = await getEventRowById(eventId);
    if (!eventRow || eventRow.groupId !== groupId) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    await declineBenchPromotion({
      requestId,
      eventId,
      userId: ctx.user.id,
    });

    return NextResponse.json({ success: true, message: 'Passed on the spot' });
  } catch (error) {
    if (error instanceof SpotError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Error declining bench promotion:', error);
    return NextResponse.json({ error: 'Failed to decline promotion' }, { status: 500 });
  }
}
