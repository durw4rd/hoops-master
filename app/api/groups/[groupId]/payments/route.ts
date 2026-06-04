/**
 * Payments API
 *
 * GET  /api/groups/[groupId]/payments - list recorded payments (members)
 * POST /api/groups/[groupId]/payments - record a payment (admin only)
 *   Body: { userEmail, amount, description?, paymentDate? }
 *   Batch: { userEmails: string[], amount, description?, paymentDate? }
 *     Records the same payment for every listed player (e.g. a season buy-in).
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
    const { userEmail, userEmails, amount, description, paymentDate } = body ?? {};

    // Accept either a single payer (userEmail) or a batch (userEmails[]).
    const emails: string[] = Array.isArray(userEmails)
      ? userEmails
      : userEmail
        ? [userEmail]
        : [];
    const uniqueEmails = Array.from(new Set(emails.filter((e) => typeof e === 'string' && e)));

    if (uniqueEmails.length === 0 || amount === undefined || amount === null) {
      return NextResponse.json(
        { error: 'At least one player and an amount are required' },
        { status: 400 }
      );
    }
    const numericAmount = Number(amount);
    if (Number.isNaN(numericAmount)) {
      return NextResponse.json({ error: 'amount must be a number' }, { status: 400 });
    }

    // Every payer must be an active member of this group.
    const members = await Promise.all(uniqueEmails.map((e) => getGroupMember(groupId, e)));
    const invalid = uniqueEmails.filter((_, i) => !members[i] || members[i]!.status !== 'active');
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `Not active members of this crew: ${invalid.join(', ')}` },
        { status: 400 }
      );
    }

    const payments = await Promise.all(
      uniqueEmails.map((e) =>
        recordPayment({
          groupId,
          userEmail: e,
          amount: numericAmount,
          recordedById: ctx.user.id,
          description,
          paymentDate,
        })
      )
    );

    const isBatch = uniqueEmails.length > 1;
    return NextResponse.json({
      success: true,
      data: isBatch ? payments : payments[0],
      count: payments.length,
      message: isBatch
        ? `Payment recorded for ${payments.length} players`
        : 'Payment recorded',
    });
  } catch (error) {
    console.error('Error recording payment:', error);
    return NextResponse.json(
      { error: 'Failed to record payment', details: String(error) },
      { status: 500 }
    );
  }
}
