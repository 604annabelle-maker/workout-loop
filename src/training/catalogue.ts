/**
 * The exercise catalogue (spec §The catalogue).
 *
 * Pure. Only exercises reviewed by hand in assets/exercises/overrides.json
 * exist here: their muscles, class, movement pattern and stretched-position
 * flag were checked against anatomy and the research, and corrected where
 * free-exercise-db's own tags were wrong (each correction says why). An
 * exercise that was not reviewed is never offered to the model, so a wrong
 * raw tag can never put a wrong-muscle exercise in a workout.
 */

import data from "../../assets/exercises/overrides.json" with { type: "json" };
import type { Load } from "./equipment";
import type { ExerciseClass, Muscle } from "./rules";

export type Pattern =
  | "squat"
  | "lunge"
  | "hinge"
  | "hip_ext"
  | "knee_ext"
  | "knee_flex"
  | "abduction"
  | "adduction"
  | "h_push"
  | "v_push"
  | "fly"
  | "dip"
  | "h_pull"
  | "v_pull"
  | "pullover"
  | "lateral_raise"
  | "rear_delt"
  | "elbow_flex"
  | "elbow_ext"
  | "calf"
  | "core";

export interface Exercise {
  id: string;
  name: string;
  primary: Muscle[];
  secondary: Muscle[];
  class: ExerciseClass;
  pattern: Pattern;
  /** Loads the muscle hard in its stretched position. */
  stretched: boolean;
  load: Load;
  /** May be used as a warm-up drill. */
  warmup: boolean;
  /** One line on form, shown under How to. */
  form: string;
  /** A bodyweight exercise's easier and harder variations. */
  easier?: string;
  harder?: string;
  /** Not in free-exercise-db, so it has no photos. */
  custom?: boolean;
  /** Why the review changed free-exercise-db's tags. */
  why?: string;
}

interface Banned {
  id: string;
  why: string;
}

const ALL = data.exercises as unknown as (Exercise & { reviewed: boolean })[];
const BANNED = (data.banned as Banned[]).map((b) => b.id);

const REACHABLE: Exercise[] = ALL.filter((e) => e.reviewed && !BANNED.includes(e.id));
const BY_ID = new Map(REACHABLE.map((e) => [e.id, e]));

/** Every exercise that can be chosen. */
export function catalogue(): readonly Exercise[] {
  return REACHABLE;
}

export function exercise(id: string): Exercise | undefined {
  return BY_ID.get(id);
}

export function banned(): readonly string[] {
  return BANNED;
}

export const trains = (e: Exercise, m: Muscle) => e.primary.includes(m);

export const isBodyweight = (e: Exercise) => e.load === "bodyweight";

/** Exercises that may be a working set: everything but warm-up drills. */
export const working = (e: Exercise) => e.class !== "drill";
