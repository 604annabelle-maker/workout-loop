/**
 * Every training number in one place (spec §Training rules).
 *
 * Pure data. Each value carries its reason and the confidence the research
 * gives it (docs/research/2026-11-progressive-overload.md): high, moderate,
 * low. Low means expert consensus rather than trials; those are the numbers
 * most worth revisiting.
 */

export const MUSCLES = [
  "quads",
  "hamstrings",
  "glutes",
  "chest",
  "back",
  "side_delts",
  "front_delts",
  "rear_delts",
  "biceps",
  "triceps",
  "calves",
  "abs",
  "adductors",
] as const;
export type Muscle = (typeof MUSCLES)[number];

/** The muscles that have a weekly set target. The rest are counted, not aimed at. */
export const TARGETED = [
  "quads",
  "hamstrings",
  "glutes",
  "chest",
  "back",
  "side_delts",
  "biceps",
  "triceps",
] as const satisfies readonly Muscle[];
export type Targeted = (typeof TARGETED)[number];

export const LABEL: Record<Muscle, string> = {
  quads: "quads",
  hamstrings: "hamstrings",
  glutes: "glutes",
  chest: "chest",
  back: "back",
  side_delts: "shoulders",
  front_delts: "front shoulders",
  rear_delts: "rear shoulders",
  biceps: "biceps",
  triceps: "triceps",
  calves: "calves",
  abs: "abs",
  adductors: "inner thighs",
};

export type ExerciseClass = "heavy" | "compound" | "isolation" | "drill";

export interface ClassRule {
  /** Default rep range. */
  reps: [number, number];
  /** Reps to stop short of failure: [least, most]. */
  shortOfFailure: [number, number];
  /** Rest between sets, seconds. */
  rest: number;
  /** Roughly how long one set takes, seconds. */
  setTime: number;
}

/**
 * Effort, reps and rest by class. Moderate for effort (Robinson 2024, Refalo
 * 2023: hard sets, about 0 to 3 short, never failure needed on heavy lifts);
 * low to moderate for rest (Singer 2024).
 */
export const CLASS: Record<Exclude<ExerciseClass, "drill">, ClassRule> = {
  heavy: { reps: [5, 8], shortOfFailure: [1, 3], rest: 165, setTime: 40 },
  compound: { reps: [8, 12], shortOfFailure: [1, 2], rest: 105, setTime: 40 },
  isolation: { reps: [10, 15], shortOfFailure: [0, 1], rest: 75, setTime: 35 },
};

/** Heavy lifts on the second day of their kind use the higher range. */
export const HEAVY_REPS_B: [number, number] = [6, 10];
/** Lateral raises and calves do better with more reps (low). */
export const HIGH_REP_PATTERNS: Record<string, [number, number]> = {
  lateral_raise: [12, 20],
  calf: [12, 20],
};

/**
 * Weekly fractional sets per muscle. Moderate (Pelland 2024; Baz-Valle 2022;
 * Schoenfeld 2019): about 10 to 20 for an intermediate, diminishing returns.
 * Arms are about two to three sets above the rest because they are a drop
 * weaker; she asked for a small lean, not a priority.
 */
export const WEEKLY: Record<Targeted, { start: number; grow: number }> = {
  quads: { start: 10, grow: 16 },
  hamstrings: { start: 10, grow: 16 },
  glutes: { start: 10, grow: 16 },
  chest: { start: 10, grow: 16 },
  back: { start: 10, grow: 16 },
  side_delts: { start: 10, grow: 16 },
  biceps: { start: 12.5, grow: 18 },
  triceps: { start: 12.5, grow: 18 },
};
/** Never past this a week, whatever growth says. */
export const WEEKLY_CAP = 20;
/** Below this a muscle is under-trained; the checker refuses a week projected under it. */
export const WEEKLY_FLOOR = 6;
/** A secondary muscle counts half a set (Pelland 2024 found this predicted growth best; moderate). */
export const SECONDARY_CREDIT = 0.5;
/** Per session, per muscle (low: expert consensus on per-session ceilings). */
export const SESSION_MUSCLE_CAP = 8;
/** Working sets in a 60 minute session, warm-up excluded. */
export const SESSION_SETS: [number, number] = [14, 20];

/** Growth: one weekly set added when every exercise for the muscle progressed over this many weeks without a hard tap. */
export const GROWTH_WINDOW_WEEKS = 2;

/** Progression (spec §Progression; low for the exact thresholds). */
export const PROGRESSION = {
  /** A next step heavier than this fraction is too big: progress reps further first. */
  bigStep: 0.1,
  /** How far the top of the range rises when the step is too big. */
  extendBy: 4,
  /** Drop after missing the bottom of the range twice, or after a stall. */
  drop: 0.1,
  /** Sessions in a row with no gain in weight × reps before it counts as a stall. */
  stallAfter: 3,
  /** A second stall within this many weeks swaps the exercise. */
  secondStallWeeks: 8,
  /** The weight she is asked to find on a first try: stop with this many left. */
  findItShort: 2,
};

/** Exercises stay long enough to progress (spec §Exercises stay long enough). */
export const ROTATION = {
  /** Small exercises rotate after this many weeks (she agreed 4 to 6). */
  smallWeeks: 5,
  /** At most this many exercises change for rotation in one session. */
  maxRotationsPerSession: 2,
  /** At most this many bodyweight exercises in one session's working sets. */
  maxBodyweightPerSession: 1,
  /** A "pain" note keeps the exercise out for this many weeks, then it may return. */
  painWeeks: 4,
};

/**
 * Deloads are reactive only: she does not want one on a schedule, and the
 * evidence for fixed deloads is thin (Coleman 2024; low).
 */
export const DELOAD = {
  /** Two or more exercises regressing in one week. */
  regressions: 2,
  /** Hard taps across two sessions in a row at or above this share. */
  hardShare: 0.6,
  /** Sets are multiplied by this in a deload week. */
  setFactor: 0.5,
  /** And sets stop this many reps short. */
  shortOfFailure: [3, 4] as [number, number],
};

/** The warm-up (spec §The warm-up; moderate for the practice set, Ribeiro 2020). */
export const WARMUP = {
  drills: [3, 4] as [number, number],
  drillReps: 10,
  /** The one light practice set of the first heavy lift. */
  practiceFraction: 0.5,
  practiceReps: 8,
  minutes: [8, 12] as [number, number],
};

/** The abs finisher: two exercises of two sets, twice a week. */
export const FINISHER = { exercises: 2, sets: 2 };
