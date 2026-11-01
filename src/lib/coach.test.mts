import { test } from "node:test";
import assert from "node:assert/strict";
import {
  budgetFor,
  buildBrief,
  chooseFinisher,
  chooseSession,
  enforceTargets,
  frequency,
  increment,
  nextTarget,
  position,
  reviveBrief,
  roundLoad,
  storeBrief,
  volumeStatus,
  weeklyRange,
  weekPlanFor,
} from "./coach.ts";
import type { Performance } from "./progress.ts";
import { checkIn, DAY, lifted, log, lowerPlan, PREFS, session, stamp } from "./test-fixtures.mts";

const T0 = Date.parse("2026-10-04T15:00:00Z");
const at = (days: number) => new Date(T0 + days * DAY);

/* ---------- blocks ---------- */

test("the first session ever starts block 1, week 1", () => {
  const pos = position([], at(0));
  assert.deepEqual([pos.block, pos.week, pos.reEntry], [1, 1, false]);
});

test("weeks count from the block's start", () => {
  const s = [session(at(0), { stamp: stamp({ blockStartedAt: at(0).toISOString() }) })];
  assert.equal(position(s, at(2)).week, 1);
  assert.equal(position(s, at(8)).week, 2);
  assert.equal(position(s.concat(session(at(26), { stamp: stamp({ blockStartedAt: at(0).toISOString() }) })), at(29)).week, 5);
});

test("after five weeks a new block begins", () => {
  const s = [session(at(30), { stamp: stamp({ block: 3, blockStartedAt: at(0).toISOString() }) })];
  const pos = position(s, at(36));
  assert.deepEqual([pos.block, pos.week], [4, 1]);
});

test("a long break starts a new block, gently", () => {
  const s = [session(at(0), { stamp: stamp({ block: 2, blockStartedAt: at(0).toISOString() }) })];
  const pos = position(s, at(14));
  assert.deepEqual([pos.block, pos.week, pos.reEntry], [3, 1, true]);
});

test("week five is lighter only when the block had enough training to need it", () => {
  const busy = Array.from({ length: 10 }, (_, i) => session(at(i * 3), { stamp: stamp({ blockStartedAt: at(0).toISOString() }) }));
  const pos = { block: 1, week: 5, blockStartedAt: at(0), reEntry: false, daysSinceLast: 1 };
  assert.equal(weekPlanFor(pos, busy).deload, true);
  assert.equal(weekPlanFor(pos, busy.slice(0, 4)).deload, false);
  assert.equal(weekPlanFor({ ...pos, week: 3 }, busy).deload, false);
});

/* ---------- which session ---------- */

test("frequency is what she said until there are three weeks to measure", () => {
  assert.equal(frequency([session(at(0))], 4, at(5)), 4);
  const many = Array.from({ length: 12 }, (_, i) => session(at(i * 2.5)));
  assert.equal(frequency(many, 2, at(30)), 11 / 4);
});

test("three or fewer sessions a week rotates through full body sessions", () => {
  const volume = volumeStatus([], PREFS, at(0));
  const first = chooseSession([], 3, volume);
  assert.equal(first.rotation, "full body");

  const after = (typeId: string) => chooseSession([session(at(0), { stamp: stamp({ typeId }) })], 3, volume).session.id;
  assert.equal(after("full-glutes"), "full-legs");
  assert.equal(after("full-legs"), "full-athletic");
  assert.equal(after("full-athletic"), "full-glutes");
});

test("four or more a week alternates upper and lower", () => {
  const volume = volumeStatus([], PREFS, at(0));
  const after = (typeId: string) => chooseSession([session(at(0), { stamp: stamp({ typeId }) })], 4, volume).session;
  assert.equal(after("lower-glutes").id, "upper-pull");
  assert.equal(after("upper-push").id, "lower-glutes");

  // Coming off full body onto the split, the half that was not just trained.
  const fromLegacy = chooseSession([session(at(0), { stamp: stamp({ typeId: "lower-legs" }) })], 4, volume);
  assert.equal(fromLegacy.session.half, "upper");
});

/* ---------- volume ---------- */

test("weekly ranges scale for beginners and lift for priorities", () => {
  assert.deepEqual(weeklyRange("glutes", PREFS), [12, 20]);
  assert.deepEqual(weeklyRange("glutes", { ...PREFS, level: "beginner" }), [8, 14]);
  assert.deepEqual(weeklyRange("glutes", { ...PREFS, priorities: ["glutes"] }), [16, 24]);
});

test("volume status reads the last seven days only", () => {
  const status = volumeStatus([session(at(0)), session(at(-10))], PREFS, at(2));
  const glutes = status.find((v) => v.muscle === "glutes")!;
  assert.equal(glutes.done, 7);
  assert.equal(glutes.status, "under");
});

/* ---------- progression ---------- */

