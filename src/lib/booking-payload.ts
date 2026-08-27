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
}

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
