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
