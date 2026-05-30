/**
 * Per-user Credit Transaction History
 *
 * GET /api/groups/[groupId]/credits/[userId]/transactions
 * `userId` is the user's email (URL-encoded). Returns spot transactions that
 * affected this user's balance within the group.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireMember } from '@/lib/apiGuards';
import { getUserRowByEmail } from '@/lib/queries/users';
import { getUserTransactions } from '@/lib/queries/transactions';

interface RouteParams {
  params: Promise<{ groupId: string; userId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { groupId, userId } = await params;
  const ctx = await requireMember(groupId);
  if (ctx instanceof NextResponse) return ctx;

  try {
    const email = decodeURIComponent(userId);
    const user = await getUserRowByEmail(email);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const transactions = await getUserTransactions(groupId, user.id);
    return NextResponse.json({ success: true, data: transactions });
  } catch (error) {
    console.error('Error fetching user transactions:', error);
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 });
  }
}
