import { test } from "node:test";
import assert from "node:assert/strict";
import { mainExercises } from "./plan.ts";
import { performancesIn } from "./progress.ts";
import { applyTap, emptyTaps, readTaps, summary, tapsToLog, type Taps } from "./taps.ts";
import { lowerPlan, session } from "./test-fixtures.mts";

const PLAN = lowerPlan();
const LABELS = mainExercises(PLAN).map((e) => e.label);
const NOW = new Date("2026-10-20T16:00:00Z");

function tap(taps: Taps, ex: string, how?: string, note?: string) {
  const out = applyTap(taps, { ex, how, note }, LABELS, NOW);
  assert.ok(out, `${ex} ${how ?? ""} ${note ?? ""} should save`);
  return out;
}

test("the last tap counts", () => {
  let t = tap(emptyTaps(), "A", "hard").taps;
  const out = tap(t, "A", "done");
  t = out.taps;
  assert.equal(t.entries.A.how, "done");
  assert.equal(out.saved, "done");
});

test("undo clears an exercise back to nothing logged", () => {
  const t = tap(tap(emptyTaps(), "A", "easy").taps, "A", "clear");
  assert.equal(t.taps.entries.A, undefined);
  assert.equal(t.saved, "cleared");
});

test("a note typed after undo is kept on its own", () => {
  const t = tap(tap(emptyTaps(), "A", "easy").taps, "A", "clear", "machine was taken");
  assert.deepEqual([t.taps.entries.A.how, t.taps.entries.A.note], [null, "machine was taken"]);
});

test("a new note replaces the old, and keeps the pill", () => {
  let t = tap(emptyTaps(), "C1", "hard", "60kg 8 8 6").taps;
  const out = tap(t, "C1", undefined, "60kg 8 8 7");
  t = out.taps;
  assert.deepEqual([t.entries.C1.how, t.entries.C1.note], ["hard", "60kg 8 8 7"]);
  assert.equal(out.saved, 'hard, "60kg 8 8 7"');
});

test("all done marks everything not yet tapped as done", () => {
  const t = tap(tap(emptyTaps(), "B", "skip").taps, "all", "alldone");
  assert.deepEqual(
    LABELS.map((l) => t.taps.entries[l].how),
    ["done", "skip", "done", "done", "done"],
  );
  assert.equal(t.saved, "everything else done");
});

test("an unlogged workout can be marked skipped in one tap", () => {
  const t = tap(emptyTaps(), "all", "skipall");
  assert.ok(LABELS.every((l) => t.taps.entries[l].how === "skip"));
});

test("a comment about the day is kept", () => {
  const t = tap(emptyTaps(), "all", undefined, "had tabata yesterday");
  assert.equal(t.taps.comment, "had tabata yesterday");
});

test("a post that makes no sense for this workout is refused", () => {
  assert.equal(applyTap(emptyTaps(), { ex: "Z9", how: "done" }, LABELS, NOW), null);
  assert.equal(applyTap(emptyTaps(), { ex: "A", how: "maybe" }, LABELS, NOW), null);
  assert.equal(applyTap(emptyTaps(), { ex: "all" }, LABELS, NOW), null);
  // Warm up items have no buttons.
  assert.equal(applyTap(emptyTaps(), { ex: "W1", how: "done" }, LABELS, NOW), null);
});

test("notes are capped, and stored taps are checked on the way back in", () => {
  const t = tap(emptyTaps(), "A", undefined, "x".repeat(400));
  assert.equal(t.taps.entries.A.note.length, 300);
  const read = readTaps({ entries: { a: { how: "done", note: 7 }, B: { how: "nonsense" } }, comment: 5 });
  assert.deepEqual(Object.keys(read.entries), ["A"]);
  assert.equal(read.comment, "");
});

test("the summary line says what is logged so far", () => {
  let t = tap(emptyTaps(), "A", "done").taps;
  t = tap(t, "C1", "swap").taps;
  t = tap(t, "C2", undefined, "elbow sore").taps;
  assert.equal(summary(t, LABELS), "A done · C1 did the swap · C2 note");
  assert.equal(summary(emptyTaps(), LABELS), "nothing yet");
});

function performances(taps: Taps) {
  const { log } = tapsToLog(PLAN, taps);
  return new Map(performancesIn(session("2026-10-20T15:00:00Z", { logs: [log] })).map((p) => [p.label, p]));
}

test("taps become the same log a reply makes, and the coach reads them the same way", () => {
  let t = tap(emptyTaps(), "A", "easy").taps;
  t = tap(t, "B", "skip").taps;
  t = tap(t, "C1", "hard", "60kg 8 8 6").taps;
  t = tap(t, "C2", "swap").taps;
  const p = performances(t);

  assert.equal(p.get("A")!.effort, "easy");
  assert.equal(p.get("A")!.logged!.length, 4);
  assert.equal(p.get("B")!.skipped, true);
  assert.deepEqual(p.get("C1")!.logged!.map((s) => [s.weightKg, s.reps]), [
    [60, 8],
    [60, 8],
    [60, 6],
  ]);
  assert.equal(p.get("C1")!.effort, "hard");
  assert.equal(p.get("C2")!.name, "LYING LEG CURL");
  // Nothing tapped for the crunch: nothing assumed.
  assert.equal(p.get("K1")!.logged, null);
});

test("a note with numbers and no pill logs the exercise; one with only words logs nothing", () => {
  let t = tap(emptyTaps(), "C1", undefined, "65kg 8 8 8").taps;
  t = tap(t, "C2", undefined, "machine was taken").taps;
  const p = performances(t);
  assert.equal(p.get("C1")!.logged![0].weightKg, 65);
  assert.equal(p.get("C2")!.logged, null);
  assert.equal(p.get("C2")!.skipped, false);
});

test("her words reach the coach as notes, and pain is picked out", () => {
  let t = tap(emptyTaps(), "C2", "done", "knee hurts at the bottom").taps;
  t = tap(t, "all", undefined, "had tabata yesterday").taps;
  const { log, notes } = tapsToLog(PLAN, t);
  assert.deepEqual(notes, ["C2 SEATED LEG CURL: knee hurts at the bottom", "had tabata yesterday"]);
  assert.equal(log.checkIn.pain.length, 1);
});
