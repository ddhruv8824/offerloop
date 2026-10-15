/**
 * When a workflow's schedule is due. Pure: no clock of its own, no storage.
 *
 * Schedules are clock times in the user's timezone ("every day at 09:00 in Asia/Kolkata"),
 * while the server may run in UTC — so everything here converts through the timezone.
 */

export type Schedule = { kind: "daily"; time: string } | { kind: "weekly"; day: string; time: string };

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_MS = 86_400_000;

/** Wall-clock parts of an instant in a timezone. */
function partsIn(ts: number, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });
  const p = Object.fromEntries(fmt.formatToParts(new Date(ts)).map((x) => [x.type, Number(x.value)]));
  return { year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute, second: p.second };
}

/** The instant at which the given wall-clock time occurs in a timezone. */
function zonedToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const p = partsIn(guess, timeZone);
  const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - guess;
  return guess - offset;
}

export function isValidTimeZone(timeZone: string | undefined): timeZone is string {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

function parseTime(time: string): [number, number] {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  const h = m ? Number(m[1]) : 9;
  const min = m ? Number(m[2]) : 0;
  return [Math.min(23, Math.max(0, h)), Math.min(59, Math.max(0, min))];
}

/** Does this local calendar day match the schedule? (Daily: always. Weekly: the right weekday.) */
function dayMatches(schedule: Schedule, year: number, month: number, day: number) {
  if (schedule.kind === "daily") return true;
  return DAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] === schedule.day;
}

/** The scheduled instant for the local calendar day that is `offsetDays` from today, or null if that day doesn't match. */
function slot(schedule: Schedule, now: number, timeZone: string, offsetDays: number): number | null {
  const today = partsIn(now, timeZone);
  // Step whole calendar days in UTC-noon space so month and year ends roll over correctly.
  const d = new Date(Date.UTC(today.year, today.month - 1, today.day, 12) + offsetDays * DAY_MS);
  const [y, m, dd] = [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
  if (!dayMatches(schedule, y, m, dd)) return null;
  const [h, min] = parseTime(schedule.time);
  return zonedToUtc(y, m, dd, h, min, timeZone);
}

/** The most recent scheduled instant at or before `now`. */
export function previousOccurrence(schedule: Schedule, now: number, timeZone: string): number {
  for (let back = 0; back >= -8; back--) {
    const at = slot(schedule, now, timeZone, back);
    if (at !== null && at <= now) return at;
  }
  return now - 8 * DAY_MS; // unreachable for valid input
}

/** The first scheduled instant after `now`. */
export function nextOccurrence(schedule: Schedule, now: number, timeZone: string): number {
  for (let ahead = 0; ahead <= 8; ahead++) {
    const at = slot(schedule, now, timeZone, ahead);
    if (at !== null && at > now) return at;
  }
  return now + 8 * DAY_MS; // unreachable for valid input
}

/**
 * Should a scheduled run start now?
 *
 * Yes when a scheduled slot has passed that we haven't run for, and that slot is after the
 * workflow was last saved (so saving a 09:00 workflow at 10:00 waits until tomorrow).
 * After downtime this is true once — for the latest missed slot — not once per missed day.
 */
export function dueSlot(schedule: Schedule, opts: { now: number; timeZone: string; savedAt: number; lastScheduledFor?: number }): number | null {
  const prev = previousOccurrence(schedule, opts.now, opts.timeZone);
  if (prev <= opts.savedAt) return null;
  if (opts.lastScheduledFor !== undefined && prev <= opts.lastScheduledFor) return null;
  return prev;
}
