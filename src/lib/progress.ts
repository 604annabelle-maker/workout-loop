/**
 * Progress, measured.
 *
 * Pure. Everything here reads the training log (sessions, their plans and what
 * she logged) and counts something: what each lift has done over time, how
 * many hard sets each muscle got this week, what was a personal best.
 *
 * Only what she logged counts. "Done" means the sets as written, so a tap is
 * enough; numbers she typed are what she did. An exercise she did not log
 * counts for nothing, because nothing is assumed: the one exception is today's
 * session in the weekly bars, counted as planned, since the bars are read in
 * the gym about the week it completes.
 */

import { matchExerciseName } from "./exercise-name";
import {
  progressionKey,
  setsDone,
  type BlockKind,
  type ExerciseKind,
  type Muscle,
  type Plan,
  type PlanBlock,
  type PlanExercise,
  type Role,
} from "./plan";
import { JUMPING } from "./program";
import type { Effort, LoggedSet, ReplyLog } from "./reply-log";
import { shapePlan } from "./workout-shape";

const DAY = 24 * 60 * 60 * 1000;

/** What the coach stamped on a session when it planned it. */
export interface Stamp {
  /** Which way of planning made it. Only the current one is read by the coach. */
  method: number;
  typeId: string;
  /** Where in the rotation it sat. */
  rotationAt: number;
  /** True when she asked for this session by hand. */
  asked: boolean;
  block: number;
  week: number;
  /** ISO. When this block began. */
  blockStartedAt: string;
  deload: boolean;
}

/** One past session in the training log, oldest first wherever a list is. */
export interface Session {
  /** The workout row, when read from the database. */
  id?: string;
  /** The secret in its log buttons, so a later email can log it too. */
  logToken?: string | null;
  at: Date;
  minutes: number;
  /** Null for a workout from before plans were structured. */
  plan: Plan | null;
  /** The plain text of such a workout, so its loads are not lost. */
  legacyText: string;
  stamp: Stamp | null;
  /** What she wrote, verbatim. */
  notes: string[];
  /** What she logged or wrote, read. One per tap set or reply that said anything. */
  logs: ReplyLog[];
  /** Counted as planned in the weekly bars: today's session, before it is done. */
  planned?: boolean;
}

/** One time one exercise was done. */
export interface Performance {
  at: Date;
  name: string;
  label: string;
  /** What was asked. */
  sets: number;
  reps: string;
  /** The range the reps move through, "3-5". */
  range: string;
  role: Role;
  loadKg: number;
  /** What she said she did, or null when she did not say. */
  logged: LoggedSet[] | null;
  effort: Effort;
  skipped: boolean;
  /** The swap that was offered with it, if any. */
  swap: string;
  /** Empty for a workout from before plans were structured. */
  primary: Muscle[];
  kind: ExerciseKind;
  block: BlockKind;
}

/**
 * Whether a performance is the kind progression and records are about: a lift
 * in the main work. A throw, a carry or a swing in a finisher is done
 * for what it does, not for a number that has to go up every week.
 */
export function isProgressed(p: Performance): boolean {
  return p.kind === "lift" && p.role !== "warmup" && p.block !== "warmup" && p.block !== "cooldown";
}

/** "8-12" to [8, 12]. "6 each side" to [6, 6]. Time and distance to null. */
export function repRange(reps: string): [number, number] | null {
  if (/sec|min|\bm\b|metre|meter|yard|cal\b|\d+\s*m$/i.test(reps)) return null;
  const m = reps.match(/(\d+)\s*(?:-|to|–)\s*(\d+)/);
  if (m) {
    const lo = Number(m[1]);
    const hi = Number(m[2]);
    return lo <= hi ? [lo, hi] : [hi, lo];
  }
  const single = reps.match(/\d+/);
  return single ? [Number(single[0]), Number(single[0])] : null;
}

/** Estimated one rep max, Epley. Only for comparing a lift with itself. */
export function e1rm(set: LoggedSet): number {
  if (set.weightKg <= 0) return 0;
  const reps = Math.min(set.reps, 15);
  return set.weightKg * (1 + reps / 30);
}

export function bestSet(sets: LoggedSet[]): LoggedSet | null {
  let best: LoggedSet | null = null;
  for (const set of sets) {
    if (!best) best = set;
    else if (set.weightKg > 0 || best.weightKg > 0) {
      if (e1rm(set) > e1rm(best)) best = set;
    } else if (set.reps > best.reps) best = set;
  }
  return best;
}

