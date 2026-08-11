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

/** Balance-view rows → the shape the settlement helpers work in, keyed by email. */
export function toSettlementBalances(
  rows: { userEmail: string; balance: number }[]
): SettlementBalance[] {
  return rows.map((r) => ({ userId: r.userEmail, balanceCents: toCents(r.balance) }));
}

/**
 * Sum of every listed player's balance. Zero for a healthy crew — the credit
 * ledger is zero-sum by construction. A non-zero total means the balance view is
 * missing someone: it only counts active members, so a player who left the crew
 * while holding credit drops out and the books stop netting out.
 *
 * Sums per-player integer cents rather than the euro floats, so a healthy crew
 * reads exactly 0 instead of 1e-14.
 */
export function crewBalanceTotalCents(balances: SettlementBalance[]): number {
  return balances.reduce((sum, b) => sum + b.balanceCents, 0);
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

export interface AllocationSide {
  userId: string;
  /** Capacity left AFTER any existing drafts — i.e. from remainingCentsByPlayer. */
  remainingCents: number;
}

const byRemainingDescThenId = (a: AllocationSide, b: AllocationSide) =>
  b.remainingCents - a.remainingCents || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0);

/**
 * Match a set of selected creditors against a set of selected debtors, biggest
 * against biggest, so picking one creditor and several debtors yields one pairing
 * per debtor in a single move.
 *
 * Integer cents throughout; never emits a zero pairing; stops as soon as either
 * side is used up (leftovers stay unmatched, which partial settlements allow).
 * Because each round consumes at least one side completely, the same
 * (debtor, creditor) pair can never appear twice.
 */
export function allocateGreedy(
  creditors: AllocationSide[],
  debtors: AllocationSide[]
): PairingProposal[] {
  // Defensive: a fractional amount would be rejected by the API, and a squared
  // player carries no capacity to hand out.
  const usable = (sides: AllocationSide[]) =>
    sides
      .filter((s) => Number.isFinite(s.remainingCents) && s.remainingCents > 0)
      .map((s) => ({ userId: s.userId, remainingCents: Math.floor(s.remainingCents) }));

  const creditorPool = usable(creditors);
  const debtorPool = usable(debtors);
  const proposals: PairingProposal[] = [];

  while (creditorPool.length > 0 && debtorPool.length > 0) {
    // Re-sorted every round on purpose: a partially consumed head can fall
    // below a later entry, and sorting once would break the tie-break order.
    creditorPool.sort(byRemainingDescThenId);
    debtorPool.sort(byRemainingDescThenId);
    const creditor = creditorPool[0];
    const debtor = debtorPool[0];

    const amountCents = Math.min(creditor.remainingCents, debtor.remainingCents);
    if (amountCents <= 0) break;

    proposals.push({
      debtorUserId: debtor.userId,
      creditorUserId: creditor.userId,
      amountCents,
    });
    creditor.remainingCents -= amountCents;
    debtor.remainingCents -= amountCents;
    if (creditor.remainingCents === 0) creditorPool.shift();
    if (debtor.remainingCents === 0) debtorPool.shift();
  }

  return proposals;
}

/**
 * Fold new proposals into existing ones, topping up a pair that is already
 * matched instead of adding a duplicate — the server allows only one pairing per
 * (debtor, creditor). Existing order is preserved.
 */
export function mergeProposals(
  existing: PairingProposal[],
  additions: PairingProposal[]
): PairingProposal[] {
  const merged = existing.map((p) => ({ ...p }));
  for (const addition of additions) {
    const match = merged.find(
      (p) =>
        p.debtorUserId === addition.debtorUserId && p.creditorUserId === addition.creditorUserId
    );
    if (match) match.amountCents += addition.amountCents;
    else merged.push({ ...addition });
  }
  return merged;
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
