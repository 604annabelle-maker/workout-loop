/**
 * Progression (spec §Progression).
 *
 * Pure. Double progression with the tap as an effort check, per exercise,
 * from what she logged. Nothing is assumed: an exercise she did not tap does
 * not move. Every weight returned exists at her gym.
 *
 * The tap maps to reps left: easy about 3 or more, done 1 to 2, hard none
 * left or reps missed. People misjudge this by about a rep (Halperin 2022),
 * which these rules tolerate: a single tap never moves a weight down.
 */

import {
  isWeighted,
  loadable,
  neighbours,
  nearest,
  roundDown,
  stepTooBig,
  stepUp,
  type Equipment,
  type Load,
} from "./equipment";
import { PROGRESSION } from "./rules";
import type { Note, Prescription, SessionRecord, Tap } from "./types";

export interface Exposure {
  date: Date;
  /** The range prescribed that day. */
  range: [number, number];
  weight: number | null;
  reps: number[];
  tap: Tap;
}

/** Every logged exposure of one exercise, oldest first, whether it was the slot's exercise or its swap. */
export function exposures(exerciseId: string, history: SessionRecord[]): Exposure[] {
  const out: Exposure[] = [];
  for (const s of [...history].sort((a, b) => a.date.getTime() - b.date.getTime())) {
    for (const log of s.logs) {
      if (log.exerciseId !== exerciseId) continue;
      const planned = s.plan.exercises.find((e) => e.slot === log.slot);
      const p = planned && (log.usedSwap ? planned.swap : planned.main);
      if (!p || !log.reps.length) continue;
      out.push({ date: s.date, range: p.range, weight: log.weight, reps: log.reps, tap: log.tap });
    }
  }
  return out;
}

/** Where a first try starts, before she adjusts it: light, so finding the weight goes up, not down. */
export function startWeight(load: Load, eq: Equipment): number | null {
  const steps = loadable(load, eq);
  if (!steps.length) return null;
  const guess: Record<string, number> = { dumbbell: 4, barbell: eq.barbell, ezbar: eq.ezbar, cable: 10 };
  return nearest(guess[load] ?? 20, steps);
}

/**
 * How strong one exposure was, comparable across days with different set
 * counts: the best set's estimated one-rep max (Epley), or its reps for
 * bodyweight work. Sets are not summed, since slots differ in how many they get.
 */
export function strength(e: { weight: number | null; reps: number[] }): number {
  const best = e.reps.length ? Math.max(...e.reps) : 0;
  return e.weight ? e.weight * (1 + best / 30) : best;
}

const work = strength;

/** The exposures since the weight last went down: a reset starts a fresh run, so it cannot stall at once. */
function sinceReset(list: Exposure[]): Exposure[] {
  let start = 0;
  for (let i = 1; i < list.length; i++)
    if (list[i].weight !== null && list[i - 1].weight !== null && list[i].weight! < list[i - 1].weight! - 1e-9) start = i;
  return list.slice(start);
}

/** Three exposures in a row that did not beat the best before them, since the last reset. */
export function stalled(all: Exposure[]): boolean {
  const n = PROGRESSION.stallAfter;
  const list = sinceReset(all);
  if (list.length < n + 1) return false;
  const recent = list.slice(-n);
  const before = Math.max(...list.slice(0, -n).map(work));
  return recent.every((e) => work(e) <= before + 1e-9);
}

export interface Next extends Prescription {
  /** Second stall within eight weeks: the slot should take another exercise. */
  swapExercise: boolean;
  /** A bodyweight exercise at the top of its range with a harder variation available. */
  readyForHarder: boolean;
  /** What moved, for tests and the log. */
  why: string;
}

/**
 * The next prescription for one exercise.
 *
 * `range` is the slot's range today. `tooEasy` is a note from her since the
 * last exposure saying it was far too light: the weight goes up now, without
 * waiting for the rep rule.
 */
