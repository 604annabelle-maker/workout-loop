import { test } from "node:test";
import assert from "node:assert/strict";
import { finalText } from "./claude.ts";
import { buildBrief } from "./coach.ts";
import { cannedPlan, generateWorkout } from "./generate.ts";
import { exercisesOf, readPlan } from "./plan.ts";
import { lifted, log, PREFS, session, stamp } from "./test-fixtures.mts";

const SLOT = { startsAt: new Date("2026-10-20T15:00:00Z"), minutes: 60 };

function brief(sessions = [] as ReturnType<typeof session>[]) {
  return buildBrief({ preferences: PREFS, sessions, slot: SLOT, sessionNumber: sessions.length + 1 });
}

test("with no API key it returns the canned plan rather than throwing", async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const b = brief();
  const result = await generateWorkout({ preferences: PREFS, sessions: [], brief: b, slot: SLOT });
  assert.equal(result.canned, true);
  assert.ok(exercisesOf(result.plan).length > 0);
});

test("the canned plan is a real plan that survives its own validation", () => {
  const plan = cannedPlan(brief());
  assert.deepEqual(readPlan(JSON.parse(JSON.stringify(plan))), plan);
  assert.deepEqual(
    plan.blocks.map((b) => b.kind),
    ["warmup", "primer", "strength", "superset", "finisher"],
  );
});

test("the canned plan follows the rotation's half", () => {
  // Four sessions a week stated, so the upper and lower split.
  const four = { ...PREFS, trainingDaysPerWeek: 4 };
  const after = (typeId: string) =>
    buildBrief({ preferences: four, sessions: [session("2026-10-17T15:00:00Z", { stamp: stamp({ typeId }) })], slot: SLOT, sessionNumber: 2 });
  assert.equal(cannedPlan(after("lower-glutes")).title, "Back and shoulders");
  assert.equal(cannedPlan(after("upper-push")).title, "Glutes and hamstrings");
});

test("the canned plan still gets the coach's loads", async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const four = { ...PREFS, trainingDaysPerWeek: 4 };
  const sessions = [
    session("2026-10-14T15:00:00Z", {
      stamp: stamp({ typeId: "upper-push" }),
      logs: [log({ exercises: [lifted("A", "HIP THRUST", 60, [10, 10, 10, 10])] })],
    }),
  ];
  const b = buildBrief({ preferences: four, sessions, slot: SLOT, sessionNumber: 2 });
  const { plan } = await generateWorkout({ preferences: four, sessions, brief: b, slot: SLOT });
  const thrust = exercisesOf(plan).find((e) => e.name === "HIP THRUST")!;
  assert.equal(thrust.loadKg, 65);
});

test("after a refusal fallback, only the answer after the marker counts", () => {
  const content = [
    { type: "thinking" },
    { type: "text", text: '{"title": "Half' },
    { type: "fallback" },
    { type: "text", text: '{"title":' },
    { type: "text", text: ' "Whole"}' },
  ];
  assert.equal(finalText(content), '{"title": "Whole"}');
  assert.equal(finalText([{ type: "text", text: " {} " }]), "{}");
});
