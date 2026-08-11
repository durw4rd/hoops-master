/**
 * POST /api/groups/[groupId]/settlement/pairings/[pairingId]/paid
 *
 * Mark a settlement pairing as squared — writes the two zero-sum payment rows.
 * Either player in the pairing or a crew manager may record it; the note lands
 * in the payment description alongside who recorded it.
 * LaunchDarkly flag: group-settlement.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireMember } from '@/lib/apiGuards';
import { evalServerFlag } from '@/lib/launchdarkly';
import { isCrewManager } from '@/lib/roles';
import { markPairingPaid } from '@/lib/queries/settlements';
import { SpotError } from '@/lib/queries/_tx';

interface RouteParams {
  params: Promise<{ groupId: string; pairingId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { groupId, pairingId } = await params;
  const ctx = await requireMember(groupId);
  if (ctx instanceof NextResponse) return ctx;

  const enabled = await evalServerFlag('group-settlement', ctx.user.email, false, {
    crewRole: ctx.member.groupRole,
    appRole: ctx.user.globalRole,
  });
  if (!enabled) {
    return NextResponse.json({ error: 'Crew settlement is not enabled' }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 200) : undefined;

    const settlement = await markPairingPaid({
      groupId,
      pairingId,
      actorId: ctx.user.id,
      isManager: isCrewManager(ctx.member.groupRole),
      note,
    });
    return NextResponse.json({ success: true, data: settlement, message: 'Marked as squared' });
  } catch (error) {
    if (error instanceof SpotError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Error marking pairing paid:', error);
    return NextResponse.json(
      { error: 'Failed to mark pairing paid', details: String(error) },
      { status: 500 }
    );
  }
}
