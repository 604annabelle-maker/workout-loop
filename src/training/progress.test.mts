import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_EQUIPMENT as EQ, loadable } from "./equipment.ts";
import { effortLine, next, stalled } from "./progress.ts";
import type { PlanV2, SessionRecord, Tap } from "./types.ts";

const DAY = 864e5;
const t0 = new Date("2026-11-15T08:00:00Z");

/** A history of one exercise: each entry is the weight, reps per set and tap. */
function hist(id: string, load: SessionRecord["plan"]["exercises"][number]["main"]["load"], range: [number, number], entries: [number | null, number[], Tap][]): SessionRecord[] {
  return entries.map(([weight, reps, tap], i) => {
    const main = { exerciseId: id, load, weight, steps: [], reps: reps[0], range, findIt: false };
    const plan: PlanV2 = {
      version: 2,
      position: { type: "upper_a", cycle: i, index: 0 },
      deload: false,
      exercises: [{ slot: "upper_a:1", muscle: "chest", class: "heavy", sets: reps.length, rest: 165, effort: "", main, swap: null }],
      warmup: [],
      changes: [],
      minutes: 50,
    };
    return { workoutId: `w${i}`, date: new Date(t0.getTime() + i * 7 * DAY), plan, logs: [{ slot: "upper_a:1", exerciseId: id, usedSwap: false, weight, reps, tap }] };
  });
}
const bench = (entries: [number | null, number[], Tap][], range: [number, number] = [5, 8]) =>
  next({ exerciseId: "Barbell_Bench_Press_-_Medium_Grip", load: "barbell", range, history: hist("Barbell_Bench_Press_-_Medium_Grip", "barbell", range, entries), equipment: EQ, now: new Date(t0.getTime() + 60 * DAY) });

test("first time: no weight is prescribed, she finds it, starting light", () => {
  const n = next({ exerciseId: "Barbell_Bench_Press_-_Medium_Grip", load: "barbell", range: [5, 8], history: [], equipment: EQ });
  assert.equal(n.findIt, true);
  assert.equal(n.weight, 20);
  assert.equal(n.reps, 5);
});

test("every set at the top, done or easy: a step heavier, back to the bottom", () => {
  for (const tap of ["done", "easy"] as Tap[]) {
    const n = bench([[40, [8, 8, 8], tap]]);
    assert.equal(n.weight, 42.5);
    assert.equal(n.reps, 5);
  }
});

test("every set at the top but hard: same weight, repeat", () => {
  const n = bench([[40, [8, 8, 8], "hard"]]);
  assert.equal(n.weight, 40);
  assert.equal(n.reps, 8);
});

test("inside the range: same weight, one more rep; hard holds the reps", () => {
  assert.deepEqual([bench([[40, [6, 6, 6], "done"]]).weight, bench([[40, [6, 6, 6], "done"]]).reps], [40, 7]);
  assert.deepEqual([bench([[40, [6, 6, 6], "hard"]]).weight, bench([[40, [6, 6, 6], "hard"]]).reps], [40, 6]);
});

test("below the bottom once holds; twice in a row drops about 10% to a weight that exists", () => {
  assert.equal(bench([[40, [5, 4, 4], "hard"]]).weight, 40);
  const n = bench([[40, [5, 4, 4], "hard"], [40, [4, 4, 3], "hard"]]);
  assert.equal(n.weight, 35);
  assert.ok(loadable("barbell", EQ).includes(n.weight!));
  assert.equal(n.reps, 5);
});

test("a step more than 10% heavier raises the top of the range first", () => {
  const range: [number, number] = [10, 15];
  const h = hist("Dumbbell_Bicep_Curl", "dumbbell", range, [[6, [15, 15, 15], "done"]]);
  const n = next({ exerciseId: "Dumbbell_Bicep_Curl", load: "dumbbell", range, history: h, equipment: EQ });
  assert.equal(n.weight, 6, "6 to 7 kg is 17%: no jump yet");
  assert.deepEqual(n.range, [10, 19]);
  assert.equal(n.reps, 16);
  const atTop = next({ exerciseId: "Dumbbell_Bicep_Curl", load: "dumbbell", range, history: hist("Dumbbell_Bicep_Curl", "dumbbell", [10, 19], [[6, [19, 19, 19], "done"]]), equipment: EQ });
  assert.equal(atTop.weight, 7);
  assert.equal(atTop.reps, 10);
});

