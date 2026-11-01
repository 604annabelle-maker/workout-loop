/**
 * The shape of a workout.
 *
 * Pure. A workout used to be plain text that the model wrote and this project
 * then parsed back apart, which meant every downstream feature (colour, the
 * pictures, last time's load) depended on the model keeping a layout. Now the
 * model returns this structure and the code does the layout, so the email is
 * the same shape every time and every exercise carries what the tracking
 * needs: which muscles it trains, whether it is an anchor lift, whether it is
 * a jump.
 *
 * `PLAN_SCHEMA` is what the API is constrained to. `readPlan` is what the code
 * trusts: it checks and tidies whatever came back, because a schema constrains
 * shape and not sense.
 */

import { normalizeExerciseName } from "./exercise-name";

/**
 * The muscle groups volume is counted against. Coarse on purpose: these are
 * the groups the weekly targets are written in, and finer anatomy would only
 * be something for the model to get inconsistently wrong.
 */
export const MUSCLES = [
  "glutes",
  "quads",
  "hamstrings",
  "adductors",
  "calves",
  "back",
  "chest",
  "shoulders",
  "biceps",
  "triceps",
  "core",
] as const;

export type Muscle = (typeof MUSCLES)[number];

/** Where in the session a block sits. The order here is the session order. */
export const BLOCK_KINDS = [
  "warmup",
  "primer",
  "strength",
  "superset",
  "circuit",
  "finisher",
  "core",
  "cooldown",
] as const;

export type BlockKind = (typeof BLOCK_KINDS)[number];

/**
 * How a block is run. Named so the email can say it in one word and so the
 * weekly review can say which ones she rated highest.
 */
export const FORMATS = [
  "straight sets",
  "superset",
  "tri-set",
  "circuit",
  "EMOM",
  "AMRAP",
  "intervals",
  "complex",
  "ladder",
  "flow",
  "carries",
] as const;

export type Format = (typeof FORMATS)[number];

/**
 * What kind of work an exercise is. `jump` is counted as foot contacts toward
 * the week's impact dose, `cardio` as conditioning minutes, `lift` as hard
 * sets toward the muscle targets.
 */
export const EXERCISE_KINDS = [
  "lift",
  "jump",
  "throw",
  "carry",
  "cardio",
  "core",
  "mobility",
] as const;

export type ExerciseKind = (typeof EXERCISE_KINDS)[number];

export interface PlanExercise {
  /** "A", "B1", "B2". How a reply refers back to it. */
  label: string;
  /** In capitals, and spelled the same way every time it appears. */
  name: string;
  kind: ExerciseKind;
  /** 0 when the block's rounds govern how many times it is done. */
  sets: number;
  /** "8-12", "30 sec", "6 each side". */
  reps: string;
  /** 0 for bodyweight. Per hand for dumbbells, total for a bar. */
  loadKg: number;
  /** "per hand", "bodyweight", "light band". Empty when the kg says it all. */
  loadNote: string;
  /** Reps in reserve at the end of each set. -1 when it does not apply. */
  rir: number;
  /** 0 when the block governs rest. */
  restSec: number;
  /** The one thing to think about, short enough to read mid set. */
  cue: string;
  /** Two or three sentences: what it works, how, the mistake to avoid. */
  howTo: string;
  primary: Muscle[];
  secondary: Muscle[];
  /** Kept from session to session within a block, so it can be progressed. */
  anchor: boolean;
}

export interface PlanBlock {
  kind: BlockKind;
  /** "Jump primer", "Glute strength", "EMOM finisher". */
  title: string;
  format: Format;
  /** For circuits, complexes and finishers. 0 when sets govern. */
  rounds: number;
  /** The block's share of the session. */
  minutes: number;
  /** How to run it, when that is not obvious from the format. */
  instructions: string;
  exercises: PlanExercise[];
}

export interface Plan {
  /** "Glutes and jumps". The subject line and the headline. */
  title: string;
  /** "Glutes, hamstrings, upper back". */
  focus: string;
  /** One sentence on why today looks the way it does. */
  why: string;
  blocks: PlanBlock[];
  /** One practical line for outside the gym, or empty. */
  tip: string;
}

const exerciseSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "label",
    "name",
    "kind",
    "sets",
    "reps",
    "loadKg",
    "loadNote",
    "rir",
    "restSec",
    "cue",
    "howTo",
    "primary",
    "secondary",
    "anchor",
  ],
  properties: {
    label: { type: "string", description: "A, B1, B2, C. Unique in the plan." },
    name: { type: "string", description: "Gym name in capitals, spelled identically every session." },
    kind: { type: "string", enum: [...EXERCISE_KINDS] },
    sets: { type: "integer", description: "0 when the block's rounds govern." },
    reps: { type: "string", description: "8-12, 30 sec, 6 each side." },
    loadKg: { type: "number", description: "0 for bodyweight. Per hand for dumbbells." },
    loadNote: { type: "string", description: "per hand, bodyweight, band colour, or empty." },
    rir: { type: "integer", description: "Reps in reserve. -1 when not applicable." },
    restSec: { type: "integer", description: "0 when the block governs rest." },
    cue: { type: "string", description: "One short cue, under 45 characters." },
    howTo: { type: "string", description: "Two or three plain sentences." },
    primary: { type: "array", items: { type: "string", enum: [...MUSCLES] } },
    secondary: { type: "array", items: { type: "string", enum: [...MUSCLES] } },
    anchor: { type: "boolean" },
  },
} as const;

