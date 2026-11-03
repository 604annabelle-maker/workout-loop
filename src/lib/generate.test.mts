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
    ["warmup", "strength", "superset"],
  );
});

test("the canned glutes day has its ab finisher", () => {
  const after = buildBrief({ preferences: PREFS, sessions: [session("2026-10-17T15:00:00Z", { stamp: stamp({ typeId: "back-biceps", rotationAt: 0 }) })], slot: SLOT, sessionNumber: 2 });
  assert.equal(after.session.id, "glutes-hams");
  assert.deepEqual(cannedPlan(after).blocks.map((b) => b.kind), ["warmup", "strength", "superset", "core"]);
});

test("the canned plan follows the rotation", () => {
  const after = (rotationAt: number) =>
    buildBrief({ preferences: PREFS, sessions: [session("2026-10-17T15:00:00Z", { stamp: stamp({ rotationAt }) })], slot: SLOT, sessionNumber: 2 });
  assert.equal(cannedPlan(after(0)).title, "Glutes + hamstrings");
  assert.equal(cannedPlan(after(1)).title, "Chest + triceps");
  assert.equal(cannedPlan(after(2)).title, "Quads + glutes");
});

test("the canned plan still gets the coach's loads", async () => {
  delete process.env.ANTHROPIC_API_KEY;
  // Last quads day, the squat went 5, 5, 5, 5 at 50kg: the top of 3-5.
  const squatDay = {
    ...session("2026-10-14T15:00:00Z", { stamp: stamp({ typeId: "quads-glutes", rotationAt: 3 }) }),
  };
  squatDay.plan = {
    ...squatDay.plan!,
    blocks: squatDay.plan!.blocks.map((b) =>
      b.kind === "strength"
        ? { ...b, exercises: [{ ...b.exercises[1], label: "A", role: "heavy" as const, sets: 4, reps: "5", range: "3-5", loadKg: 50 }] }
        : b,
    ),
  };
  squatDay.logs = [log({ exercises: [lifted("A", "BARBELL SQUAT", 50, [5, 5, 5, 5])] })];
  const sessions = [squatDay, session("2026-10-17T15:00:00Z", { stamp: stamp({ typeId: "chest-triceps", rotationAt: 6 }) })];
  const b = buildBrief({ preferences: PREFS, sessions, slot: SLOT, sessionNumber: 3 });
  assert.equal(b.session.id, "full-body");
  const quads = buildBrief({ preferences: PREFS, sessions: [squatDay, session("2026-10-17T15:00:00Z", { stamp: stamp({ typeId: "chest-triceps", rotationAt: 2 }) })], slot: SLOT, sessionNumber: 3 });
  assert.equal(quads.session.id, "quads-glutes");
  const { plan } = await generateWorkout({ preferences: PREFS, sessions, brief: quads, slot: SLOT });
  const squat = exercisesOf(plan).find((e) => e.name === "BARBELL SQUAT" && e.role === "heavy")!;
  assert.equal(squat.loadKg, 52.5);
  assert.equal(squat.reps, "3");
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
