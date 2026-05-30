/**
 * Credit balances (computed via the player_credit_balances view) + payments.
 */

import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { payments, playerCreditBalances, users } from '@/lib/db/schema';
import { getUserRowByEmail } from './users';
import type { CreditBalance, PaymentRecord } from '@/lib/types';

export async function getGroupBalances(groupId: string): Promise<CreditBalance[]> {
  const rows = await db
    .select()
    .from(playerCreditBalances)
    .where(eq(playerCreditBalances.groupId, groupId));
  return rows
    .map((r) => ({
      userEmail: r.email,
      displayName: r.displayName,
      totalPaid: Number(r.totalPaid),
      totalSpent: Number(r.totalSpent),
      totalEarned: Number(r.totalEarned),
      balance: Number(r.balance),
    }))
    .sort((a, b) => a.balance - b.balance);
}

export interface RecordPaymentInput {
  groupId: string;
  userEmail: string;
  amount: number;
  recordedById: string;
  description?: string;
  paymentDate?: string; // YYYY-MM-DD
}

export async function recordPayment(input: RecordPaymentInput): Promise<PaymentRecord> {
  const user = await getUserRowByEmail(input.userEmail);
  if (!user) throw new Error('User not found');

  const [row] = await db
    .insert(payments)
    .values({
      groupId: input.groupId,
      userId: user.id,
      amount: String(input.amount),
      recordedBy: input.recordedById,
      description: input.description ?? '',
      ...(input.paymentDate ? { paymentDate: input.paymentDate } : {}),
    })
    .returning();

  return {
    paymentId: row.id,
    userEmail: user.email,
    amount: Number(row.amount),
    recordedBy: input.recordedById,
    description: row.description ?? '',
    paymentDate: typeof row.paymentDate === 'string' ? row.paymentDate : String(row.paymentDate),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getPayments(groupId: string): Promise<PaymentRecord[]> {
  const rows = await db
    .select({ p: payments, email: users.email })
    .from(payments)
    .innerJoin(users, eq(users.id, payments.userId))
    .where(eq(payments.groupId, groupId))
    .orderBy(desc(payments.createdAt));
  return rows.map(({ p, email }) => ({
    paymentId: p.id,
    userEmail: email,
    amount: Number(p.amount),
    recordedBy: p.recordedBy,
    description: p.description ?? '',
    paymentDate: typeof p.paymentDate === 'string' ? p.paymentDate : String(p.paymentDate),
    createdAt: p.createdAt.toISOString(),
  }));
}

export { and };
