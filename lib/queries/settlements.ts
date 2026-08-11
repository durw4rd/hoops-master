/**
 * Crew credit settlements — pairing creditors with debtors so the books square up.
 *
 * A manager builds the pairings by hand (see components/groups/SettlementBuilder),
 * submits them, and the set is re-validated here against fresh balances before it
 * is persisted. Marking a pairing paid writes two zero-sum `payments` rows (+X for
 * the debtor who sent the money, -X for the creditor who received it), so the
 * crew's balances still sum to zero afterwards.
 *
 * One open settlement per crew: enforced by a check under the group-row lock plus
 * the `settlements_group_open_unique` partial index as a backstop.
 */

import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '@/lib/db';
import {
  groupMembers,
  groups,
  notifications,
  payments,
  playerCreditBalances,
  settlementPairings,
  settlements,
  users,
} from '@/lib/db/schema';
import {
  formatCents,
  toCents,
  validatePairingProposals,
  SettlementValidationError,
  type PairingProposal,
  type SettlementBalance,
} from '@/lib/settlement';
import type {
  NotificationType,
  SettlementDTO,
  SettlementPairingDTO,
  SettlementPairingStatus,
  SettlementStatus,
} from '@/lib/types';
import { serializableTx, SpotError, type Tx } from './_tx';

/** What the manager submits: emails keep the API surface consistent with payments. */
export interface PairingInput {
  debtorEmail: string;
  creditorEmail: string;
  amountCents: number;
}

export interface SettlementViewer {
  userId: string;
  isManager: boolean;
}

const NOTE_MAX = 200;

// =============================================================================
// Read helpers
// =============================================================================

async function readBalancesInTx(tx: Tx, groupId: string): Promise<SettlementBalance[]> {
  const rows = await tx
    .select({ userId: playerCreditBalances.userId, balance: playerCreditBalances.balance })
    .from(playerCreditBalances)
    .where(eq(playerCreditBalances.groupId, groupId));
  return rows.map((r) => ({ userId: r.userId, balanceCents: toCents(Number(r.balance)) }));
}

/**
 * Load a settlement with its pairings, shaped for the client. Non-managers only
 * ever see the pairings they are a party to.
 */
async function loadSettlementDTO(
  settlementId: string,
  viewer: SettlementViewer
): Promise<SettlementDTO | null> {
  const creator = alias(users, 'creator');
  const [head] = await db
    .select({ s: settlements, createdByName: creator.displayName })
    .from(settlements)
    .innerJoin(creator, eq(creator.id, settlements.createdBy))
    .where(eq(settlements.id, settlementId))
    .limit(1);
  if (!head) return null;

  const debtor = alias(users, 'debtor');
  const creditor = alias(users, 'creditor');
  const marker = alias(users, 'marker');
  const rows = await db
    .select({
      p: settlementPairings,
      debtorEmail: debtor.email,
      debtorName: debtor.displayName,
      creditorEmail: creditor.email,
      creditorName: creditor.displayName,
      markedPaidByName: marker.displayName,
    })
    .from(settlementPairings)
    .innerJoin(debtor, eq(debtor.id, settlementPairings.debtorUserId))
    .innerJoin(creditor, eq(creditor.id, settlementPairings.creditorUserId))
    .leftJoin(marker, eq(marker.id, settlementPairings.markedPaidBy))
    .where(eq(settlementPairings.settlementId, settlementId))
    // Grouped by creditor so each "one payment request" reads together. Rows
    // inserted in one batch share created_at, so that can't order them.
    .orderBy(creditor.displayName, debtor.displayName, settlementPairings.id);

  const visible = viewer.isManager
    ? rows
    : rows.filter(
        (r) =>
          r.p.debtorUserId === viewer.userId || r.p.creditorUserId === viewer.userId
      );

  const pairings: SettlementPairingDTO[] = visible.map((r) => ({
    pairingId: r.p.id,
    debtorEmail: r.debtorEmail,
    debtorName: r.debtorName,
    creditorEmail: r.creditorEmail,
    creditorName: r.creditorName,
    amount: Number(r.p.amount),
    status: r.p.status as SettlementPairingStatus,
    paidAt: r.p.paidAt?.toISOString() ?? null,
    markedPaidByName: r.markedPaidByName ?? null,
  }));

  return {
    settlementId: head.s.id,
    status: head.s.status as SettlementStatus,
    createdByName: head.createdByName,
    createdAt: head.s.createdAt.toISOString(),
    resolvedAt: head.s.resolvedAt?.toISOString() ?? null,
    pairings,
  };
}

