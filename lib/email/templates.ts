/**
 * Plain-HTML email templates. Dates/times are pre-formatted by the caller in
 * the crew's timezone (utcToZonedFriendlyParts — e.g. "Wed Jul 22", "18:00").
 */

export interface GameEmailContext {
  crewName: string;
  eventName?: string | null;
  date: string;
  time: string;
  location?: string | null;
}

function gameLine(p: GameEmailContext): string {
  const title = p.eventName?.trim() ? `${p.eventName} — ` : '';
  const loc = p.location?.trim() ? ` @ ${p.location}` : '';
  return `${title}${p.date}, ${p.time}${loc}`;
}

/** One upcoming game as it appears in a player's consolidated reminder. */
export interface ReminderGame {
  crewName: string;
  eventName?: string | null;
  date: string;
  time: string;
  location?: string | null;
  relative: string;        // "today" | "tomorrow" | "in N days" (computed at send)
  hasRider?: boolean;      // the player is also bringing a +1 to this game
}

function reminderGameLine(g: ReminderGame, opts: { withCrew?: boolean } = {}): string {
  const crew = opts.withCrew ? `${g.crewName} — ` : '';
  const title = g.eventName?.trim() ? `${g.eventName} — ` : '';
  const loc = g.location?.trim() ? ` @ ${g.location}` : '';
  const rider = g.hasRider ? ' · +1' : '';
  return `${crew}${title}${g.date}, ${g.time}${loc}${rider}`;
}

function wrap(body: string): string {
  return `
  <div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
    ${body}
    <p style="margin-top: 32px; font-size: 12px; color: #888;">
      Hoops Master — you can turn these emails off in your profile settings.
    </p>
  </div>`;
}

const CANT_MAKE_IT =
  `<p>Can't make it? Release or offer your spot in the app so someone from the bench can take it.</p>`;

/**
 * Consolidated upcoming-game reminder: one email per player covering all their
 * due games (soonest first). Relative timing ("today"/"tomorrow"/"in N days")
 * is computed by the caller at send time, per game.
 */
export function gameReminderEmail(games: ReminderGame[]): { subject: string; html: string } {
  if (games.length === 1) {
    const g = games[0];
    const rider = g.hasRider ? ', and you\'re bringing a +1' : '';
    return {
      subject: `Game ${g.relative} — ${g.crewName}, ${g.date}, ${g.time}`,
      html: wrap(`
        <h2 style="margin: 0 0 12px;">Ball ${g.relative} 🏀</h2>
        <p>You're in the run with <strong>${g.crewName}</strong>${rider}:</p>
        <p style="font-size: 18px;"><strong>${reminderGameLine(g)}</strong> (${g.relative})</p>
        <!-- single-game line omits the crew (named in the sentence above) -->
        ${CANT_MAKE_IT}
      `),
    };
  }

  const items = games
    .map((g) => `<li style="margin: 0 0 6px;"><strong>${reminderGameLine(g, { withCrew: true })}</strong> (${g.relative})</li>`)
    .join('');
  return {
    subject: `You've got ${games.length} games coming up`,
    html: wrap(`
      <h2 style="margin: 0 0 12px;">You're on the schedule 🏀</h2>
      <p>You're in the run for these games:</p>
      <ul style="font-size: 16px; padding-left: 20px; margin: 0 0 12px;">${items}</ul>
      ${CANT_MAKE_IT}
    `),
  };
}

export function benchPromotionEmail(
  p: GameEmailContext & { spotKind: 'primary' | 'plus_one' }
): { subject: string; html: string } {
  const isPlusOne = p.spotKind === 'plus_one';
  return {
    subject: isPlusOne
      ? `Your +1 is in — ${p.crewName}, ${p.date}, ${p.time}`
      : `You're in — ${p.crewName}, ${p.date}, ${p.time}`,
    html: wrap(`
      <h2 style="margin: 0 0 12px;">${isPlusOne ? 'Your +1 is off the bench 🏀' : "You're off the bench 🏀"}</h2>
      <p>${isPlusOne ? 'Your +1 just got' : 'You just got'} promoted into the game with <strong>${p.crewName}</strong>:</p>
      <p style="font-size: 18px;"><strong>${gameLine(p)}</strong></p>
    `),
  };
}

export function benchPromotionPendingEmail(
  p: GameEmailContext & { spotKind: 'primary' | 'plus_one' }
): { subject: string; html: string } {
  const spotLabel = p.spotKind === 'plus_one' ? 'A +1 spot' : 'A spot';
  return {
    subject: `Spot waiting on you — ${p.crewName}, ${p.date}, ${p.time}`,
    html: wrap(`
      <h2 style="margin: 0 0 12px;">Spot waiting on you ⏳</h2>
      <p>${spotLabel} opened up last-minute in the game with <strong>${p.crewName}</strong>:</p>
      <p style="font-size: 18px;"><strong>${gameLine(p)}</strong></p>
      <p>Open the app to <strong>accept</strong> the spot — or decline to pass it to the next player on the bench.</p>
    `),
  };
}
