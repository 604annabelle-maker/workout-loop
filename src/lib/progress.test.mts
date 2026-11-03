import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bestsBetween,
  describeSets,
  e1rm,
  exposures,
  historyByExercise,
  hardSetsBetween,
  kg,
  lastPeriodStart,
  performancesIn,
  repRange,
  setsPerMuscle,
  stalled,
  trendsBetween,
  unlogged,
} from "./progress.ts";
import { checkIn, DAY, lifted, log, lowerPlan, session } from "./test-fixtures.mts";
import { DESCRIPTIONS_HEADING } from "./workout-shape.ts";

const FROM = new Date("2026-10-01T00:00:00Z");
const TO = new Date("2026-12-01T00:00:00Z");

test("rep ranges read from the ways they get written", () => {
  assert.deepEqual(repRange("8-12"), [8, 12]);
  assert.deepEqual(repRange("6 to 8"), [6, 8]);
  assert.deepEqual(repRange("8-10 each side"), [8, 10]);
  assert.deepEqual(repRange("5"), [5, 5]);
  assert.equal(repRange("30 sec"), null);
  assert.equal(repRange("40 m"), null);
  assert.equal(repRange("2 min"), null);
});

test("estimated max is Epley, and nothing for bodyweight", () => {
  assert.equal(e1rm({ weightKg: 60, reps: 10 }), 80);
  assert.equal(e1rm({ weightKg: 0, reps: 10 }), 0);
});

test("sets are described compactly", () => {
  assert.equal(describeSets([{ weightKg: 60, reps: 10 }, { weightKg: 60, reps: 9 }]), "60kg x 10, 9");
  assert.equal(describeSets([{ weightKg: 0, reps: 8 }, { weightKg: 0, reps: 7 }]), "8, 7 reps");
  assert.equal(describeSets([{ weightKg: 60, reps: 8 }, { weightKg: 62.5, reps: 6 }]), "60kg x 8, 62.5kg x 6");
  assert.equal(kg(12.25), "12.25kg");
});

test("a logged exercise is tied by label, and by name when there is no label", () => {
  const s = session("2026-10-05T15:00:00Z", {
    logs: [log({ exercises: [lifted("C1", "HIP THRUST", 62.5, [10, 10, 9]), lifted("", "seated leg curls", 30, [12, 12, 12])] })],
  });
  const byName = new Map(performancesIn(s).map((p) => [p.name, p]));
  assert.deepEqual(byName.get("HIP THRUST")!.logged!.map((x) => x.reps), [10, 10, 9]);
  assert.equal(byName.get("SEATED LEG CURL")!.logged!.length, 3);
  assert.equal(byName.get("DEADLIFT")!.logged, null);
});

test("done with no numbers means the sets as written", () => {
  const s = session("2026-10-05T15:00:00Z", {
    logs: [log({ exercises: [{ label: "A", name: "DEADLIFT", sets: [], effort: "right", skipped: false, note: "" }] })],
  });
  const deadlift = performancesIn(s).find((p) => p.name === "DEADLIFT")!;
  assert.deepEqual(deadlift.logged, [
    { weightKg: 60, reps: 3 },
    { weightKg: 60, reps: 3 },
    { weightKg: 60, reps: 3 },
    { weightKg: 60, reps: 3 },
  ]);
  assert.equal(deadlift.role, "heavy");
});

test("a swap done instead is its own movement's history", () => {
  const s = session("2026-10-05T15:00:00Z", {
    logs: [log({ exercises: [{ label: "C2", name: "SEATED LEG CURL", sets: [], effort: "right", skipped: false, note: "", swappedTo: "LYING LEG CURL" }] })],
  });
  const names = performancesIn(s).map((p) => p.name);
  assert.ok(names.includes("LYING LEG CURL"));
  assert.ok(!names.includes("SEATED LEG CURL"));
  const curl = performancesIn(s).find((p) => p.name === "LYING LEG CURL")!;
  assert.equal(curl.loadKg, 25);
  assert.deepEqual(curl.logged![0], { weightKg: 25, reps: 10 });
  // It still counts for the hamstrings.
  assert.equal(setsPerMuscle([s], FROM, TO).hamstrings, 3);
});

