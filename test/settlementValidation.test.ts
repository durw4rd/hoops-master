import { describe, expect, it } from 'vitest';
import {
  formatCents,
  remainingCentsByPlayer,
  toCents,
  validatePairingProposals,
  SettlementValidationError,
  type PairingProposal,
  type SettlementBalance,
} from '@/lib/settlement';

// A zero-sum crew: two creditors (+30, +12.50), three debtors (-20, -15, -7.50).
const BALANCES: SettlementBalance[] = [
  { userId: 'cred-a', balanceCents: 3000 },
  { userId: 'cred-b', balanceCents: 1250 },
  { userId: 'debt-x', balanceCents: -2000 },
  { userId: 'debt-y', balanceCents: -1500 },
  { userId: 'debt-z', balanceCents: -750 },
  { userId: 'square', balanceCents: 0 },
];

const pair = (debtor: string, creditor: string, cents: number): PairingProposal => ({
  debtorUserId: debtor,
  creditorUserId: creditor,
  amountCents: cents,
});

const expectRejected = (proposals: PairingProposal[], match: RegExp) => {
  expect(() => validatePairingProposals(BALANCES, proposals)).toThrow(SettlementValidationError);
  expect(() => validatePairingProposals(BALANCES, proposals)).toThrow(match);
};

describe('toCents / formatCents', () => {
  it('round-trips euro amounts without float drift', () => {
    expect(toCents(12.5)).toBe(1250);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(-7.5)).toBe(-750);
    expect(formatCents(1250)).toBe('12.50');
    expect(formatCents(5)).toBe('0.05');
  });
});

describe('remainingCentsByPlayer', () => {
  // This is what the builder shows next to every name as drafts are added.
  it('starts at the full balance and draws down both sides of each pairing', () => {
    const remaining = remainingCentsByPlayer(BALANCES, []);
    expect(remaining.get('cred-a')).toBe(3000);
    expect(remaining.get('debt-x')).toBe(2000); // capacity is |balance|
    expect(remaining.get('square')).toBe(0);

    const after = remainingCentsByPlayer(BALANCES, [pair('debt-x', 'cred-a', 2000)]);
    expect(after.get('debt-x')).toBe(0); // fully squared, drops out of the builder
    expect(after.get('cred-a')).toBe(1000); // still owed €10
    expect(after.get('cred-b')).toBe(1250); // untouched
  });

  it('accumulates across several pairings for the same player', () => {
    const remaining = remainingCentsByPlayer(BALANCES, [
      pair('debt-x', 'cred-a', 1200),
      pair('debt-y', 'cred-a', 800),
    ]);
    expect(remaining.get('cred-a')).toBe(1000);
    expect(remaining.get('debt-x')).toBe(800);
    expect(remaining.get('debt-y')).toBe(700);
  });

  it('goes negative exactly when a player is over-allocated', () => {
    const remaining = remainingCentsByPlayer(BALANCES, [
      pair('debt-z', 'cred-a', 500),
      pair('debt-z', 'cred-b', 500),
    ]);
    expect(remaining.get('debt-z')).toBe(-250);
  });

  it('ignores players outside the balance set rather than inventing capacity', () => {
    const remaining = remainingCentsByPlayer(BALANCES, [pair('ghost', 'cred-a', 500)]);
    expect(remaining.has('ghost')).toBe(false);
    expect(remaining.get('cred-a')).toBe(2500);
  });
});

describe('validatePairingProposals — accepted shapes', () => {
  it('accepts a one-to-one match that consumes both sides exactly', () => {
    expect(() => validatePairingProposals(BALANCES, [pair('debt-y', 'cred-b', 1250)])).not.toThrow();
  });

  it('accepts one creditor split across several debtors', () => {
    expect(() =>
      validatePairingProposals(BALANCES, [
        pair('debt-x', 'cred-a', 2000),
        pair('debt-y', 'cred-a', 1000),
      ])
    ).not.toThrow();
  });

  it('accepts one debtor split across several creditors', () => {
    expect(() =>
      validatePairingProposals(BALANCES, [
        pair('debt-x', 'cred-a', 1000),
        pair('debt-x', 'cred-b', 1000),
      ])
    ).not.toThrow();
  });

  it('accepts a full many-to-many settlement of the whole crew', () => {
    expect(() =>
      validatePairingProposals(BALANCES, [
        pair('debt-x', 'cred-a', 2000),
        pair('debt-y', 'cred-a', 1000),
        pair('debt-y', 'cred-b', 500),
        pair('debt-z', 'cred-b', 750),
      ])
    ).not.toThrow();
  });

  it('accepts partial coverage — remainders may be left unsettled', () => {
    expect(() => validatePairingProposals(BALANCES, [pair('debt-x', 'cred-a', 100)])).not.toThrow();
  });
});

describe('validatePairingProposals — rejected shapes', () => {
  it('rejects an empty proposal list', () => {
    expectRejected([], /at least one pairing/i);
  });

  it('rejects non-positive and fractional amounts', () => {
    expectRejected([pair('debt-x', 'cred-a', 0)], /positive amount/i);
    expectRejected([pair('debt-x', 'cred-a', -500)], /positive amount/i);
    expectRejected([pair('debt-x', 'cred-a', 12.5)], /positive amount/i);
  });

  it('rejects a player matched with themselves', () => {
    expectRejected([pair('debt-x', 'debt-x', 500)], /with themselves/i);
  });

  it('rejects the same pair of players matched twice', () => {
    expectRejected(
      [pair('debt-x', 'cred-a', 500), pair('debt-x', 'cred-a', 500)],
      /matched more than once/i
    );
  });

  it('rejects players who are not in the balance set', () => {
    expectRejected([pair('ghost', 'cred-a', 500)], /no longer in the crew/i);
    expectRejected([pair('debt-x', 'ghost', 500)], /no longer in the crew/i);
  });

  it('rejects wrong-sign roles, including squared-up players', () => {
    expectRejected([pair('cred-b', 'cred-a', 500)], /in the red/i);
    expectRejected([pair('debt-x', 'debt-y', 500)], /in the black/i);
    expectRejected([pair('square', 'cred-a', 500)], /in the red/i);
    expectRejected([pair('debt-x', 'square', 500)], /in the black/i);
  });

  it('rejects over-allocating a creditor across several pairings', () => {
    expectRejected(
      [pair('debt-x', 'cred-b', 1000), pair('debt-y', 'cred-b', 500)],
      /more than their €12\.50 balance/
    );
  });

  it('rejects over-allocating a debtor across several pairings', () => {
    expectRejected(
      [pair('debt-z', 'cred-a', 500), pair('debt-z', 'cred-b', 500)],
      /more than their €7\.50 balance/
    );
  });

  it('rejects a single pairing larger than either side', () => {
    expectRejected([pair('debt-z', 'cred-a', 3000)], /more than their €7\.50 balance/);
    expectRejected([pair('debt-x', 'cred-b', 2000)], /more than their €12\.50 balance/);
  });
});
