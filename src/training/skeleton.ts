/**
 * The week's skeleton (spec §Weekly structure).
 *
 * Pure. Code, never the model, decides which session today is, which slots it
 * has, what muscle and kind of exercise each slot is for, and how many sets
 * each gets. The model only fills slots (choose.ts), and check.ts refuses any
 * filling that does not train the slot's muscle.
 *
 * A "week" here is a cycle of four sessions in order: Upper A, Lower A, Upper
 * B, Lower B. Sessions go in order rather than by weekday, so a missed day
 * shifts the rest and nothing is lost. Every other cycle, Lower B is a full
 * body day instead. Weekly volume is aimed at per cycle; the summary in the
 * email counts Sunday to Saturday, which is what she sees.
 */

import type { Pattern } from "./catalogue";
import {
  CLASS,
  DELOAD,
  FINISHER,
  HEAVY_REPS_B,
  HIGH_REP_PATTERNS,
  SESSION_MUSCLE_CAP,
  SESSION_SETS,
  TARGETED,
  WEEKLY,
  WEEKLY_CAP,
  type ExerciseClass,
  type Muscle,
  type Targeted,
} from "./rules";

export const SESSION_TYPES = ["upper_a", "lower_a", "upper_b", "lower_b", "full"] as const;
export type SessionType = (typeof SESSION_TYPES)[number];

export const SESSION_NAME: Record<SessionType, string> = {
  upper_a: "Upper",
  lower_a: "Lower",
  upper_b: "Upper",
  lower_b: "Lower",
  full: "Full body",
};

export interface SlotSpec {
  /** Stable across weeks: "upper_a:2". Rotation is tracked per key. */
  key: string;
  muscle: Muscle;
  class: Exclude<ExerciseClass, "drill">;
  /** Allowed movement patterns; empty means any that trains the muscle. */
  patterns: Pattern[];
  /** Least and most sets the balancer may give it; a min of 0 makes the slot optional. */
  sets: [number, number];
  /** Rough fractional credit per set, for planning only; check.ts uses the real exercise. */
  expect: Partial<Record<Muscle, number>>;
  /** An abs finisher slot. */
  finisher?: boolean;
  /** Prefer an exercise that loads the muscle stretched. */
  preferStretched?: boolean;
}

export interface Slot extends SlotSpec {
  /** Sets after balancing (and halving in a deload week). */
  setCount: number;
  reps: [number, number];
}

const s = (
  type: SessionType,
  n: number,
  muscle: Muscle,
  cls: SlotSpec["class"],
  patterns: Pattern[],
  sets: [number, number],
  expect: Partial<Record<Muscle, number>>,
  extra: Partial<SlotSpec> = {},
): SlotSpec => ({ key: `${type}:${n}`, muscle, class: cls, patterns, sets, expect: { [muscle]: 1, ...expect }, ...extra });

const PRESS = { triceps: 0.5, front_delts: 0.5 };
const PULL = { biceps: 0.5, rear_delts: 0.5 };
const PULLDOWN = { biceps: 0.5 };

const finisher = (type: SessionType, n: number): SlotSpec[] =>
  Array.from({ length: FINISHER.exercises }, (_, i) =>
    s(type, n + i, "abs", "isolation", ["core"], [FINISHER.sets, FINISHER.sets], {}, { finisher: true }),
  );

