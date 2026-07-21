/**
 * Route-level gate tests: the player-spot-reassignment flag, the retract
 * past-block fix, and the claim-rider dual-mode past rules. Guards, LD, and
 * the query layer are mocked; the real route handlers + eventRules run.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { requireMember } from '@/lib/apiGuards';
import { evalServerFlag } from '@/lib/launchdarkly';
import {
  assignSpotToGuest,
  claimRiderSpot,
  getEventRowById,
  reassignSpot,
  retractOffer,
} from '@/lib/queries/events';
import { POST as reassignPOST } from '@/app/api/groups/[groupId]/events/[eventId]/reassign/route';
import { POST as retractPOST } from '@/app/api/groups/[groupId]/events/[eventId]/retract/route';
import { POST as claimRiderPOST } from '@/app/api/groups/[groupId]/events/[eventId]/claim-rider/route';
import { POST as assignGuestPOST } from '@/app/api/groups/[groupId]/events/[eventId]/assign-guest/route';

vi.mock('@/lib/apiGuards', () => ({
  requireMember: vi.fn(),
  requireCrewManager: vi.fn(),
}));
vi.mock('@/lib/queries/events', () => ({
  getEventRowById: vi.fn(),
  reassignSpot: vi.fn(async () => ({ id: 'att-1' })),
  retractOffer: vi.fn(async () => ({ id: 'att-1' })),
  claimRiderSpot: vi.fn(async () => ({ id: 'att-1' })),
  assignSpotToGuest: vi.fn(async () => ({ id: 'att-1' })),
}));
vi.mock('@/lib/queries/groups', () => ({
  getActiveMembersWithUsers: vi.fn(async () => [
    { email: 'p1@test.local', membership: { userId: 'u-p1' } },
    { email: 'p2@test.local', membership: { userId: 'u-p2' } },
  ]),
}));
vi.mock('@/lib/queries/users', () => ({
  getUserRowByEmail: vi.fn(async () => ({ id: 'u-p2', displayName: 'P2' })),
}));

const HOUR = 60 * 60 * 1000;
const baseEvent = {
  id: 'evt-1',
  groupId: 'grp-1',
  status: 'scheduled',
  pricingMode: 'per_spot',
  pricingFinalizedAt: null,
  signupOpensAt: null,
};
const futureEvent = { ...baseEvent, startsAt: new Date(Date.now() + 72 * HOUR) };
const pastEvent = { ...baseEvent, startsAt: new Date(Date.now() - 2 * HOUR) };

const memberCtx = {
  user: { id: 'u-p1', email: 'p1@test.local' },
  member: { groupRole: 'member' },
  group: {},
};
const managerCtx = {
  user: { id: 'u-capo', email: 'capo@test.local' },
  member: { groupRole: 'admin' },
  group: {},
};

function makeRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}
const routeParams = { params: Promise.resolve({ groupId: 'grp-1', eventId: 'evt-1' }) };

beforeEach(() => {
  vi.clearAllMocks();
  // Hard-reset the LD mock so queued mockResolvedValueOnce values can't leak
  // between tests (e.g. when a route 400s before evaluating the flag).
  vi.mocked(evalServerFlag).mockReset();
  vi.mocked(evalServerFlag).mockImplementation(
    (async (flagKey: string, _email: string, defaultValue: unknown) =>
      flagKey === 'email-notifications' ? true : defaultValue) as typeof evalServerFlag
  );
  vi.mocked(getEventRowById).mockResolvedValue(futureEvent as never);
  vi.mocked(requireMember).mockResolvedValue(memberCtx as never);
});

describe('reassign route — player-spot-reassignment flag (F1)', () => {
  it('403s player handover while the flag is off; reassignSpot untouched', async () => {
    // Global LD mock is fail-closed for this flag (returns the false default).
    const res = await reassignPOST(makeRequest({ toUserEmail: 'p2@test.local' }), routeParams);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain('not enabled');
    expect(reassignSpot).not.toHaveBeenCalled();
  });

  it('lets player handover through when the flag is on', async () => {
    vi.mocked(evalServerFlag).mockResolvedValueOnce(true); // player-spot-reassignment
    const res = await reassignPOST(makeRequest({ toUserEmail: 'p2@test.local' }), routeParams);
    expect(res.status).toBe(200);
    expect(reassignSpot).toHaveBeenCalledWith(expect.objectContaining({ isAdmin: false }));
  });

  it('admin swaps skip the flag entirely', async () => {
    vi.mocked(requireMember).mockResolvedValue(managerCtx as never);
    const res = await reassignPOST(makeRequest({ toUserEmail: 'p2@test.local' }), routeParams);
    expect(res.status).toBe(200);
    expect(reassignSpot).toHaveBeenCalledWith(expect.objectContaining({ isAdmin: true }));
    const flagsEvaluated = vi.mocked(evalServerFlag).mock.calls.map((c) => c[0]);
    expect(flagsEvaluated).not.toContain('player-spot-reassignment');
  });

  it('admin swaps work on past games; player handover stays blocked there', async () => {
    vi.mocked(getEventRowById).mockResolvedValue(pastEvent as never);
    vi.mocked(requireMember).mockResolvedValue(managerCtx as never);
    expect((await reassignPOST(makeRequest({ toUserEmail: 'p2@test.local' }), routeParams)).status).toBe(200);

    vi.mocked(requireMember).mockResolvedValue(memberCtx as never);
    vi.mocked(evalServerFlag).mockResolvedValueOnce(true);
    const res = await reassignPOST(makeRequest({ toUserEmail: 'p2@test.local' }), routeParams);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('past events');
  });
});

describe('assign-guest route — flags for player-initiated guest handover', () => {
  it('non-admin needs BOTH guest-spots and player-spot-reassignment', async () => {
    vi.mocked(evalServerFlag).mockResolvedValueOnce(true); // guest-spots on
    // player-spot-reassignment falls through to the false default
    const res = await assignGuestPOST(
      makeRequest({ attendeeId: 'att-1', guestName: 'Guest' }),
      routeParams
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain('handover is not enabled');
    expect(assignSpotToGuest).not.toHaveBeenCalled();
  });

  it('non-admin passes with both flags on; admin needs only guest-spots', async () => {
    vi.mocked(evalServerFlag).mockResolvedValueOnce(true).mockResolvedValueOnce(true);
    let res = await assignGuestPOST(makeRequest({ attendeeId: 'att-1', guestName: 'Guest' }), routeParams);
    expect(res.status).toBe(200);

    vi.mocked(requireMember).mockResolvedValue(managerCtx as never);
    vi.mocked(evalServerFlag).mockResolvedValueOnce(true); // guest-spots only
    res = await assignGuestPOST(makeRequest({ attendeeId: 'att-1', guestName: 'Guest' }), routeParams);
    expect(res.status).toBe(200);
    expect(assignSpotToGuest).toHaveBeenCalledTimes(2);
  });
});

describe('retract route — past-game rules (gap fix)', () => {
  it('blocks players on past games', async () => {
    vi.mocked(getEventRowById).mockResolvedValue(pastEvent as never);
    const res = await retractPOST(makeRequest({ attendeeId: 'att-1' }), routeParams);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('past events');
    expect(retractOffer).not.toHaveBeenCalled();
  });

  it('lets managers retract on past games (on-behalf cleanup)', async () => {
    vi.mocked(getEventRowById).mockResolvedValue(pastEvent as never);
    vi.mocked(requireMember).mockResolvedValue(managerCtx as never);
    const res = await retractPOST(makeRequest({ attendeeId: 'att-1' }), routeParams);
    expect(res.status).toBe(200);
    expect(retractOffer).toHaveBeenCalledWith(expect.objectContaining({ isAdmin: true }));
  });
});

describe('claim-rider route — dual-mode past rules', () => {
  it('admin assign path works on past games', async () => {
    vi.mocked(getEventRowById).mockResolvedValue(pastEvent as never);
    vi.mocked(requireMember).mockResolvedValue(managerCtx as never);
    const res = await claimRiderPOST(
      makeRequest({ targetUserEmail: 'p2@test.local' }),
      routeParams
    );
    expect(res.status).toBe(200);
    expect(claimRiderSpot).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u-p2', byUserId: 'u-capo' })
    );
  });

  it('self-claim stays blocked on past games — even for admins', async () => {
    vi.mocked(getEventRowById).mockResolvedValue(pastEvent as never);
    vi.mocked(requireMember).mockResolvedValue(managerCtx as never);
    const res = await claimRiderPOST(makeRequest({}), routeParams);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('past events');
    expect(claimRiderSpot).not.toHaveBeenCalled();
  });
});
