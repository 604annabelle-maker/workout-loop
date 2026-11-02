import { test } from "node:test";
import assert from "node:assert/strict";
import { restText, wrap, WIDTH } from "./text.ts";
import { isoDate, localMidnight, localParts, weekStart } from "./when.ts";

test("wrapping keeps every line within the width", () => {
  const prose = "Tired, slept badly, crampy or just flat? Keep the weights, drop the last set of each superset and leave one more rep in reserve.";
  const lines = wrap(prose);
  assert.ok(lines.length > 1);
  assert.ok(lines.every((l) => l.length <= WIDTH));
  assert.equal(lines.join(" "), prose);
});

test("continuation lines are indented, the first optionally differently", () => {
  const lines = wrap("one two three four five six seven eight nine ten eleven twelve", "   ", "- ", 20);
  assert.equal(lines[0].slice(0, 2), "- ");
  assert.ok(lines.slice(1).every((l) => l.startsWith("   ")));
});

test("nothing to wrap is no lines, and a long word is left whole", () => {
  assert.deepEqual(wrap("   "), []);
  const long = "x".repeat(60);
  assert.deepEqual(wrap(long), [long]);
});

test("rest reads the way it is said", () => {
  assert.equal(restText(0), "");
  assert.equal(restText(60), "60 sec");
  assert.equal(restText(90), "1:30");
  assert.equal(restText(120), "2 min");
  assert.equal(restText(150), "2:30");
});

test("local time is Jerusalem's, across the clock change", () => {
  assert.deepEqual(localParts(new Date("2026-11-01T10:00:00Z")), {
    year: 2026, month: 11, day: 1, hour: 12, minute: 0, weekday: 0,
  });
  // Summer time, three hours ahead; winter, two.
  assert.equal(localMidnight(2026, 10, 18).toISOString(), "2026-10-17T21:00:00.000Z");
  assert.equal(localMidnight(2026, 11, 1).toISOString(), "2026-10-31T22:00:00.000Z");
});

test("the week starts on the Sunday on or before", () => {
  assert.equal(weekStart(new Date("2026-11-01T10:00:00Z")).toISOString(), "2026-10-31T22:00:00.000Z");
  assert.equal(weekStart(new Date("2026-10-31T20:00:00Z")).toISOString(), "2026-10-24T21:00:00.000Z");
  assert.equal(isoDate(weekStart(new Date("2026-10-28T12:00:00Z"))), "2026-10-25");
});
