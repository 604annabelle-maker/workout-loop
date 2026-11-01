/**
 * Saying when something is, in the only timezone that matters here.
 *
 * The gym is in Jerusalem and so is the person. Every timestamp is stored as an
 * absolute instant, so this is the single place that turns one into words. Two
 * copies of a timezone are two copies that can drift.
 */

const ZONE = "Asia/Jerusalem";

const DATE_AND_TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const DATE_ONLY = new Intl.DateTimeFormat("en-GB", {
  timeZone: ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
});

/** "Wed, 26 Aug 2026, 18:00" */
export function dateAndTime(at: Date): string {
  return DATE_AND_TIME.format(at);
}

/** "Wed 26 Aug". Intl drops the comma when the year is absent. */
export function dateOnly(at: Date): string {
  return DATE_ONLY.format(at);
}

const PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  weekday: "short",
});

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 0 is Sunday, which is when the week starts here. */
  weekday: number;
}

/** The wall clock in Jerusalem at an instant. */
export function localParts(at: Date): LocalParts {
  const get = (type: string) => PARTS.formatToParts(at).find((p) => p.type === type)?.value ?? "0";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: WEEKDAYS.indexOf(get("weekday")),
  };
}

/** How far ahead of UTC Jerusalem is at an instant, in milliseconds. */
function offsetAt(at: Date): number {
  const p = localParts(at);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return asUtc - (at.getTime() - (at.getTime() % 60_000));
}

/** The instant it is midnight in Jerusalem on a calendar date. */
export function localMidnight(year: number, month: number, day: number): Date {
  const guess = Date.UTC(year, month - 1, day);
  const first = guess - offsetAt(new Date(guess));
  // Once more from the corrected guess, in case a clock change sits between.
  return new Date(guess - offsetAt(new Date(first)));
}

/** Midnight at the start of the Sunday on or before an instant. */
export function weekStart(at: Date): Date {
  const p = localParts(at);
  return localMidnight(p.year, p.month, p.day - p.weekday);
}

/** "2026-11-01", the calendar date in Jerusalem. */
export function isoDate(at: Date): string {
  const p = localParts(at);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Days since the epoch, by the calendar in Jerusalem. Differences are whole days. */
export function dayNumber(at: Date): number {
  const p = localParts(at);
  return Math.round(Date.UTC(p.year, p.month - 1, p.day) / 86_400_000);
}
