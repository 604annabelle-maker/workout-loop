import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyCoach,
  buildBrief,
  chooseSession,
  current,
  enforceEffort,
  enforceTargets,
  increment,
  jumpDay,
  nextTarget,
  removeJumps,
  reviveBrief,
  roundLoad,
  storeBrief,
  swapsIn,
  weeklyRange,
  type Brief,
} from "./coach.ts";
import { PlanError, type Plan } from "./plan.ts";
import { ROTATION, SPLIT } from "./program.ts";
import type { Performance } from "./progress.ts";
import { block, DAY, exercise, lifted, log, lowerPlan, PREFS, session, stamp } from "./test-fixtures.mts";

const SLOT = { startsAt: new Date("2026-10-20T15:00:00Z"), minutes: 60 };
const CTX = { deload: false, reEntry: false, now: SLOT.startsAt };

function perf(over: Partial<Performance> = {}): Performance {
  return {
    at: new Date("2026-10-17T15:00:00Z"),
    name: "BARBELL SQUAT",
    label: "A",
    sets: 4,
    reps: "4",
    range: "3-5",
    role: "heavy",
    loadKg: 60,
    logged: null,
    effort: "",
    skipped: false,
    swap: "",
    primary: ["quads", "glutes"],
    kind: "lift",
    block: "strength",
    ...over,
  };
}

const sets = (kg: number, reps: number[]) => reps.map((r) => ({ weightKg: kg, reps: r }));

/* ---------- the rotation ---------- */

test("sessions come in order, eight to a cycle, with full body standing in for the last", () => {
  assert.deepEqual(ROTATION, [
    "back-biceps",
    "glutes-hams",
    "chest-triceps",
    "quads-glutes",
    "back-biceps",
    "glutes-hams",
    "chest-triceps",
    "full-body",
  ]);
  assert.equal(chooseSession([]).session.id, "back-biceps");
  for (let at = 0; at < ROTATION.length; at++) {
    const next = chooseSession([session("2026-10-17T15:00:00Z", { stamp: stamp({ rotationAt: at }) })]);
    assert.equal(next.session.id, ROTATION[(at + 1) % ROTATION.length]);
    assert.equal(next.rotationAt, (at + 1) % ROTATION.length);
  }
});

test("each day has two headline muscles, and arms get named work", () => {
  for (const day of SPLIT) assert.equal(day.primary.length, 2);
  assert.match(SPLIT[0].shape.join(" "), /two biceps exercises/);
  assert.match(SPLIT[2].shape.join(" "), /two triceps exercises/);
  assert.match(SPLIT[1].shape.join(" "), /ab finisher/);
});

test("every main lift comes twice a week: heavy on its day, light on another", () => {
  const text = SPLIT.map((d) => d.shape.join(" ")).join(" ");
  for (const lift of [/bench press/, /deadlift/, /squat/, /pull or (a )?row|heavy pull/]) {
    assert.ok((text.match(new RegExp(lift.source, "g")) ?? []).length >= 2, `${lift} twice`);
  }
});

test("a session she asked for does not move the rotation on", () => {
  const asked = chooseSession([session("2026-10-17T15:00:00Z", { stamp: stamp({ rotationAt: 1 }) })], "upper");
  assert.equal(asked.rotation, "asked for");
  assert.equal(asked.session.half, "upper");
  assert.equal(asked.rotationAt, 1);

  // The day it stood in for still comes next, unless it is the same day.
  const after = chooseSession([
    session("2026-10-17T15:00:00Z", { stamp: stamp({ rotationAt: 1 }) }),
    session("2026-10-18T15:00:00Z", { stamp: stamp({ rotationAt: 1, typeId: "chest-triceps", asked: true }) }),
  ]);
  assert.equal(after.session.id, "quads-glutes");
});

test("full body when she asks for it", () => {
  assert.equal(chooseSession([], "full").session.id, "full-body");
});

/* ---------- progress starts fresh ---------- */

