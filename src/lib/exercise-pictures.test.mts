import { test } from "node:test";
import assert from "node:assert/strict";
import { picturesFor, type PictureIndex } from "./exercise-pictures.ts";

const INDEX: PictureIndex = {
  exercises: [
    { id: "Barbell_Squat", name: "Barbell Squat", files: ["Barbell_Squat-0.jpg", "Barbell_Squat-1.jpg"] },
    { id: "Romanian_Deadlift", name: "Romanian Deadlift", files: ["Romanian_Deadlift-0.jpg", "Romanian_Deadlift-1.jpg"] },
    { id: "Side_Lateral_Raise", name: "Side Lateral Raise", files: ["Side_Lateral_Raise-0.jpg"] },
  ],
};

const PLAN = ["BARBELL SQUAT", "ROMANIAN DEADLIFT", "SEATED LEG CURL"];

test("a name asked for twice is answered once, in the order asked", () => {
  const pictures = picturesFor(INDEX, ["BARBELL SQUAT", "BARBELL SQUAT", "ROMANIAN DEADLIFT"]);
  assert.deepEqual(pictures.map((p) => p.exercise), ["BARBELL SQUAT", "ROMANIAN DEADLIFT"]);
});

test("every exercise gets an answer, including the ones with no picture", () => {
  const pictures = picturesFor(INDEX, PLAN);

  assert.equal(pictures.length, 3);
  assert.deepEqual(
    pictures.map((p) => p.frames.length),
    [2, 2, 0],
  );
});

test("the frames carry a content id per file, in order", () => {
  const [squat] = picturesFor(INDEX, PLAN);

  assert.deepEqual(squat.frames, [
    { cid: "exercise-barbell-squat-0@workout-loop", file: "Barbell_Squat-0.jpg" },
    { cid: "exercise-barbell-squat-1@workout-loop", file: "Barbell_Squat-1.jpg" },
  ]);
});

test("a picture of the movement as asked for needs no caption", () => {
  const [squat] = picturesFor(INDEX, PLAN);
  assert.equal(squat.shows, "");
});

test("a picture of something adjacent says what it is of", () => {
  const [raise] = picturesFor(INDEX, ["DUMBBELL LATERAL RAISE"]);
  assert.equal(raise.shows, "Side Lateral Raise");
  assert.equal(raise.frames.length, 1);
});

test("an empty set is not an error, it is a workout without pictures", () => {
  const pictures = picturesFor({ exercises: [] }, PLAN);
  assert.equal(pictures.length, 3);
  assert.ok(pictures.every((p) => p.frames.length === 0));
});
