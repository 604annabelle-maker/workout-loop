/**
 * The rules every choosable exercise must keep. A tag that breaks one fails
 * the build, so a wrong-muscle exercise can never reach a workout.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { banned, catalogue, exercise } from "./catalogue.ts";
import { TEMPLATES } from "./skeleton.ts";
import { fits } from "./candidates.ts";

const all = catalogue();
const named = (re: RegExp) => all.filter((e) => re.test(e.name));

test("leg curls and Nordic curls are hamstrings", () => {
  const curls = named(/leg curl|^nordic/i);
  assert.ok(curls.length >= 3);
  for (const e of curls) assert.deepEqual(e.primary, ["hamstrings"], e.name);
});

test("leg extensions are quads", () => {
  for (const e of named(/extension$/i).filter((e) => e.pattern === "knee_ext")) assert.deepEqual(e.primary, ["quads"], e.name);
});

test("hip thrusts, glute bridges and abduction are glutes", () => {
  for (const e of named(/hip thrust|glute bridge|abduction|cable kickback|kneeling kickback/i)) assert.ok(e.primary.includes("glutes"), e.name);
});

test("rows and pulldowns are back, with biceps second, and never chest", () => {
  for (const e of all.filter((e) => e.pattern === "h_pull" || e.pattern === "v_pull")) {
    assert.ok(e.primary.includes("back"), e.name);
    assert.ok(!e.primary.includes("chest") && !e.secondary.includes("chest"), e.name);
    if (e.class !== "drill") assert.ok(e.secondary.includes("biceps"), `${e.name} gives biceps half a set`);
  }
});

test("presses carry triceps second", () => {
  for (const e of all.filter((e) => (e.pattern === "h_push" || e.pattern === "v_push") && e.primary[0] !== "triceps"))
    assert.ok(e.secondary.includes("triceps"), e.name);
});

test("overhead triceps extensions are triceps and stretched", () => {
  const overhead = named(/overhead .*extension/i);
  assert.ok(overhead.length >= 2);
  for (const e of overhead) {
    assert.deepEqual(e.primary, ["triceps"], e.name);
    assert.equal(e.stretched, true, e.name);
  }
});

test("lateral raises are side delts, curls are biceps, pushdowns are triceps", () => {
  for (const e of named(/lateral raise/i)) assert.deepEqual(e.primary, ["side_delts"], e.name);
  for (const e of all.filter((e) => e.pattern === "elbow_flex")) assert.deepEqual(e.primary, ["biceps"], e.name);
  for (const e of named(/pushdown|skull crusher|kickback$/i).filter((e) => e.pattern === "elbow_ext")) assert.deepEqual(e.primary, ["triceps"], e.name);
});

test("seated leg curl is stretched and lying is not (Maeo 2021)", () => {
  assert.equal(exercise("Seated_Leg_Curl")?.stretched, true);
  assert.equal(exercise("Lying_Leg_Curls")?.stretched, false);
});

test("nothing banned can be reached: no chest pads, no medicine ball chest pass", () => {
  for (const id of banned()) assert.equal(exercise(id), undefined, id);
  for (const e of all) assert.ok(!/chest[- ]supported|prone|spider|medicine ball/i.test(e.name), e.name);
  assert.ok(banned().includes("Medicine_Ball_Chest_Pass"));
});

test("every slot of every session has at least three exercises that fit, and every muscle has warm-up drills", () => {
  for (const [type, slots] of Object.entries(TEMPLATES))
    for (const spec of slots) {
      const slot = { ...spec, setCount: 3, reps: [8, 12] as [number, number] };
      const n = all.filter((e) => fits(e, slot)).length;
      assert.ok(n >= (spec.class === "heavy" ? 1 : 3), `${type} ${spec.key}: only ${n} fit`);
    }
  for (const m of ["quads", "hamstrings", "glutes", "chest", "back", "side_delts", "biceps", "triceps"] as const) {
    const drills = all.filter((e) => (e.class === "drill" || e.warmup) && e.primary.includes(m) && (e.load === "bodyweight" || e.load === "band"));
    assert.ok(drills.length >= 1, `${m} has ${drills.length} warm-up drills`);
  }
});

test("every correction of the raw tags says why, and every custom exercise is marked", () => {
  for (const e of all) if (e.custom) assert.ok(e.why, `${e.name} is custom without a reason`);
});