/** "70kg x 10, 10, 9". Bodyweight reads as reps only. */
export function describeSets(sets: LoggedSet[]): string {
  if (sets.length === 0) return "";
  const weights = [...new Set(sets.map((s) => s.weightKg))];
  const reps = sets.map((s) => s.reps).join(", ");
  if (weights.length === 1) {
    return weights[0] > 0 ? `${kg(weights[0])} x ${reps}` : `${reps} reps`;
  }
  return sets.map((s) => (s.weightKg > 0 ? `${kg(s.weightKg)} x ${s.reps}` : `${s.reps}`)).join(", ");
}

export function kg(n: number): string {
  return `${Number.isInteger(n) ? n : n.toFixed(n * 4 === Math.round(n * 4) && (n * 2) % 1 !== 0 ? 2 : 1)}kg`;
}

/**
 * The exercises in a workout from before plans were structured.
 *
 * Read off the text the old way, with the kilos pulled from the loading line,
 * so the first block after the change still knows what was lifted.
 */
function legacyPerformances(session: Session): Performance[] {
  const out: Performance[] = [];
  for (const section of shapePlan(session.legacyText).sections) {
    for (const exercise of section.exercises) {
      if (!exercise.name) continue;
      const load = exercise.note.match(/(\d+(?:\.\d+)?)\s*kg/i);
      const sets = exercise.sets.match(/^(\d+)\s*x\s*(.+)$/i);
      out.push({
        at: session.at,
        name: exercise.name.toUpperCase(),
        label: exercise.number,
        sets: sets ? Number(sets[1]) : 0,
        reps: sets ? sets[2].trim() : exercise.sets,
        range: "",
        role: "accessory",
        loadKg: load ? Number(load[1]) : 0,
        logged: null,
        effort: "",
        skipped: false,
        swap: "",
        primary: [],
        kind: "lift",
        block: "strength",
      });
    }
  }
  return out;
}

export interface Logged {
  /** What she did. Filled from the plan when she said "done" without numbers. */
  sets: LoggedSet[] | null;
  effort: Effort;
  skipped: boolean;
  /** She did the swap instead. */
  swapped: boolean;
  /** Anything was logged at all. */
  any: boolean;
}

/** One set per set prescribed, at the target reps and load: what "done" means. */
function asWritten(block: PlanBlock, exercise: PlanExercise, swap = false): LoggedSet[] {
  const reps = Number((swap ? exercise.swap?.reps : exercise.reps)?.match(/\d+/)?.[0] ?? 0);
  if (!reps) return [];
  const weightKg = swap ? (exercise.swap?.loadKg ?? 0) : exercise.loadKg;
  return Array.from({ length: setsDone(block, exercise) }, () => ({ weightKg, reps }));
}

/**
 * What was logged for a plan exercise: by label, then by name. A later entry
 * about the same exercise wins, since a correction comes second.
 */
export function loggedFor(block: PlanBlock, exercise: PlanExercise, logs: ReplyLog[]): Logged {
  let found: Logged = { sets: null, effort: "", skipped: false, swapped: false, any: false };

  for (const log of logs) {
    for (const entry of log.exercises) {
      const byLabel = entry.label && entry.label === exercise.label;
      const byName =
        !entry.label && entry.name && matchExerciseName([exercise.name], entry.name) !== null;
      if (!byLabel && !byName) continue;

      const swapped = !!entry.swappedTo;
      found = {
        sets: entry.sets.length > 0 ? entry.sets : swapped === found.swapped ? found.sets : null,
        effort: entry.effort || (swapped === found.swapped ? found.effort : ""),
        skipped: entry.skipped,
        swapped,
        any: true,
      };
    }
  }

  // "Done", "easy" or "hard" with no numbers: the sets as written.
  if (found.any && !found.skipped && !found.sets && found.effort) {
    const written = asWritten(block, exercise, found.swapped);
    found.sets = written.length ? written : null;
  }

  return found;
}

export function performancesIn(session: Session): Performance[] {
  if (!session.plan) return legacyPerformances(session);

  return session.plan.blocks
    .filter((b) => b.kind !== "warmup" && b.kind !== "cooldown")
    .flatMap((block) =>
      block.exercises.map((exercise): Performance => {
        const logged = loggedFor(block, exercise, session.logs);
        const swap = logged.swapped && exercise.swap ? exercise.swap : null;
        return {
          at: session.at,
          name: swap ? swap.name : exercise.name,
          label: exercise.label,
          sets: setsDone(block, exercise),
          reps: swap ? swap.reps || exercise.reps : exercise.reps,
          range: exercise.range,
          role: swap ? "accessory" : exercise.role,
          loadKg: swap ? swap.loadKg : exercise.loadKg,
          logged: logged.sets,
          effort: logged.effort,
          skipped: logged.skipped,
          swap: swap ? "" : (exercise.swap?.name ?? ""),
          primary: exercise.primary,
          kind: exercise.kind,
          block: block.kind,
        };
      }),
    );
}

