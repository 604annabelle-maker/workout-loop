import assert from "node:assert/strict";
import test from "node:test";
import { simulate } from "./fixtures.mts";
import { targets } from "./skeleton.ts";
import { weekSummary } from "./summary.ts";

test("the summary counts only what was logged since Sunday, plus today as planned", async () => {
  const h = await simulate(5, { seed: 4, start: new Date("2026-11-08T08:00:00Z") });
  const sunday = new Date("2026-11-14T22:00:00Z"); // Sunday 15 November, midnight in Jerusalem
  const rows = weekSummary({ history: h.slice(0, -1), today: h[h.length - 1].plan, weekStart: sunday, targets: targets() });
  const before = h.slice(0, -1).filter((s) => s.date >= sunday);
  const total = rows.reduce((s, r) => s + r.done, 0);
  if (!before.some((s) => s.logs.length)) assert.equal(total, 0);
  assert.ok(rows.some((r) => r.today > 0));
  const none = weekSummary({ history: h.slice(0, -1), today: h[h.length - 1].plan, weekStart: new Date("2027-01-01"), targets: targets() });
  assert.equal(none.reduce((s, r) => s + r.done, 0), 0, "a new week starts at zero");
  assert.equal(rows.find((r) => r.muscle === "biceps")!.target, 12.5);
});
