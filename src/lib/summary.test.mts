import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBrief } from "./coach.ts";
import { bar, heardLines, lastLog, snapshot, trendLine } from "./summary.ts";
import { checkIn, lifted, log, lowerPlan, PREFS, session } from "./test-fixtures.mts";

const NOW = new Date("2026-10-20T15:00:00Z");

test("bars fill to the top of the range and never overflow", () => {
  assert.equal(bar(5, 10), "■■■■■□□□□□");
  assert.equal(bar(30, 10), "■■■■■■■■■■");
  assert.equal(bar(0, 0), "□□□□□□□□□□");
});

test("the snapshot counts today as planned, and only the last seven days", () => {
  const sessions = [session("2026-10-17T15:00:00Z"), session("2026-10-01T15:00:00Z")];
  const brief = buildBrief({ preferences: PREFS, sessions, slot: { startsAt: NOW, minutes: 60 }, sessionNumber: 3 });

  const without = snapshot(sessions, brief, NOW);
  const withToday = snapshot(sessions, brief, NOW, lowerPlan());

  const glutes = (s: typeof without) => s.volume.find((v) => v.muscle === "glutes")!.done;
  assert.equal(glutes(without), 7);
  assert.equal(glutes(withToday), 14);
  assert.equal(withToday.sessions, 2);
  assert.equal(withToday.jumps, 40);
  assert.equal(withToday.volume.find((v) => v.muscle === "glutes")!.status, "in");
});

test("what was heard is said back plainly", () => {
  const lines = heardLines(
    log({
      exercises: [
        lifted("A", "HIP THRUST", 60, [10, 10, 9], "hard"),
        { label: "B2", name: "CHEST SUPPORTED ROW", sets: [], effort: "", skipped: true, note: "" },
      ],
      checkIn: checkIn({ energy: 3, enjoyment: 5, periodStarted: true, pain: ["left knee"] }),
      requests: "more jumps",
    }),
  );
  assert.deepEqual(lines, [
    "Hip thrust: 60kg x 10, 10, 9, hard",
    "Chest supported row: skipped",
    "energy 3/5, fun 5/5, period started",
    "Pain: left knee",
    "Asked for: more jumps",
  ]);
  assert.deepEqual(heardLines(null), []);
});

test("several replies to one workout merge, the later winning", () => {
  const latest = lastLog([
    session("2026-10-10T15:00:00Z", { logs: [log({ checkIn: checkIn({ energy: 1 }) })] }),
    session("2026-10-17T15:00:00Z", {
      logs: [
        log({ exercises: [lifted("A", "HIP THRUST", 60, [8])], checkIn: checkIn({ energy: 4 }) }),
        log({ exercises: [lifted("A", "HIP THRUST", 60, [10])], checkIn: checkIn({ enjoyment: 5 }) }),
      ],
    }),
  ])!;
  assert.equal(latest.log.exercises.length, 1);
  assert.equal(latest.log.exercises[0].sets[0].reps, 10);
  assert.equal(latest.log.checkIn.energy, 4);
  assert.equal(latest.log.checkIn.enjoyment, 5);
});

test("no reply to the latest session means nothing to show, even if older ones had one", () => {
  assert.equal(
    lastLog([
      session("2026-10-10T15:00:00Z", { logs: [log({ checkIn: checkIn({ energy: 4 }) })] }),
      session("2026-10-17T15:00:00Z"),
    ]),
    null,
  );
});

test("a trend reads as from, to and the change", () => {
  assert.equal(
    trendLine({ name: "HIP THRUST", from: { weightKg: 60, reps: 8 }, to: { weightKg: 70, reps: 10 }, change: 21 }),
    "Hip thrust 60kg x 8 → 70kg x 10 (+21%)",
  );
});