test("only sessions planned this way count: progress started fresh", () => {
  const old = session("2026-10-10T15:00:00Z", { stamp: stamp({ method: 1, typeId: "lower-glutes" }) });
  const now = session("2026-10-17T15:00:00Z");
  assert.deepEqual(current([old, now]), [now]);
  const brief = buildBrief({ preferences: PREFS, sessions: [old], slot: SLOT, sessionNumber: 9 });
  assert.equal(brief.session.id, "back-biceps");
  assert.equal(brief.block, 1);
  assert.equal(brief.week, 1);
  assert.equal(brief.daysSinceLast, null);
});

/* ---------- volume ---------- */

test("arms as priorities get 12 to 16 sets a week; glutes a normal share", () => {
  const arms = { ...PREFS, priorities: ["biceps" as const, "triceps" as const] };
  assert.deepEqual(weeklyRange("biceps", arms), [12, 16]);
  assert.deepEqual(weeklyRange("triceps", arms), [12, 16]);
  assert.deepEqual(weeklyRange("glutes", arms), [12, 16]);
  assert.deepEqual(weeklyRange("biceps", PREFS), [8, 12]);
});

/* ---------- progression ---------- */

test("done: one more rep next time", () => {
  const t = nextTarget([perf({ logged: sets(60, [4, 4, 4, 4]), effort: "right" })], CTX)!;
  assert.equal(t.action, "reps");
  assert.equal(t.reps, "5");
  assert.equal(t.loadKg, 60);
});

test("done at the top of the range: the weight goes up and the reps go back to the bottom", () => {
  const t = nextTarget([perf({ reps: "5", logged: sets(60, [5, 5, 5, 5]), effort: "right" })], CTX)!;
  assert.equal(t.action, "up");
  assert.equal(t.loadKg, 65);
  assert.equal(t.reps, "3");
  assert.match(t.reason, /Up 5kg/);
});

test("easy: the weight up a step now, at the same reps", () => {
  const t = nextTarget([perf({ logged: sets(60, [4, 4, 4, 4]), effort: "easy" })], CTX)!;
  assert.equal(t.loadKg, 65);
  assert.equal(t.reps, "4");
});

test("hard: the same again; hard twice in a row, and it comes down a step", () => {
  const once = nextTarget([perf({ logged: sets(60, [4, 4, 4, 4]), effort: "hard" })], CTX)!;
  assert.equal(once.loadKg, 60);
  assert.equal(once.reps, "4");

  const twice = nextTarget(
    [
      perf({ at: new Date("2026-10-13T15:00:00Z"), logged: sets(60, [4, 4, 4, 4]), effort: "hard" }),
      perf({ logged: sets(60, [4, 4, 4, 4]), effort: "hard" }),
    ],
    CTX,
  )!;
  assert.equal(twice.action, "drop");
  assert.equal(twice.loadKg, 55);
});

test("skipped, or nothing logged: the same again, nothing assumed", () => {
  const skipped = nextTarget([perf({ skipped: true })], CTX)!;
  assert.equal(skipped.action, "hold");
  assert.equal(skipped.loadKg, 60);
  assert.equal(skipped.reps, "4");

  const silent = nextTarget([perf(), perf({ at: new Date("2026-10-19T15:00:00Z") })], CTX)!;
  assert.equal(silent.action, "hold");
  assert.equal(silent.loadKg, 60);
  assert.match(silent.reason, /Not logged/);
});

test("numbers well short of the target bring the weight down a step", () => {
  const t = nextTarget([perf({ reps: "5", logged: sets(60, [5, 4, 2]) })], CTX)!;
  assert.equal(t.action, "drop");
  assert.equal(t.loadKg, 55);
  assert.equal(t.reps, "3");
});

test("a rep short of the target is the same again", () => {
  const t = nextTarget([perf({ reps: "5", logged: sets(60, [5, 5, 4]) })], CTX)!;
  assert.equal(t.action, "hold");
  assert.equal(t.reps, "5");
  assert.match(t.reason, /Beat 5, 5, 4/);
});

