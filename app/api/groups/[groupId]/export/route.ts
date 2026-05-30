/**
 * CSV Export API (admin only)
 *
 * GET /api/groups/[groupId]/export?type=balances|transactions|payments
 * Streams a text/csv attachment generated from the relevant query.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireGroupAdmin } from '@/lib/apiGuards';
import { getGroupBalances, getPayments } from '@/lib/queries/credits';
import { getGroupTransactions } from '@/lib/queries/transactions';
import { getUsersByIds } from '@/lib/queries/users';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

/** Minimal RFC-4180-ish CSV cell escaping. */
function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(',')];
  for (const row of rows) lines.push(row.map(csvCell).join(','));
  return lines.join('\n');
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { groupId } = await params;
  const ctx = await requireGroupAdmin(groupId);
  if (ctx instanceof NextResponse) return ctx;

  try {
    const type = request.nextUrl.searchParams.get('type') || 'balances';
    let csv: string;
    let filename: string;

    if (type === 'balances') {
      const balances = await getGroupBalances(groupId);
      csv = toCsv(
        ['email', 'displayName', 'totalPaid', 'totalSpent', 'totalEarned', 'balance'],
        balances.map((b) => [b.userEmail, b.displayName, b.totalPaid, b.totalSpent, b.totalEarned, b.balance])
      );
      filename = 'balances.csv';
    } else if (type === 'payments') {
      const payments = await getPayments(groupId);
      csv = toCsv(
        ['paymentId', 'userEmail', 'amount', 'description', 'paymentDate', 'createdAt'],
        payments.map((p) => [p.paymentId, p.userEmail, p.amount, p.description, p.paymentDate, p.createdAt])
      );
      filename = 'payments.csv';
    } else if (type === 'transactions') {
      const rows = await getGroupTransactions(groupId);
      const fromIds = Array.from(
        new Set(rows.map((r) => r.t.fromUserId).filter((id): id is string => !!id))
      );
      const fromMap = await getUsersByIds(fromIds);
      csv = toCsv(
        ['transactionId', 'eventStartsAt', 'type', 'fromUserEmail', 'toUserEmail', 'amount', 'createdAt', 'notes'],
        rows.map((r) => [
          r.t.id,
          r.starts.toISOString(),
          r.t.type,
          r.t.fromUserId ? fromMap.get(r.t.fromUserId)?.email ?? '' : '',
          r.toEmail,
          r.t.amount,
          r.t.createdAt.toISOString(),
          r.t.notes ?? '',
        ])
      );
      filename = 'transactions.csv';
    } else {
      return NextResponse.json(
        { error: 'type must be one of: balances, transactions, payments' },
        { status: 400 }
      );
    }

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Error exporting CSV:', error);
    return NextResponse.json({ error: 'Failed to export CSV' }, { status: 500 });
  }
}