test("three sessions without beating the best is a stall: drop 10% and rebuild", () => {
  const entries: [number, number[], Tap][] = [[50, [6, 6, 6], "done"], [50, [6, 6, 5], "done"], [50, [6, 5, 5], "done"], [50, [6, 6, 5], "done"]];
  const h = hist("x", "barbell", [5, 8], entries);
  assert.equal(stalled([...h].map((s) => ({ date: s.date, range: [5, 8] as [number, number], weight: s.logs[0].weight, reps: s.logs[0].reps, tap: s.logs[0].tap }))), true);
  const n = bench(entries);
  assert.equal(n.weight, 45);
  assert.equal(n.why, "stall");
});

test("a second stall within eight weeks swaps the exercise", () => {
  const n = bench([
    [50, [6, 6, 6], "done"], [50, [6, 6, 5], "done"], [50, [6, 5, 5], "done"], [50, [6, 6, 5], "done"],
    [45, [6, 6, 6], "done"], [45, [6, 6, 5], "done"], [45, [6, 5, 5], "done"], [45, [6, 6, 5], "done"],
  ]);
  assert.equal(n.why, "stall");
  assert.equal(n.swapExercise, true);
});

test("too easy, said in a note: heavier now", () => {
  const h = hist("Barbell_Bench_Press_-_Medium_Grip", "barbell", [5, 8], [[40, [6, 6, 6], "done"]]);
  const n = next({
    exerciseId: "Barbell_Bench_Press_-_Medium_Grip", load: "barbell", range: [5, 8], history: h, equipment: EQ,
    notes: [{ id: "n1", reason: "too_easy", exerciseId: "Barbell_Bench_Press_-_Medium_Grip", text: "way too light", createdAt: new Date(t0.getTime() + DAY), undoneAt: null }],
  });
  assert.equal(n.weight, 42.5);
});

test("an exercise she did not tap does not move", () => {
  const h = hist("Barbell_Bench_Press_-_Medium_Grip", "barbell", [5, 8], [[40, [6, 6, 6], "done"]]);
  const untapped = { ...h[0], workoutId: "w9", date: new Date(t0.getTime() + 3 * DAY), logs: [] };
  const a = next({ exerciseId: "Barbell_Bench_Press_-_Medium_Grip", load: "barbell", range: [5, 8], history: h, equipment: EQ });
  const b = next({ exerciseId: "Barbell_Bench_Press_-_Medium_Grip", load: "barbell", range: [5, 8], history: [...h, untapped], equipment: EQ });
  assert.deepEqual([a.weight, a.reps], [b.weight, b.reps]);
});

test("bodyweight: reps go up, then a harder variation", () => {
  const range: [number, number] = [8, 12];
  const mid = next({ exerciseId: "Pushups", load: "bodyweight", range, history: hist("Pushups", "bodyweight", range, [[null, [10, 10, 9], "done"]]), equipment: EQ });
  assert.equal(mid.weight, null);
  assert.equal(mid.reps, 10);
  const top = next({ exerciseId: "Pushups", load: "bodyweight", range, history: hist("Pushups", "bodyweight", range, [[null, [12, 12, 12], "easy"]]), equipment: EQ });
  assert.equal(top.readyForHarder, true);
});

test("the effort line is plain words and never says RIR", () => {
  for (const c of ["heavy", "compound", "isolation"] as const) {
    assert.ok(!/rir/i.test(effortLine(c)));
    assert.match(effortLine(c), /left/);
  }
  assert.match(effortLine("heavy", true), /easy week/);
});

test("after a stall drop, the next session does not count as another stall", () => {
  const n = bench([[50, [6, 6, 6], "done"], [50, [6, 6, 5], "done"], [50, [6, 5, 5], "done"], [50, [6, 6, 5], "done"], [45, [6, 6, 6], "done"]]);
  assert.notEqual(n.why, "stall");
  assert.equal(n.weight, 45);
  assert.equal(n.reps, 7);
});