test("light weights move in small steps, heavy lower lifts in big ones", () => {
  assert.equal(increment(8, false), 1);
  assert.equal(increment(16, false), 2);
  assert.equal(increment(40, false), 2.5);
  assert.equal(increment(60, true), 5);
  assert.equal(roundLoad(61.3), 62.5);
  assert.equal(roundLoad(7.3), 7.5);
});

test("a lighter week halves the sets and takes a little off", () => {
  const t = nextTarget([perf({ logged: sets(60, [4, 4, 4, 4]), effort: "right" })], { ...CTX, deload: true })!;
  assert.equal(t.sets, 2);
  assert.equal(t.loadKg, 55);
});

/* ---------- swaps ---------- */

test("skipped twice in a row, and the swap takes over", () => {
  const skipped = (at: string) =>
    session(at, { logs: [log({ exercises: [{ label: "C2", name: "SEATED LEG CURL", sets: [], effort: "", skipped: true, note: "" }] })] });
  assert.deepEqual(swapsIn([skipped("2026-10-10T15:00:00Z"), skipped("2026-10-17T15:00:00Z")]), [
    { name: "SEATED LEG CURL", swap: "LYING LEG CURL" },
  ]);
  assert.deepEqual(swapsIn([skipped("2026-10-10T15:00:00Z"), session("2026-10-17T15:00:00Z")]), []);
});

/* ---------- the brief ---------- */

function briefAfter(sessions = [session("2026-10-17T15:00:00Z")], preferences = PREFS): Brief {
  return buildBrief({ preferences, sessions, slot: SLOT, sessionNumber: sessions.length + 1 });
}

test("targets are kept per role, so the light squat has its own number", () => {
  const s = session("2026-10-17T15:00:00Z", {
    logs: [log({ exercises: [lifted("B", "BARBELL SQUAT", 40, [6, 6, 6])] })],
  });
  const brief = briefAfter([s]);
  const light = brief.targets.find((t) => t.name === "BARBELL SQUAT")!;
  assert.equal(light.role, "light");
  assert.equal(light.reps, "7");
  assert.equal(light.range, "6-8");
});

test("only the glutes day gets the ab finisher's minutes", () => {
  assert.equal(briefAfter([session("2026-10-17T15:00:00Z", { stamp: stamp({ rotationAt: 0 }) })]).budget.core, 6);
  assert.equal(briefAfter([session("2026-10-17T15:00:00Z", { stamp: stamp({ rotationAt: 1 }) })]).budget.core, 0);
});

test("a stored brief comes back with its dates, and an older one is ignored", () => {
  const brief = briefAfter();
  const revived = reviveBrief(JSON.parse(JSON.stringify(storeBrief(brief))))!;
  assert.equal(revived.blockStartedAt.getTime(), brief.blockStartedAt.getTime());
  assert.equal(reviveBrief({ version: 1, brief }), null);
  assert.equal(storeBrief(brief).stamp.method, 2);
});

/* ---------- jumps ---------- */

test("jumps go in the warm up on a lower day, once a week", () => {
  const prefs = { ...PREFS, jumpDays: 1 };
  const lower = SPLIT.find((s) => s.id === "glutes-hams")!;
  const upper = SPLIT.find((s) => s.id === "back-biceps")!;
  const day = jumpDay(prefs, lower, [], SLOT.startsAt, { deload: false, reEntry: false, pain: [] });
  assert.equal(day.today, true);
  assert.deepEqual(day.contacts, [15, 25]);
  assert.equal(jumpDay(prefs, upper, [], SLOT.startsAt, { deload: false, reEntry: false, pain: [] }).today, false);
  assert.equal(jumpDay(PREFS, lower, [], SLOT.startsAt, { deload: false, reEntry: false, pain: [] }).today, false);
});

