/**
 * What the Ellé Fitness app sends when a slot is booked.
 *
 * Pure, and deliberately strict. This is the only thing crossing the boundary
 * between two applications, so a malformed payload should produce a clear
 * refusal rather than a workout for the wrong hour.
 */

export interface Booking {
  /** The booking's id in the gym app. Unique, and the whole of idempotency. */
  bookingRef: string;
  slotStartsAt: Date;
  slotMinutes: number;
  /** Only from a workout asked for by hand: upper, lower or full body. */
  focus?: "upper" | "lower" | "full" | null;
  /** Only from a workout asked for by hand: anything she wanted to say. */
  note?: string | null;
}

const FOCUSES = ["upper", "lower", "full"] as const;

/** How long a note may be. Enough for a sentence or two, not an essay. */
const MAX_NOTE = 300;

export type ParseResult =
  | { ok: true; booking: Booking }
  | { ok: false; error: string };

/** A slot longer than this is a mistake somewhere, not a very long workout. */
const MAX_MINUTES = 8 * 60;

export function parseBookingPayload(raw: string): ParseResult {
  let body: unknown;

  try {
    body = JSON.parse(raw);
  } catch {
    return { ok: false, error: "not JSON" };
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "expected an object" };
  }

  const { bookingRef, slotStartsAt, slotMinutes } = body as Record<string, unknown>;

  if (typeof bookingRef !== "string" || bookingRef.trim() === "") {
    return { ok: false, error: "bookingRef must be a non-empty string" };
  }

  if (typeof slotStartsAt !== "string") {
    return { ok: false, error: "slotStartsAt must be an ISO 8601 string" };
  }

  const startsAt = new Date(slotStartsAt);
  if (Number.isNaN(startsAt.getTime())) {
    return { ok: false, error: `slotStartsAt is not a date: ${slotStartsAt}` };
  }

  if (
    typeof slotMinutes !== "number" ||
    !Number.isFinite(slotMinutes) ||
    !Number.isInteger(slotMinutes) ||
    slotMinutes <= 0 ||
    slotMinutes > MAX_MINUTES
  ) {
    return { ok: false, error: "slotMinutes must be a whole number of minutes" };
  }

  return {
    ok: true,
    booking: { bookingRef: bookingRef.trim(), slotStartsAt: startsAt, slotMinutes },
  };
}

/**
 * A workout asked for by hand rather than by a booking: from the "Send a
 * workout now" action, for a session that was never booked in the gym app.
 *
 * Forgiving where the booking webhook is strict, because the only caller is
 * her, pressing a button: no body means a 60 minute session starting now.
 * The reference is the minute it was asked for, so pressing twice by accident
 * within a minute sends one workout, and pressing again later sends another.
 */
export function manualBooking(raw: string, now = new Date()): ParseResult {
  let body: Record<string, unknown> = {};

  if (raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return { ok: false, error: "expected an object" };
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return { ok: false, error: "not JSON" };
    }
  }

  const minutes = body.minutes === undefined || body.minutes === "" ? 60 : Number(body.minutes);
  if (!Number.isInteger(minutes) || minutes < 15 || minutes > 180) {
    return { ok: false, error: "minutes must be a whole number from 15 to 180" };
  }

  // "auto", empty or absent leaves it to the rotation. Anything else that is
  // not one of the three is a mistake worth saying so about.
  const rawFocus = typeof body.focus === "string" ? body.focus.trim().toLowerCase().split(/\s+/)[0] : "";
  if (rawFocus && rawFocus !== "auto" && !FOCUSES.includes(rawFocus as (typeof FOCUSES)[number])) {
    return { ok: false, error: "focus must be auto, upper, lower or full" };
  }
  const focus = FOCUSES.includes(rawFocus as (typeof FOCUSES)[number])
    ? (rawFocus as (typeof FOCUSES)[number])
    : null;

  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, MAX_NOTE) : null;

  const minute = new Date(Math.floor(now.getTime() / 60_000) * 60_000);

  return {
    ok: true,
    booking: {
      bookingRef: `manual-${minute.toISOString()}`,
      slotStartsAt: minute,
      slotMinutes: minutes,
      focus,
      note,
    },
  };
}
