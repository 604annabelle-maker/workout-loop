/** Test helpers: simulated histories, built through the real planner. */

import { buildSession, type Picker } from "./build.ts";
import { DEFAULT_EQUIPMENT, type Equipment } from "./equipment.ts";
import type { LogEntry, Note, SessionRecord, Tap } from "./types.ts";

/** A small deterministic random number generator, so failures reproduce. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export const DAY = 864e5;

/** Log every exercise of a plan, with reps and taps from `how`. */
export function logAll(plan: SessionRecord["plan"], how: (i: number) => { reps: number; tap: Tap } | null): LogEntry[] {
  return plan.exercises.flatMap((x, i) => {
    const h = how(i);
    if (!h) return [];
    return [{ slot: x.slot, exerciseId: x.main.exerciseId, usedSwap: false, weight: x.main.weight, reps: Array(x.sets).fill(h.reps), tap: h.tap }];
  });
}

/** Run `n` sessions two days apart, each logged by `how`, and return the history. */
export async function simulate(
  n: number,
  opts: { seed?: number; notes?: Note[]; equipment?: Equipment; pick?: Picker; start?: Date; how?: (r: () => number, x: SessionRecord["plan"]["exercises"][number]) => { reps: number; tap: Tap } | null } = {},
): Promise<SessionRecord[]> {
  const r = rng(opts.seed ?? 1);
  const history: SessionRecord[] = [];
  let now = opts.start ?? new Date("2026-11-15T08:00:00Z");
  for (let i = 0; i < n; i++) {
    const { plan } = await buildSession({ history, notes: opts.notes ?? [], equipment: opts.equipment ?? DEFAULT_EQUIPMENT, now, pick: opts.pick });
    const how =
      opts.how ??
      ((rand: () => number, x: SessionRecord["plan"]["exercises"][number]) => {
        if (rand() < 0.1) return null;
        const [lo, hi] = x.main.range;
        const reps = lo - 1 + Math.floor(rand() * (hi - lo + 3));
        const t = rand();
        return { reps, tap: t < 0.25 ? "easy" : t < 0.8 ? "done" : "hard" };
      });
    history.push({ workoutId: `w${i}`, date: now, plan, logs: logAll(plan, (k) => how(r, plan.exercises[k])) });
    now = new Date(now.getTime() + (1 + Math.floor(r() * 3)) * DAY);
  }
  return history;
}