const blockSchema = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "title", "format", "rounds", "minutes", "instructions", "exercises"],
  properties: {
    kind: { type: "string", enum: [...BLOCK_KINDS] },
    title: { type: "string" },
    format: { type: "string", enum: [...FORMATS] },
    rounds: { type: "integer" },
    minutes: { type: "integer" },
    instructions: { type: "string" },
    exercises: { type: "array", items: exerciseSchema },
  },
} as const;

/** What the API is constrained to return. */
export const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "focus", "why", "blocks", "tip"],
  properties: {
    title: { type: "string" },
    focus: { type: "string" },
    why: { type: "string" },
    blocks: { type: "array", items: blockSchema },
    tip: { type: "string" },
  },
} as const;

export class PlanError extends Error {}

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

const int = (v: unknown, fallback = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.round(v) : fallback;

/** Loads are kept to the nearest quarter kilo. Nothing in a gym is finer. */
const kg = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v * 4) / 4 : 0;

function oneOf<T extends string>(all: readonly T[], v: unknown, fallback: T): T {
  return all.includes(v as T) ? (v as T) : fallback;
}

function muscles(v: unknown): Muscle[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((m): m is Muscle => MUSCLES.includes(m as Muscle)))];
}

function readExercise(raw: unknown, fallbackLabel: string): PlanExercise | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const name = text(r.name).toUpperCase().replace(/\s+/g, " ");
  if (!name) return null;

  const primary = muscles(r.primary);

  return {
    label: text(r.label).toUpperCase() || fallbackLabel,
    name,
    kind: oneOf(EXERCISE_KINDS, r.kind, "lift"),
    sets: Math.max(0, int(r.sets)),
    reps: text(r.reps),
    loadKg: kg(r.loadKg),
    loadNote: text(r.loadNote),
    rir: Math.max(-1, Math.min(5, int(r.rir, -1))),
    restSec: Math.max(0, int(r.restSec)),
    cue: text(r.cue),
    howTo: text(r.howTo),
    primary,
    // A muscle is never both. Primary wins, because it is what gets counted.
    secondary: muscles(r.secondary).filter((m) => !primary.includes(m)),
    anchor: r.anchor === true,
  };
}

/**
 * Turns whatever came back into a plan that can be trusted downstream.
 *
 * Forgiving where forgiveness is harmless (an unknown format becomes straight
 * sets) and strict only where nothing could be sent: a plan with no exercises
 * at all is a generation that failed, and it is better retried than mailed.
 */
export function readPlan(raw: unknown): Plan {
  if (!raw || typeof raw !== "object") throw new PlanError("The plan is not an object.");
  const r = raw as Record<string, unknown>;

  const blocks: PlanBlock[] = [];
  const seen = new Set<string>();
  let counter = 0;

  for (const rawBlock of Array.isArray(r.blocks) ? r.blocks : []) {
    if (!rawBlock || typeof rawBlock !== "object") continue;
    const b = rawBlock as Record<string, unknown>;

    const exercises: PlanExercise[] = [];
    for (const rawExercise of Array.isArray(b.exercises) ? b.exercises : []) {
      counter += 1;
      const exercise = readExercise(rawExercise, `X${counter}`);
      if (!exercise) continue;

      // Labels are how a reply points at an exercise, so they must be unique.
      while (seen.has(exercise.label)) exercise.label = `${exercise.label}'`;
      seen.add(exercise.label);

      exercises.push(exercise);
    }

    if (exercises.length === 0) continue;

    blocks.push({
      kind: oneOf(BLOCK_KINDS, b.kind, "strength"),
      title: text(b.title),
      format: oneOf(FORMATS, b.format, "straight sets"),
      rounds: Math.max(0, int(b.rounds)),
      minutes: Math.max(0, int(b.minutes)),
      instructions: text(b.instructions),
      exercises,
    });
  }

  if (blocks.length === 0) throw new PlanError("The plan has no exercises.");

  return {
    title: text(r.title) || "Today's session",
    focus: text(r.focus),
    why: text(r.why),
    blocks,
    tip: text(r.tip),
  };
}

/** Every exercise in session order. */
export function exercisesOf(plan: Plan): PlanExercise[] {
  return plan.blocks.flatMap((b) => b.exercises);
}

/**
 * The exercises that get a picture and a written explanation: everything but
 * the warm up and cool down, which are prose-sized items that would bury the
 * session under twenty pictures of people stretching.
 */
export function mainExercises(plan: Plan): PlanExercise[] {
  return plan.blocks
    .filter((b) => b.kind !== "warmup" && b.kind !== "cooldown")
    .flatMap((b) => b.exercises);
}

/** How many times each exercise is actually done, whether sets or rounds say so. */
export function setsDone(block: PlanBlock, exercise: PlanExercise): number {
  if (exercise.sets > 0) return exercise.sets;
  return block.rounds > 0 ? block.rounds : 1;
}

/** The key two spellings of one movement share. */
export function exerciseKey(name: string): string {
  return normalizeExerciseName(name);
}

/** The total time the plan says it takes. */
export function plannedMinutes(plan: Plan): number {
  return plan.blocks.reduce((sum, b) => sum + b.minutes, 0);
}