export function next(input: {
  exerciseId: string;
  load: Load;
  range: [number, number];
  history: SessionRecord[];
  equipment: Equipment;
  notes?: Note[];
  now?: Date;
}): Next {
  const { exerciseId, load, equipment } = input;
  const [lo, hi] = input.range;
  const steps = loadable(load, equipment);
  const weighted = isWeighted(load) && steps.length > 0;
  const list = exposures(exerciseId, input.history);
  const last = list[list.length - 1];
  const base = { exerciseId, load, swapExercise: false, readyForHarder: false };
  const around = (w: number | null) => (w === null ? [] : neighbours(w, steps, 6));

  if (!last) {
    const w = weighted ? startWeight(load, equipment) : null;
    return { ...base, weight: w, steps: around(w), reps: lo, range: [lo, hi], findIt: weighted, why: "first time" };
  }

  const tooEasy = (input.notes ?? []).some(
    (n) => n.reason === "too_easy" && n.exerciseId === exerciseId && !n.undoneAt && n.createdAt > last.date,
  );

  // Bodyweight and bands: reps only, then a harder variation.
  if (!weighted) {
    const top = Math.max(hi, last.range[1]);
    const allTop = last.reps.every((r) => r >= top);
    const below = last.reps.some((r) => r < lo);
    if (allTop && last.tap !== "hard")
      return { ...base, weight: null, steps: [], reps: top + 1, range: [lo, top + PROGRESSION.extendBy], findIt: false, readyForHarder: true, why: "top of range" };
    if (below || last.tap === "hard") {
      const reps = Math.max(lo, Math.min(...last.reps));
      return { ...base, weight: null, steps: [], reps, range: [lo, top], findIt: false, why: "hold" };
    }
    const reps = Math.min(top, Math.min(...last.reps) + 1);
    return { ...base, weight: null, steps: [], reps, range: [lo, top], findIt: false, why: "one more rep" };
  }

  const w = last.weight !== null ? (nearest(last.weight, steps) ?? last.weight) : (startWeight(load, equipment) as number);
  // When the next step is too big, the top of the range rises first (rule 4).
  const extended = stepTooBig(w, steps, PROGRESSION.bigStep);
  const top = extended ? hi + PROGRESSION.extendBy : hi;
  const range: [number, number] = [lo, top];
  const done = (weight: number, reps: number, why: string, extra: Partial<Next> = {}): Next => ({
    ...base,
    weight,
    steps: around(weight),
    reps,
    range: extra.range ?? range,
    findIt: false,
    why,
    ...extra,
  });

  if (tooEasy) return done(stepUp(w, steps) ?? w, lo, "she said too easy", { range: [lo, hi] });

  // Stalls (rule 5): drop and rebuild; a second within eight weeks swaps the exercise.
  if (stalled(list)) {
    const cutoff = (input.now ?? new Date()).getTime() - PROGRESSION.secondStallWeeks * 7 * 864e5;
    // An earlier stall: some prefix ending before these last sessions, inside the window, stalled too.
    const n = PROGRESSION.stallAfter;
    let priorStall = false;
    for (let k = n + 1; k <= list.length - n; k++)
      if (list[k - 1].date.getTime() >= cutoff && stalled(list.slice(0, k))) priorStall = true;
    const dropped = roundDown(w * (1 - PROGRESSION.drop), steps) ?? w;
    return done(dropped, lo, "stall", { range: [lo, hi], swapExercise: priorStall });
  }

  const allTop = last.reps.every((r) => r >= top);
  const below = last.reps.some((r) => r < lo);

  if (allTop) {
    if (last.tap === "hard") return done(w, top, "top but hard: repeat");
    const up = stepUp(w, steps) ?? w;
    return done(up, lo, "top of range: heavier", { range: [lo, hi] });
  }
  if (below) {
    const prev = list[list.length - 2];
    const twice = prev && prev.reps.some((r) => r < prev.range[0]) && prev.weight === last.weight;
    if (twice) return done(roundDown(w * (1 - PROGRESSION.drop), steps) ?? w, lo, "below range twice: lighter", { range: [lo, hi] });
    return done(w, lo, "below range: hold");
  }
  if (last.tap === "hard") return done(w, Math.max(lo, Math.min(...last.reps)), "hard: hold");
  return done(w, Math.min(top, Math.min(...last.reps) + 1), "one more rep");
}

/** The effort line, in plain words. Never "RIR". */
export function effortLine(cls: "heavy" | "compound" | "isolation", deload = false): string {
  if (deload) return "easy week: stop with 3–4 left in the tank";
  if (cls === "heavy") return "stop with 2 left in the tank";
  if (cls === "compound") return "stop with 1–2 left in the tank";
  return "stop with 1 left, last set all out";
}