function perf(over: Partial<Performance>): Performance {
  return {
    at: at(0),
    name: "HIP THRUST",
    label: "A",
    sets: 3,
    reps: "8-12",
    loadKg: 60,
    logged: null,
    effort: "",
    skipped: false,
    primary: ["glutes"],
    kind: "lift",
    block: "strength",
    ...over,
  };
}

const sets = (kg: number, reps: number[]) => reps.map((r) => ({ weightKg: kg, reps: r }));
const ctx = { deload: false, reEntry: false, now: at(3) };

test("every set at the top of the range earns the next step", () => {
  const t = nextTarget([perf({ logged: sets(60, [12, 12, 12]) })], ctx)!;
  assert.equal(t.action, "up");
  assert.equal(t.loadKg, 65);
  assert.match(t.reason, /Up 5kg/);
});

test("short of the top, the same weight with more reps", () => {
  const t = nextTarget([perf({ logged: sets(60, [12, 11, 10]) })], ctx)!;
  assert.equal(t.action, "reps");
  assert.equal(t.loadKg, 60);
  assert.match(t.reason, /Beat 12, 11, 10/);
});

test("a failed set or falling well short drops the load", () => {
  assert.equal(nextTarget([perf({ logged: sets(60, [8, 6, 5]) })], ctx)!.action, "drop");
  const failed = nextTarget([perf({ logged: sets(60, [10, 10, 9]), effort: "failed" })], ctx)!;
  assert.equal(failed.action, "drop");
  assert.equal(failed.loadKg, 55);
});

test("a hard top of range holds rather than jumping", () => {
  assert.equal(nextTarget([perf({ logged: sets(60, [12, 12, 12]), effort: "hard" })], ctx)!.action, "reps");
});

test("a step that is a big share of a light load is earned with two extra reps", () => {
  const light = perf({ name: "LATERAL RAISE", loadKg: 6, primary: ["shoulders"] });
  assert.equal(nextTarget([{ ...light, logged: sets(6, [12, 12, 12]) }], ctx)!.action, "reps");
  const t = nextTarget([{ ...light, logged: sets(6, [14, 14, 14]) }], ctx)!;
  assert.equal(t.action, "up");
  assert.equal(t.loadKg, 7);
});

test("with no reply, the prescription stands in and moves up after two", () => {
  const once = nextTarget([perf({})], ctx)!;
  assert.equal(once.action, "reps");
  assert.equal(once.logged, false);
  assert.match(once.last, /as written/);

  const twice = nextTarget([perf({ at: at(-3) }), perf({})], ctx)!;
  assert.equal(twice.action, "up");
  assert.equal(twice.loadKg, 65);
});

test("after a break everything is about ten percent lighter", () => {
  const t = nextTarget([perf({ logged: sets(60, [12, 12, 12]) })], { ...ctx, reEntry: true })!;
  assert.equal(t.action, "reset");
  assert.equal(t.loadKg, 57.5);
});

test("the lighter week halves the sets and eases the load", () => {
  const t = nextTarget([perf({ sets: 4, logged: sets(60, [10, 10, 10, 10]) })], { ...ctx, deload: true })!;
  assert.equal(t.action, "deload");
  assert.equal(t.sets, 2);
  assert.equal(t.loadKg, 55);
});

test("timed work holds", () => {
  assert.equal(nextTarget([perf({ reps: "30 sec", logged: sets(20, [1]) })], ctx)!.action, "hold");
});

test("increments are small when light and bigger for heavy legs", () => {
  assert.equal(increment(8, false), 1);
  assert.equal(increment(16, false), 2);
  assert.equal(increment(40, true), 2.5);
  assert.equal(increment(80, true), 5);
  assert.equal(increment(80, false), 2.5);
  assert.equal(roundLoad(57.4), 57.5);
  assert.equal(roundLoad(13.4), 13);
  assert.equal(roundLoad(7.3), 7.5);
});

/* ---------- the rest ---------- */

test("the budget gives the main work most of the time and cuts the finisher first", () => {
  const sixty = budgetFor(60);
  assert.equal(sixty.warmup + sixty.primer + sixty.main + sixty.finisher, 60);
  assert.ok(sixty.main / 60 >= 0.6);
  assert.equal(budgetFor(30).finisher, 0);
});

test("the finisher avoids the last two, leans to what she rated, and skips dislikes", () => {
  const rated = [
    session(at(0), { stamp: stamp({ finisher: "AMRAP" }), logs: [log({ checkIn: checkIn({ enjoyment: 5 }) })] }),
    session(at(2), { stamp: stamp({ finisher: "complex" }), logs: [log({ checkIn: checkIn({ enjoyment: 2 }) })] }),
    session(at(4), { stamp: stamp({ finisher: "EMOM" }) }),
    session(at(6), { stamp: stamp({ finisher: "ladder" }) }),
  ];
  assert.equal(chooseFinisher(rated, false, [], 1).format, "AMRAP");
  assert.notEqual(chooseFinisher(rated, false, ["amrap"], 1).format, "AMRAP");
  assert.ok(!["EMOM", "ladder"].includes(chooseFinisher(rated, false, [], 3).format));
  const conditioning = chooseFinisher([], true, [], 0);
  assert.ok(["EMOM", "intervals", "AMRAP", "complex", "ladder"].includes(conditioning.format));
});

