/**
 * Lighter weeks and volume growth (spec §Deloads, §Weekly structure).
 *
 * Pure. Deloads are reactive only: she does not want one on a schedule. A
 * lighter cycle starts when her logs show she is struggling, or when she says
 * she is worn out, and lasts to the end of that cycle of four sessions.
 * Volume grows a set at a time, only for muscles whose every exercise has
 * been progressing without a hard tap.
 */

import { exercise } from "./catalogue";
import { exposures, strength } from "./progress";
import { DELOAD, GROWTH_WINDOW_WEEKS, TARGETED, WEEKLY, type Targeted } from "./rules";
import type { Note, SessionRecord } from "./types";

const byDate = (h: SessionRecord[]) => [...h].sort((a, b) => a.date.getTime() - b.date.getTime());
const work = (weight: number | null, reps: number[]) => strength({ weight, reps });

/** Sessions after the last lighter one: what came before a deload does not trigger another. */
function sinceDeload(history: SessionRecord[]): SessionRecord[] {
  const sorted = byDate(history);
  const last = sorted.map((s) => s.plan.deload).lastIndexOf(true);
  return sorted.slice(last + 1);
}

/** How many exercises did less than their previous exposure, at the same weight or lighter, in these sessions. */
export function regressions(sessions: SessionRecord[], history: SessionRecord[]): number {
  let n = 0;
  for (const s of sessions)
    for (const log of s.logs) {
      const list = exposures(log.exerciseId, history).filter((e) => e.date <= s.date);
      if (list.length < 2) continue;
      const [prev, cur] = list.slice(-2);
      if ((cur.weight ?? 0) <= (prev.weight ?? 0) && work(cur.weight, cur.reps) < work(prev.weight, prev.reps)) n++;
    }
  return n;
}

export function deloadNow(input: { history: SessionRecord[]; notes: Note[]; cycle: number; since: Date | null }): {
  deload: boolean;
  why: string | null;
} {
  const { history, cycle } = input;
  if (history.some((s) => s.plan.position.cycle === cycle && s.plan.deload)) return { deload: true, why: "this cycle is lighter" };
  const worn = input.notes.find(
    (n) => !n.undoneAt && n.exerciseId === null && n.reason === "too_hard" && (!input.since || n.createdAt > input.since),
  );
  if (worn) return { deload: true, why: "she said she is worn out" };

  const recent = sinceDeload(history);
  const lastTwo = recent.slice(-2);
  if (lastTwo.length === 2) {
    const taps = lastTwo.flatMap((s) => s.logs.map((l) => l.tap));
    if (taps.length >= 4 && taps.filter((t) => t === "hard").length / taps.length >= DELOAD.hardShare)
      return { deload: true, why: "mostly hard taps two sessions running" };
  }
  const lastCycle = Math.max(-1, ...recent.map((s) => s.plan.position.cycle).filter((c) => c < cycle));
  const inLast = recent.filter((s) => s.plan.position.cycle === lastCycle);
  if (inLast.length && regressions(inLast, history) >= DELOAD.regressions)
    return { deload: true, why: "several lifts went backwards last cycle" };
  return { deload: false, why: null };
}

/**
 * Sets added to each muscle's weekly target. Each window of two cycles since
 * the last deload in which every exercise for the muscle progressed, with no
 * hard tap, earns one set; the growth ceiling in rules.ts still applies.
 */
export function growth(history: SessionRecord[]): Partial<Record<Targeted, number>> {
  const recent = sinceDeload(history);
  const cycles = [...new Set(recent.map((s) => s.plan.position.cycle))].sort((a, b) => a - b);
  const complete = cycles.filter((c) => recent.filter((s) => s.plan.position.cycle === c).length >= 4);
  const out: Partial<Record<Targeted, number>> = {};
  const window = GROWTH_WINDOW_WEEKS;
  for (let i = 0; i + window <= complete.length; i += window) {
    const span = new Set(complete.slice(i, i + window));
    const sessions = recent.filter((s) => span.has(s.plan.position.cycle));
    for (const m of TARGETED) {
      const logs = sessions.flatMap((s) => s.logs.filter((l) => exercise(l.exerciseId)?.primary.includes(m)));
      if (!logs.length || logs.some((l) => l.tap === "hard")) continue;
      const ids = [...new Set(logs.map((l) => l.exerciseId))];
      const progressed = ids.every((id) => {
        const list = exposures(id, history).filter((e) => sessions.some((s) => s.date.getTime() === e.date.getTime()));
        return list.length >= 2 && work(list[list.length - 1].weight, list[list.length - 1].reps) > work(list[0].weight, list[0].reps);
      });
      if (progressed) out[m] = Math.min((out[m] ?? 0) + 1, WEEKLY[m].grow - WEEKLY[m].start);
    }
  }
  return out;
}
