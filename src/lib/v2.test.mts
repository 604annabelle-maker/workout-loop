import assert from "node:assert/strict";
import test from "node:test";
import { isCheckinDay } from "./checkin.ts";
import { positionFor } from "./v2.ts";

test("asking for upper gives the next upper day in order; nothing asked, the next session", () => {
  assert.equal(positionFor(null, null), undefined);
  assert.equal(positionFor({ type: "back_biceps", cycle: 0, index: 0 }, "upper")!.type, "chest_triceps");
  assert.equal(positionFor({ type: "chest_triceps", cycle: 0, index: 2 }, "lower")!.type, "quads_glutes");
  assert.equal(positionFor({ type: "back_biceps", cycle: 0, index: 0 }, "full")!.type, "full");
});

test("the check-in goes out on the first Sunday of the month, in the morning in Jerusalem", () => {
  assert.equal(isCheckinDay(new Date("2026-12-06T08:00:00Z")), true, "Sunday 6 December, 10am");
  assert.equal(isCheckinDay(new Date("2026-12-13T08:00:00Z")), false, "second Sunday");
  assert.equal(isCheckinDay(new Date("2026-12-05T08:00:00Z")), false, "a Saturday");
  assert.equal(isCheckinDay(new Date("2026-12-06T03:00:00Z")), false, "too early");
});
