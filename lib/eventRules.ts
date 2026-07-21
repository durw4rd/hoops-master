/**
 * Pure event-state rules shared across spot action routes.
 */

import type { EventRow } from '@/lib/queries/_tx';
import { isPricingLocked } from '@/lib/queries/pricing';

export function isPastEvent(event: Pick<EventRow, 'startsAt'>): boolean {
  return event.startsAt.getTime() < Date.now();
}

export function isSignupOpen(event: Pick<EventRow, 'signupOpensAt'>): boolean {
  if (!event.signupOpensAt) return true; // null => immediate
  if (event.signupOpensAt.getFullYear() < 2000) return true; // epoch sentinel
  return event.signupOpensAt.getTime() <= Date.now();
}

export interface SpotMutationActor {
  /**
   * Capo/King acting on behalf: may edit past games retroactively (fix the
   * record). Cancelled games and finalized pricing stay locked for everyone.
   */
  actorIsManager?: boolean;
}

export function isSpotMutationBlocked(event: EventRow, opts: SpotMutationActor = {}): boolean {
  return spotMutationBlockedMessage(event, opts) !== null;
}

export function spotMutationBlockedMessage(
  event: EventRow,
  opts: SpotMutationActor = {}
): string | null {
  if (!opts.actorIsManager && isPastEvent(event)) return 'Cannot modify spots for past events';
  if (event.status === 'cancelled') return 'This game has been cancelled';
  if (isPricingLocked(event)) return 'Roster cost has been finalized — spot changes are locked';
  return null;
}