test("a later log about the same exercise corrects an earlier one", () => {
  const s = session("2026-10-05T15:00:00Z", {
    logs: [
      log({ exercises: [lifted("C1", "HIP THRUST", 60, [10, 10, 10])] }),
      log({ exercises: [lifted("C1", "HIP THRUST", 65, [8, 8, 8])] }),
    ],
  });
  const thrust = performancesIn(s).find((p) => p.name === "HIP THRUST")!;
  assert.equal(thrust.logged![0].weightKg, 65);
});

test("a workout from before plans were structured still yields its loads", () => {
  const legacy = session("2026-09-20T15:00:00Z", {
    plan: null,
    stamp: null,
    legacyText: `FOCUS\n\nLegs\n\nTHE SESSION\n\n1. BACK SQUAT  4x5\n   50kg. Rest 3 min.\n\n${DESCRIPTIONS_HEADING}\n\nBACK SQUAT\nSit down.`,
  });
  const [squat] = performancesIn(legacy);
  assert.equal(squat.name, "BACK SQUAT");
  assert.equal(squat.loadKg, 50);
  assert.equal(squat.sets, 4);
  assert.equal(squat.reps, "5");
});

test("history is per movement and role, oldest first, across sessions", () => {
  const history = historyByExercise([
    session("2026-10-12T15:00:00Z", { plan: lowerPlan({ thrustKg: 65 }) }),
    session("2026-10-05T15:00:00Z", { plan: lowerPlan({ thrustKg: 60 }) }),
  ]);
  assert.deepEqual(history.get("hip thrust")!.map((p) => p.loadKg), [60, 65]);
  // The light squat is kept apart from any heavy one.
  assert.ok(history.has("barbell squat (light)"));
  assert.ok(!history.has("barbell squat"));
});

const ALL_DONE = log({
  exercises: ["A", "B", "C1", "C2", "K1"].map((label) => ({ label, name: "", sets: [], effort: "right" as const, skipped: false, note: "" })),
});

test("volume counts what she logged: primary sets whole, secondary half", () => {
  const sets = setsPerMuscle([session("2026-10-05T15:00:00Z", { logs: [ALL_DONE] })], FROM, TO);
  // Deadlift 4 + hip thrust 3 + squat 3 x 0.5 = 8.5 glutes; deadlift 4 +
  // leg curl 3 + thrust 3 x 0.5 = 8.5 hamstrings; squat 3 quads; crunch 3.
  assert.equal(sets.glutes, 8.5);
  assert.equal(sets.hamstrings, 8.5);
  assert.equal(sets.quads, 3);
  assert.equal(sets.back, 2);
  assert.equal(sets.core, 3);
});

test("nothing logged counts for nothing, unless the session is today's, as planned", () => {
  assert.deepEqual(setsPerMuscle([session("2026-10-05T15:00:00Z")], FROM, TO), {});
  const today = setsPerMuscle([session("2026-10-05T15:00:00Z", { planned: true })], FROM, TO);
  assert.equal(today.glutes, 8.5);
});

test("volume follows what she logged and skips what she skipped", () => {
  const s = session("2026-10-05T15:00:00Z", {
    logs: [
      log({
        exercises: [
          lifted("A", "DEADLIFT", 60, [3, 3]),
          { label: "C1", name: "HIP THRUST", sets: [], effort: "", skipped: true, note: "" },
        ],
      }),
    ],
  });
  const sets = setsPerMuscle([s], FROM, TO);
  assert.equal(sets.glutes, 2);
  assert.equal(sets.hamstrings, 2);
});

test("volume only counts sessions inside the window", () => {
  const sets = setsPerMuscle([session("2026-09-01T15:00:00Z", { logs: [ALL_DONE] })], FROM, TO);
  assert.deepEqual(sets, {});
});

test("hard sets in total count each exercise once, logged work only", () => {
  // Deadlift 4, squat 3, thrust 3, curl 3, crunch 3. Not the bike.
  assert.equal(hardSetsBetween([session("2026-10-05T15:00:00Z", { logs: [ALL_DONE] })], FROM, TO), 16);
  assert.equal(hardSetsBetween([session("2026-10-05T15:00:00Z")], FROM, TO), 0);
});

