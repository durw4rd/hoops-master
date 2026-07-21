/**
 * Plain-HTML email templates. Dates/times are pre-formatted by the caller in
 * the crew's timezone (utcToZonedParts).
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
  return `${title}${p.date} ${p.time}${loc}`;
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

export function gameReminderEmail(p: GameEmailContext): { subject: string; html: string } {
  return {
    subject: `Game in 2 days — ${p.crewName}, ${p.date} ${p.time}`,
    html: wrap(`
      <h2 style="margin: 0 0 12px;">Ball in 2 days 🏀</h2>
      <p>You're in the run with <strong>${p.crewName}</strong>:</p>
      <p style="font-size: 18px;"><strong>${gameLine(p)}</strong></p>
      <p>Can't make it? Release or offer your spot in the app so someone from the bench can take it.</p>
    `),
  };
}

export function benchPromotionEmail(
  p: GameEmailContext & { spotKind: 'primary' | 'plus_one' }
): { subject: string; html: string } {
  const isPlusOne = p.spotKind === 'plus_one';
  return {
    subject: isPlusOne
      ? `Your +1 is in — ${p.crewName}, ${p.date} ${p.time}`
      : `You're in — ${p.crewName}, ${p.date} ${p.time}`,
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
    subject: `Spot waiting on you — ${p.crewName}, ${p.date} ${p.time}`,
    html: wrap(`
      <h2 style="margin: 0 0 12px;">Spot waiting on you ⏳</h2>
      <p>${spotLabel} opened up last-minute in the game with <strong>${p.crewName}</strong>:</p>
      <p style="font-size: 18px;"><strong>${gameLine(p)}</strong></p>
      <p>Open the app to <strong>accept</strong> the spot — or decline to pass it to the next player on the bench.</p>
    `),
  };
}
