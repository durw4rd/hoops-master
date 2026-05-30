/**
 * Pure event-state rules shared across spot action routes.
 */

import type { EventRow } from '@/lib/queries/_tx';

export function isPastEvent(event: Pick<EventRow, 'startsAt'>): boolean {
  return event.startsAt.getTime() < Date.now();
}

export function isSignupOpen(event: Pick<EventRow, 'signupOpensAt'>): boolean {
  if (!event.signupOpensAt) return true; // null => immediate
  if (event.signupOpensAt.getFullYear() < 2000) return true; // epoch sentinel
  return event.signupOpensAt.getTime() <= Date.now();
}