/**
 * The crew's current settlement (the open one), or null when there is none — or
 * when a regular player has no stake in it.
 */
export async function getGroupSettlement(
  groupId: string,
  viewer: SettlementViewer
): Promise<SettlementDTO | null> {
  const [open] = await db
    .select({ id: settlements.id })
    .from(settlements)
    .where(and(eq(settlements.groupId, groupId), eq(settlements.status, 'open')))
    .orderBy(desc(settlements.createdAt))
    .limit(1);
  if (!open) return null;

  const dto = await loadSettlementDTO(open.id, viewer);
  if (!dto) return null;
  // Nothing to show a player who isn't part of this one.
  if (!viewer.isManager && dto.pairings.length === 0) return null;
  return dto;
}

// =============================================================================
// Notifications (crew-scoped: no event to hang them off)
// =============================================================================

async function notifySettlement(
  tx: Tx,
  params: {
    userIds: string[];
    groupId: string;
    type: NotificationType;
    title: string;
    bodyFor: (userId: string) => string;
  }
): Promise<void> {
  const unique = [...new Set(params.userIds)];
  if (unique.length === 0) return;
  await tx.insert(notifications).values(
    unique.map((userId) => ({
      userId,
      groupId: params.groupId,
      eventId: null,
      type: params.type,
      title: params.title,
      body: params.bodyFor(userId),
    }))
  );
}

// =============================================================================
// Create
// =============================================================================

