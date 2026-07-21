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

export function isSpotMutationBlocked(event: EventRow): boolean {
  return isPastEvent(event) || event.status === 'cancelled' || isPricingLocked(event);
}

export function spotMutationBlockedMessage(event: EventRow): string | null {
  if (isPastEvent(event)) return 'Cannot modify spots for past events';
  if (event.status === 'cancelled') return 'This game has been cancelled';
  if (isPricingLocked(event)) return 'Roster cost has been finalized — spot changes are locked';
  return null;
}