test("enforcing targets corrects the load, but only for the same rep scheme", () => {
  const sessions = [
    session(at(0), { logs: [log({ exercises: [lifted("A", "HIP THRUST", 60, [10, 10, 10, 10])] })] }),
  ];
  const brief = buildBrief({ preferences: PREFS, sessions, slot: { startsAt: at(3), minutes: 60 }, sessionNumber: 2 });
  const plan = lowerPlan({ thrustKg: 80 });
  assert.equal(enforceTargets(plan, brief).blocks[2].exercises[0].loadKg, 65);

  plan.blocks[2].exercises[0].reps = "3-5";
  assert.equal(enforceTargets(plan, brief).blocks[2].exercises[0].loadKg, 80);
});

test("a brief carries the readiness, pain and requests from recent replies", () => {
  const sessions = [
    session(at(0), {
      logs: [
        log({
          checkIn: checkIn({ energy: 2, sleep: 1, symptoms: ["cramps"], pain: ["left knee on lunges"] }),
          requests: "more jumps please",
          disliked: ["burpees"],
        }),
      ],
    }),
  ];
  const brief = buildBrief({ preferences: PREFS, sessions, slot: { startsAt: at(2), minutes: 60 }, sessionNumber: 2 });
  assert.deepEqual(brief.readiness, ["energy 2 of 5", "sleep 1 of 5", "cramps"]);
  assert.deepEqual(brief.pain, ["left knee on lunges"]);
  assert.deepEqual(brief.requests, ["more jumps please"]);
  assert.deepEqual(brief.dislikes, ["burpees"]);
});

test("cycle day shows only when she asked for tracking", () => {
  const sessions = [session(at(0), { logs: [log({ checkIn: checkIn({ periodStarted: true }) })] })];
  const slot = { startsAt: at(9), minutes: 60 };
  assert.equal(buildBrief({ preferences: PREFS, sessions, slot, sessionNumber: 2 }).cycleDay, null);
  assert.equal(buildBrief({ preferences: { ...PREFS, cycleTracking: true }, sessions, slot, sessionNumber: 2 }).cycleDay, 10);
});

test("anchors are kept within a block for the same session", () => {
  const sessions = [session(at(0), { stamp: stamp({ typeId: "full-glutes", blockStartedAt: at(0).toISOString() }) })];
  const later = [
    ...sessions,
    session(at(2), { stamp: stamp({ typeId: "full-legs", blockStartedAt: at(0).toISOString() }) }),
    session(at(4), { stamp: stamp({ typeId: "full-athletic", blockStartedAt: at(0).toISOString() }) }),
  ];
  const brief = buildBrief({ preferences: PREFS, sessions: later, slot: { startsAt: at(7), minutes: 60 }, sessionNumber: 4 });
  assert.equal(brief.session.id, "full-glutes");
  assert.deepEqual(brief.anchors, ["HIP THRUST"]);
});

test("a brief survives being stored as JSON and read back", () => {
  const sessions = [session(at(0), { logs: [log({ exercises: [lifted("A", "HIP THRUST", 60, [10, 10, 10, 10])] })] })];
  const brief = buildBrief({ preferences: PREFS, sessions, slot: { startsAt: at(3), minutes: 60 }, sessionNumber: 2 });
  const stored = JSON.parse(JSON.stringify(storeBrief(brief, lowerPlan())));
  const back = reviveBrief(stored)!;
  assert.ok(back.blockStartedAt instanceof Date);
  assert.ok(back.targets[0].lastAt instanceof Date);
  assert.equal(back.targets[0].loadKg, brief.targets[0].loadKg);
  assert.equal(stored.stamp.typeId, brief.session.id);
  assert.equal(stored.stamp.finisher, "EMOM");
  assert.equal(reviveBrief(null), null);
  assert.equal(reviveBrief({ stamp: {} }), null);
});

test("targets are only for lifts in the main work, never jumps or finisher swings", () => {
  const sessions = [session(at(0)), session(at(3))];
  const brief = buildBrief({ preferences: PREFS, sessions, slot: { startsAt: at(6), minutes: 60 }, sessionNumber: 3 });
  const names = brief.targets.map((t) => t.name);
  assert.ok(names.includes("HIP THRUST"));
  assert.ok(!names.includes("BOX JUMP"));
  assert.ok(!names.includes("KETTLEBELL SWING"));
});
