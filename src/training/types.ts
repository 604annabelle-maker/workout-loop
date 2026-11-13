/**
 * The shapes the training engine passes around. Pure types.
 *
 * A plan is what was prescribed and sent; a log is what she did. History is
 * plans and logs together, read from the database by history.ts and handed
 * to the pure modules, which never touch the database themselves.
 */

import type { Load } from "./equipment";
import type { Muscle } from "./rules";
import type { Position, SessionType, SlotSpec } from "./skeleton";

export type Tap = "easy" | "done" | "hard";

/** Why a slot holds a different exercise from last time. */
export type Change =
  | { kind: "note"; noteId: string }
  | { kind: "rotation" }
  | { kind: "stall" }
  | { kind: "harder" }
  | { kind: "undo"; noteId: string };

/** One exercise's numbers, for the slot's exercise or its swap. */
export interface Prescription {
  exerciseId: string;
  load: Load;
  /** Null for bodyweight and bands. */
  weight: number | null;
  /** The weights that exist around it, for − / + and the tap-a-weight row. */
  steps: number[];
  /** Reps to aim for on every set. */
  reps: number;
  /** The range in force, which may have been extended because the next weight step is too big. */
  range: [number, number];
  /** First time she does it: she finds the weight, starting from `weight`. */
  findIt: boolean;
}

export interface PlannedExercise {
  slot: string;
  muscle: Muscle;
  class: SlotSpec["class"];
  sets: number;
  rest: number;
  /** "stop with 2 left in the tank" */
  effort: string;
  main: Prescription;
  swap: Prescription | null;
  /** One line from the model on why this exercise. */
  why?: string;
  change?: Change;
  /** The exercise this slot held before a change. */
  previous?: string;
  finisher?: boolean;
}

export interface WarmupItem {
  exerciseId: string;
  /** Reps per side where it is one-sided; the email just says the number. */
  reps: number;
  /** The practice set's weight; null for drills. */
  weight: number | null;
  load: Load;
  practice?: boolean;
}

/** A line at the top saying what the app changed because of something she said, with an undo. */
export interface ChangeLine {
  noteId: string;
  text: string;
}

export interface PlanV2 {
  version: 2;
  position: Position;
  deload: boolean;
  exercises: PlannedExercise[];
  warmup: WarmupItem[];
  changes: ChangeLine[];
  /** Rough minutes, warm-up included. */
  minutes: number;
}

export interface LogEntry {
  slot: string;
  exerciseId: string;
  usedSwap: boolean;
  weight: number | null;
  /** Reps on each set, as she left them on the card. */
  reps: number[];
  tap: Tap;
}

export interface SessionRecord {
  workoutId: string;
  /** When it was sent. */
  date: Date;
  plan: PlanV2;
  logs: LogEntry[];
}

export type NoteReason = "wrong_muscle" | "pain" | "too_hard" | "too_easy" | "dislike" | "one_off" | "liked";

export interface Note {
  id: string;
  reason: NoteReason;
  /** Null when the note is about the whole session. */
  exerciseId: string | null;
  /** What she said, in her words. */
  text: string;
  createdAt: Date;
  undoneAt: Date | null;
}

export interface Checkin {
  month: string;
  enjoying: "yes" | "meh" | "no" | null;
  length: "too_short" | "right" | "too_long" | null;
  comment: string | null;
}

export type { SessionType };
