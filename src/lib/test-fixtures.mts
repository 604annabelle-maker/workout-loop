/**
 * Shared building blocks for the tests. Not a test file itself: the runner
 * only picks up *.test.mts.
 */

import type { Plan, PlanBlock, PlanExercise } from "./plan.ts";
import type { Preferences } from "./profile.ts";
import type { Session, Stamp } from "./progress.ts";
import { EMPTY_CHECK_IN, type CheckIn, type ReplyLog } from "./reply-log.ts";

export const DAY = 24 * 60 * 60 * 1000;

export const PREFS: Preferences = {
  goals: "build lean muscle",
  experience: "a year of lifting",
  level: "intermediate",
  trainingDaysPerWeek: 3,
  priorities: [],
  avoid: "",
  equipment: "full gym",
  enjoys: "",
  cycleTracking: false,
  weeklyReview: true,
  brief: "",
};

export function exercise(overrides: Partial<PlanExercise> & { name: string }): PlanExercise {
  return {
    label: "A",
    kind: "lift",
    sets: 3,
    reps: "8-12",
    loadKg: 40,
    loadNote: "",
    rir: 2,
    restSec: 120,
    cue: "Brace.",
    howTo: "Do it well.",
    primary: ["glutes"],
    secondary: [],
    anchor: false,
    ...overrides,
  };
}

export function block(overrides: Partial<PlanBlock> & { exercises: PlanExercise[] }): PlanBlock {
  return {
    kind: "strength",
    title: "Strength",
    format: "straight sets",
    rounds: 0,
    minutes: 15,
    instructions: "",
    ...overrides,
  };
}

/** A lower body plan: warm up, jumps, a hip thrust anchor, an RDL and row superset, an EMOM. */
export function lowerPlan(over: { thrustKg?: number; rdlKg?: number } = {}): Plan {
  return {
    title: "Glutes and jumps",
    focus: "Glutes, hamstrings",
    why: "Glutes lead today.",
    tip: "",
    blocks: [
      block({
        kind: "warmup",
        title: "Warm up",
        format: "circuit",
        minutes: 6,
        exercises: [exercise({ label: "W1", name: "BIKE", kind: "cardio", sets: 0, reps: "3 min", loadKg: 0, rir: -1, primary: [] })],
      }),
      block({
        kind: "primer",
        title: "Jump primer",
        minutes: 5,
        exercises: [exercise({ label: "P1", name: "BOX JUMP", kind: "jump", sets: 4, reps: "5", loadKg: 0, rir: -1, primary: ["quads"], secondary: ["glutes"] })],
      }),
      block({
        kind: "strength",
        title: "Glute strength",
        exercises: [
          exercise({ label: "A", name: "HIP THRUST", sets: 4, reps: "6-10", loadKg: over.thrustKg ?? 60, primary: ["glutes"], secondary: ["hamstrings"], anchor: true }),
        ],
      }),
      block({
        kind: "superset",
        title: "Superset",
        format: "superset",
        rounds: 3,
        minutes: 14,
        exercises: [
          exercise({ label: "B1", name: "ROMANIAN DEADLIFT", sets: 3, reps: "8-12", loadKg: over.rdlKg ?? 40, primary: ["hamstrings", "glutes"] }),
          exercise({ label: "B2", name: "CHEST SUPPORTED ROW", sets: 3, reps: "10-12", loadKg: 14, primary: ["back"], secondary: ["biceps"] }),
        ],
      }),
      block({
        kind: "finisher",
        title: "EMOM",
        format: "EMOM",
        rounds: 8,
        minutes: 8,
        exercises: [exercise({ label: "F1", name: "KETTLEBELL SWING", sets: 0, reps: "15", loadKg: 16, rir: -1, primary: ["glutes"] })],
      }),
    ],
  };
}

export function checkIn(over: Partial<CheckIn> = {}): CheckIn {
  return { ...EMPTY_CHECK_IN, symptoms: [], pain: [], ...over };
}

export function log(over: Partial<ReplyLog> = {}): ReplyLog {
  return { exercises: [], checkIn: checkIn(), liked: [], disliked: [], requests: "", ...over };
}

export function stamp(over: Partial<Stamp> = {}): Stamp {
  return {
    typeId: "full-glutes",
    block: 1,
    week: 1,
    blockStartedAt: "2026-10-04T00:00:00.000Z",
    deload: false,
    finisher: "EMOM",
    ...over,
  };
}

export function session(at: string | Date, over: Partial<Session> = {}): Session {
  return {
    at: typeof at === "string" ? new Date(at) : at,
    minutes: 60,
    plan: lowerPlan(),
    legacyText: "",
    stamp: stamp(),
    notes: [],
    logs: [],
    ...over,
  };
}

/** "A 60 x 10 10 10" as a log entry. */
export function lifted(label: string, name: string, weightKg: number, reps: number[], effort: ReplyLog["exercises"][number]["effort"] = "") {
  return { label, name, sets: reps.map((r) => ({ weightKg, reps: r })), effort, skipped: false, note: "" };
}
