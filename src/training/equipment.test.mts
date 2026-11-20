import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_EQUIPMENT as EQ, label, loadable, nearest, neighbours, readEquipment, roundDown, stepDown, stepTooBig, stepUp } from "./equipment.ts";

test("a barbell's weights are the bar plus pairs of plates", () => {
  const steps = loadable("barbell", EQ);
  assert.equal(steps[0], 20);
  assert.ok(steps.includes(22.5) === false, "no 1.25 kg plates");
  assert.ok(steps.includes(30) && steps.includes(35) && steps.includes(60));
  assert.ok(!steps.includes(25), "one 5 kg plate on one side only is not a weight");
  for (const w of steps) assert.equal(Math.round(((w - 20) / 2) * 100) % 250, 0, `${w} is not symmetric`);
});

test("her dumbbells: every kilo to 10, then 2.5s", () => {
  assert.deepEqual(loadable("dumbbell", EQ), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12.5, 15, 17.5, 20, 22.5, 25, 27.5, 30]);
});

test("her plates: 10, 7.5 and 5 kg, so the bar starts 20, 30, 35, 40, 45", () => {
  assert.deepEqual(EQ.plates, [5, 7.5, 10]);
  assert.deepEqual(loadable("barbell", EQ).slice(0, 5), [20, 30, 35, 40, 45]);
});

test("every function returns only weights that exist", () => {
  for (const load of ["barbell", "ezbar", "dumbbell", "cable", "machine:leg_press"] as const) {
    const steps = loadable(load, EQ);
    for (const w of [0.5, 3.3, 17, 41, 99, 500]) {
      for (const f of [nearest, roundDown, stepUp, stepDown]) {
        const v = f(w, steps);
        assert.ok(v !== null && steps.includes(v), `${f.name}(${w}) for ${load} gave ${v}`);
      }
      for (const v of neighbours(w, steps)) assert.ok(steps.includes(v));
    }
  }
});

test("the tap-a-weight row is about three either side, clipped at the ends", () => {
  const steps = loadable("dumbbell", EQ);
  assert.deepEqual(neighbours(10, steps), [7, 8, 9, 10, 12.5, 15, 17.5]);
  assert.deepEqual(neighbours(1, steps), [1, 2, 3, 4]);
  assert.deepEqual(neighbours(30, steps), [22.5, 25, 27.5, 30]);
});

test("a step more than 10% heavier is too big", () => {
  const db = loadable("dumbbell", EQ);
  assert.equal(stepTooBig(4, db), true, "4 to 5 kg is 25%");
  assert.equal(stepTooBig(25, db), false, "25 to 27.5 kg is 10%");
  assert.equal(stepTooBig(20, db), true, "20 to 22.5 kg is 12.5%");
  assert.equal(stepTooBig(60, loadable("barbell", EQ)), false);
});

test("every weight says what it means", () => {
  assert.equal(label("dumbbell"), "each hand");
  assert.equal(label("barbell"), "total with bar");
  assert.equal(label("cable"), "on the stack");
  assert.equal(label("machine:leg_press"), "on the stack");
  assert.equal(label("bodyweight"), "bodyweight");
});

test("her own equipment replaces the defaults, and blanks keep them", () => {
  const eq = readEquipment({ dumbbells: "2, 4, 6, 8, 10", machines: { leg_press: [10, 20, 30] }, missing: ["machine:hack_squat"] });
  assert.deepEqual(eq.dumbbells, [2, 4, 6, 8, 10]);
  assert.deepEqual(loadable("machine:leg_press", eq), [10, 20, 30]);
  assert.deepEqual(eq.plates, EQ.plates);
  assert.deepEqual(eq.missing, ["machine:hack_squat"]);
});

test("RDLs and rows can take the 15 kg bar: 15 and 25 kg become weights, said on the card", async () => {
  const { labelAt, lightBarFor } = await import("./equipment.ts");
  assert.deepEqual(loadable("freebar", EQ).slice(0, 6), [15, 20, 25, 30, 35, 40]);
  assert.equal(lightBarFor("freebar", 25, EQ), 15);
  assert.equal(lightBarFor("freebar", 15, EQ), 15);
  assert.equal(lightBarFor("freebar", 30, EQ), null, "the 20 kg bar whenever it can");
  assert.equal(lightBarFor("barbell", 25, EQ), null);
  assert.equal(labelAt("freebar", 25, EQ), "total with the 15 kg bar");
  assert.equal(labelAt("freebar", 40, EQ), "total with bar");
  assert.ok(!loadable("barbell", EQ).includes(25), "racked lifts keep the 20 kg bar");
  const { exercise } = await import("./catalogue.ts");
  for (const id of ["Romanian_Deadlift", "Reverse_Grip_Bent-Over_Rows"]) assert.equal(exercise(id)?.load, "freebar", id);
  assert.equal(exercise("Barbell_Squat")?.load, "barbell");
});