export async function createSettlement(
  groupId: string,
  createdById: string,
  pairings: PairingInput[]
): Promise<SettlementDTO> {
  const settlementId = await serializableTx(async (tx) => {
    // Crew-scoped mutex: there is no withGroupLock, so the group row is the lock.
    const [group] = await tx
      .select({ id: groups.id })
      .from(groups)
      .where(eq(groups.id, groupId))
      .for('update')
      .limit(1);
    if (!group) throw new SpotError('Crew not found', 404);

    const [existing] = await tx
      .select({ id: settlements.id })
      .from(settlements)
      .where(and(eq(settlements.groupId, groupId), eq(settlements.status, 'open')))
      .limit(1);
    if (existing) {
      throw new SpotError(
        'This crew already has a settlement in play — square it up or tear it up first.',
        409
      );
    }

    // Resolve emails against active membership only.
    const emails = [
      ...new Set(pairings.flatMap((p) => [p.debtorEmail, p.creditorEmail])),
    ];
    const memberRows = emails.length
      ? await tx
          .select({ id: users.id, email: users.email, displayName: users.displayName })
          .from(users)
          .innerJoin(groupMembers, eq(groupMembers.userId, users.id))
          .where(
            and(
              eq(groupMembers.groupId, groupId),
              eq(groupMembers.status, 'active'),
              inArray(users.email, emails)
            )
          )
      : [];
    const userByEmail = new Map(memberRows.map((r) => [r.email, r]));
    const nameById = new Map(memberRows.map((r) => [r.id, r.displayName]));

    const proposals: PairingProposal[] = pairings.map((p) => {
      const debtor = userByEmail.get(p.debtorEmail);
      const creditor = userByEmail.get(p.creditorEmail);
      if (!debtor || !creditor) {
        throw new SpotError('One of the matched players is no longer in the crew.', 400);
      }
      return {
        debtorUserId: debtor.id,
        creditorUserId: creditor.id,
        amountCents: p.amountCents,
      };
    });

    // Re-validate against balances read inside this transaction: this is what
    // catches a stale builder whose balances moved since it loaded.
    const balances = await readBalancesInTx(tx, groupId);
    try {
      validatePairingProposals(balances, proposals);
    } catch (err) {
      if (err instanceof SettlementValidationError) throw new SpotError(err.message, 400);
      throw err;
    }

    const [head] = await tx
      .insert(settlements)
      .values({ groupId, createdBy: createdById, status: 'open' })
      .returning();

    await tx.insert(settlementPairings).values(
      proposals.map((p) => ({
        settlementId: head.id,
        debtorUserId: p.debtorUserId,
        creditorUserId: p.creditorUserId,
        amount: formatCents(p.amountCents),
      }))
    );

    // One notification per involved player, phrased from their side.
    const owedTo = new Map<string, { name: string; cents: number }[]>();
    const owedBy = new Map<string, { name: string; cents: number }[]>();
    for (const p of proposals) {
      const debtorName = nameById.get(p.debtorUserId) ?? 'Someone';
      const creditorName = nameById.get(p.creditorUserId) ?? 'Someone';
      owedTo.set(p.debtorUserId, [
        ...(owedTo.get(p.debtorUserId) ?? []),
        { name: creditorName, cents: p.amountCents },
      ]);
      owedBy.set(p.creditorUserId, [
        ...(owedBy.get(p.creditorUserId) ?? []),
        { name: debtorName, cents: p.amountCents },
      ]);
    }

    const involved = [...new Set(proposals.flatMap((p) => [p.debtorUserId, p.creditorUserId]))];
    await notifySettlement(tx, {
      userIds: involved,
      groupId,
      type: 'settlement_created',
      title: 'Beef to squash',
      bodyFor: (userId) => {
        const parts: string[] = [];
        const pays = owedTo.get(userId) ?? [];
        const collects = owedBy.get(userId) ?? [];
        for (const x of pays) parts.push(`you owe ${x.name} €${formatCents(x.cents)}`);
        for (const x of collects) parts.push(`${x.name} owes you €${formatCents(x.cents)}`);
        return `Settlement's in: ${parts.join(', ')}. Mark it in the app once the money moves.`;
      },
    });

    return head.id;
  });

  const dto = await loadSettlementDTO(settlementId, { userId: createdById, isManager: true });
  if (!dto) throw new SpotError('Settlement not found', 404);
  return dto;
}

// =============================================================================
// Mark paid
// =============================================================================

