/**
 * Same-day scheduling clash detection for the crew game list.
 *
 * A "clash" is the viewing player being involved (rostered or benched) in 2+
 * games on the same calendar day. Two tiers drive a subtle vs. stronger UI
 * indicator:
 *   2 = rostered (confirmed) in 2+ games that day    → stronger highlight
 *   1 = involved in 2+ that day but fewer than 2 as roster (roster+bench, or
 *       bench+bench)                                  → subtle highlight
 *   0 = not a clash for this player
 *
 * Bucketing uses each event's `date` field, which `toEventDTO` already renders
 * in the crew timezone — do NOT slice `startsAt` (that buckets in UTC and
 * misgroups late-evening games).
 */

export type SameDayTier = 0 | 1 | 2;

export interface ClashEvent {
  eventId: string;
  date: string; // crew-timezone-local YYYY-MM-DD (from toEventDTO)
  isAttending?: boolean;
  onWaitlist?: boolean;
}

export function sameDayTierByEvent(events: ClashEvent[]): Map<string, SameDayTier> {
  const byDay = new Map<string, { attending: number; involved: number }>();
  for (const e of events) {
    if (!e.isAttending && !e.onWaitlist) continue;
    const stats = byDay.get(e.date) ?? { attending: 0, involved: 0 };
    if (e.isAttending) stats.attending += 1;
    stats.involved += 1;
    byDay.set(e.date, stats);
  }

  const result = new Map<string, SameDayTier>();
  for (const e of events) {
    if (!e.isAttending && !e.onWaitlist) {
      result.set(e.eventId, 0);
      continue;
    }
    const stats = byDay.get(e.date);
    if (!stats || stats.involved < 2) {
      result.set(e.eventId, 0);
      continue;
    }
    result.set(e.eventId, stats.attending >= 2 ? 2 : 1);
  }
  return result;
}
