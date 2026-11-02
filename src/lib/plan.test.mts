import { test } from "node:test";
import assert from "node:assert/strict";
import {
  exercisesOf,
  mainExercises,
  PLAN_SCHEMA,
  plannedMinutes,
  PlanError,
  readPlan,
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
  assert.ok(names.includes("MED BALL SLAM"));
});

test("sets come from the exercise, or the block's rounds when it has none", () => {
  const plan = lowerPlan();
  const finisher = plan.blocks.find((b) => b.kind === "finisher")!;
  const strength = plan.blocks.find((b) => b.kind === "strength")!;
  assert.equal(setsDone(finisher, finisher.exercises[0]), 8);
  assert.equal(setsDone(strength, strength.exercises[0]), 4);
});

test("planned minutes add up the blocks", () => {
  assert.equal(plannedMinutes(lowerPlan()), 6 + 5 + 15 + 14 + 8);
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

test("the schema never offers jump as a kind of exercise", () => {
  const kinds = (PLAN_SCHEMA.properties.blocks.items.properties.exercises.items.properties.kind as { enum: string[] }).enum;
  assert.ok(!kinds.includes("jump"));
  assert.ok(kinds.includes("throw"));
});
