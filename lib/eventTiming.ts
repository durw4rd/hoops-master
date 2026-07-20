/**
 * Signup-window timing helper shared by event creation routes.
 */

import { zonedToUtc, ALWAYS_OPEN_SENTINEL } from '@/lib/datetime';

export type SignupOpenType = 'immediate' | 'relative' | 'absolute';

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * True when the event starts within the next 24 hours (used for bench promotion approval).
 */
export function isWithin24HoursOfEvent(event: { startsAt: Date }): boolean {
  return event.startsAt.getTime() - Date.now() < TWENTY_FOUR_HOURS_MS;
}

/**
 * Compute the absolute signup-open ISO string from the modal's signup-timing
 * payload, using the group's timezone for local conversions.
 */
export function computeSignupOpensAt(
  timezone: string,
  date: string,
  startTime: string,
  signupOpenType: SignupOpenType,
  signupOpenValue?: number | string
): string {
  if (signupOpenType === 'relative' && typeof signupOpenValue === 'number') {
    const start = zonedToUtc(date, startTime, timezone);
    start.setDate(start.getDate() - signupOpenValue);
    return start.toISOString();
  }
  if (signupOpenType === 'absolute' && typeof signupOpenValue === 'string') {
    const [d, t] = signupOpenValue.split('T');
    if (d && t) return zonedToUtc(d, t.slice(0, 5), timezone).toISOString();
    const parsed = new Date(signupOpenValue);
    if (!isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return ALWAYS_OPEN_SENTINEL; // immediate
}
