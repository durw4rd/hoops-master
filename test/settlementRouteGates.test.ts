/**
 * Route-level gates for the settlement API: the group-settlement flag is
 * fail-closed on every handler, and manager-only actions sit behind
 * requireCrewManager. Guards, LD, and the query layer are mocked; the real
 * route handlers run.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { requireCrewManager, requireMember } from '@/lib/apiGuards';
import { evalServerFlag } from '@/lib/launchdarkly';
import {
  cancelSettlement,
  createSettlement,
  getGroupSettlement,
  markPairingPaid,
} from '@/lib/queries/settlements';
import {
  DELETE as settlementDELETE,
  GET as settlementGET,
  POST as settlementPOST,
} from '@/app/api/groups/[groupId]/settlement/route';
import { POST as paidPOST } from '@/app/api/groups/[groupId]/settlement/pairings/[pairingId]/paid/route';

vi.mock('@/lib/apiGuards', () => ({
  requireMember: vi.fn(),
  requireCrewManager: vi.fn(),
}));
vi.mock('@/lib/queries/settlements', () => ({
  getGroupSettlement: vi.fn(async () => null),
  createSettlement: vi.fn(async () => ({ settlementId: 's-1', pairings: [{ pairingId: 'p-1' }] })),
  cancelSettlement: vi.fn(async () => undefined),
  markPairingPaid: vi.fn(async () => ({ settlementId: 's-1', pairings: [] })),
}));

const memberCtx = {
  user: { id: 'u-p1', email: 'p1@test.local', globalRole: 'user' },
  member: { groupRole: 'member' },
  group: {},
};
const managerCtx = {
  user: { id: 'u-capo', email: 'capo@test.local', globalRole: 'user' },
  member: { groupRole: 'admin' },
  group: {},
};

function makeRequest(body: unknown = {}): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}
const routeParams = { params: Promise.resolve({ groupId: 'grp-1' }) };
const pairingParams = { params: Promise.resolve({ groupId: 'grp-1', pairingId: 'p-1' }) };
const validBody = {
  pairings: [{ debtorEmail: 'x@test.local', creditorEmail: 'a@test.local', amountCents: 2000 }],
};

/** Turn the flag on for the single evaluation each handler makes. */
const flagOn = () => vi.mocked(evalServerFlag).mockResolvedValueOnce(true as never);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(evalServerFlag).mockReset();
  // Fail-closed default: unknown flags resolve to the passed default (false).
  vi.mocked(evalServerFlag).mockImplementation(
    (async (flagKey: string, _email: string, defaultValue: unknown) =>
      flagKey === 'email-notifications' ? true : defaultValue) as typeof evalServerFlag
  );
  vi.mocked(requireMember).mockResolvedValue(memberCtx as never);
  vi.mocked(requireCrewManager).mockResolvedValue(managerCtx as never);
});

describe('group-settlement flag is fail-closed on every handler', () => {
  it('403s GET and never reads the settlement', async () => {
    const res = await settlementGET(makeRequest(), routeParams);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain('not enabled');
    expect(getGroupSettlement).not.toHaveBeenCalled();
  });

  it('403s POST and never creates a settlement', async () => {
    const res = await settlementPOST(makeRequest(validBody), routeParams);
    expect(res.status).toBe(403);
    expect(createSettlement).not.toHaveBeenCalled();
  });

  it('403s DELETE and never cancels', async () => {
    const res = await settlementDELETE(makeRequest(), routeParams);
    expect(res.status).toBe(403);
    expect(cancelSettlement).not.toHaveBeenCalled();
  });

  it('403s mark-paid and never writes payments', async () => {
    const res = await paidPOST(makeRequest(), pairingParams);
    expect(res.status).toBe(403);
    expect(markPairingPaid).not.toHaveBeenCalled();
  });
});

describe('handlers with the flag on', () => {
  it('GET passes the viewer role through so players see only their pairings', async () => {
    flagOn();
    expect((await settlementGET(makeRequest(), routeParams)).status).toBe(200);
    expect(getGroupSettlement).toHaveBeenCalledWith('grp-1', {
      userId: 'u-p1',
      isManager: false,
    });

    vi.mocked(requireMember).mockResolvedValue(managerCtx as never);
    flagOn();
    await settlementGET(makeRequest(), routeParams);
    expect(getGroupSettlement).toHaveBeenLastCalledWith('grp-1', {
      userId: 'u-capo',
      isManager: true,
    });
  });

  it('POST creates the settlement from the submitted pairings', async () => {
    flagOn();
    const res = await settlementPOST(makeRequest(validBody), routeParams);
    expect(res.status).toBe(200);
    expect(createSettlement).toHaveBeenCalledWith('grp-1', 'u-capo', [
      { debtorEmail: 'x@test.local', creditorEmail: 'a@test.local', amountCents: 2000 },
    ]);
  });

  it('DELETE tears up the settlement', async () => {
    flagOn();
    expect((await settlementDELETE(makeRequest(), routeParams)).status).toBe(200);
    expect(cancelSettlement).toHaveBeenCalledWith('grp-1', 'u-capo');
  });

  it('mark-paid forwards the actor, manager flag, and capped note', async () => {
    flagOn();
    const res = await paidPOST(makeRequest({ note: 'x'.repeat(250) }), pairingParams);
    expect(res.status).toBe(200);
    expect(markPairingPaid).toHaveBeenCalledWith({
      groupId: 'grp-1',
      pairingId: 'p-1',
      actorId: 'u-p1',
      isManager: false,
      note: 'x'.repeat(200),
    });
  });
});

describe('POST body validation', () => {
  const cases: Array<[string, unknown]> = [
    ['no pairings key', {}],
    ['empty pairings', { pairings: [] }],
    ['missing emails', { pairings: [{ amountCents: 100 }] }],
    ['zero amount', { pairings: [{ debtorEmail: 'x@t', creditorEmail: 'a@t', amountCents: 0 }] }],
    [
      'fractional cents',
      { pairings: [{ debtorEmail: 'x@t', creditorEmail: 'a@t', amountCents: 12.5 }] },
    ],
    [
      'negative amount',
      { pairings: [{ debtorEmail: 'x@t', creditorEmail: 'a@t', amountCents: -100 }] },
    ],
  ];

  for (const [label, body] of cases) {
    it(`400s on ${label}`, async () => {
      flagOn();
      const res = await settlementPOST(makeRequest(body), routeParams);
      expect(res.status).toBe(400);
      expect(createSettlement).not.toHaveBeenCalled();
    });
  }
});

describe('role guards', () => {
  it('POST and DELETE go through requireCrewManager; GET and mark-paid through requireMember', async () => {
    const forbidden = NextResponse.json({ error: 'nope' }, { status: 403 });
    vi.mocked(requireCrewManager).mockResolvedValue(forbidden as never);

    expect((await settlementPOST(makeRequest(validBody), routeParams)).status).toBe(403);
    expect((await settlementDELETE(makeRequest(), routeParams)).status).toBe(403);
    expect(createSettlement).not.toHaveBeenCalled();
    expect(cancelSettlement).not.toHaveBeenCalled();
    // The flag is never even evaluated when the role guard rejects first.
    expect(evalServerFlag).not.toHaveBeenCalled();

    // Regular members still reach the member-level handlers.
    flagOn();
    expect((await settlementGET(makeRequest(), routeParams)).status).toBe(200);
    flagOn();
    expect((await paidPOST(makeRequest(), pairingParams)).status).toBe(200);
  });
});