export const TEMPLATES: Record<SessionType, SlotSpec[]> = {
  upper_a: [
    s("upper_a", 1, "chest", "heavy", ["h_push"], [3, 4], PRESS),
    s("upper_a", 2, "back", "heavy", ["h_pull"], [3, 4], PULL),
    s("upper_a", 3, "back", "compound", ["v_pull"], [2, 4], PULLDOWN),
    s("upper_a", 4, "side_delts", "isolation", ["lateral_raise"], [2, 4], {}),
    s("upper_a", 5, "biceps", "isolation", ["elbow_flex"], [2, 4], {}),
    s("upper_a", 6, "triceps", "isolation", ["elbow_ext"], [2, 4], {}, { preferStretched: true }),
  ],
  lower_a: [
    s("lower_a", 1, "quads", "heavy", ["squat"], [3, 4], { glutes: 0.5 }),
    s("lower_a", 2, "hamstrings", "heavy", ["hinge"], [3, 4], { glutes: 0.5 }),
    s("lower_a", 3, "glutes", "compound", ["hip_ext", "lunge"], [2, 4], { hamstrings: 0.5 }),
    s("lower_a", 4, "quads", "isolation", ["knee_ext"], [2, 3], {}),
    s("lower_a", 5, "hamstrings", "isolation", ["knee_flex"], [2, 3], {}, { preferStretched: true }),
    s("lower_a", 6, "side_delts", "isolation", ["lateral_raise"], [0, 3], {}),
    ...finisher("lower_a", 7),
  ],
  upper_b: [
    s("upper_b", 1, "chest", "compound", ["h_push"], [3, 4], PRESS, { preferStretched: true }),
    s("upper_b", 2, "back", "compound", ["v_pull"], [3, 4], PULLDOWN),
    s("upper_b", 3, "back", "compound", ["h_pull"], [2, 3], PULL),
    s("upper_b", 4, "chest", "isolation", ["fly"], [0, 3], {}),
    s("upper_b", 5, "side_delts", "isolation", ["lateral_raise"], [2, 4], {}),
    s("upper_b", 6, "biceps", "isolation", ["elbow_flex"], [2, 4], {}, { preferStretched: true }),
    s("upper_b", 7, "triceps", "isolation", ["elbow_ext"], [2, 4], {}, { preferStretched: true }),
  ],
  lower_b: [
    s("lower_b", 1, "glutes", "heavy", ["hip_ext", "hinge"], [3, 4], { hamstrings: 0.5 }),
    s("lower_b", 2, "quads", "compound", ["squat", "lunge"], [3, 4], { glutes: 0.5 }),
    s("lower_b", 3, "hamstrings", "isolation", ["knee_flex"], [2, 3], {}, { preferStretched: true }),
    s("lower_b", 4, "glutes", "isolation", ["abduction", "hip_ext"], [2, 3], {}),
    s("lower_b", 5, "quads", "isolation", ["knee_ext"], [0, 3], {}),
    s("lower_b", 6, "triceps", "isolation", ["elbow_ext"], [0, 2], {}),
    ...finisher("lower_b", 7),
  ],
  full: [
    s("full", 1, "quads", "heavy", ["squat"], [3, 3], { glutes: 0.5 }),
    s("full", 2, "chest", "compound", ["h_push"], [2, 3], PRESS),
    s("full", 3, "back", "compound", ["v_pull", "h_pull"], [2, 3], PULLDOWN),
    s("full", 4, "hamstrings", "compound", ["hinge"], [2, 3], { glutes: 0.5 }),
    s("full", 5, "glutes", "compound", ["hip_ext", "lunge"], [2, 3], { hamstrings: 0.5 }),
    s("full", 6, "side_delts", "isolation", ["lateral_raise"], [0, 3], {}),
    s("full", 7, "biceps", "isolation", ["elbow_flex"], [0, 3], {}),
    s("full", 8, "triceps", "isolation", ["elbow_ext"], [0, 3], {}),
    ...finisher("full", 9),
  ],
};

/** Upper A, Lower A, Upper B, then Lower B, or full body on every other cycle. */
export function cycleTypes(cycle: number): SessionType[] {
  return ["upper_a", "lower_a", "upper_b", cycle % 2 === 1 ? "full" : "lower_b"];
}

export interface Position {
  type: SessionType;
  /** Which cycle of four this is, from 0. */
  cycle: number;
  /** Where in the cycle, 0 to 3. */
  index: number;
}

/** The session after the last one sent, in order. With no history, Upper A of cycle 0. */
export function nextPosition(last: Position | null): Position {
  if (!last) return { type: "upper_a", cycle: 0, index: 0 };
  const index = (last.index + 1) % 4;
  const cycle = index === 0 ? last.cycle + 1 : last.cycle;
  return { type: cycleTypes(cycle)[index], cycle, index };
}

export type Targets = Record<Targeted, number>;

/** Weekly targets, starting values plus any growth earned, never past the growth ceiling. */
export function targets(growth: Partial<Record<Targeted, number>> = {}): Targets {
  const out = {} as Targets;
  for (const m of TARGETED) out[m] = Math.min(WEEKLY[m].start + (growth[m] ?? 0), WEEKLY[m].grow, WEEKLY_CAP);
  return out;
}

const isTargeted = (m: Muscle): m is Targeted => (TARGETED as readonly string[]).includes(m);

/** Fractional volume per muscle for slots with their set counts. */
export function plannedVolume(slots: { expect: Partial<Record<Muscle, number>>; setCount: number }[]) {
  const v: Partial<Record<Muscle, number>> = {};
  for (const slot of slots)
    for (const [m, c] of Object.entries(slot.expect) as [Muscle, number][]) v[m] = (v[m] ?? 0) + c * slot.setCount;
  return v;
}

/**
 * Sets per slot for a whole cycle: every slot starts at its minimum, then sets
 * go one at a time wherever they close the most of the remaining gap to the
 * weekly targets, without breaking a session's set budget, a per-session
 * muscle cap or the weekly cap. Then any session still under its minimum
 * budget is topped up.
 */
