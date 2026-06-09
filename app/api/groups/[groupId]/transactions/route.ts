/**
 * Group spot ledger
 *
 * GET /api/groups/[groupId]/transactions — all spot transactions (Capo/King).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireCrewManager } from '@/lib/apiGuards';
import { getGroupTransactionsDTO } from '@/lib/queries/transactions';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { groupId } = await params;
  const ctx = await requireCrewManager(groupId);
  if (ctx instanceof NextResponse) return ctx;

  try {
    const data = await getGroupTransactionsDTO(groupId);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching group transactions:', error);
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 });
  }
}
