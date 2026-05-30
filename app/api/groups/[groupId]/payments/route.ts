/**
 * Payments API
 *
 * GET  /api/groups/[groupId]/payments - list recorded payments (members)
 * POST /api/groups/[groupId]/payments - record a payment (admin only)
 *   Body: { userEmail, amount, description?, paymentDate? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireMember, requireGroupAdmin } from '@/lib/apiGuards';
import { getPayments, recordPayment } from '@/lib/queries/credits';
import { getGroupMember } from '@/lib/queries/groups';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { groupId } = await params;
  const ctx = await requireMember(groupId);
  if (ctx instanceof NextResponse) return ctx;

  try {
    const payments = await getPayments(groupId);
    return NextResponse.json({ success: true, data: payments });
  } catch (error) {
    console.error('Error fetching payments:', error);
    return NextResponse.json({ error: 'Failed to fetch payments' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { groupId } = await params;
  const ctx = await requireGroupAdmin(groupId);
  if (ctx instanceof NextResponse) return ctx;

  try {
    const body = await request.json();
    const { userEmail, amount, description, paymentDate } = body ?? {};

    if (!userEmail || amount === undefined || amount === null) {
      return NextResponse.json({ error: 'userEmail and amount are required' }, { status: 400 });
    }
    const numericAmount = Number(amount);
    if (Number.isNaN(numericAmount)) {
      return NextResponse.json({ error: 'amount must be a number' }, { status: 400 });
    }

    // Payer must be an active member of this group.
    const member = await getGroupMember(groupId, userEmail);
    if (!member || member.status !== 'active') {
      return NextResponse.json(
        { error: 'Payer is not an active member of this group' },
        { status: 400 }
      );
    }

    const payment = await recordPayment({
      groupId,
      userEmail,
      amount: numericAmount,
      recordedById: ctx.user.id,
      description,
      paymentDate,
    });

    return NextResponse.json({ success: true, data: payment, message: 'Payment recorded' });
  } catch (error) {
    console.error('Error recording payment:', error);
    return NextResponse.json(
      { error: 'Failed to record payment', details: String(error) },
      { status: 500 }
    );
  }
}
