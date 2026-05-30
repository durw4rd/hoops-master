/**
 * Signup-window timing helper shared by event creation routes.
 */

import { zonedToUtc, ALWAYS_OPEN_SENTINEL } from '@/lib/datetime';

export type SignupOpenType = 'immediate' | 'relative' | 'absolute';

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
