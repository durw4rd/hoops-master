/**
 * Crew settlement API (LaunchDarkly flag: group-settlement).
 *
 * GET    /api/groups/[groupId]/settlement - the settlement in play (members;
 *        players only see the pairings they are part of)
 * POST   /api/groups/[groupId]/settlement - lock in hand-built pairings (Capo or King)
 *        Body: { pairings: [{ debtorEmail, creditorEmail, amountCents }] }
 * DELETE /api/groups/[groupId]/settlement - tear up the open settlement (Capo or King)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireCrewManager, requireMember } from '@/lib/apiGuards';
import { evalServerFlag } from '@/lib/launchdarkly';
import { isCrewManager } from '@/lib/roles';
import {
  cancelSettlement,
  createSettlement,
  getGroupSettlement,
  type PairingInput,
} from '@/lib/queries/settlements';
import { SpotError } from '@/lib/queries/_tx';
import type { MemberContext } from '@/lib/apiGuards';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

async function settlementEnabled(ctx: MemberContext): Promise<boolean> {
  return evalServerFlag('group-settlement', ctx.user.email, false, {
    crewRole: ctx.member.groupRole,
    appRole: ctx.user.globalRole,
  });
}

const notEnabled = () =>
  NextResponse.json({ error: 'Crew settlement is not enabled' }, { status: 403 });

function handleError(error: unknown, fallback: string) {
  if (error instanceof SpotError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error(`${fallback}:`, error);
  return NextResponse.json({ error: fallback, details: String(error) }, { status: 500 });
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { groupId } = await params;
  const ctx = await requireMember(groupId);
  if (ctx instanceof NextResponse) return ctx;
  if (!(await settlementEnabled(ctx))) return notEnabled();

  try {
    const settlement = await getGroupSettlement(groupId, {
      userId: ctx.user.id,
      isManager: isCrewManager(ctx.member.groupRole),
    });
    return NextResponse.json({ success: true, data: settlement });
  } catch (error) {
    return handleError(error, 'Failed to fetch settlement');
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { groupId } = await params;
  const ctx = await requireCrewManager(groupId);
  if (ctx instanceof NextResponse) return ctx;
  if (!(await settlementEnabled(ctx))) return notEnabled();

  try {
    const body = await request.json().catch(() => ({}));
    const raw = body?.pairings;
    if (!Array.isArray(raw) || raw.length === 0) {
      return NextResponse.json({ error: 'At least one pairing is required' }, { status: 400 });
    }

    const pairings: PairingInput[] = [];
    for (const p of raw) {
      const debtorEmail = typeof p?.debtorEmail === 'string' ? p.debtorEmail.trim() : '';
      const creditorEmail = typeof p?.creditorEmail === 'string' ? p.creditorEmail.trim() : '';
      const amountCents = Number(p?.amountCents);
      if (!debtorEmail || !creditorEmail) {
        return NextResponse.json(
          { error: 'Every pairing needs a debtor and a creditor' },
          { status: 400 }
        );
      }
      if (!Number.isInteger(amountCents) || amountCents <= 0) {
        return NextResponse.json(
          { error: 'Every pairing needs a positive whole-cent amount' },
          { status: 400 }
        );
      }
      pairings.push({ debtorEmail, creditorEmail, amountCents });
    }

    const settlement = await createSettlement(groupId, ctx.user.id, pairings);
    return NextResponse.json({
      success: true,
      data: settlement,
      count: settlement.pairings.length,
      message: `Settlement locked in with ${settlement.pairings.length} pairings`,
    });
  } catch (error) {
    return handleError(error, 'Failed to create settlement');
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { groupId } = await params;
  const ctx = await requireCrewManager(groupId);
  if (ctx instanceof NextResponse) return ctx;
  if (!(await settlementEnabled(ctx))) return notEnabled();

  try {
    await cancelSettlement(groupId, ctx.user.id);
    return NextResponse.json({ success: true, message: 'Settlement torn up' });
  } catch (error) {
    return handleError(error, 'Failed to cancel settlement');
  }
}
