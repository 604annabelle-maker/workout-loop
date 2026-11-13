import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_EQUIPMENT as EQ, label, loadable, nearest, neighbours, readEquipment, roundDown, stepDown, stepTooBig, stepUp } from "./equipment.ts";

test("a barbell's weights are the bar plus pairs of plates", () => {
  const steps = loadable("barbell", EQ);
  assert.equal(steps[0], 20);
  assert.ok(steps.includes(22.5) && steps.includes(25) && steps.includes(60));
  assert.ok(!steps.includes(21.25), "one plate on one side only is not a weight");
  for (const w of steps) assert.equal(Math.round(((w - 20) / 2) * 100) % 125, 0, `${w} is not symmetric`);
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
  assert.deepEqual(neighbours(10, steps), [7, 8, 9, 10, 12, 14, 16]);
  assert.deepEqual(neighbours(1, steps), [1, 2, 3, 4]);
  assert.deepEqual(neighbours(30, steps), [24, 26, 28, 30]);
});

test("a step more than 10% heavier is too big", () => {
  const db = loadable("dumbbell", EQ);
  assert.equal(stepTooBig(4, db), true, "4 to 5 kg is 25%");
  assert.equal(stepTooBig(20, db), false, "20 to 22 kg is 10%");
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