export function balance(types: SessionType[], t: Targets): number[][] {
  const sessions = types.map((type) => TEMPLATES[type]);
  const sets = sessions.map((slots) => slots.map((x) => x.sets[0]));

  const weekVol = () => {
    const v: Partial<Record<Muscle, number>> = {};
    sessions.forEach((slots, i) =>
      slots.forEach((slot, j) => {
        for (const [m, c] of Object.entries(slot.expect) as [Muscle, number][]) v[m] = (v[m] ?? 0) + c * sets[i][j];
      }),
    );
    return v;
  };
  const deficit = (v: Partial<Record<Muscle, number>>) =>
    TARGETED.reduce((sum, m) => sum + Math.max(0, t[m] - (v[m] ?? 0)), 0);
  // The budget's ceiling counts every set, since it is about time; its floor counts working sets, abs excluded.
  const sessionSets = (i: number) => sets[i].reduce((a, b) => a + b, 0);
  const workingSets = (i: number) => sets[i].reduce((a, b, j) => a + (sessions[i][j].finisher ? 0 : b), 0);
  const sessionMuscle = (i: number, m: Muscle) =>
    sessions[i].reduce((sum, slot, j) => sum + (slot.expect[m] ?? 0) * sets[i][j], 0);
  // An optional slot that comes in starts at two sets: a single set of an exercise is not worth the setup.
  const step = (i: number, j: number) => (sets[i][j] === 0 ? 2 : 1);
  const canAdd = (i: number, j: number) => {
    const slot = sessions[i][j];
    const n = step(i, j);
    if (slot.finisher) return false;
    if (sets[i][j] + n > slot.sets[1]) return false;
    if (sessionSets(i) + n > SESSION_SETS[1]) return false;
    const v = weekVol();
    for (const [m, c] of Object.entries(slot.expect) as [Muscle, number][]) {
      if (sessionMuscle(i, m) + c * n > SESSION_MUSCLE_CAP) return false;
      if ((v[m] ?? 0) + c * n > WEEKLY_CAP) return false;
    }
    return true;
  };

  for (let guard = 0; guard < 200; guard++) {
    const before = deficit(weekVol());
    let best: { i: number; j: number; gain: number; need: number } | null = null;
    sessions.forEach((slots, i) =>
      slots.forEach((slot, j) => {
        if (!canAdd(i, j)) return;
        const n = step(i, j);
        sets[i][j] += n;
        const gain = (before - deficit(weekVol())) / n;
        sets[i][j] -= n;
        const v = weekVol();
        const need = isTargeted(slot.muscle) ? t[slot.muscle] - (v[slot.muscle] ?? 0) : 0;
        if (gain > 1e-9 && (!best || gain > best.gain + 1e-9 || (Math.abs(gain - best.gain) < 1e-9 && need > best.need)))
          best = { i, j, gain, need };
      }),
    );
    if (!best) break;
    const { i, j } = best as { i: number; j: number };
    sets[i][j] += step(i, j);
  }

  // Top up any session under its minimum budget, on the slot whose muscle is least over target.
  sessions.forEach((slots, i) => {
    for (let guard = 0; guard < 40 && workingSets(i) < SESSION_SETS[0]; guard++) {
      const v = weekVol();
      const options = slots
        .map((slot, j) => ({ slot, j }))
        .filter(({ j }) => canAdd(i, j))
        .sort((a, b) => {
          const over = (x: SlotSpec) => (v[x.muscle] ?? 0) - (isTargeted(x.muscle) ? t[x.muscle] : 0);
          return over(a.slot) - over(b.slot);
        });
      if (!options.length) break;
      sets[i][options[0].j] += step(i, options[0].j);
    }
  });
  return sets;
}

export interface Skeleton {
  type: SessionType;
  cycle: number;
  index: number;
  deload: boolean;
  slots: Slot[];
}

/** One session's slots, with sets from the cycle's balance and reps by class. */
export function skeleton(pos: Position, opts: { targets?: Targets; deload?: boolean } = {}): Skeleton {
  const types = cycleTypes(pos.cycle);
  const all = balance(types, opts.targets ?? targets());
  const sets = all[pos.index];
  const isB = pos.type === "upper_b" || pos.type === "lower_b";
  const slots: Slot[] = TEMPLATES[pos.type]
    .map((spec, j) => {
      let setCount = sets[j];
      if (opts.deload && setCount > 0) setCount = Math.max(1, Math.round(setCount * DELOAD.setFactor));
      const high = spec.patterns.length && spec.patterns.every((p) => HIGH_REP_PATTERNS[p]) ? HIGH_REP_PATTERNS[spec.patterns[0]] : null;
      const reps = high ?? (spec.class === "heavy" && isB ? HEAVY_REPS_B : CLASS[spec.class].reps);
      return { ...spec, setCount, reps: [...reps] as [number, number] };
    })
    .filter((slot) => slot.setCount > 0);
  return { type: pos.type, cycle: pos.cycle, index: pos.index, deload: !!opts.deload, slots };
}

/** Rough minutes for the working sets of a session, warm-up not included. */
export function workMinutes(slots: { class: SlotSpec["class"]; setCount: number }[]): number {
  const seconds = slots.reduce((sum, slot) => {
    const c = CLASS[slot.class];
    return sum + slot.setCount * (c.setTime + c.rest);
  }, 0);
  return Math.round(seconds / 60);
}
