/**
 * Crew settlement lifecycle: build pairings by hand, notify, mark paid with
 * zero-sum payment rows, complete or tear up.
 */

import { and, eq, isNull } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { notifications, payments, settlementPairings, settlements } from '@/lib/db/schema';
import { getGroupBalances } from '@/lib/queries/credits';
import { deleteGroup } from '@/lib/queries/groups';
import {
  cancelSettlement,
  createSettlement,
  getGroupSettlement,
  markPairingPaid,
  type PairingInput,
} from '@/lib/queries/settlements';
import { SpotError } from '@/lib/queries/_tx';
import { addMember, createCrew, createUser, seedBalance } from './factories';
import { assertSettlementInvariant, groupBalanceSum } from './invariants';

type UserRow = Awaited<ReturnType<typeof createUser>>;
type GroupRow = Awaited<ReturnType<typeof createCrew>>['group'];

/**
 * Zero-sum crew: two players in the black (+30, +12.50), three in the red
 * (-20, -15, -7.50), and one already square.
 */
async function settlementScenario() {
  const { group, capo } = await createCrew();
  const player = async (name: string, balance: number): Promise<UserRow> => {
    const user = await createUser(name);
    await addMember(group.id, user);
    if (balance !== 0) await seedBalance(group.id, user, balance, capo);
    return user;
  };
  return {
    group,
    capo,
    credA: await player('credA', 30),
    credB: await player('credB', 12.5),
    debtX: await player('debtX', -20),
    debtY: await player('debtY', -15),
    debtZ: await player('debtZ', -7.5),
    square: await player('square', 0),
  };
}

const pair = (debtor: UserRow, creditor: UserRow, cents: number): PairingInput => ({
  debtorEmail: debtor.email,
  creditorEmail: creditor.email,
  amountCents: cents,
});

const pairingRows = (settlementId: string) =>
  db.select().from(settlementPairings).where(eq(settlementPairings.settlementId, settlementId));

const settlementNotifications = (groupId: string) =>
  db
    .select()
    .from(notifications)
    .where(and(eq(notifications.groupId, groupId), isNull(notifications.eventId)));

const paymentRowsFor = (groupId: string) =>
  db.select().from(payments).where(eq(payments.groupId, groupId));

let scenario: Awaited<ReturnType<typeof settlementScenario>>;

beforeEach(async () => {
  scenario = await settlementScenario();
});

