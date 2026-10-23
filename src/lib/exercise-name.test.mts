import { test } from "node:test";
import assert from "node:assert/strict";
import { matchExerciseName, normalizeExerciseName } from "./exercise-name.ts";

/** A slice of the vendored set, including the near misses that matter. */
const CATALOGUE = [
  "Barbell Hip Thrust",
  "Barbell Squat",
  "Cable Crunch",
  "Cable Rear Delt Fly",
  "Dumbbell Flyes",
  "Dumbbell Lying Rear Lateral Raise",
  "Hanging Leg Raise",
  "Kneeling Cable Crunch With Alternating Oblique Twists",
  "Leg Press",
  "Plank",
  "Romanian Deadlift",
  "Seated Dumbbell Press",
  "Side Lateral Raise",
  "Smith Machine Calf Raise",
  "Smith Machine Overhead Shoulder Press",
  "Triceps Pushdown",
];

function matched(name: string): string | null {
  const match = matchExerciseName(CATALOGUE, name);
  return match ? CATALOGUE[match.at] : null;
}

test("the same movement spelled differently is the same movement", () => {
  assert.equal(normalizeExerciseName("DUMBBELL FLYES"), normalizeExerciseName("Dumbbell Fly"));
  assert.equal(normalizeExerciseName("Cable Rear Delt Flye"), "cable rear delt fly");
});

test("a name written exactly matches exactly", () => {
  const match = matchExerciseName(CATALOGUE, "BARBELL SQUAT");
  assert.equal(match?.score, 1);
  assert.equal(CATALOGUE[match!.at], "Barbell Squat");
});

test("the gym's name finds the catalogue's longer one", () => {
  assert.equal(matched("SMITH OVERHEAD PRESS"), "Smith Machine Overhead Shoulder Press");
  assert.equal(matched("SMITH CALF RAISE"), "Smith Machine Calf Raise");
});

test("a plain lateral raise is not the rear delt one", () => {
  assert.equal(matched("DUMBBELL LATERAL RAISE"), "Side Lateral Raise");
});

test("a variant nobody asked for loses to a plainer match", () => {
  assert.equal(matched("CABLE KNEELING CRUNCH"), "Cable Crunch");
});

test("knees and legs are the same picture", () => {
  assert.equal(matched("HANGING KNEE RAISE"), "Hanging Leg Raise");
});

test("plurals, abbreviations and gym spellings all land", () => {
  assert.equal(matched("RDL"), "Romanian Deadlift");
  assert.equal(matched("HIP THRUSTER"), "Barbell Hip Thrust");
  assert.equal(matched("TRICEP ROPE PUSHDOWN"), "Triceps Pushdown");
});

test("a different movement is no match at all, however many words it shares", () => {
  // Shares "press", but a leg press is not a bench press and a picture of one
  // beside the other is worse than no picture.
  assert.equal(matched("BENCH PRESS"), null);
  assert.equal(matched("BIKE MACHINE"), null);
  assert.equal(matched("FOAM ROLLING"), null);
});

test("nothing is matched to nothing", () => {
  assert.equal(matched(""), null);
  assert.equal(matchExerciseName([], "BARBELL SQUAT"), null);
});

test("the same name always picks the same one", () => {
  const first = matchExerciseName(CATALOGUE, "LATERAL RAISE");
  const again = matchExerciseName(CATALOGUE, "LATERAL RAISE");
  assert.deepEqual(first, again);
});