test("jumps stay only in the warm up, and only on a jump day", () => {
  const plan: Plan = {
    title: "x",
    focus: "",
    blocks: [
      block({ kind: "warmup", exercises: [exercise({ label: "W1", name: "POGO JUMPS", kind: "jump", role: "warmup" })] }),
      block({ kind: "superset", exercises: [exercise({ label: "C1", name: "BOX JUMP", kind: "jump" }), exercise({ label: "C2", name: "LEG CURL" })] }),
    ],
  };
  const kept = removeJumps(plan, true);
  assert.deepEqual(kept.blocks.flatMap((b) => b.exercises.map((e) => e.name)), ["POGO JUMPS", "LEG CURL"]);
  assert.deepEqual(removeJumps(plan, false).blocks.flatMap((b) => b.exercises.map((e) => e.name)), ["LEG CURL"]);
});

/* ---------- what the coach insists on ---------- */

test("the coach's load and rep target replace the model's", () => {
  const s = session("2026-10-17T15:00:00Z", {
    logs: [log({ exercises: [lifted("C1", "HIP THRUST", 60, [8, 8, 8])] })],
  });
  const brief = briefAfter([s]);
  const plan = enforceTargets(lowerPlan({ thrustKg: 50 }), brief);
  const thrust = plan.blocks.flatMap((b) => b.exercises).find((e) => e.name === "HIP THRUST")!;
  assert.equal(thrust.loadKg, 60);
  assert.equal(thrust.reps, "9");
});

test("failure only on small exercises, and never in a lighter week", () => {
  const plan: Plan = {
    title: "x",
    focus: "",
    blocks: [
      block({
        kind: "strength",
        exercises: [exercise({ label: "A", name: "DEADLIFT", role: "heavy", lastSetToFailure: true })],
      }),
      block({
        kind: "superset",
        exercises: [exercise({ label: "C1", name: "CURL", role: "accessory", primary: ["biceps"], lastSetToFailure: true })],
      }),
    ],
  };
  const brief = briefAfter();
  const out = enforceEffort(plan, brief).blocks.flatMap((b) => b.exercises.map((e) => e.lastSetToFailure));
  assert.deepEqual(out, [false, true]);
  const lighter = enforceEffort(plan, { ...brief, deload: true }).blocks.flatMap((b) => b.exercises.map((e) => e.lastSetToFailure));
  assert.deepEqual(lighter, [false, false]);
});

test("banned exercises never reach her, whatever the model wrote", () => {
  const plan: Plan = {
    title: "x",
    focus: "",
    blocks: [
      block({
        kind: "superset",
        exercises: [
          exercise({ label: "C1", name: "CHEST SUPPORTED ROW", swap: { name: "SEATED CABLE ROW", reps: "10", loadKg: 30, loadNote: "", howTo: "" } }),
          exercise({ label: "C2", name: "MED BALL CHEST PASS" }),
        ],
      }),
    ],
  };
  const names = applyCoach(plan, briefAfter()).blocks.flatMap((b) => b.exercises.map((e) => e.name));
  assert.deepEqual(names, ["SEATED CABLE ROW"]);
});

test("no legs today means no leg exercise", () => {
  const brief = buildBrief({ preferences: PREFS, sessions: [], slot: SLOT, sessionNumber: 1, request: { focus: "upper" } });
  const out = applyCoach(lowerPlan(), { ...brief, jumps: { ...brief.jumps, today: false } });
  assert.deepEqual(out.blocks.flatMap((b) => b.exercises.map((e) => e.name)), ["BIKE", "CABLE CRUNCH"]);
  assert.throws(() => applyCoach({ ...lowerPlan(), blocks: lowerPlan().blocks.slice(0, 3) }, brief), PlanError);
});

test("a block's weeks are counted by calendar day", () => {
  const started = stamp({ blockStartedAt: "2026-10-04T18:00:00.000Z" });
  const brief = buildBrief({ preferences: PREFS, sessions: [session(new Date(Date.parse("2026-10-17T15:00:00Z")), { stamp: started })], slot: { ...SLOT, startsAt: new Date(Date.parse("2026-10-04T18:00:00Z") + 21 * DAY - 3 * 60 * 60 * 1000) }, sessionNumber: 2 });
  assert.equal(brief.week, 4);
});