test("exposures count how many times she was given each exercise", () => {
  const seen = exposures([session("2026-10-05T15:00:00Z"), session("2026-10-08T15:00:00Z"), session("2026-10-30T15:00:00Z")], new Date("2026-10-20T00:00:00Z"));
  assert.equal(seen.get("hip thrust"), 2);
  assert.equal(seen.get("deadlift"), 2);
});

test("sessions with nothing logged are found, newest first", () => {
  const sessions = [
    session("2026-10-05T15:00:00Z", { logs: [ALL_DONE] }),
    session("2026-10-08T15:00:00Z"),
    session("2026-10-11T15:00:00Z", { logs: [log({ checkIn: checkIn({ energy: 2 }) })] }),
  ];
  assert.deepEqual(unlogged(sessions).map((s) => s.at.toISOString().slice(0, 10)), ["2026-10-11", "2026-10-08"]);
});

test("a best is only new when it beats everything logged before it", () => {
  const sessions = [
    session("2026-10-05T15:00:00Z", { logs: [log({ exercises: [lifted("C1", "HIP THRUST", 60, [10, 10, 10])] })] }),
    session("2026-10-08T15:00:00Z", { logs: [log({ exercises: [lifted("C1", "HIP THRUST", 60, [9, 9, 9])] })] }),
    session("2026-10-12T15:00:00Z", { logs: [log({ exercises: [lifted("C1", "HIP THRUST", 62.5, [10, 10, 10])] })] }),
  ];
  const bests = bestsBetween(sessions, new Date("2026-10-07T00:00:00Z"), TO);
  assert.equal(bests.length, 1);
  assert.equal(bests[0].set.weightKg, 62.5);
});

test("the first time a lift is logged is not a record, there is nothing to beat", () => {
  const sessions = [session("2026-10-05T15:00:00Z", { logs: [log({ exercises: [lifted("C1", "HIP THRUST", 60, [10])] })] })];
  assert.equal(bestsBetween(sessions, FROM, TO).length, 0);
});

test("trends compare the first and latest logged best in the window", () => {
  const sessions = [
    session("2026-10-05T15:00:00Z", { logs: [log({ exercises: [lifted("C1", "HIP THRUST", 60, [10])] })] }),
    session("2026-10-19T15:00:00Z", { logs: [log({ exercises: [lifted("C1", "HIP THRUST", 66, [10])] })] }),
  ];
  const [trend] = trendsBetween(sessions, FROM, TO);
  assert.equal(trend.name, "HIP THRUST");
  assert.equal(trend.change, 10);
});

test("warm up items never show up as records or trends", () => {
  const sessions = [
    session("2026-10-05T15:00:00Z", { logs: [log({ exercises: [lifted("W1", "BIKE", 0, [15])] })] }),
    session("2026-10-08T15:00:00Z", { logs: [log({ exercises: [lifted("W1", "BIKE", 0, [20])] })] }),
  ];
  assert.equal(bestsBetween(sessions, FROM, TO).length, 0);
  assert.equal(trendsBetween(sessions, FROM, TO).length, 0);
});

test("a lift is stalled after three logged sessions without progress", () => {
  const at = (d: number, reps: number[]) =>
    session(new Date(Date.parse("2026-10-05T15:00:00Z") + d * DAY), {
      logs: [log({ exercises: [lifted("C1", "HIP THRUST", 60, reps)] })],
    });
  assert.deepEqual(stalled([at(0, [10, 10, 9]), at(3, [10, 9, 9]), at(7, [10, 10, 9])]), ["HIP THRUST"]);
  assert.deepEqual(stalled([at(0, [10, 10, 9]), at(3, [10, 9, 9]), at(7, [10, 10, 10])]), []);
  assert.deepEqual(stalled([at(0, [10, 10, 9]), at(3, [10, 9, 9])]), []);
});

test("the latest period start is found, counting back from a cycle day", () => {
  const sessions = [
    session("2026-10-05T15:00:00Z", { logs: [log({ checkIn: checkIn({ periodStarted: true, cycleDay: 1 }) })] }),
    session("2026-10-20T15:00:00Z", { logs: [log({ checkIn: checkIn({ cycleDay: 16 }) })] }),
  ];
  assert.equal(lastPeriodStart(sessions)!.toISOString(), "2026-10-05T15:00:00.000Z");
  assert.equal(lastPeriodStart([session("2026-10-05T15:00:00Z")]), null);
});
