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
  /** Not in free-exercise-db. */
  custom?: boolean;
  /** The Everkinetic drawing of this movement, by name (assets/exercise-drawings). */
  drawing?: string;
  /** One line on how the drawing differs, when it shows a near version. */
  drawingNote?: string;
  /** Why the review changed free-exercise-db's tags. */
  why?: string;
}

interface Banned {
  id: string;
  why: string;
}

const ALL = data.exercises as unknown as (Exercise & { reviewed: boolean })[];
const BANNED = (data.banned as Banned[]).map((b) => b.id);

/**
 * Choosable: reviewed, not banned, and with an exact drawing. She learns each
 * movement from its drawing alone, so an exercise without an accurate one is
 * never offered (asked for on 16 November).
 */
const REACHABLE: Exercise[] = ALL.filter((e) => e.reviewed && !BANNED.includes(e.id) && !!e.drawing);
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

const EQUIPMENT_WORDS = /\b(dumbbell|barbell|ez-bar|ez|cable|machine|band|one-arm|single-leg|single-arm|seated|standing|lying|alternating|rope|v-bar|bodyweight)\b/g;

/** The movement without its equipment: "Dumbbell skull crusher" and "EZ-bar skull crusher" are both "skull crusher". */
export const family = (e: Exercise) => e.name.toLowerCase().replace(EQUIPMENT_WORDS, " ").replace(/\s+/g, " ").trim();

export const isBodyweight = (e: Exercise) => e.load === "bodyweight";

/** Exercises that may be a working set: everything but warm-up drills. */
export const working = (e: Exercise) => e.class !== "drill";
