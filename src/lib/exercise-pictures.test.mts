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
    { cid: "exercise-barbell-squat-0@workout-loop", source: "p", file: "Barbell_Squat-0.jpg", width: 400, height: 300 },
    { cid: "exercise-barbell-squat-1@workout-loop", source: "p", file: "Barbell_Squat-1.jpg", width: 400, height: 300 },
  ]);
  assert.equal(squat.drawn, false);
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

test("a name that shares every word with a different exercise still gets a caption", () => {
  const index: PictureIndex = {
    exercises: [{ id: "Push_Up_to_Side_Plank", name: "Push Up to Side Plank", files: ["a.jpg"] }],
  };
  const [plank] = picturesFor(index, ["SIDE PLANK"]);
  assert.equal(plank.shows, "Push Up to Side Plank");
});

test("gym names the set spells differently go to the right picture", () => {
  const index: PictureIndex = {
    exercises: [
      { id: "Push_Up_to_Side_Plank", name: "Push Up to Side Plank", files: ["a.jpg"] },
      { id: "Side_Bridge", name: "Side Bridge", files: ["b.jpg"] },
      { id: "Farmers_Walk", name: "Farmer's Walk", files: ["c.jpg"] },
    ],
  };
  const [plank, carry] = picturesFor(index, ["SIDE PLANK", "FARMER CARRY"]);
  assert.equal(plank.frames[0].file, "b.jpg");
  assert.equal(plank.shows, "Side Bridge");
  assert.equal(carry.frames[0].file, "c.jpg");
});

const DRAWINGS: PictureIndex = {
  exercises: [
    { id: "0122", name: "Barbell Squat", files: ["0122-0.png", "0122-1.png"], sizes: [[400, 315], [400, 320]] },
    { id: "0081", name: "Bench Press: Barbell", files: ["0081-0.png", "0081-1.png"] },
    { id: "0090", name: "Rear Deltoid Row Dumbbell", files: ["0090-0.png", "0090-1.png"] },
  ],
};

test("a drawing wins over a photo, and carries its size", () => {
  const [squat] = picturesFor(INDEX, ["BARBELL SQUAT"], DRAWINGS);
  assert.equal(squat.drawn, true);
  assert.equal(squat.shows, "");
  assert.deepEqual(squat.frames[0], { cid: "drawing-0122-0@workout-loop", source: "d", file: "0122-0.png", width: 400, height: 315 });
});

test("gym names reach the drawing checked for them, with no caption", () => {
  const [bench, row, rdl] = picturesFor(INDEX, ["BENCH PRESS", "ONE-ARM DUMBBELL ROW", "ROMANIAN DEADLIFT"], DRAWINGS);
  assert.equal(bench.frames[0].file, "0081-0.png");
  assert.equal(row.frames[0].file, "0090-0.png");
  assert.equal(row.shows, "");
  // No drawing for it: the photo, as before.
  assert.equal(rdl.drawn, false);
  assert.equal(rdl.frames[0].file, "Romanian_Deadlift-0.jpg");
});

test("a drawing is never matched by a few shared words", () => {
  const [curl] = picturesFor({ exercises: [] }, ["SQUAT CURL"], DRAWINGS);
  assert.equal(curl.frames.length, 0);
});
