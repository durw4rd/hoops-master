/**
 * Credits API
 *
 * GET /api/groups/[groupId]/credits - all member balances (members can view)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireMember } from '@/lib/apiGuards';
import { getGroupBalances } from '@/lib/queries/credits';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { groupId } = await params;
  const ctx = await requireMember(groupId);
  if (ctx instanceof NextResponse) return ctx;

  try {
    const balances = await getGroupBalances(groupId);
    return NextResponse.json({ success: true, data: balances });
  } catch (error) {
    console.error('Error fetching credits:', error);
    return NextResponse.json({ error: 'Failed to fetch credits' }, { status: 500 });
  }
}