/** Every exercise's history, keyed by movement and role, oldest first within each. */
export function historyByExercise(sessions: Session[]): Map<string, Performance[]> {
  const out = new Map<string, Performance[]>();
  const sorted = [...sessions].sort((a, b) => a.at.getTime() - b.at.getTime());

  for (const session of sorted) {
    for (const performance of performancesIn(session)) {
      const key = progressionKey(performance.name, performance.role);
      if (!key) continue;
      const list = out.get(key) ?? [];
      list.push(performance);
      out.set(key, list);
    }
  }

  return out;
}

/** The plan blocks whose sets count toward muscle volume. */
function countsForVolume(block: PlanBlock): boolean {
  return block.kind === "strength" || block.kind === "superset" || block.kind === "circuit" || block.kind === "core" || block.kind === "finisher";
}

function within(session: Session, from: Date, to: Date): boolean {
  return session.at >= from && session.at < to;
}

/**
 * How many sets of an exercise count toward the week: as many as she logged,
 * the plan's own for a session counted as planned, and none otherwise.
 */
function countedSets(session: Session, block: PlanBlock, exercise: PlanExercise): number {
  if (session.planned) return setsDone(block, exercise);
  const logged = loggedFor(block, exercise, session.logs);
  if (logged.skipped || !logged.any) return 0;
  return logged.sets ? logged.sets.length : setsDone(block, exercise);
}

/**
 * Hard sets per muscle between two instants.
 *
 * A primary muscle counts a whole set, a secondary one half, which is how the
 * volume research counts them. A swap counts for the muscles of the exercise
 * it stood in for.
 */
export function setsPerMuscle(sessions: Session[], from: Date, to: Date): Record<Muscle, number> {
  const total = {} as Record<Muscle, number>;

  for (const session of sessions) {
    if (!within(session, from, to) || !session.plan) continue;

    for (const block of session.plan.blocks) {
      if (!countsForVolume(block)) continue;

      for (const exercise of block.exercises) {
        if (exercise.kind !== "lift" && exercise.kind !== "core" && exercise.kind !== "carry") continue;

        const sets = countedSets(session, block, exercise);
        if (sets === 0) continue;

        for (const m of exercise.primary) total[m] = (total[m] ?? 0) + sets;
        for (const m of exercise.secondary) total[m] = (total[m] ?? 0) + sets / 2;
      }
    }
  }

  return total;
}

/**
 * Hard sets in total, each exercise counted once however many muscles it
 * works. The headline number for "how much did I do".
 */
export function hardSetsBetween(sessions: Session[], from: Date, to: Date): number {
  let total = 0;
  for (const session of sessions) {
    if (!within(session, from, to) || !session.plan) continue;
    for (const block of session.plan.blocks) {
      if (!countsForVolume(block)) continue;
      for (const exercise of block.exercises) {
        if (exercise.kind !== "lift" && exercise.kind !== "core" && exercise.kind !== "carry") continue;
        total += countedSets(session, block, exercise);
      }
    }
  }
  return total;
}

/** Sessions in a window that had jumps in them, wherever they sat. */
export function jumpSessionsBetween(sessions: Session[], from: Date, to: Date): number {
  return sessions.filter(
    (s) =>
      within(s, from, to) &&
      s.plan?.blocks.some((b) => b.exercises.some((e) => e.kind === "jump" || JUMPING.test(e.name))),
  ).length;
}

export function sessionsBetween(sessions: Session[], from: Date, to: Date): number {
  return sessions.filter((s) => within(s, from, to)).length;
}

/** Sessions a week, averaged over the four weeks before `now`. */
export function sessionsPerWeek(sessions: Session[], now: Date): number {
  const from = new Date(now.getTime() - 28 * DAY);
  return sessionsBetween(sessions, from, now) / 4;
}

export interface Best {
  name: string;
  set: LoggedSet;
  at: Date;
  /** True when this beat everything logged before it. */
  isNew: boolean;
}

/**
 * Personal bests logged in a window, by estimated max for loaded lifts and by
 * reps for bodyweight ones. Only logged sets count: a prescription is not a
 * record.
 */
