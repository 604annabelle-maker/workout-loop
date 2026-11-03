import { test } from "node:test";
import assert from "node:assert/strict";
import {
  exercisesOf,
  mainExercises,
  PLAN_SCHEMA,
  plannedMinutes,
  PlanError,
  progressionKey,
  readPlan,
  removeBanned,
  setsDone,
} from "./plan.ts";
import { lowerPlan } from "./test-fixtures.mts";

test("a well formed plan comes back as it went in", () => {
  const plan = lowerPlan();
  assert.deepEqual(readPlan(JSON.parse(JSON.stringify(plan))), plan);
});

test("a plan with no exercises is an error, not an empty email", () => {
  assert.throws(() => readPlan({ title: "x", blocks: [] }), PlanError);
  assert.throws(() => readPlan({ title: "x", blocks: [{ kind: "strength", exercises: [] }] }), PlanError);
  assert.throws(() => readPlan(null), PlanError);
});

test("names are capitalised and spaced the same way every time", () => {
  const plan = readPlan({ blocks: [{ exercises: [{ name: "  hip   thrust " }] }] });
  assert.equal(exercisesOf(plan)[0].name, "HIP THRUST");
});

test("unknown kinds and formats fall back rather than failing", () => {
  const plan = readPlan({ blocks: [{ kind: "bogus", format: "tabata", exercises: [{ name: "Squat", kind: "weird" }] }] });
  assert.equal(plan.blocks[0].kind, "strength");
  assert.equal(plan.blocks[0].format, "straight sets");
  assert.equal(plan.blocks[0].exercises[0].kind, "lift");
});

test("labels are unique, because a reply points at an exercise by label", () => {
  const plan = readPlan({
    blocks: [{ exercises: [{ name: "A one", label: "a" }, { name: "A two", label: "A" }, { name: "Unlabelled" }] }],
  });
  const labels = exercisesOf(plan).map((e) => e.label);
  assert.equal(new Set(labels).size, 3);
  assert.equal(labels[0], "A");
});

test("a muscle is never both primary and secondary, and unknown muscles are dropped", () => {
  const plan = readPlan({
    blocks: [{ exercises: [{ name: "Hip thrust", primary: ["glutes", "glutes", "booty"], secondary: ["glutes", "hamstrings"] }] }],
  });
  const [e] = exercisesOf(plan);
  assert.deepEqual(e.primary, ["glutes"]);
  assert.deepEqual(e.secondary, ["hamstrings"]);
});

test("loads are kept to the nearest quarter kilo and never negative", () => {
  const plan = readPlan({ blocks: [{ exercises: [{ name: "A", loadKg: 12.4 }, { name: "B", loadKg: -5 }] }] });
  assert.deepEqual(exercisesOf(plan).map((e) => e.loadKg), [12.5, 0]);
});

test("reps in reserve is clamped to something meaningful", () => {
  const plan = readPlan({ blocks: [{ exercises: [{ name: "A", rir: 9 }, { name: "B", rir: -4 }, { name: "C" }] }] });
  assert.deepEqual(exercisesOf(plan).map((e) => e.rir), [5, -1, -1]);
});

test("the main exercises leave out the warm up and cool down", () => {
  const names = mainExercises(lowerPlan()).map((e) => e.name);
  assert.ok(!names.includes("BIKE"));
  assert.ok(names.includes("HIP THRUST"));
  assert.ok(names.includes("CABLE CRUNCH"));
});

test("sets come from the exercise, or the block's rounds when it has none", () => {
  const plan = lowerPlan();
  const strength = plan.blocks.find((b) => b.kind === "strength")!;
  const rounds = { ...strength, rounds: 8, exercises: [{ ...strength.exercises[0], sets: 0 }] };
  assert.equal(setsDone(rounds, rounds.exercises[0]), 8);
  assert.equal(setsDone(strength, strength.exercises[0]), 4);
});

test("planned minutes add up the blocks", () => {
  assert.equal(plannedMinutes(lowerPlan()), 7 + 24 + 14 + 6);
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
  walk(PLAN_SCHEMA);
});

test("the schema offers jump, and the coach decides where it may stay", () => {
  const kinds = PLAN_SCHEMA.properties.blocks.items.properties.exercises.items.properties.kind.enum as readonly string[];
  assert.ok(kinds.includes("jump"));
  assert.ok(kinds.includes("throw"));
});

test("roles come from the field, or from anchor and block kind in older plans", () => {
  const plan = readPlan({
    blocks: [
      { kind: "warmup", exercises: [{ name: "BIKE" }] },
      { kind: "strength", exercises: [{ name: "SQUAT", role: "heavy", reps: "5", range: "3-5" }, { name: "HIP THRUST", anchor: true, reps: "6-10" }] },
      { kind: "core", exercises: [{ name: "DEAD BUG" }] },
      { kind: "superset", exercises: [{ name: "CURL" }] },
    ],
  });
  const [bike, squat, thrust, bug, curl] = exercisesOf(plan);
  assert.deepEqual([bike.role, squat.role, thrust.role, bug.role, curl.role], ["warmup", "heavy", "heavy", "core", "accessory"]);
  assert.equal(squat.anchor, true);
  // An older plan's range was its reps.
  assert.equal(thrust.range, "6-10");
});

test("a swap is kept, unless it is empty, the same movement, or on a warm up item", () => {
  const plan = readPlan({
    blocks: [
      { kind: "warmup", exercises: [{ name: "BIKE", swap: { name: "ROWER" } }] },
      {
        kind: "strength",
        exercises: [
          { name: "bench press", swap: { name: "dumbbell bench press", reps: "8", loadKg: 14 } },
          { name: "SQUAT", swap: { name: "" } },
          { name: "CURL", swap: { name: "curl" } },
        ],
      },
    ],
  });
  const [bike, bench, squat, curl] = exercisesOf(plan);
  assert.equal(bike.swap, null);
  assert.deepEqual(bench.swap, { name: "DUMBBELL BENCH PRESS", reps: "8", loadKg: 14, loadNote: "", howTo: "" });
  assert.equal(squat.swap, null);
  assert.equal(curl.swap, null);
});

test("what she banned comes out: a chest pad exercise becomes its swap, a banned swap goes", () => {
  const plan = readPlan({
    blocks: [
      {
        kind: "superset",
        exercises: [
          { name: "CHEST SUPPORTED DUMBBELL ROW", swap: { name: "ONE ARM DUMBBELL ROW", reps: "10", loadKg: 16 } },
          { name: "INCLINE CURL", swap: { name: "SPIDER CURL", reps: "10", loadKg: 6 } },
          { name: "MEDICINE BALL CHEST PASS" },
        ],
      },
    ],
  });
  const names = exercisesOf(removeBanned(plan)).map((e) => [e.name, e.swap?.name ?? null]);
  assert.deepEqual(names, [
    ["ONE ARM DUMBBELL ROW", null],
    ["INCLINE CURL", null],
  ]);
});

test("a session that was nothing but banned exercises is written again", () => {
  const plan = readPlan({ blocks: [{ kind: "superset", exercises: [{ name: "SEAL ROW" }] }] });
  assert.throws(() => removeBanned(plan), PlanError);
});

test("the light day of a lift keeps its own progression", () => {
  assert.notEqual(progressionKey("BENCH PRESS", "light"), progressionKey("BENCH PRESS", "heavy"));
  assert.equal(progressionKey("BENCH PRESS", "heavy"), progressionKey("Bench Press"));
});
