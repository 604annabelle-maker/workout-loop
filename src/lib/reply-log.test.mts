import { test } from "node:test";
import assert from "node:assert/strict";
import { isEmptyLog, parseShorthand, readReplyLog, REPLY_LOG_SCHEMA, setsIn, type Prescribed } from "./reply-log.ts";

const PLAN: Prescribed[] = [
  { label: "A", name: "HIP THRUST", sets: 4, loadKg: 60 },
  { label: "B1", name: "ROMANIAN DEADLIFT", sets: 3, loadKg: 40 },
  { label: "B2", name: "PULL UP", sets: 3, loadKg: 0 },
  { label: "C", name: "LEG CURL", sets: 3, loadKg: 30 },
];

test("weight times reps, spaced, comma'd or slashed", () => {
  const log = parseShorthand("A 62.5 x 10 10 9\nB1 40x12,12,11\nC 30 kg x 12/12/12", PLAN);
  assert.deepEqual(log.exercises.filter((e) => e.sets.length).map((e) => [e.label, e.sets.map((s) => `${s.weightKg}x${s.reps}`).join(" ")]), [
    ["A", "62.5x10 62.5x10 62.5x9"],
    ["B1", "40x12 40x12 40x11"],
    ["C", "30x12 30x12 30x12"],
  ]);
});

test("a decimal comma is a decimal", () => {
  const log = parseShorthand("A 62,5 x 8 8 8", PLAN);
  assert.equal(log.exercises[0].sets[0].weightKg, 62.5);
});

test("reps alone are at the prescribed load", () => {
  const log = parseShorthand("B2 8 7 6\nA 10 10 10", PLAN);
  assert.deepEqual(log.exercises[0].sets, [
    { weightKg: 0, reps: 8 },
    { weightKg: 0, reps: 7 },
    { weightKg: 0, reps: 6 },
  ]);
  assert.equal(log.exercises[1].sets[0].weightKg, 60);
});

test("effort words and skips are read", () => {
  const log = parseShorthand("A 60 x 8 8 6 hard\nB1 skipped\nC done", PLAN);
  assert.equal(log.exercises[0].effort, "hard");
  assert.equal(log.exercises[1].skipped, true);
  assert.equal(log.exercises[2].effort, "right");
});

test("labels are case insensitive, and a label not in the plan is left alone", () => {
  const log = parseShorthand("a 60 x 10\nZ 50 x 10", PLAN);
  assert.deepEqual(log.exercises.filter((e) => e.sets.length).map((e) => e.label), ["A"]);
  assert.ok(!log.exercises.some((e) => e.label === "Z"));
});

test("check in ratings, symptoms and a period start", () => {
  const log = parseShorthand("energy 2, sleep 3, sore 4, fun 5\nperiod started today, cramps", PLAN);
  assert.equal(log.checkIn.energy, 2);
  assert.equal(log.checkIn.sleep, 3);
  assert.equal(log.checkIn.soreness, 4);
  assert.equal(log.checkIn.enjoyment, 5);
  assert.equal(log.checkIn.periodStarted, true);
  assert.equal(log.checkIn.cycleDay, 1);
  assert.deepEqual(log.checkIn.symptoms, ["cramps"]);
});

test("a cycle day can be given directly", () => {
  assert.equal(parseShorthand("cycle day 14", PLAN).checkIn.cycleDay, 14);
});

test("pain is kept in her words", () => {
  const log = parseShorthand("my left knee hurts on lunges", PLAN);
  assert.equal(log.checkIn.pain.length, 1);
  assert.match(log.checkIn.pain[0], /left knee/);
});

test("prose with nothing structured gives an empty log", () => {
  const log = parseShorthand("Great session, loved it.", PLAN);
  assert.equal(log.exercises.length, 0);
  assert.ok(isEmptyLog(log));
});

test("reading clamps ratings and drops impossible sets", () => {
  const log = readReplyLog({
    exercises: [
      { label: "a", name: "hip thrust", sets: [{ weightKg: 60, reps: 10 }, { weightKg: 60, reps: 0 }, { weightKg: 9000, reps: 5 }], effort: "meh", skipped: false, note: "" },
      { label: "", name: "", sets: [], effort: "", skipped: false, note: "" },
    ],
    checkIn: { energy: 9, sleep: -1, soreness: 3.4, enjoyment: "5", cycleDay: 200, symptoms: ["", "cramps"], pain: [] },
  });
  assert.equal(log.exercises.length, 1);
  assert.equal(log.exercises[0].label, "A");
  assert.equal(log.exercises[0].sets.length, 1);
  assert.equal(log.exercises[0].effort, "");
  assert.equal(log.checkIn.energy, 5);
  assert.equal(log.checkIn.sleep, 0);
  assert.equal(log.checkIn.soreness, 3);
  assert.equal(log.checkIn.enjoyment, 0);
  assert.equal(log.checkIn.cycleDay, 0);
  assert.deepEqual(log.checkIn.symptoms, ["cramps"]);
});

test("reading never throws on rubbish", () => {
  assert.doesNotThrow(() => readReplyLog(undefined));
  assert.doesNotThrow(() => readReplyLog("text"));
  assert.ok(isEmptyLog(readReplyLog({})));
});

test("the schema closes every object, which structured output requires", () => {
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const n = node as Record<string, unknown>;
    if (n.type === "object") {
      assert.equal(n.additionalProperties, false);
      assert.deepEqual(new Set(n.required as string[]), new Set(Object.keys(n.properties as object)));
    }
    Object.values(n).forEach(walk);
  };
  walk(REPLY_LOG_SCHEMA);
});

test("done on its own means everything as written", () => {
  const log = parseShorthand("Done", PLAN);
  assert.deepEqual(log.exercises.map((e) => [e.label, e.effort, e.skipped]), [
    ["A", "right", false],
    ["B1", "right", false],
    ["B2", "right", false],
    ["C", "right", false],
  ]);
});

test("naming only the exceptions means the rest were done", () => {
  const log = parseShorthand("B1 hard 22 10 10 8\nC skip", PLAN);
  const by = Object.fromEntries(log.exercises.map((e) => [e.label, e]));
  assert.deepEqual(by.B1.sets, [
    { weightKg: 22, reps: 10 },
    { weightKg: 22, reps: 10 },
    { weightKg: 22, reps: 8 },
  ]);
  assert.equal(by.B1.effort, "hard");
  assert.equal(by.C.skipped, true);
  assert.equal(by.A.effort, "right");
  assert.equal(by.B2.effort, "right");
});

test("words about the day alone assume nothing", () => {
  assert.equal(parseShorthand("Gym was packed today.", PLAN).exercises.length, 0);
});

test("sets are read wherever they sit among words", () => {
  assert.deepEqual(setsIn("20kg 10 10 8", 15), [
    { weightKg: 20, reps: 10 },
    { weightKg: 20, reps: 10 },
    { weightKg: 20, reps: 8 },
  ]);
  assert.deepEqual(setsIn("felt hard, 22 10 10 8", 15).map((s) => s.weightKg), [22, 22, 22]);
  // Close numbers with no kg or x are reps at the load written.
  assert.deepEqual(setsIn("12 12 10", 15), [
    { weightKg: 15, reps: 12 },
    { weightKg: 15, reps: 12 },
    { weightKg: 15, reps: 10 },
  ]);
  assert.deepEqual(setsIn("17.5 8 8", 15).map((s) => [s.weightKg, s.reps]), [
    [17.5, 8],
    [17.5, 8],
  ]);
  assert.deepEqual(setsIn("did the swap", 15), []);
});