export function bestsBetween(sessions: Session[], from: Date, to: Date): Best[] {
  const out: Best[] = [];

  for (const [, all] of historyByExercise(sessions)) {
    const history = all.filter(isProgressed);
    let before = 0;
    let beforeReps = 0;

    for (const p of history) {
      if (!p.logged || p.logged.length === 0) continue;
      const top = bestSet(p.logged);
      if (!top) continue;

      const score = e1rm(top);
      const isNew = top.weightKg > 0 ? score > before + 0.01 : top.reps > beforeReps;
      const seenBefore = before > 0 || beforeReps > 0;

      if (p.at >= from && p.at < to && isNew && seenBefore) {
        out.push({ name: p.name, set: top, at: p.at, isNew: true });
      }

      before = Math.max(before, score);
      beforeReps = Math.max(beforeReps, top.weightKg > 0 ? 0 : top.reps);
    }
  }

  return out.sort((a, b) => b.at.getTime() - a.at.getTime());
}

export interface Trend {
  name: string;
  from: LoggedSet;
  to: LoggedSet;
  /** Percent change in estimated max, or reps for bodyweight work. */
  change: number;
}

/**
 * How each lift has moved across a window: the first logged best against the
 * latest. Only lifts logged at least twice, because one point is not a line.
 */
export function trendsBetween(sessions: Session[], from: Date, to: Date): Trend[] {
  const out: Trend[] = [];

  for (const [, all] of historyByExercise(sessions)) {
    const points = all
      .filter(isProgressed)
      .filter((p) => p.at >= from && p.at < to && p.logged && p.logged.length > 0)
      .map((p) => ({ p, top: bestSet(p.logged!)! }));
    if (points.length < 2) continue;

    const first = points[0];
    const last = points[points.length - 1];
    const a = first.top.weightKg > 0 ? e1rm(first.top) : first.top.reps;
    const b = last.top.weightKg > 0 ? e1rm(last.top) : last.top.reps;
    if (a <= 0) continue;

    out.push({
      name: last.p.name,
      from: first.top,
      to: last.top,
      change: Math.round(((b - a) / a) * 100),
    });
  }

  return out.sort((x, y) => y.change - x.change);
}

/**
 * Lifts that have stopped moving: logged three or more times in a row with no
 * improvement in the best set. The fix is a variation or a rep range change
 * at the next block, not grinding the same number.
 */
export function stalled(sessions: Session[], exposures = 3): string[] {
  const out: string[] = [];

  for (const [, history] of historyByExercise(sessions)) {
    const logged = history.filter((p) => isProgressed(p) && p.logged && p.logged.length > 0);
    if (logged.length < exposures) continue;

    const recent = logged.slice(-exposures);
    // Best set first, total reps as the tie break: three more reps at the
    // same load is progress even when the best set did not move.
    const scores = recent.map((p) => {
      const top = bestSet(p.logged!)!;
      const best = top.weightKg > 0 ? e1rm(top) : top.reps;
      const reps = p.logged!.reduce((sum, s) => sum + s.reps, 0);
      return best * 1000 + reps;
    });
    const improved = scores.slice(1).some((s, i) => s > Math.max(...scores.slice(0, i + 1)) + 0.01);
    if (!improved) out.push(recent[recent.length - 1].name);
  }

  return out;
}

/** The most recent replies' check-ins, newest first, with when they were about. */
export function recentCheckIns(sessions: Session[]): { at: Date; log: ReplyLog }[] {
  return sessions
    .flatMap((s) => s.logs.map((log) => ({ at: s.at, log })))
    .sort((a, b) => b.at.getTime() - a.at.getTime());
}

/** Most recent day a period start was logged, if any. */
export function lastPeriodStart(sessions: Session[]): Date | null {
  let latest: Date | null = null;
  for (const s of sessions) {
    for (const log of s.logs) {
      if (!log.checkIn.periodStarted && log.checkIn.cycleDay <= 0) continue;
      const start = new Date(s.at.getTime() - Math.max(0, log.checkIn.cycleDay - 1) * DAY);
      if (!latest || start > latest) latest = start;
    }
  }
  return latest;
}

/**
 * How many times she has been given an exercise before `before`, by name.
 * Pictures are shown the first few times, so she learns it, and then dropped.
 */
export function exposures(sessions: Session[], before: Date): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of sessions) {
    if (!s.plan || s.at >= before) continue;
    for (const block of s.plan.blocks) {
      for (const e of block.exercises) {
        const key = progressionKey(e.name);
        out.set(key, (out.get(key) ?? 0) + 1);
      }
    }
  }
  return out;
}

/**
 * Sessions with nothing logged at all, newest first. The next email asks
 * about them, since a forgotten log otherwise holds every weight where it is.
 */
export function unlogged(sessions: Session[]): Session[] {
  return sessions
    .filter((s) => s.plan && !s.planned && s.logs.every((l) => l.exercises.length === 0))
    .sort((a, b) => b.at.getTime() - a.at.getTime());
}

export const DAY_MS = DAY;