export async function markPairingPaid(params: {
  groupId: string;
  pairingId: string;
  actorId: string;
  isManager: boolean;
  note?: string;
}): Promise<SettlementDTO> {
  const { groupId, pairingId, actorId, isManager } = params;
  const note = params.note?.trim().slice(0, NOTE_MAX) ?? '';

  const settlementId = await serializableTx(async (tx) => {
    const [row] = await tx
      .select({ p: settlementPairings, settlementStatus: settlements.status, groupId: settlements.groupId })
      .from(settlementPairings)
      .innerJoin(settlements, eq(settlements.id, settlementPairings.settlementId))
      .where(eq(settlementPairings.id, pairingId))
      .for('update', { of: settlementPairings })
      .limit(1);
    if (!row || row.groupId !== groupId) throw new SpotError('Pairing not found', 404);

    const pairing = row.p;
    if (row.settlementStatus !== 'open') {
      throw new SpotError('That settlement is already closed.', 409);
    }
    if (pairing.status !== 'open') {
      throw new SpotError('That pairing is already squared.', 409);
    }
    if (
      !isManager &&
      actorId !== pairing.debtorUserId &&
      actorId !== pairing.creditorUserId
    ) {
      throw new SpotError('Only the players in this pairing can mark it paid.', 403);
    }

    const nameRows = await tx
      .select({ id: users.id, displayName: users.displayName })
      .from(users)
      .where(inArray(users.id, [pairing.debtorUserId, pairing.creditorUserId, actorId]));
    const nameById = new Map(nameRows.map((r) => [r.id, r.displayName]));
    const debtorName = nameById.get(pairing.debtorUserId) ?? 'Player';
    const creditorName = nameById.get(pairing.creditorUserId) ?? 'Player';
    const actorName = nameById.get(actorId) ?? 'Player';

    const amount = Number(pairing.amount);
    const base = `Settlement: ${debtorName} → ${creditorName} €${amount.toFixed(2)} — marked paid by ${actorName}`;
    const description = note ? `${base} — "${note}"` : base;

    // Two zero-sum rows: the payer's balance rises, the receiver's falls by the
    // same amount, so the crew total is unchanged.
    const [debtorPayment] = await tx
      .insert(payments)
      .values({
        groupId,
        userId: pairing.debtorUserId,
        amount: amount.toFixed(2),
        recordedBy: actorId,
        description,
      })
      .returning();
    const [creditorPayment] = await tx
      .insert(payments)
      .values({
        groupId,
        userId: pairing.creditorUserId,
        amount: (-amount).toFixed(2),
        recordedBy: actorId,
        description,
      })
      .returning();

    await tx
      .update(settlementPairings)
      .set({
        status: 'paid',
        paidAt: new Date(),
        markedPaidBy: actorId,
        debtorPaymentId: debtorPayment.id,
        creditorPaymentId: creditorPayment.id,
      })
      .where(eq(settlementPairings.id, pairingId));

    // Last open pairing squared → the whole settlement is done.
    const stillOpen = await tx
      .select({ id: settlementPairings.id })
      .from(settlementPairings)
      .where(
        and(
          eq(settlementPairings.settlementId, pairing.settlementId),
          eq(settlementPairings.status, 'open'),
          ne(settlementPairings.id, pairingId)
        )
      )
      .limit(1);
    if (stillOpen.length === 0) {
      await tx
        .update(settlements)
        .set({ status: 'completed', resolvedAt: new Date(), resolvedBy: actorId })
        .where(eq(settlements.id, pairing.settlementId));
    }

    // Tell the other side; if a manager recorded it, tell both players.
    const recipients = [pairing.debtorUserId, pairing.creditorUserId].filter(
      (id) => id !== actorId
    );
    await notifySettlement(tx, {
      userIds: recipients,
      groupId,
      type: 'settlement_paid',
      title: 'Squared up',
      bodyFor: (userId) =>
        userId === pairing.creditorUserId
          ? `${debtorName} squared the €${amount.toFixed(2)} with you${note ? ` — "${note}"` : ''}.`
          : `Your €${amount.toFixed(2)} to ${creditorName} is marked paid by ${actorName}.`,
    });

    return pairing.settlementId;
  });

  const dto = await loadSettlementDTO(settlementId, { userId: actorId, isManager });
  if (!dto) throw new SpotError('Settlement not found', 404);
  return dto;
}

// =============================================================================
// Cancel
// =============================================================================

export async function cancelSettlement(groupId: string, actorId: string): Promise<void> {
  await serializableTx(async (tx) => {
    const [head] = await tx
      .select({ id: settlements.id })
      .from(settlements)
      .where(and(eq(settlements.groupId, groupId), eq(settlements.status, 'open')))
      .for('update')
      .limit(1);
    if (!head) throw new SpotError('No settlement in play', 404);

    // Only open pairings are torn up; paid ones stay as history with their payments.
    const cancelled = await tx
      .update(settlementPairings)
      .set({ status: 'cancelled' })
      .where(
        and(eq(settlementPairings.settlementId, head.id), eq(settlementPairings.status, 'open'))
      )
      .returning({
        debtorUserId: settlementPairings.debtorUserId,
        creditorUserId: settlementPairings.creditorUserId,
      });

    await tx
      .update(settlements)
      .set({ status: 'cancelled', resolvedAt: new Date(), resolvedBy: actorId })
      .where(eq(settlements.id, head.id));

    await notifySettlement(tx, {
      userIds: cancelled.flatMap((c) => [c.debtorUserId, c.creditorUserId]),
      groupId,
      type: 'settlement_cancelled',
      title: "Beef's off",
      bodyFor: () =>
        'The crew settlement got torn up — your open pairing is off the books. Anything already marked paid stands.',
    });
  });
}
