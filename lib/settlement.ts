/**
 * Settlement pairing validation.
 *
 * A crew manager builds pairings by hand in the UI (creditor ← debtor, any
 * many-to-many shape); the server re-validates the submitted set against fresh
 * balances before persisting it. Pure module: integer cents only, no DB, no
 * dates — so it stays unit-testable and shared with the client-side builder.
 *
 * Partial coverage is allowed: a player may be left with an unsettled remainder
 * (crews whose active-member balances don't sum to zero — e.g. a departed member
 * still holding credit — could never be fully paired otherwise).
 */

export interface SettlementBalance {
  userId: string;
  balanceCents: number;
}

export interface PairingProposal {
  debtorUserId: string;
  creditorUserId: string;
  amountCents: number;
}

export class SettlementValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SettlementValidationError';
  }
}

/** Euro amount from the numeric(10,2) balance view → exact integer cents. */
export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * How many cents each player still has unmatched once these pairings are taken
 * into account — the figure the builder shows next to every name, and the basis
 * for the over-allocation check below. Keys are whatever identifies a player in
 * `balances`: user ids server-side, emails in the builder.
 *
 * Both sides of a pairing consume capacity, so a player's own sign doesn't
 * matter here: capacity is |balance| and every pairing they appear in draws it
 * down. A negative result means they are over-allocated.
 */
export function remainingCentsByPlayer(
  balances: SettlementBalance[],
  proposals: PairingProposal[]
): Map<string, number> {
  const remaining = new Map(balances.map((b) => [b.userId, Math.abs(b.balanceCents)]));
  for (const p of proposals) {
    for (const userId of [p.creditorUserId, p.debtorUserId]) {
      // Unknown players are validated separately; skip rather than invent capacity.
      if (!remaining.has(userId)) continue;
      remaining.set(userId, (remaining.get(userId) ?? 0) - p.amountCents);
    }
  }
  return remaining;
}

/**
 * Throws SettlementValidationError if the proposals can't be turned into a
 * settlement for these balances. Callers map that to a 400.
 */
export function validatePairingProposals(
  balances: SettlementBalance[],
  proposals: PairingProposal[]
): void {
  if (proposals.length === 0) {
    throw new SettlementValidationError('Add at least one pairing before locking it in.');
  }

  const balanceByUser = new Map(balances.map((b) => [b.userId, b.balanceCents]));
  const seenPairs = new Set<string>();

  for (const p of proposals) {
    if (!Number.isInteger(p.amountCents) || p.amountCents <= 0) {
      throw new SettlementValidationError('Every pairing needs a positive amount.');
    }
    if (p.debtorUserId === p.creditorUserId) {
      throw new SettlementValidationError('A player cannot settle up with themselves.');
    }

    const pairKey = `${p.debtorUserId}>${p.creditorUserId}`;
    if (seenPairs.has(pairKey)) {
      throw new SettlementValidationError('The same pair of players is matched more than once.');
    }
    seenPairs.add(pairKey);

    const creditorBalance = balanceByUser.get(p.creditorUserId);
    if (creditorBalance === undefined) {
      throw new SettlementValidationError('One of the matched players is no longer in the crew.');
    }
    if (creditorBalance <= 0) {
      throw new SettlementValidationError('Only players in the black can be owed money.');
    }

    const debtorBalance = balanceByUser.get(p.debtorUserId);
    if (debtorBalance === undefined) {
      throw new SettlementValidationError('One of the matched players is no longer in the crew.');
    }
    if (debtorBalance >= 0) {
      throw new SettlementValidationError('Only players in the red can owe money.');
    }

  }

  for (const [userId, remaining] of remainingCentsByPlayer(balances, proposals)) {
    if (remaining >= 0) continue;
    const capacity = Math.abs(balanceByUser.get(userId) ?? 0);
    throw new SettlementValidationError(
      `Pairings for one player add up to €${formatCents(capacity - remaining)}, more than their €${formatCents(capacity)} balance. Balances may have moved — refresh and rebuild.`
    );
  }
}
