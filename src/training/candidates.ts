/**
 * Which exercises may fill a slot, and whether a slot may change at all
 * (spec §How a session is planned, §Exercises stay long enough to progress).
 *
 * Pure. A slot is either locked to the exercise it holds, or open, with a
 * ranked list of candidates that all pass every filter: the slot's muscle is
 * a primary muscle, the class and pattern fit, her gym has the equipment,
 * nothing banned or disliked. The model only ever picks from this list.
 */

import { avoided, changeFor, disliked, liked, tooHard } from "../memory/apply";
import { catalogue, exercise, isBodyweight, trains, working, type Exercise } from "./catalogue";
import { has, type Equipment } from "./equipment";
import { ROTATION } from "./rules";
import type { Slot } from "./skeleton";
import type { Change, Note, SessionRecord } from "./types";

export interface SlotHistory {
  /** The exercise the slot held last time. */
  current: string | null;
  /** When it was last planned. */
  lastPlanned: Date | null;
  /** When the current exercise first went into this slot, in its present streak. */
  since: Date | null;
  /** Why it changed to the current one, and what it was before. */
  change?: Change;
  previous?: string;
}

export function slotHistory(key: string, history: SessionRecord[]): SlotHistory {
  const sessions = [...history].sort((a, b) => b.date.getTime() - a.date.getTime());
  const hits = sessions
    .map((s) => ({ s, e: s.plan.exercises.find((x) => x.slot === key) }))
    .filter((x) => x.e) as { s: SessionRecord; e: NonNullable<SessionRecord["plan"]["exercises"][number]> }[];
  if (!hits.length) return { current: null, lastPlanned: null, since: null };
  const current = hits[0].e.main.exerciseId;
  let since = hits[0].s.date;
  for (const h of hits) {
    if (h.e.main.exerciseId !== current) break;
    since = h.s.date;
  }
  const first = hits.find((h) => h.e.main.exerciseId === current && h.s.date.getTime() === since.getTime());
  return { current, lastPlanned: hits[0].s.date, since, change: first?.e.change, previous: first?.e.previous };
}

export type Decision =
  | { mode: "locked"; exerciseId: string; change?: Change; previous?: string; noteId?: string }
  | { mode: "open"; change?: Change; previous?: string; dueSince?: Date };

const WEEK = 7 * 864e5;

/**
 * Whether a slot keeps its exercise, must change, or may rotate.
 *
 * `swapExercise` and `readyForHarder` come from progress.ts for the slot's
 * current exercise.
 */
export function decide(
  slot: Slot,
  h: SlotHistory,
  ctx: { notes: Note[]; now: Date; equipment: Equipment; swapExercise?: boolean; readyForHarder?: boolean },
): Decision {
  const cur = h.current ? exercise(h.current) : undefined;
  if (!cur || !h.current) return { mode: "open" };

  // An undone note that caused this exercise: put back what it replaced.
  if (h.change?.kind === "note" && h.previous) {
    const undone = ctx.notes.find((n) => n.id === (h.change as { noteId: string }).noteId && n.undoneAt);
    const prev = exercise(h.previous);
    if (undone && prev && !disliked(ctx.notes, prev.id))
      return { mode: "locked", exerciseId: prev.id, change: { kind: "undo", noteId: undone.id }, previous: cur.id };
  }

  if (!has(cur.load, ctx.equipment) || disliked(ctx.notes, cur.id)) {
    const n = changeFor(ctx.notes, cur.id, null);
    return { mode: "open", change: n ? { kind: "note", noteId: n.id } : { kind: "rotation" }, previous: cur.id };
  }

  const said = changeFor(ctx.notes, cur.id, h.lastPlanned);
  if (said) return { mode: "open", change: { kind: "note", noteId: said.id }, previous: cur.id };

  const hard = tooHard(ctx.notes, cur.id, h.lastPlanned);
  if (hard && cur.easier && exercise(cur.easier))
    return { mode: "locked", exerciseId: cur.easier, change: { kind: "note", noteId: hard.id }, previous: cur.id };

  if (ctx.readyForHarder && cur.harder && exercise(cur.harder) && !disliked(ctx.notes, cur.harder))
    return { mode: "locked", exerciseId: cur.harder, change: { kind: "harder" }, previous: cur.id };

  if (ctx.swapExercise) return { mode: "open", change: { kind: "stall" }, previous: cur.id };

  // Big lifts stay; small exercises rotate after a few weeks.
  if (slot.class !== "heavy" && h.since && ctx.now.getTime() - h.since.getTime() >= ROTATION.smallWeeks * WEEK)
    return { mode: "open", change: { kind: "rotation" }, previous: cur.id, dueSince: h.since };

  return { mode: "locked", exerciseId: cur.id };
}

