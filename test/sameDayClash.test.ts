import { describe, expect, it } from 'vitest';
import { sameDayTierByEvent, type ClashEvent } from '@/lib/sameDayClash';

const ev = (id: string, date: string, s: Partial<ClashEvent> = {}): ClashEvent => ({
  eventId: id,
  date,
  isAttending: s.isAttending,
  onWaitlist: s.onWaitlist,
});

describe('sameDayTierByEvent', () => {
  it('flags tier 2 when rostered in 2+ games the same day', () => {
    const tiers = sameDayTierByEvent([
      ev('a', '2026-08-03', { isAttending: true }),
      ev('b', '2026-08-03', { isAttending: true }),
    ]);
    expect(tiers.get('a')).toBe(2);
    expect(tiers.get('b')).toBe(2);
  });

  it('flags tier 1 when rostered in one and benched in another the same day', () => {
    const tiers = sameDayTierByEvent([
      ev('a', '2026-08-03', { isAttending: true }),
      ev('b', '2026-08-03', { onWaitlist: true }),
    ]);
    expect(tiers.get('a')).toBe(1);
    expect(tiers.get('b')).toBe(1);
  });

  it('flags tier 1 when benched in 2+ games the same day', () => {
    const tiers = sameDayTierByEvent([
      ev('a', '2026-08-03', { onWaitlist: true }),
      ev('b', '2026-08-03', { onWaitlist: true }),
    ]);
    expect(tiers.get('a')).toBe(1);
    expect(tiers.get('b')).toBe(1);
  });

  it('returns 0 for a single involvement on a day', () => {
    const tiers = sameDayTierByEvent([
      ev('a', '2026-08-03', { isAttending: true }),
      ev('b', '2026-08-04', { isAttending: true }),
    ]);
    expect(tiers.get('a')).toBe(0);
    expect(tiers.get('b')).toBe(0);
  });

  it('returns 0 for events the player is not involved in, even if others clash', () => {
    const tiers = sameDayTierByEvent([
      ev('a', '2026-08-03', { isAttending: true }),
      ev('b', '2026-08-03'), // not involved
    ]);
    expect(tiers.get('a')).toBe(0); // only one personal involvement that day
    expect(tiers.get('b')).toBe(0);
  });

  it('takes the strongest tier on a 3-game day (2 rostered + 1 benched → tier 2)', () => {
    const tiers = sameDayTierByEvent([
      ev('a', '2026-08-03', { isAttending: true }),
      ev('b', '2026-08-03', { isAttending: true }),
      ev('c', '2026-08-03', { onWaitlist: true }),
    ]);
    expect(tiers.get('a')).toBe(2);
    expect(tiers.get('b')).toBe(2);
    expect(tiers.get('c')).toBe(2);
  });

  it('buckets independently per day', () => {
    const tiers = sameDayTierByEvent([
      ev('a', '2026-08-03', { isAttending: true }),
      ev('b', '2026-08-03', { onWaitlist: true }),
      ev('c', '2026-08-10', { isAttending: true }),
    ]);
    expect(tiers.get('a')).toBe(1);
    expect(tiers.get('b')).toBe(1);
    expect(tiers.get('c')).toBe(0);
  });
});
