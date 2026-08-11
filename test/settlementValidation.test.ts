import { describe, expect, it } from 'vitest';
import {
  allocateGreedy,
  crewBalanceTotalCents,
  formatCents,
  mergeProposals,
  remainingCentsByPlayer,
  toCents,
  toSettlementBalances,
  validatePairingProposals,
  SettlementValidationError,
  type AllocationSide,
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

describe('crewBalanceTotalCents', () => {
  it('is zero for a crew whose books balance', () => {
    expect(crewBalanceTotalCents(BALANCES)).toBe(0);
    expect(crewBalanceTotalCents([])).toBe(0);
  });

  it('reports the drift when someone holding credit is missing from the view', () => {
    // A departed member drops out of player_credit_balances, so the rest no
    // longer net out — this is the number the Balances card flags to managers.
    expect(
      crewBalanceTotalCents([
        { userId: 'cred-a', balanceCents: 3000 },
        { userId: 'debt-x', balanceCents: -2000 },
      ])
    ).toBe(1000);
    expect(
      crewBalanceTotalCents([
        { userId: 'cred-a', balanceCents: 2000 },
        { userId: 'debt-x', balanceCents: -3000 },
      ])
    ).toBe(-1000);
  });

  it('sums per-player cents so float euros cannot leave a phantom drift', () => {
    const balances = toSettlementBalances([
      { userEmail: 'a@t', balance: 0.1 },
      { userEmail: 'b@t', balance: 0.2 },
      { userEmail: 'c@t', balance: -0.3 },
    ]);
    expect(crewBalanceTotalCents(balances)).toBe(0);
  });
});

describe('allocateGreedy', () => {
  const side = (userId: string, remainingCents: number): AllocationSide => ({
    userId,
    remainingCents,
  });

  it('turns one creditor and two debtors into two pairings in a single move', () => {
    // The motivating case: +40 selected against -30 and -10.
    expect(allocateGreedy([side('cred-a', 4000)], [side('debt-x', 3000), side('debt-y', 1000)])).toEqual([
      pair('debt-x', 'cred-a', 3000),
      pair('debt-y', 'cred-a', 1000),
    ]);
  });

  it('matches biggest against biggest across both sides', () => {
    expect(
      allocateGreedy(
        [side('cred-a', 4000), side('cred-b', 1000)],
        [side('debt-x', 2500), side('debt-y', 2500)]
      )
    ).toEqual([
      pair('debt-x', 'cred-a', 2500),
      pair('debt-y', 'cred-a', 1500),
      pair('debt-y', 'cred-b', 1000),
    ]);
  });

  it('stops when either side runs out, leaving the rest unmatched', () => {
    expect(allocateGreedy([side('cred-a', 1000)], [side('debt-x', 3000)])).toEqual([
      pair('debt-x', 'cred-a', 1000),
    ]);
    expect(allocateGreedy([side('cred-a', 3000)], [side('debt-x', 1000)])).toEqual([
      pair('debt-x', 'cred-a', 1000),
    ]);
    expect(allocateGreedy([], [side('debt-x', 1000)])).toEqual([]);
    expect(allocateGreedy([side('cred-a', 1000)], [])).toEqual([]);
  });

  it('ignores squared-off players and floors fractional capacity', () => {
    expect(
      allocateGreedy(
        [side('cred-a', 1000), side('squared', 0), side('over', -500)],
        [side('debt-x', 1000)]
      )
    ).toEqual([pair('debt-x', 'cred-a', 1000)]);

    const [only] = allocateGreedy([side('cred-a', 1000.7)], [side('debt-x', 500.9)]);
    expect(Number.isInteger(only.amountCents)).toBe(true);
    expect(only.amountCents).toBe(500);
  });

  it('is deterministic regardless of input order, tie-breaking by userId', () => {
    const creditors = [side('cred-b', 2000), side('cred-a', 2000)];
    const debtors = [side('debt-y', 1500), side('debt-x', 1500), side('debt-z', 1000)];
    const expected = allocateGreedy(creditors, debtors);
    // Ties go to the lower userId, so the order they arrive in cannot matter.
    expect(expected[0].creditorUserId).toBe('cred-a');
    expect(expected[0].debtorUserId).toBe('debt-x');
    for (const [c, d] of [
      [[...creditors].reverse(), [...debtors].reverse()],
      [creditors, [...debtors].reverse()],
      [[...creditors].reverse(), debtors],
    ] as [AllocationSide[], AllocationSide[]][]) {
      expect(allocateGreedy(c.map((x) => ({ ...x })), d.map((x) => ({ ...x })))).toEqual(expected);
    }
  });

  it('never repeats a pair, never emits zero, and allocates exactly the smaller side', () => {
    const creditors = [side('cred-a', 4000), side('cred-b', 1250), side('cred-c', 333)];
    const debtors = [side('debt-x', 2000), side('debt-y', 1500), side('debt-z', 750)];
    const proposals = allocateGreedy(creditors, debtors);

    const keys = proposals.map((p) => `${p.debtorUserId}>${p.creditorUserId}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(proposals.every((p) => p.amountCents > 0)).toBe(true);
    expect(proposals.reduce((s, p) => s + p.amountCents, 0)).toBe(
      Math.min(4000 + 1250 + 333, 2000 + 1500 + 750)
    );
  });

  it('respects remaining capacity after existing drafts', () => {
    const drafts = [pair('debt-x', 'cred-a', 1500)];
    const remaining = remainingCentsByPlayer(BALANCES, drafts);
    const sides = (ids: string[]) => ids.map((id) => side(id, remaining.get(id) ?? 0));

    const proposals = allocateGreedy(sides(['cred-a']), sides(['debt-x', 'debt-y']));
    const perUser = new Map<string, number>();
    for (const p of proposals) {
      for (const id of [p.debtorUserId, p.creditorUserId]) {
        perUser.set(id, (perUser.get(id) ?? 0) + p.amountCents);
      }
    }
    for (const [id, allocated] of perUser) {
      expect(allocated).toBeLessThanOrEqual(remaining.get(id) ?? 0);
    }
  });
});

describe('mergeProposals', () => {
  it('tops up an already-matched pair instead of duplicating it', () => {
    expect(
      mergeProposals([pair('debt-x', 'cred-a', 300)], [pair('debt-x', 'cred-a', 450)])
    ).toEqual([pair('debt-x', 'cred-a', 750)]);
  });

  it('appends new pairs, keeps existing order, and merges duplicate additions', () => {
    expect(
      mergeProposals(
        [pair('debt-x', 'cred-a', 300), pair('debt-y', 'cred-b', 100)],
        [pair('debt-z', 'cred-a', 200), pair('debt-z', 'cred-a', 50)]
      )
    ).toEqual([
      pair('debt-x', 'cred-a', 300),
      pair('debt-y', 'cred-b', 100),
      pair('debt-z', 'cred-a', 250),
    ]);
  });

  it('treats the reversed pair as a different pairing', () => {
    expect(mergeProposals([pair('a', 'b', 100)], [pair('b', 'a', 100)])).toHaveLength(2);
  });

  it('does not mutate its inputs', () => {
    const existing = [pair('debt-x', 'cred-a', 300)];
    mergeProposals(existing, [pair('debt-x', 'cred-a', 200)]);
    expect(existing[0].amountCents).toBe(300);
  });
});

describe('builder output always satisfies the server validator', () => {
  // The real contract: whatever the multi-select builder produces must never be
  // something createSettlement rejects with a 400.
  const CASES: { name: string; balances: SettlementBalance[]; drafts: PairingProposal[] }[] = [
    { name: 'zero-sum crew, no drafts', balances: BALANCES, drafts: [] },
    { name: 'zero-sum crew, partial draft', balances: BALANCES, drafts: [pair('debt-x', 'cred-a', 500)] },
    {
      name: 'crew with drift (departed member holds credit)',
      balances: [
        { userId: 'cred-a', balanceCents: 5000 },
        { userId: 'debt-x', balanceCents: -2000 },
        { userId: 'debt-y', balanceCents: -1000 },
      ],
      drafts: [],
    },
    {
      name: 'single cent amounts',
      balances: [
        { userId: 'cred-a', balanceCents: 1 },
        { userId: 'debt-x', balanceCents: -1 },
      ],
      drafts: [],
    },
    {
      name: 'one debtor covering several creditors',
      balances: [
        { userId: 'cred-a', balanceCents: 1000 },
        { userId: 'cred-b', balanceCents: 2000 },
        { userId: 'debt-x', balanceCents: -3000 },
      ],
      drafts: [],
    },
  ];

  for (const { name, balances, drafts } of CASES) {
    it(`accepts everything the allocator proposes: ${name}`, () => {
      const remaining = remainingCentsByPlayer(balances, drafts);
      const sides = (predicate: (b: SettlementBalance) => boolean) =>
        balances
          .filter(predicate)
          .map((b) => ({ userId: b.userId, remainingCents: remaining.get(b.userId) ?? 0 }));

      const proposals = mergeProposals(
        drafts,
        allocateGreedy(sides((b) => b.balanceCents > 0), sides((b) => b.balanceCents < 0))
      );
      expect(proposals.length).toBeGreaterThan(0);
      expect(() => validatePairingProposals(balances, proposals)).not.toThrow();
    });
  }
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
