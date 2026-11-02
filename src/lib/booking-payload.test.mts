import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBookingPayload } from "./booking-payload.ts";

const GOOD = JSON.stringify({
  bookingRef: "gym-booking-42",
  slotStartsAt: "2026-08-26T15:00:00.000Z",
  slotMinutes: 60,
});

function errorFor(body: unknown): string {
  const result = parseBookingPayload(
    typeof body === "string" ? body : JSON.stringify(body),
  );
  assert.equal(result.ok, false, "expected this to be rejected");
  return result.ok ? "" : result.error;
}

test("a well-formed booking parses", () => {
  const result = parseBookingPayload(GOOD);

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.booking.bookingRef, "gym-booking-42");
  assert.equal(result.booking.slotMinutes, 60);
  assert.equal(result.booking.slotStartsAt.toISOString(), "2026-08-26T15:00:00.000Z");
});

test("surrounding whitespace on the reference is trimmed", () => {
  const result = parseBookingPayload(
    JSON.stringify({ bookingRef: "  ref  ", slotStartsAt: "2026-08-26T15:00:00Z", slotMinutes: 60 }),
  );

  assert.equal(result.ok && result.booking.bookingRef, "ref");
});

test("anything that is not a JSON object is refused", () => {
  assert.match(errorFor("not json at all"), /not JSON/);
  assert.match(errorFor([1, 2]), /expected an object/);
  assert.match(errorFor(null), /expected an object/);
  assert.match(errorFor("42"), /expected an object/);
});

test("a missing or empty booking reference is refused", () => {
  assert.match(errorFor({ slotStartsAt: "2026-08-26T15:00:00Z", slotMinutes: 60 }), /bookingRef/);
  assert.match(errorFor({ bookingRef: "   ", slotStartsAt: "2026-08-26T15:00:00Z", slotMinutes: 60 }), /bookingRef/);
  assert.match(errorFor({ bookingRef: 42, slotStartsAt: "2026-08-26T15:00:00Z", slotMinutes: 60 }), /bookingRef/);
});

test("an unparseable date is refused rather than silently becoming now", () => {
  assert.match(errorFor({ bookingRef: "r", slotStartsAt: "next tuesday", slotMinutes: 60 }), /not a date/);
  assert.match(errorFor({ bookingRef: "r", slotMinutes: 60 }), /ISO 8601/);
  assert.match(errorFor({ bookingRef: "r", slotStartsAt: 1756220400000, slotMinutes: 60 }), /ISO 8601/);
});

test("a nonsense duration is refused", () => {
  for (const slotMinutes of [0, -30, 1.5, 9 * 60, "60", null, NaN]) {
    assert.match(
      errorFor({ bookingRef: "r", slotStartsAt: "2026-08-26T15:00:00Z", slotMinutes }),
      /slotMinutes/,
      `expected ${String(slotMinutes)} to be refused`,
    );
  }
});

test("extra fields are ignored rather than refused", () => {
  const result = parseBookingPayload(
    JSON.stringify({
      bookingRef: "r",
      slotStartsAt: "2026-08-26T15:00:00Z",
      slotMinutes: 60,
      somethingTheGymAppAddedLater: true,
    }),
  );

  assert.equal(result.ok, true);
});

import { manualBooking } from "./booking-payload.ts";

const NOW = new Date("2026-11-02T07:15:42.123Z");

test("a manual request with no body is a 60 minute session starting now", () => {
  const result = manualBooking("", NOW);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.booking.slotMinutes, 60);
  assert.equal(result.booking.slotStartsAt.toISOString(), "2026-11-02T07:15:00.000Z");
  assert.equal(result.booking.bookingRef, "manual-2026-11-02T07:15:00.000Z");
});

test("a manual request can say how long, as a number or the string a form sends", () => {
  for (const minutes of [45, "45"]) {
    const result = manualBooking(JSON.stringify({ minutes }), NOW);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.booking.slotMinutes, 45);
  }
});

test("pressing twice within a minute is one workout; later is another", () => {
  const a = manualBooking("", NOW);
  const b = manualBooking("", new Date(NOW.getTime() + 10_000));
  const c = manualBooking("", new Date(NOW.getTime() + 90_000));
  assert.ok(a.ok && b.ok && c.ok);
  if (!a.ok || !b.ok || !c.ok) return;
  assert.equal(a.booking.bookingRef, b.booking.bookingRef);
  assert.notEqual(a.booking.bookingRef, c.booking.bookingRef);
});

test("a manual request with nonsense is refused, not guessed at", () => {
  assert.equal(manualBooking("not json", NOW).ok, false);
  assert.equal(manualBooking("[1]", NOW).ok, false);
  assert.equal(manualBooking(JSON.stringify({ minutes: 5 }), NOW).ok, false);
  assert.equal(manualBooking(JSON.stringify({ minutes: 45.5 }), NOW).ok, false);
});
