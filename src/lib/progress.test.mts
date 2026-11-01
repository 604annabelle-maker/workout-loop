import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bestsBetween,
  describeSets,
  e1rm,
  hardMinutesBetween,
  historyByExercise,
  jumpsBetween,
  kg,
  lastPeriodStart,
  performancesIn,
  repRange,
  setsPerMuscle,
  stalled,
  trendsBetween,
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
    logs: [log({ exercises: [lifted("A", "HIP THRUST", 62.5, [10, 10, 9]), lifted("", "romanian deadlifts", 40, [12, 12, 12])] })],
  });
  const byName = new Map(performancesIn(s).map((p) => [p.name, p]));
  assert.deepEqual(byName.get("HIP THRUST")!.logged!.map((x) => x.reps), [10, 10, 9]);
  assert.equal(byName.get("ROMANIAN DEADLIFT")!.logged!.length, 3);
  assert.equal(byName.get("CHEST SUPPORTED ROW")!.logged, null);
});

test("a later reply about the same exercise corrects an earlier one", () => {
  const s = session("2026-10-05T15:00:00Z", {
    logs: [
      log({ exercises: [lifted("A", "HIP THRUST", 60, [10, 10, 10])] }),
      log({ exercises: [lifted("A", "HIP THRUST", 65, [8, 8, 8])] }),
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

test("history is per movement, oldest first, across sessions", () => {
  const history = historyByExercise([
    session("2026-10-12T15:00:00Z", { plan: lowerPlan({ thrustKg: 65 }) }),
    session("2026-10-05T15:00:00Z", { plan: lowerPlan({ thrustKg: 60 }) }),
  ]);
  const thrust = history.get("hip thrust")!;
  assert.deepEqual(thrust.map((p) => p.loadKg), [60, 65]);
});

test("volume counts primary sets whole and secondary sets half, main work only", () => {
  const sets = setsPerMuscle([session("2026-10-05T15:00:00Z")], FROM, TO);
  // Hip thrust 4 (glutes) + RDL 3 (glutes primary) = 7 glutes; box jump and
  // the finisher swing do not count; RDL 3 + thrust 4 x 0.5 = 5 hamstrings.
  assert.equal(sets.glutes, 7);
  assert.equal(sets.hamstrings, 5);
  assert.equal(sets.back, 3);
  assert.equal(sets.biceps, 1.5);
  assert.equal(sets.quads, undefined);
});

test("volume follows what she logged and skips what she skipped", () => {
  const s = session("2026-10-05T15:00:00Z", {
    logs: [
      log({
        exercises: [
          lifted("A", "HIP THRUST", 60, [10, 10]),
          { label: "B2", name: "CHEST SUPPORTED ROW", sets: [], effort: "", skipped: true, note: "" },
        ],
      }),
    ],
  });
  const sets = setsPerMuscle([s], FROM, TO);
  assert.equal(sets.glutes, 2 + 3);
  assert.equal(sets.back, undefined);
});

test("volume only counts sessions inside the window", () => {
  const sets = setsPerMuscle([session("2026-09-01T15:00:00Z")], FROM, TO);
  assert.deepEqual(sets, {});
});

test("jumps are foot contacts, doubled when each side", () => {
  const plan = lowerPlan();
  plan.blocks[1].exercises.push({ ...plan.blocks[1].exercises[0], label: "P2", name: "SKATER BOUND", reps: "5 each side", sets: 2 });
  assert.equal(jumpsBetween([session("2026-10-05T15:00:00Z", { plan })], FROM, TO), 4 * 5 + 2 * 10);
});

test("hard minutes come from finishers whose format is hard", () => {
  assert.equal(hardMinutesBetween([session("2026-10-05T15:00:00Z")], FROM, TO), 8);
  const plan = lowerPlan();
  plan.blocks[4].format = "carries";
  assert.equal(hardMinutesBetween([session("2026-10-05T15:00:00Z", { plan })], FROM, TO), 0);
});

test("a best is only new when it beats everything logged before it", () => {
  const sessions = [
    session("2026-10-05T15:00:00Z", { logs: [log({ exercises: [lifted("A", "HIP THRUST", 60, [10, 10, 10])] })] }),
    session("2026-10-08T15:00:00Z", { logs: [log({ exercises: [lifted("A", "HIP THRUST", 60, [9, 9, 9])] })] }),
    session("2026-10-12T15:00:00Z", { logs: [log({ exercises: [lifted("A", "HIP THRUST", 62.5, [10, 10, 10])] })] }),
  ];
  const bests = bestsBetween(sessions, new Date("2026-10-07T00:00:00Z"), TO);
  assert.equal(bests.length, 1);
  assert.equal(bests[0].set.weightKg, 62.5);
});

test("the first time a lift is logged is not a record, there is nothing to beat", () => {
  const sessions = [session("2026-10-05T15:00:00Z", { logs: [log({ exercises: [lifted("A", "HIP THRUST", 60, [10])] })] })];
  assert.equal(bestsBetween(sessions, FROM, TO).length, 0);
});

test("trends compare the first and latest logged best in the window", () => {
  const sessions = [
    session("2026-10-05T15:00:00Z", { logs: [log({ exercises: [lifted("A", "HIP THRUST", 60, [10])] })] }),
    session("2026-10-19T15:00:00Z", { logs: [log({ exercises: [lifted("A", "HIP THRUST", 66, [10])] })] }),
  ];
  const [trend] = trendsBetween(sessions, FROM, TO);
  assert.equal(trend.name, "HIP THRUST");
  assert.equal(trend.change, 10);
});

test("jumps and finisher swings never show up as records or trends", () => {
  const sessions = [
    session("2026-10-05T15:00:00Z", { logs: [log({ exercises: [lifted("F1", "KETTLEBELL SWING", 16, [15])] })] }),
    session("2026-10-08T15:00:00Z", { logs: [log({ exercises: [lifted("F1", "KETTLEBELL SWING", 20, [15])] })] }),
  ];
  assert.equal(bestsBetween(sessions, FROM, TO).length, 0);
  assert.equal(trendsBetween(sessions, FROM, TO).length, 0);
});

test("a lift is stalled after three logged sessions without progress", () => {
  const at = (d: number, reps: number[]) =>
    session(new Date(Date.parse("2026-10-05T15:00:00Z") + d * DAY), {
      logs: [log({ exercises: [lifted("A", "HIP THRUST", 60, reps)] })],
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
