/**
 * Timezone helpers.
 *
 * Event instants are stored as TIMESTAMPTZ (absolute). The group's IANA timezone
 * is the single source of truth for converting between the admin's local wall-clock
 * input (YYYY-MM-DD + HH:MM) and the stored instant, and for rendering back.
 *
 * No external dependency: uses Intl.DateTimeFormat to resolve zone offsets.
 */

const PAD = (n: number) => String(n).padStart(2, '0');

/**
 * Offset (ms) of `timeZone` from UTC at the given absolute instant.
 * Positive means the zone is ahead of UTC.
 */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(instant);
  const map: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = Number(p.value);
  }
  // Intl can emit hour '24' at midnight; normalize.
  const hour = map.hour === 24 ? 0 : map.hour;
  const asUTC = Date.UTC(map.year, map.month - 1, map.day, hour, map.minute, map.second);
  return asUTC - instant.getTime();
}

/**
 * Convert a local wall-clock date+time in `timeZone` to an absolute UTC Date.
 *
 * @param dateStr "YYYY-MM-DD"
 * @param timeStr "HH:MM" (defaults to "00:00")
 */
export function zonedToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = (timeStr || '00:00').split(':').map(Number);
  // First guess: pretend the wall time is UTC, then correct by the zone offset.
  const utcGuess = Date.UTC(y, m - 1, d, hh, mm, 0);
  const offset = zoneOffsetMs(new Date(utcGuess), timeZone);
  return new Date(utcGuess - offset);
}

interface ZonedParts {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
}

/**
 * Render an absolute instant into local date/time parts for `timeZone`.
 */
/**
 * Human-friendly local date/time parts for emails: date like "Wed Jul 22",
 * time like "18:00".
 */
export function utcToZonedFriendlyParts(instant: Date, timeZone: string): ZonedParts {
  const { time } = utcToZonedParts(instant, timeZone);
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(instant)) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  return { date: `${map.weekday} ${map.month} ${map.day}`, time };
}

export function utcToZonedParts(instant: Date, timeZone: string): ZonedParts {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const parts = dtf.formatToParts(instant);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  const hour = map.hour === '24' ? '00' : map.hour;
  return {
    date: `${map.year}-${map.month}-${map.day}`,
    time: `${hour}:${map.minute}`,
  };
}

/**
 * Day-of-week (0=Sun..6=Sat) of an instant in a given zone.
 */
export function zonedDayOfWeek(instant: Date, timeZone: string): number {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(instant);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[wd] ?? 0;
}

/** Format an ISO/epoch-safe immediate-open sentinel. */
export const ALWAYS_OPEN_SENTINEL = '1970-01-01T00:00:00.000Z';

export { PAD };
