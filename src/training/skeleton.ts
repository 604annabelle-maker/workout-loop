/**
 * The week's skeleton (spec §Weekly structure).
 *
 * Pure. Code, never the model, decides which session today is, which slots it
 * has, what muscle and kind of exercise each slot is for, and how many sets
 * each gets. The model only fills slots (choose.ts), and check.ts refuses any
 * filling that does not train the slot's muscle.
 *
 * A "week" here is a cycle of four sessions in order: back and biceps,
 * glutes and hamstrings, chest and triceps, quads and glutes. Sessions go in
 * order rather than by weekday, so a missed day shifts the rest and nothing
 * is lost. Every other cycle, the quads and glutes day is full body instead. Weekly volume is aimed at per cycle; the summary in the
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

export const SESSION_TYPES = ["back_biceps", "glutes_hams", "chest_triceps", "quads_glutes", "full"] as const;
export type SessionType = (typeof SESSION_TYPES)[number];

export const SESSION_NAME: Record<SessionType, string> = {
  back_biceps: "Back + biceps",
  glutes_hams: "Glutes + hamstrings",
  chest_triceps: "Chest + triceps",
  quads_glutes: "Quads + glutes",
  full: "Full body",
};

/** Which days count as upper and lower, for "send me an upper workout". */
export const UPPER: SessionType[] = ["back_biceps", "chest_triceps"];
export const LOWER: SessionType[] = ["glutes_hams", "quads_glutes"];

export interface SlotSpec {
  /** Stable across weeks: "back_biceps:2". Rotation is tracked per key. */
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

/**
 * Four focused days, two muscle groups each, as she chose: every muscle is
 * trained hard once a week. The research finds growth about equal to twice a
 * week when weekly sets match (Schoenfeld 2019, Pelland 2024, a slight edge
 * to twice), so each day carries the whole week's sets for its muscles.
 * Chest day has a little shoulder work, and both leg days end with abs.
 */
export const TEMPLATES: Record<SessionType, SlotSpec[]> = {
  back_biceps: [
    s("back_biceps", 1, "back", "heavy", ["h_pull"], [3, 4], PULL),
    s("back_biceps", 2, "back", "compound", ["v_pull"], [3, 4], PULLDOWN, { preferStretched: true }),
    s("back_biceps", 3, "back", "compound", ["h_pull"], [2, 3], PULL),
    s("back_biceps", 4, "back", "isolation", ["pullover"], [0, 3], {}),
    s("back_biceps", 5, "biceps", "isolation", ["elbow_flex"], [3, 4], {}, { preferStretched: true }),
    s("back_biceps", 6, "biceps", "isolation", ["elbow_flex"], [2, 4], {}),
  ],
  glutes_hams: [
    s("glutes_hams", 1, "hamstrings", "heavy", ["hinge"], [3, 4], { glutes: 0.5 }),
    // A glute-led lunge or step-up: the hip thrust has no accurate drawing, and a second heavy hinge would be too much.
    s("glutes_hams", 2, "glutes", "compound", ["lunge", "hinge"], [3, 4], { hamstrings: 0.5 }),
    s("glutes_hams", 3, "hamstrings", "isolation", ["knee_flex"], [3, 4], {}, { preferStretched: true }),
    s("glutes_hams", 4, "glutes", "isolation", ["abduction", "hip_ext"], [2, 3], {}),
    s("glutes_hams", 5, "glutes", "isolation", ["hip_ext"], [0, 3], { hamstrings: 0.5 }),
    ...finisher("glutes_hams", 6),
  ],
  chest_triceps: [
    s("chest_triceps", 1, "chest", "heavy", ["h_push"], [3, 4], PRESS),
    s("chest_triceps", 2, "chest", "compound", ["h_push"], [3, 4], PRESS, { preferStretched: true }),
    s("chest_triceps", 3, "chest", "isolation", ["fly"], [0, 3], {}),
    s("chest_triceps", 4, "side_delts", "isolation", ["lateral_raise"], [2, 6], {}),
    s("chest_triceps", 5, "triceps", "isolation", ["elbow_ext"], [3, 4], {}, { preferStretched: true }),
    s("chest_triceps", 6, "triceps", "isolation", ["elbow_ext"], [2, 4], {}),
  ],
  quads_glutes: [
    s("quads_glutes", 1, "quads", "heavy", ["squat"], [3, 4], { glutes: 0.5 }),
    s("quads_glutes", 2, "quads", "compound", ["squat", "lunge"], [3, 4], { glutes: 0.5 }),
    // Glutes by isolation here: the lunges with exact drawings also count fully for quads, which this day already has plenty of.
    s("quads_glutes", 3, "glutes", "isolation", ["abduction", "hip_ext"], [2, 3], {}),
    s("quads_glutes", 4, "quads", "isolation", ["knee_ext"], [2, 4], {}),
    s("quads_glutes", 5, "glutes", "compound", ["lunge", "hinge"], [0, 3], { quads: 1 }),
    ...finisher("quads_glutes", 6),
  ],
  full: [
    s("full", 1, "quads", "heavy", ["squat"], [3, 4], { glutes: 0.5 }),
    s("full", 2, "chest", "compound", ["h_push"], [2, 3], PRESS),
    s("full", 3, "back", "compound", ["v_pull", "h_pull"], [2, 3], PULLDOWN),
    s("full", 4, "hamstrings", "compound", ["hinge"], [2, 3], { glutes: 0.5 }),
    s("full", 5, "glutes", "compound", ["hip_ext", "lunge", "hinge"], [2, 3], { hamstrings: 0.5 }),
    s("full", 6, "quads", "isolation", ["knee_ext"], [0, 3], {}),
    s("full", 7, "side_delts", "isolation", ["lateral_raise"], [0, 3], {}),
    s("full", 8, "biceps", "isolation", ["elbow_flex"], [0, 2], {}),
    s("full", 9, "triceps", "isolation", ["elbow_ext"], [0, 2], {}),
    ...finisher("full", 10),
  ],
};

/** The four focused days in order; every other cycle the quads and glutes day is full body instead. */
export function cycleTypes(cycle: number): SessionType[] {
  return ["back_biceps", "glutes_hams", "chest_triceps", cycle % 2 === 1 ? "full" : "quads_glutes"];
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
  if (!last) return { type: "back_biceps", cycle: 0, index: 0 };
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
  /** Slots left out because nothing could fill them; the session may then be shorter. */
  dropped?: number;
}

/** One session's slots, with sets from the cycle's balance and reps by class. */
export function skeleton(pos: Position, opts: { targets?: Targets; deload?: boolean } = {}): Skeleton {
  const types = cycleTypes(pos.cycle);
  const all = balance(types, opts.targets ?? targets());
  const sets = all[pos.index];
  const slots: Slot[] = TEMPLATES[pos.type]
    .map((spec, j) => {
      let setCount = sets[j];
      if (opts.deload && setCount > 0) setCount = Math.max(1, Math.round(setCount * DELOAD.setFactor));
      const high = spec.patterns.length && spec.patterns.every((p) => HIGH_REP_PATTERNS[p]) ? HIGH_REP_PATTERNS[spec.patterns[0]] : null;
      const reps = high ?? (spec.class === "heavy" && pos.type === "full" ? HEAVY_REPS_B : CLASS[spec.class].reps);
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
