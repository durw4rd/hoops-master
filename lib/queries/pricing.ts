/**
 * Event pricing: per-spot charges, split-total settlement, and per-spot corrections.
 */

import { and, eq, inArray } from 'drizzle-orm';
import { eventAttendees, events, spotTransactions } from '@/lib/db/schema';
import { recordTransaction } from './transactions';
import { withEventLock, SpotError, type Tx, type EventRow } from './_tx';
import type { PricingMode, RemainderPolicy } from '@/lib/types';

export function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

export function isSplitTotal(event: Pick<EventRow, 'pricingMode'>): boolean {
  return event.pricingMode === 'split_total';
}

export function isPricingFinalized(event: Pick<EventRow, 'pricingFinalizedAt'>): boolean {
  return event.pricingFinalizedAt != null;
}

export function isPricingLocked(event: EventRow): boolean {
  return isSplitTotal(event) && isPricingFinalized(event);
}

/** Amount to record on a spot mutation (0 for unfinalized split-total). */
export function getSpotChargeAmount(event: EventRow): number {
  if (isSplitTotal(event)) {
    if (!isPricingFinalized(event)) return 0;
    return Number(event.finalizedPerShare ?? 0);
  }
  return Number(event.slotCost);
}

export function getEstimatedPerShare(event: EventRow, occupancy: number): number | null {
  if (!isSplitTotal(event) || occupancy <= 0) return null;
  return roundToOneDecimal(Number(event.totalCost) / occupancy);
}

export interface SplitFinalizePreview {
  baseShare: number;
  roundedSum: number;
  remainder: number;
  occupancy: number;
  totalCost: number;
  isSurplus: boolean;
  isDeficit: boolean;
}

export function computeSplitFinalize(event: EventRow, occupancy: number): SplitFinalizePreview {
  const totalCost = Number(event.totalCost);
  const baseShare = occupancy > 0 ? roundToOneDecimal(totalCost / occupancy) : 0;
  const roundedSum = roundToOneDecimal(baseShare * occupancy);
  const remainder = roundToOneDecimal(totalCost - roundedSum);
  return {
    baseShare,
    roundedSum,
    remainder,
    occupancy,
    totalCost,
    isSurplus: remainder < 0,
    isDeficit: remainder > 0,
  };
}

async function occupiedRowsInTx(tx: Tx, eventId: string) {
  return tx
    .select()
    .from(eventAttendees)
    .where(eq(eventAttendees.eventId, eventId));
}

export async function finalizeSplitPricing(params: {
  eventId: string;
  adminUserId: string;
  remainderPolicy: RemainderPolicy;
}): Promise<SplitFinalizePreview> {
  return withEventLock(params.eventId, async (tx, event) => {
    if (!isSplitTotal(event)) {
      throw new SpotError('This game does not use split-total pricing', 400);
    }
    if (isPricingFinalized(event)) {
      throw new SpotError('Cost split has already been finalized', 409);
    }

    const rows = await occupiedRowsInTx(tx, params.eventId);
    if (rows.length === 0) {
      throw new SpotError('Cannot finalize — no players on the roster', 400);
    }

    const preview = computeSplitFinalize(event, rows.length);

    if (preview.isSurplus && params.remainderPolicy === 'adjust_total_deficit') {
      throw new SpotError('Cannot adjust total for a deficit when there is a surplus', 400);
    }
    if (preview.isDeficit && params.remainderPolicy === 'admin_absorb_surplus') {
      throw new SpotError('Cannot absorb surplus when there is a deficit', 400);
    }

    let effectiveTotal = preview.totalCost;
    if (params.remainderPolicy === 'adjust_total_deficit' && preview.isDeficit) {
      effectiveTotal = preview.roundedSum;
    }

    for (const row of rows) {
      await recordTransaction(tx, {
        eventId: event.id,
        groupId: event.groupId,
        attendeeId: row.id,
        type: 'split_settle',
        fromUserId: null,
        toUserId: row.userId,
        amount: preview.baseShare,
        notes: 'Split cost settlement',
      });
    }

    if (params.remainderPolicy === 'admin_absorb_surplus' && preview.isSurplus) {
      const credit = roundToOneDecimal(Math.abs(preview.remainder));
      await recordTransaction(tx, {
        eventId: event.id,
        groupId: event.groupId,
        attendeeId: null,
        type: 'split_remainder',
        fromUserId: null,
        toUserId: params.adminUserId,
        amount: -credit,
        notes: 'Surplus absorbed by admin',
      });
    }

    await tx
      .update(events)
      .set({
        pricingFinalizedAt: new Date(),
        finalizedPerShare: String(preview.baseShare),
        remainderPolicy: params.remainderPolicy,
        effectiveTotalCost: String(effectiveTotal),
      })
      .where(eq(events.id, event.id));

    return preview;
  });
}

export async function unfinalizeSplitPricing(eventId: string): Promise<void> {
  await withEventLock(eventId, async (tx, event) => {
    if (!isSplitTotal(event) || !isPricingFinalized(event)) {
      throw new SpotError('Nothing to undo', 400);
    }
    if (event.startsAt.getTime() < Date.now()) {
      throw new SpotError('Cannot undo finalize after the game has started', 400);
    }

    await tx
      .delete(spotTransactions)
      .where(
        and(
          eq(spotTransactions.eventId, eventId),
          inArray(spotTransactions.type, ['split_settle', 'split_remainder'])
        )
      );

    await tx
      .update(events)
      .set({
        pricingFinalizedAt: null,
        finalizedPerShare: null,
        remainderPolicy: null,
        effectiveTotalCost: null,
      })
      .where(eq(events.id, eventId));
  });
}

/** Per-spot only: append correction rows when slotCost changes. */
export async function applySlotCostAdjustment(
  tx: Tx,
  event: EventRow,
  oldCost: number,
  newCost: number
): Promise<number> {
  if (isSplitTotal(event)) return 0;
  const delta = roundToOneDecimal(newCost - oldCost);
  if (delta === 0) return 0;

  const rows = await occupiedRowsInTx(tx, event.id);
  if (rows.length === 0) return 0;

  const rowCountByUser = new Map<string, number>();
  for (const row of rows) {
    rowCountByUser.set(row.userId, (rowCountByUser.get(row.userId) ?? 0) + 1);
  }

  let affected = 0;
  for (const [userId, count] of rowCountByUser) {
    const amount = roundToOneDecimal(delta * count);
    if (amount === 0) continue;
    await recordTransaction(tx, {
      eventId: event.id,
      groupId: event.groupId,
      attendeeId: null,
      type: 'price_adjustment',
      fromUserId: null,
      toUserId: userId,
      amount,
      notes: `Slot cost ${oldCost} → ${newCost} (×${count} slot${count === 1 ? '' : 's'})`,
    });
    affected += 1;
  }
  return affected;
}

export type { PricingMode, RemainderPolicy };