/**
 * At most two slots change for rotation in one session; the ones due longest
 * go first and the rest wait. Changes she asked for, by note or by a stall,
 * are never held back.
 */
export function capRotations(decisions: Decision[], histories: SlotHistory[]): Decision[] {
  const due = decisions
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => d.mode === "open" && d.change?.kind === "rotation" && d.dueSince)
    .sort((a, b) => (a.d as { dueSince: Date }).dueSince.getTime() - (b.d as { dueSince: Date }).dueSince.getTime());
  const keep = new Set(due.slice(0, ROTATION.maxRotationsPerSession).map((x) => x.i));
  return decisions.map((d, i) =>
    due.some((x) => x.i === i) && !keep.has(i) && histories[i].current
      ? { mode: "locked", exerciseId: histories[i].current as string }
      : d,
  );
}

/** Does this exercise fit this slot at all? The same test the checker applies. */
export function fits(e: Exercise, slot: Slot): boolean {
  if (!working(e) || !trains(e, slot.muscle)) return false;
  if (e.class !== slot.class) return false;
  if (slot.patterns.length && !slot.patterns.includes(e.pattern)) return false;
  return true;
}

/**
 * Can it stand in as the slot's swap? The same muscle and movement, and for
 * a heavy slot a lighter compound is allowed too: there is often only one
 * barbell version of a lift, and the swap is for when that bar is taken.
 */
export function fitsSwap(e: Exercise, slot: Slot): boolean {
  if (fits(e, slot)) return true;
  return slot.class === "heavy" && fits(e, { ...slot, class: "compound" });
}

/**
 * The exercises that may fill an open slot, best first: stretched where the
 * slot prefers it, then ones she liked, then ones she has done before.
 * `taken` are already in this session. Avoided exercises (missed the muscle,
 * or hurt recently) drop out unless nothing else fits.
 */
export function candidates(
  slot: Slot,
  ctx: { notes: Note[]; now: Date; equipment: Equipment; history: SessionRecord[]; taken: string[]; exclude?: string[] },
): Exercise[] {
  const done = new Set(ctx.history.flatMap((s) => s.logs.map((l) => l.exerciseId)));
  const pool = catalogue().filter(
    (e) =>
      fits(e, slot) &&
      has(e.load, ctx.equipment) &&
      !disliked(ctx.notes, e.id) &&
      !ctx.taken.includes(e.id) &&
      !(ctx.exclude ?? []).includes(e.id),
  );
  const preferred = pool.filter((e) => !avoided(ctx.notes, e.id, ctx.now));
  const list = preferred.length ? preferred : pool;
  // Bodyweight exercises come in now and then, not by default: they rank below loaded ones unless she liked them.
  const score = (e: Exercise) =>
    (e.stretched ? (slot.preferStretched ? 4 : 1) : 0) +
    (liked(ctx.notes, e.id) ? 3 : 0) +
    (done.has(e.id) ? 1 : 0) -
    (isBodyweight(e) && !slot.finisher ? 5 : 0);
  return [...list].sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
}

/** The swap for a slot: same muscle and fit, preferably needing different equipment, since the usual reason is a taken machine. */
export function swapFor(main: Exercise, slot: Slot, pool: Exercise[], notes: Note[], now: Date): Exercise | null {
  const options = pool.filter((e) => e.id !== main.id && !isBodyweight(e));
  const different = options.filter((e) => e.load !== main.load && !avoided(notes, e.id, now));
  return different[0] ?? options[0] ?? null;
}
