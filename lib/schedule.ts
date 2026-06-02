/**
 * Weekly-schedule expansion shared by the recurring creator and the Rotation tab.
 *
 * A fixed weekly schedule is a set of slots (day-of-week + start/end time). Each
 * slot can be split into fixed-length blocks (e.g. a Mon 18:00–20:00 slot becomes
 * two 1-hour games). Expanding a schedule over a date range yields concrete event
 * blocks sorted chronologically — ready to create and/or round-robin assign across.
 */

export interface ScheduleSlot {
  dayOfWeek: number; // 0 (Sun) – 6 (Sat)
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
}

export interface ScheduleBlock {
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function toHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Split a [start, end] window into consecutive blocks of `blockMinutes`. A
 * trailing partial block (if the window isn't evenly divisible) is kept so no
 * time is lost. `blockMinutes <= 0` or longer than the window returns the whole
 * window as a single block.
 */
export function splitIntoBlocks(
  startTime: string,
  endTime: string,
  blockMinutes: number
): { startTime: string; endTime: string }[] {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  if (end <= start) return [{ startTime, endTime }];
  if (!blockMinutes || blockMinutes <= 0 || blockMinutes >= end - start) {
    return [{ startTime, endTime }];
  }
  const blocks: { startTime: string; endTime: string }[] = [];
  let cur = start;
  while (cur < end) {
    const next = Math.min(cur + blockMinutes, end);
    blocks.push({ startTime: toHHMM(cur), endTime: toHHMM(next) });
    cur = next;
  }
  return blocks;
}

/** YYYY-MM-DD dates for a weekday within [startDate, endDate] (UTC-safe). */
export function datesForWeekday(startDate: string, endDate: string, dayOfWeek: number): string[] {
  if (!startDate || !endDate) return [];
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);
  const cur = new Date(Date.UTC(sy, sm - 1, sd));
  const end = new Date(Date.UTC(ey, em - 1, ed));
  if (isNaN(cur.getTime()) || isNaN(end.getTime())) return [];
  const out: string[] = [];
  while (cur.getUTCDay() !== dayOfWeek && cur <= end) cur.setUTCDate(cur.getUTCDate() + 1);
  while (cur <= end) {
    out.push(cur.toISOString().split('T')[0]);
    cur.setUTCDate(cur.getUTCDate() + 7);
  }
  return out;
}

/**
 * Expand a weekly schedule into concrete event blocks across a date range,
 * sorted by date then start time (so a round-robin slide flows naturally through
 * the week). `blockMinutes = 0` keeps each slot as a single game.
 */
export function expandWeeklySchedule(
  slots: ScheduleSlot[],
  blockMinutes: number,
  startDate: string,
  endDate: string
): ScheduleBlock[] {
  const blocks: ScheduleBlock[] = [];
  for (const slot of slots) {
    if (!slot.startTime || !slot.endTime) continue;
    const dates = datesForWeekday(startDate, endDate, slot.dayOfWeek);
    const pieces = splitIntoBlocks(slot.startTime, slot.endTime, blockMinutes);
    for (const date of dates) {
      for (const piece of pieces) {
        blocks.push({ date, startTime: piece.startTime, endTime: piece.endTime });
      }
    }
  }
  blocks.sort((a, b) =>
    a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date)
  );
  return blocks;
}

export const DAYS_OF_WEEK = [
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
];

export const TIME_OPTIONS = Array.from({ length: 24 * 4 }, (_, i) => {
  const h = String(Math.floor(i / 4)).padStart(2, '0');
  const m = String((i % 4) * 15).padStart(2, '0');
  return `${h}:${m}`;
});

export const BLOCK_LENGTH_OPTIONS = [
  { value: '0', label: 'Whole slot (no split)' },
  { value: '30', label: '30-min blocks' },
  { value: '45', label: '45-min blocks' },
  { value: '60', label: '1-hour blocks' },
  { value: '90', label: '90-min blocks' },
  { value: '120', label: '2-hour blocks' },
];
