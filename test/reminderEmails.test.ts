import { describe, expect, it } from 'vitest';
import { relativeDayLabel } from '@/lib/datetime';
import { buildReminderEmails, type ReminderEntry } from '@/lib/queries/eventReminders';
import type { ReminderGame } from '@/lib/email/templates';

const game = (over: Partial<ReminderGame> = {}): ReminderGame => ({
  crewName: 'Summer Hoops 26',
  date: 'Wed Jul 22',
  time: '18:00',
  location: 'Hala',
  relative: 'today',
  ...over,
});

describe('relativeDayLabel', () => {
  it('reads a later-same-day game as "today" (not "in 2 days")', () => {
    const now = new Date('2026-07-22T07:00:00Z');
    const event = new Date('2026-07-22T18:00:00Z');
    expect(relativeDayLabel(event, now, 'UTC')).toBe('today');
  });

  it('reads the next calendar day as "tomorrow" and further out as "in N days"', () => {
    const now = new Date('2026-07-22T07:00:00Z');
    expect(relativeDayLabel(new Date('2026-07-23T09:00:00Z'), now, 'UTC')).toBe('tomorrow');
    expect(relativeDayLabel(new Date('2026-07-24T06:00:00Z'), now, 'UTC')).toBe('in 2 days');
  });

  it('guards a past instant to "today"', () => {
    const now = new Date('2026-07-22T07:00:00Z');
    expect(relativeDayLabel(new Date('2026-07-21T18:00:00Z'), now, 'UTC')).toBe('today');
  });

  it('buckets by the crew timezone, not UTC', () => {
    // 23:30 UTC is still the 22nd in Los Angeles; the game at 02:00 UTC next day
    // is 19:00 the SAME LA day → "today" in LA, "tomorrow" in UTC.
    const now = new Date('2026-07-22T23:30:00Z');
    const event = new Date('2026-07-23T02:00:00Z');
    expect(relativeDayLabel(event, now, 'America/Los_Angeles')).toBe('today');
    expect(relativeDayLabel(event, now, 'UTC')).toBe('tomorrow');
  });
});

describe('buildReminderEmails', () => {
  const entry = (email: string, startsAtMs: number, g: ReminderGame): ReminderEntry => ({
    email,
    startsAtMs,
    game: g,
  });

  it('consolidates a player in 2 games into one email listing both, soonest first', () => {
    const early = game({ crewName: 'Summer Hoops 26', date: 'Wed Jul 22', relative: 'today' });
    const late = game({ crewName: 'Test Crew', date: 'Fri Jul 24', relative: 'in 2 days' });
    const emails = buildReminderEmails([
      entry('p1@test.local', 2000, late),
      entry('p1@test.local', 1000, early),
    ]);

    expect(emails).toHaveLength(1);
    const { subject, html } = emails[0];
    expect(subject).toBe("You've got 2 games coming up");
    expect(html).toContain('Summer Hoops 26');
    expect(html).toContain('Test Crew');
    // soonest first: the "today" game's crew appears before the "in 2 days" one.
    expect(html.indexOf('Summer Hoops 26')).toBeLessThan(html.indexOf('Test Crew'));
  });

  it('sends separate emails to different players in the same game', () => {
    const g = game();
    const emails = buildReminderEmails([
      entry('a@test.local', 1000, g),
      entry('b@test.local', 1000, g),
    ]);
    expect(emails.map((e) => e.to).sort()).toEqual(['a@test.local', 'b@test.local']);
  });

  it('reflects a +1 as a single line with the marker (never a second email)', () => {
    const emails = buildReminderEmails([entry('p1@test.local', 1000, game({ hasRider: true }))]);
    expect(emails).toHaveLength(1);
    const { subject, html } = emails[0];
    expect(subject).toBe('Game today — Summer Hoops 26, Wed Jul 22, 18:00');
    expect(html).toContain('Ball today'); // single-game heading
    expect(html.match(/· \+1/g) ?? []).toHaveLength(1); // exactly one +1 marker
    expect(html).toContain("you're bringing a +1");
  });

  it('omits the +1 marker when the player has no rider', () => {
    const emails = buildReminderEmails([entry('p1@test.local', 1000, game())]);
    expect(emails[0].html).not.toContain('+1');
  });
});
