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
  jumpDays: 0,
  brief: "",
};

export function exercise(overrides: Partial<PlanExercise> & { name: string }): PlanExercise {
  return {
    label: "A",
    kind: "lift",
    role: "accessory",
    sets: 3,
    reps: "10",
    range: "8-12",
    loadKg: 40,
    loadNote: "",
    rir: 2,
    lastSetToFailure: false,
    restSec: 120,
    cue: "Brace.",
    howTo: "Do it well.",
    primary: ["glutes"],
    secondary: [],
    anchor: overrides.role === "heavy" || overrides.role === "light",
    swap: null,
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

/**
 * The glutes day: a warm up, a heavy deadlift and a light squat, a hip thrust
 * and leg curl superset, and an ab finisher.
 */
export function lowerPlan(over: { deadliftKg?: number; thrustKg?: number; deadliftReps?: string } = {}): Plan {
  return {
    title: "Glutes + hamstrings",
    focus: "glutes, hamstrings",
    blocks: [
      block({
        kind: "warmup",
        title: "Warm up",
        format: "circuit",
        minutes: 7,
        exercises: [exercise({ label: "W1", name: "BIKE", kind: "cardio", role: "warmup", sets: 0, reps: "3 min", range: "", loadKg: 0, rir: -1, primary: [] })],
      }),
      block({
        kind: "strength",
        title: "Main lifts",
        minutes: 24,
        exercises: [
          exercise({ label: "A", name: "DEADLIFT", role: "heavy", sets: 4, reps: over.deadliftReps ?? "3", range: "3-5", loadKg: over.deadliftKg ?? 60, rir: 2, primary: ["glutes", "hamstrings"], secondary: ["back"], swap: { name: "TRAP BAR DEADLIFT", reps: "3", loadKg: 60, loadNote: "", howTo: "" } }),
          exercise({ label: "B", name: "BARBELL SQUAT", role: "light", sets: 3, reps: "6", range: "6-8", loadKg: 40, rir: 2, primary: ["quads"], secondary: ["glutes"], swap: { name: "GOBLET SQUAT", reps: "8", loadKg: 16, loadNote: "", howTo: "" } }),
        ],
      }),
      block({
        kind: "superset",
        title: "Superset",
        format: "superset",
        rounds: 3,
        minutes: 14,
        exercises: [
          exercise({ label: "C1", name: "HIP THRUST", role: "second", sets: 3, reps: "8", range: "6-10", loadKg: over.thrustKg ?? 60, primary: ["glutes"], secondary: ["hamstrings"], swap: { name: "GLUTE BRIDGE", reps: "12", loadKg: 40, loadNote: "", howTo: "" } }),
          exercise({ label: "C2", name: "SEATED LEG CURL", role: "accessory", sets: 3, reps: "10", range: "8-15", loadKg: 30, rir: 1, primary: ["hamstrings"], swap: { name: "LYING LEG CURL", reps: "10", loadKg: 25, loadNote: "", howTo: "" } }),
        ],
      }),
      block({
        kind: "core",
        title: "Ab finisher",
        format: "circuit",
        rounds: 3,
        minutes: 6,
        exercises: [exercise({ label: "K1", name: "CABLE CRUNCH", kind: "core", role: "core", sets: 3, reps: "12", range: "8-15", loadKg: 20, primary: ["core"], swap: { name: "CRUNCH", reps: "15", loadKg: 0, loadNote: "", howTo: "" } })],
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
    method: 2,
    typeId: "glutes-hams",
    rotationAt: 1,
    asked: false,
    block: 1,
    week: 1,
    blockStartedAt: "2026-10-04T00:00:00.000Z",
    deload: false,
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
