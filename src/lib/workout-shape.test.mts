import { test } from "node:test";
import assert from "node:assert/strict";
import { shapePlan } from "./workout-shape.ts";
import { DESCRIPTIONS_HEADING } from "./prompt.ts";

const PLAN = `WARM UP

- Bike or brisk walk 3 min
- Bodyweight squat 10 reps, slow

THE SESSION

1. BACK SQUAT  4x5
   Heavier than last week. 3 min rest.

2. DEADLIFT  3x5
   Stop each set with 2 reps left. 3 min.

FINISH

- Hip flexor stretch 45 sec each side

${DESCRIPTIONS_HEADING}

BACK SQUAT
Bar on the upper back, brace hard.
Do not let the chest fall forward.

DEADLIFT
Bar over midfoot, chest up.`;

test("sections come out in order", () => {
  const { sections } = shapePlan(PLAN);

  assert.deepEqual(sections.map((s) => s.heading), ["WARM UP", "THE SESSION", "FINISH"]);
});

test("an exercise splits into number, name, sets and note", () => {
  const { sections } = shapePlan(PLAN);
  const session = sections.find((s) => s.heading === "THE SESSION")!;

  assert.deepEqual(session.exercises[0], {
    number: "1",
    name: "BACK SQUAT",
    sets: "4x5",
    note: "Heavier than last week. 3 min rest.",
  });
  assert.equal(session.exercises[1].sets, "3x5");
});

test("plain items keep their text and lose the bullet", () => {
  const { sections } = shapePlan(PLAN);

  assert.deepEqual(sections[0].items, [
    "Bike or brisk walk 3 min",
    "Bodyweight squat 10 reps, slow",
  ]);
  assert.deepEqual(sections[2].items, ["Hip flexor stretch 45 sec each side"]);
});

test("descriptions pair a name with its prose, rejoined into one paragraph", () => {
  const { descriptions } = shapePlan(PLAN);

  assert.equal(descriptions.length, 2);
  assert.equal(descriptions[0].name, "BACK SQUAT");
  assert.equal(
    descriptions[0].body,
    "Bar on the upper back, brace hard. Do not let the chest fall forward.",
  );
});

test("an exercise line with no sets still parses", () => {
  const { sections } = shapePlan("THE SESSION\n\n1. SIDE PLANK");

  assert.deepEqual(sections[0].exercises[0], {
    number: "1",
    name: "SIDE PLANK",
    sets: "",
    note: "",
  });
});

test("a second indented line does not overwrite the first note", () => {
  const { sections } = shapePlan(
    "THE SESSION\n\n1. BACK SQUAT  4x5\n   First note.\n   Stray second line.",
  );

  assert.equal(sections[0].exercises[0].note, "First note.");
  assert.deepEqual(sections[0].items, ["Stray second line."], "the stray line is kept");
});

test("text before any heading is kept rather than dropped", () => {
  const { sections, unparsed } = shapePlan("Just some loose text.\n\nAnd more.");

  assert.equal(unparsed, false);
  assert.deepEqual(sections[0].items, ["Just some loose text.", "And more."]);
});

test("a plan with nothing in it says so, so the caller can print it raw", () => {
  assert.equal(shapePlan("").unparsed, true);
  assert.equal(shapePlan("   \n\n  ").unparsed, true);
});

test("a plan with no descriptions section is fine", () => {
  const { descriptions, unparsed } = shapePlan("THE SESSION\n\n1. BACK SQUAT  4x5");

  assert.deepEqual(descriptions, []);
  assert.equal(unparsed, false);
});

test("CRLF endings parse the same", () => {
  const { sections } = shapePlan("THE SESSION\r\n\r\n1. BACK SQUAT  4x5\r\n   Rest 3 min.");

  assert.equal(sections[0].exercises[0].name, "BACK SQUAT");
  assert.equal(sections[0].exercises[0].note, "Rest 3 min.");
});

test("a name containing a number is not mistaken for a heading", () => {
  const { sections } = shapePlan("THE SESSION\n\n1. FARMER CARRY 20M  3 rounds");

  assert.equal(sections[0].exercises[0].name, "FARMER CARRY 20M");
  assert.equal(sections[0].exercises[0].sets, "3 rounds");
});