describe('createSettlement', () => {
  it('persists hand-built pairings and tags every involved player', async () => {
    const { group, capo, credA, credB, debtX, debtY, debtZ, square } = scenario;
    expect(await groupBalanceSum(group.id)).toBeCloseTo(0, 2);

    // credA is covered by two debtors; debtY is split across both creditors.
    const dto = await createSettlement(group.id, capo.id, [
      pair(debtX, credA, 2000),
      pair(debtY, credA, 1000),
      pair(debtY, credB, 500),
      pair(debtZ, credB, 750),
    ]);

    expect(dto.status).toBe('open');
    expect(dto.createdByName).toBe(capo.displayName);
    expect(dto.pairings).toHaveLength(4);
    expect(dto.pairings.every((p) => p.status === 'open')).toBe(true);
    expect(dto.pairings.map((p) => p.amount)).toEqual([20, 10, 5, 7.5]);
    // Names, never raw emails, drive the UI.
    expect(dto.pairings[0].debtorName).toBe(debtX.displayName);
    expect(dto.pairings[0].creditorName).toBe(credA.displayName);

    const notifs = await settlementNotifications(group.id);
    expect(notifs).toHaveLength(5); // everyone but the squared-up player
    expect(notifs.every((n) => n.type === 'settlement_created')).toBe(true);
    expect(notifs.map((n) => n.userId)).not.toContain(square.id);
    // Crew-scoped: no game to hang the notification off.
    expect(notifs.every((n) => n.eventId === null)).toBe(true);

    const debtorNote = notifs.find((n) => n.userId === debtX.id);
    expect(debtorNote?.body).toContain(`you owe ${credA.displayName} €20.00`);
    const creditorNote = notifs.find((n) => n.userId === credB.id);
    expect(creditorNote?.body).toContain(`owes you €5.00`);

    await assertSettlementInvariant(group.id, dto.settlementId);
  });

  it('accepts a partial settlement, leaving remainders on the books', async () => {
    const { group, capo, credA, debtX } = scenario;
    const dto = await createSettlement(group.id, capo.id, [pair(debtX, credA, 500)]);
    expect(dto.pairings).toHaveLength(1);
    await assertSettlementInvariant(group.id, dto.settlementId);

    // Balances are untouched until someone actually pays.
    const balances = await getGroupBalances(group.id);
    expect(balances.find((b) => b.userEmail === credA.email)?.balance).toBe(30);
  });

  it('rejects pairings that overshoot a balance', async () => {
    const { group, capo, credB, debtX } = scenario;
    await expect(
      createSettlement(group.id, capo.id, [pair(debtX, credB, 2000)])
    ).rejects.toThrow(/more than their €12\.50 balance/);
    expect(await db.select().from(settlements).where(eq(settlements.groupId, group.id))).toHaveLength(0);
  });

  it('rejects wrong-sign roles and non-members', async () => {
    const { group, capo, credA, credB, debtX } = scenario;
    await expect(
      createSettlement(group.id, capo.id, [pair(credB, credA, 500)])
    ).rejects.toThrow(/in the red/);

    const outsider = await createUser('Outsider');
    await expect(
      createSettlement(group.id, capo.id, [
        { debtorEmail: outsider.email, creditorEmail: credA.email, amountCents: 500 },
      ])
    ).rejects.toThrow(/no longer in the crew/);
    await expect(
      createSettlement(group.id, capo.id, [pair(debtX, credA, 0)])
    ).rejects.toThrow(/positive amount/);
  });

  it('blocks a second settlement while one is still in play', async () => {
    const { group, capo, credA, debtX } = scenario;
    await createSettlement(group.id, capo.id, [pair(debtX, credA, 2000)]);
    await expect(
      createSettlement(group.id, capo.id, [pair(debtX, credA, 100)])
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe('getGroupSettlement visibility', () => {
  it('shows managers everything and players only their own pairings', async () => {
    const { group, capo, credA, credB, debtX, debtY, debtZ, square } = scenario;
    await createSettlement(group.id, capo.id, [
      pair(debtX, credA, 2000),
      pair(debtY, credA, 1000),
      pair(debtZ, credB, 750),
    ]);

    const asManager = await getGroupSettlement(group.id, { userId: capo.id, isManager: true });
    expect(asManager?.pairings).toHaveLength(3);

    const asCredA = await getGroupSettlement(group.id, { userId: credA.id, isManager: false });
    expect(asCredA?.pairings).toHaveLength(2);
    expect(asCredA?.pairings.every((p) => p.creditorEmail === credA.email)).toBe(true);

    const asDebtZ = await getGroupSettlement(group.id, { userId: debtZ.id, isManager: false });
    expect(asDebtZ?.pairings).toHaveLength(1);

    // Nothing to show a player with no stake in it.
    expect(await getGroupSettlement(group.id, { userId: square.id, isManager: false })).toBeNull();
  });

  it('returns null when the crew has no settlement in play', async () => {
    const { group, capo } = scenario;
    expect(await getGroupSettlement(group.id, { userId: capo.id, isManager: true })).toBeNull();
  });
});

describe('markPairingPaid', () => {
  async function openSettlement(group: GroupRow, capo: UserRow, pairs: PairingInput[]) {
    const dto = await createSettlement(group.id, capo.id, pairs);
    return dto;
  }

  it('writes two zero-sum payment rows and squares both balances', async () => {
    const { group, capo, credB, debtY } = scenario;
    const dto = await openSettlement(group, capo, [pair(debtY, credB, 1250)]);
    const pairingId = dto.pairings[0].pairingId;

    const after = await markPairingPaid({
      groupId: group.id,
      pairingId,
      actorId: debtY.id,
      isManager: false,
      note: 'Revolut 12:04',
    });

    expect(after.pairings[0].status).toBe('paid');
    expect(after.pairings[0].paidAt).toBeTruthy();
    expect(after.pairings[0].markedPaidByName).toBe(debtY.displayName);
    // Last open pairing squared → the whole settlement is done.
    expect(after.status).toBe('completed');

    const settlementPayments = (await paymentRowsFor(group.id)).filter((p) =>
      (p.description ?? '').startsWith('Settlement:')
    );
    expect(settlementPayments).toHaveLength(2);
    const debtorPayment = settlementPayments.find((p) => p.userId === debtY.id);
    const creditorPayment = settlementPayments.find((p) => p.userId === credB.id);
    expect(Number(debtorPayment?.amount)).toBe(12.5);
    expect(Number(creditorPayment?.amount)).toBe(-12.5);
    expect(debtorPayment?.recordedBy).toBe(debtY.id);
    // The note carries the details and who recorded it.
    expect(debtorPayment?.description).toContain(debtY.displayName);
    expect(debtorPayment?.description).toContain(credB.displayName);
    expect(debtorPayment?.description).toContain('€12.50');
    expect(debtorPayment?.description).toContain(`marked paid by ${debtY.displayName}`);
    expect(debtorPayment?.description).toContain('Revolut 12:04');

    const [row] = await pairingRows(dto.settlementId);
    expect(row.debtorPaymentId).toBe(debtorPayment?.id);
    expect(row.creditorPaymentId).toBe(creditorPayment?.id);

    const balances = await getGroupBalances(group.id);
    expect(balances.find((b) => b.userEmail === credB.email)?.balance).toBe(0);
    expect(balances.find((b) => b.userEmail === debtY.email)?.balance).toBe(-2.5);
    await assertSettlementInvariant(group.id, dto.settlementId);
  });

  it('notifies the counterparty, and both players when a manager records it', async () => {
    const { group, capo, credA, credB, debtX, debtZ } = scenario;
    const dto = await openSettlement(group, capo, [
      pair(debtX, credA, 2000),
      pair(debtZ, credB, 750),
    ]);

    await markPairingPaid({
      groupId: group.id,
      pairingId: dto.pairings[0].pairingId,
      actorId: debtX.id,
      isManager: false,
    });
    let paidNotes = (await settlementNotifications(group.id)).filter(
      (n) => n.type === 'settlement_paid'
    );
    expect(paidNotes).toHaveLength(1);
    expect(paidNotes[0].userId).toBe(credA.id);
    expect(paidNotes[0].body).toContain(`${debtX.displayName} squared the €20.00`);

    await markPairingPaid({
      groupId: group.id,
      pairingId: dto.pairings[1].pairingId,
      actorId: capo.id,
      isManager: true,
    });
    paidNotes = (await settlementNotifications(group.id)).filter(
      (n) => n.type === 'settlement_paid'
    );
    expect(paidNotes).toHaveLength(3);
    expect(paidNotes.map((n) => n.userId)).toEqual(
      expect.arrayContaining([credB.id, debtZ.id])
    );
  });

  it('is idempotent under a double mark and refuses closed settlements', async () => {
    const { group, capo, credB, debtY } = scenario;
    const dto = await openSettlement(group, capo, [pair(debtY, credB, 1250)]);
    const pairingId = dto.pairings[0].pairingId;
    const markArgs = { groupId: group.id, pairingId, actorId: debtY.id, isManager: false };

    await markPairingPaid(markArgs);
    await expect(markPairingPaid(markArgs)).rejects.toMatchObject({ status: 409 });
    // Still exactly one pair of payment rows.
    const settlementPayments = (await paymentRowsFor(group.id)).filter((p) =>
      (p.description ?? '').startsWith('Settlement:')
    );
    expect(settlementPayments).toHaveLength(2);
  });

  it('lets either player or a manager mark it, and nobody else', async () => {
    const { group, capo, credA, debtX, debtZ } = scenario;
    const dto = await openSettlement(group, capo, [pair(debtX, credA, 2000)]);
    const pairingId = dto.pairings[0].pairingId;

    await expect(
      markPairingPaid({ groupId: group.id, pairingId, actorId: debtZ.id, isManager: false })
    ).rejects.toMatchObject({ status: 403 });

    // The creditor side can record it too.
    await expect(
      markPairingPaid({ groupId: group.id, pairingId, actorId: credA.id, isManager: false })
    ).resolves.toBeTruthy();
  });

  it('404s for a pairing from another crew', async () => {
    const { group, capo, credA, debtX } = scenario;
    const dto = await openSettlement(group, capo, [pair(debtX, credA, 2000)]);
    const other = await createCrew();
    await expect(
      markPairingPaid({
        groupId: other.group.id,
        pairingId: dto.pairings[0].pairingId,
        actorId: capo.id,
        isManager: true,
      })
    ).rejects.toMatchObject({ status: 404 });
  });

  it('keeps the crew zero-sum once every pairing is squared', async () => {
    const { group, capo, credA, credB, debtX, debtY, debtZ } = scenario;
    const dto = await openSettlement(group, capo, [
      pair(debtX, credA, 2000),
      pair(debtY, credA, 1000),
      pair(debtY, credB, 500),
      pair(debtZ, credB, 750),
    ]);

    for (const p of dto.pairings) {
      await markPairingPaid({
        groupId: group.id,
        pairingId: p.pairingId,
        actorId: capo.id,
        isManager: true,
      });
    }

    const [head] = await db.select().from(settlements).where(eq(settlements.id, dto.settlementId));
    expect(head.status).toBe('completed');
    expect(head.resolvedAt).toBeTruthy();
    expect(head.resolvedBy).toBe(capo.id);

    expect(await groupBalanceSum(group.id)).toBeCloseTo(0, 2);
    // A fully-covered settlement leaves everyone square.
    for (const b of await getGroupBalances(group.id)) expect(b.balance).toBeCloseTo(0, 2);
    await assertSettlementInvariant(group.id, dto.settlementId);

    // With the previous one closed, a fresh settlement is allowed again.
    await seedBalance(group.id, credA, 5, capo);
    await seedBalance(group.id, debtX, -5, capo);
    await expect(
      createSettlement(group.id, capo.id, [pair(debtX, credA, 500)])
    ).resolves.toBeTruthy();
  });
});

describe('cancelSettlement', () => {
  it('tears up open pairings, keeps paid ones, and unblocks a new settlement', async () => {
    const { group, capo, credA, credB, debtX, debtZ } = scenario;
    const dto = await createSettlement(group.id, capo.id, [
      pair(debtX, credA, 2000),
      pair(debtZ, credB, 750),
    ]);
    await markPairingPaid({
      groupId: group.id,
      pairingId: dto.pairings[0].pairingId,
      actorId: capo.id,
      isManager: true,
    });

    await cancelSettlement(group.id, capo.id);

    const rows = await pairingRows(dto.settlementId);
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(dto.pairings[0].pairingId)?.status).toBe('paid');
    expect(byId.get(dto.pairings[1].pairingId)?.status).toBe('cancelled');

    const [head] = await db.select().from(settlements).where(eq(settlements.id, dto.settlementId));
    expect(head.status).toBe('cancelled');
    expect(head.resolvedBy).toBe(capo.id);

    // Only the players whose pairing was torn up hear about it.
    const cancelNotes = (await settlementNotifications(group.id)).filter(
      (n) => n.type === 'settlement_cancelled'
    );
    expect(cancelNotes.map((n) => n.userId).sort()).toEqual([credB.id, debtZ.id].sort());

    // The paid pairing's money stands.
    const balances = await getGroupBalances(group.id);
    expect(balances.find((b) => b.userEmail === credA.email)?.balance).toBe(10);
    expect(balances.find((b) => b.userEmail === debtX.email)?.balance).toBe(0);
    expect(await groupBalanceSum(group.id)).toBeCloseTo(0, 2);

    expect(await getGroupSettlement(group.id, { userId: capo.id, isManager: true })).toBeNull();
    await expect(
      createSettlement(group.id, capo.id, [pair(debtZ, credB, 750)])
    ).resolves.toBeTruthy();
  });

  it('404s when there is nothing in play', async () => {
    const { group, capo } = scenario;
    await expect(cancelSettlement(group.id, capo.id)).rejects.toBeInstanceOf(SpotError);
  });
});

describe('deleteGroup with settlement history', () => {
  // Settlements FK to the group and paid pairings FK to payment rows, so the
  // crew-deletion transaction has to clear them in dependency order.
  it('burns down a crew that has open, paid, and cancelled pairings', async () => {
    const { group, capo, credA, credB, debtX, debtZ } = scenario;

    const first = await createSettlement(group.id, capo.id, [
      pair(debtX, credA, 2000),
      pair(debtZ, credB, 750),
    ]);
    await markPairingPaid({
      groupId: group.id,
      pairingId: first.pairings[0].pairingId,
      actorId: capo.id,
      isManager: true,
    });
    await cancelSettlement(group.id, capo.id); // leaves one paid + one cancelled
    const second = await createSettlement(group.id, capo.id, [pair(debtZ, credB, 750)]);

    expect(await deleteGroup(group.id)).toBe(true);

    expect(await db.select().from(settlements).where(eq(settlements.groupId, group.id))).toHaveLength(0);
    for (const id of [first.settlementId, second.settlementId]) {
      expect(await pairingRows(id)).toHaveLength(0);
    }
    expect(await paymentRowsFor(group.id)).toHaveLength(0);
  });
});
