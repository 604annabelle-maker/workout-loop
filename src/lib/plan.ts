/**
 * The shape of a workout.
 *
 * Pure. A workout used to be plain text that the model wrote and this project
 * then parsed back apart, which meant every downstream feature (colour, the
 * pictures, last time's load) depended on the model keeping a layout. Now the
 * model returns this structure and the code does the layout, so the email is
 * the same shape every time and every exercise carries what the tracking
 * needs: which muscles it trains, whether it is an anchor lift, what kind of
 * work it is.
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
 * What kind of work an exercise is. `lift` counts as hard sets toward the
 * muscle targets. `jump` belongs only in the warm up on her jump day; the
 * coach removes it anywhere else.
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

/**
 * The job an exercise does in the session, which decides its reps, effort
 * and rest (program.ts ROLES), and keeps two uses of one lift apart.
 *
 * `heavy` is a main lift on its heavy day, `light` the same lift on its other
 * day of the week. They share a name, and each keeps its own progression: a
 * heavy bench at 4 x 5 and a light one at 3 x 8 are two different numbers to
 * beat. `second` is the session's second lift, `accessory` everything after,
 * `core` the ab work, and `warmup` anything before the main work.
 */
export const ROLE_NAMES = ["heavy", "light", "second", "accessory", "core", "warmup"] as const;

export type Role = (typeof ROLE_NAMES)[number];

/** The one exercise that can stand in for another, shown under it. */
export interface Swap {
  name: string;
  /** The rep target, as for the exercise it replaces. */
  reps: string;
  loadKg: number;
  loadNote: string;
  /** Shown only when there is no picture for it. */
  howTo: string;
}

export interface PlanExercise {
  /** "A", "B1", "B2". How a tap or a reply refers back to it. */
  label: string;
  /** In capitals, and spelled the same way every time it appears. */
  name: string;
  kind: ExerciseKind;
  role: Role;
  /** 0 when the block's rounds govern how many times it is done. */
  sets: number;
  /**
   * Today's target: one number of reps for a lift ("5"), so "done" means
   * something exact. Time or a count per side where that is what it is
   * ("30 sec", "8 each side").
   */
  reps: string;
  /**
   * The rep range the target moves through, "3-5". Reps go up by one inside
   * it; at the top, the weight goes up and the reps go back to the bottom.
   * Empty for anything not progressed that way.
   */
  range: string;
  /** 0 for bodyweight. Per hand for dumbbells, total for a bar. */
  loadKg: number;
  /** "per hand", "bodyweight", "light band". Empty when the kg says it all. */
  loadNote: string;
  /** Reps in reserve at the end of each set. -1 when it does not apply. */
  rir: number;
  /**
   * The last set goes all the way to failure. Rationed and enforced by the
   * coach: never on a heavy anchor, never in a lighter week.
   */
  lastSetToFailure: boolean;
  /** 0 when the block governs rest. */
  restSec: number;
  /** The one thing to think about, short enough to read mid set. */
  cue: string;
  /** Two or three sentences: what it works, how, the mistake to avoid. */
  howTo: string;
  primary: Muscle[];
  secondary: Muscle[];
  /** A main lift, heavy or light: kept from block to block so it can be progressed. */
  anchor: boolean;
  /** What to do instead, if the machine is taken or it does not suit today. */
  swap: Swap | null;
}

export interface PlanBlock {
  kind: BlockKind;
  /** "Power primer", "Glute strength", "EMOM finisher". */
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
  /** "Back + biceps". The subject line and the headline. */
  title: string;
  /** "Back, biceps". */
  focus: string;
  blocks: PlanBlock[];
}

const exerciseSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "label",
    "name",
    "kind",
    "role",
    "sets",
    "reps",
    "range",
    "loadKg",
    "loadNote",
    "rir",
    "lastSetToFailure",
    "restSec",
    "cue",
    "howTo",
    "primary",
    "secondary",
    "swap",
  ],
  properties: {
    label: { type: "string", description: "A, B1, B2, C. Unique in the plan." },
    name: { type: "string", description: "Gym name in capitals, spelled identically every session." },
    kind: { type: "string", enum: [...EXERCISE_KINDS] },
    role: { type: "string", enum: [...ROLE_NAMES] },
    sets: { type: "integer", description: "0 when the block's rounds govern." },
    reps: { type: "string", description: "Today's target. One number for a lift: 5, 10. Or 30 sec, 8 each side." },
    range: { type: "string", description: "The rep range the target moves through, 3-5, 8-12. Empty when not a lift." },
    loadKg: { type: "number", description: "0 for bodyweight. Per hand for dumbbells." },
    loadNote: { type: "string", description: "per hand, bodyweight, band colour, or empty." },
    rir: { type: "integer", description: "Reps in reserve on working sets. -1 when not applicable." },
    lastSetToFailure: { type: "boolean", description: "The last set goes to failure." },
    restSec: { type: "integer", description: "0 when the block governs rest." },
    cue: { type: "string", description: "One short cue, under 45 characters." },
    howTo: { type: "string", description: "Two or three plain sentences." },
    primary: { type: "array", items: { type: "string", enum: [...MUSCLES] } },
    secondary: { type: "array", items: { type: "string", enum: [...MUSCLES] } },
    swap: {
      type: "object",
      additionalProperties: false,
      required: ["name", "reps", "loadKg", "loadNote", "howTo"],
      description: "One alternative for the same muscles. Empty name for warm up items.",
      properties: {
        name: { type: "string" },
        reps: { type: "string" },
        loadKg: { type: "number" },
        loadNote: { type: "string" },
        howTo: { type: "string" },
      },
    },
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
  required: ["title", "focus", "blocks"],
  properties: {
    title: { type: "string" },
    focus: { type: "string" },
    blocks: { type: "array", items: blockSchema },
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

const gymName = (v: unknown): string => text(v).toUpperCase().replace(/\s+/g, " ");

function readSwap(raw: unknown, name: string): Swap | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const swap = gymName(r.name);
  if (!swap || swap === name) return null;
  return { name: swap, reps: text(r.reps), loadKg: kg(r.loadKg), loadNote: text(r.loadNote), howTo: text(r.howTo) };
}

/**
 * The role, from the field when there is one. Plans from before roles
 * existed said `anchor` instead, and those were the heavy lifts.
 */
function readRole(r: Record<string, unknown>, blockKind: BlockKind): Role {
  if (ROLE_NAMES.includes(r.role as Role)) return r.role as Role;
  if (r.anchor === true) return "heavy";
  if (blockKind === "warmup" || blockKind === "primer" || blockKind === "cooldown") return "warmup";
  if (blockKind === "core") return "core";
  return "accessory";
}

function readExercise(raw: unknown, fallbackLabel: string, blockKind: BlockKind): PlanExercise | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const name = gymName(r.name);
  if (!name) return null;

  const primary = muscles(r.primary);
  const role = readRole(r, blockKind);
  const reps = text(r.reps);

  return {
    label: text(r.label).toUpperCase() || fallbackLabel,
    name,
    kind: oneOf(EXERCISE_KINDS, r.kind, "lift"),
    role,
    sets: Math.max(0, int(r.sets)),
    reps,
    // Older plans wrote the range as the reps.
    range: text(r.range) || (/^\d+\s*-\s*\d+$/.test(reps) ? reps.replace(/\s+/g, "") : ""),
    loadKg: kg(r.loadKg),
    loadNote: text(r.loadNote),
    rir: Math.max(-1, Math.min(5, int(r.rir, -1))),
    lastSetToFailure: r.lastSetToFailure === true,
    restSec: Math.max(0, int(r.restSec)),
    cue: text(r.cue),
    howTo: text(r.howTo),
    primary,
    // A muscle is never both. Primary wins, because it is what gets counted.
    secondary: muscles(r.secondary).filter((m) => !primary.includes(m)),
    anchor: role === "heavy" || role === "light",
    swap: role === "warmup" ? null : readSwap(r.swap, name),
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

    const kind = oneOf(BLOCK_KINDS, b.kind, "strength");
    const exercises: PlanExercise[] = [];
    for (const rawExercise of Array.isArray(b.exercises) ? b.exercises : []) {
      counter += 1;
      const exercise = readExercise(rawExercise, `X${counter}`, kind);
      if (!exercise) continue;

      // Labels are how a reply points at an exercise, so they must be unique.
      while (seen.has(exercise.label)) exercise.label = `${exercise.label}'`;
      seen.add(exercise.label);

      exercises.push(exercise);
    }

    if (exercises.length === 0) continue;

    blocks.push({
      kind,
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
    blocks,
  };
}

/** Every exercise in session order. */
export function exercisesOf(plan: Plan): PlanExercise[] {
  return plan.blocks.flatMap((b) => b.exercises);
}

/**
 * The exercises that get a picture and a row of log buttons: everything but
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

/**
 * The key a progression is kept under. A main lift on its light day is kept
 * apart from the same lift on its heavy day, since they are different numbers.
 */
export function progressionKey(name: string, role: Role | "" = ""): string {
  const key = exerciseKey(name);
  return role === "light" ? `${key} (light)` : key;
}

/**
 * What she asked never to be given: anything braced on a chest pad, and the
 * medicine ball chest pass. Checked in code, because a rule she set should not
 * depend on the model remembering it.
 */
export const BANNED =
  /\b(chest[- ]?supported|chest[- ]?pad|seal rows?|spider curls?|incline (?:bench |dumbbell |db )?rows?|(?:medicine|med) ball chest pass(?:es)?|chest pass(?:es)?)\b/i;

/**
 * Takes out what she banned. A banned exercise with a fine swap becomes its
 * swap; a banned swap is dropped. If the session is left with no main work,
 * it is an error, and the plan is written again.
 */
export function removeBanned(plan: Plan): Plan {
  const blocks = plan.blocks
    .map((block) => ({
      ...block,
      exercises: block.exercises.flatMap((e): PlanExercise[] => {
        const swap = e.swap && BANNED.test(e.swap.name) ? null : e.swap;
        if (!BANNED.test(e.name)) return [{ ...e, swap }];
        if (!swap) return [];
        return [{ ...e, name: swap.name, reps: swap.reps || e.reps, loadKg: swap.loadKg, loadNote: swap.loadNote, howTo: swap.howTo, swap: null }];
      }),
    }))
    .filter((block) => block.exercises.length > 0);

  if (!blocks.some((b) => b.kind !== "warmup" && b.kind !== "cooldown")) {
    throw new PlanError("Nothing was left once the banned exercises came out.");
  }
  return { ...plan, blocks };
}

/** The total time the plan says it takes. */
export function plannedMinutes(plan: Plan): number {
  return plan.blocks.reduce((sum, b) => sum + b.minutes, 0);
}
