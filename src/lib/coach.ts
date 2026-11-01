/**
 * The coach: everything decided before the model writes a word.
 *
 * Pure. Given her preferences, her training log and the slot she booked, this
 * works out what today is: which session in the rotation, which week of which
 * block, whether it is a lighter week, which muscles are behind, how many
 * jumps and hard minutes the week still wants, what every lift she has done
 * should be loaded at next, and which finisher to reach for.
 *
 * The model is good at choosing movements, writing cues and making a session
 * feel like a session. It is not a reliable bookkeeper, and progression is
 * bookkeeping. So the numbers are decided here, where they can be tested, and
 * handed to the model as facts; `enforceTargets` puts them back if it drifts.
 */

import { exerciseKey, type Muscle, type Plan } from "./plan";
import type { Preferences } from "./profile";
import {
  BEGINNER_SCALE,
  BLOCK_WEEKS,
  CONDITIONING,
  DELOAD_MIN_SESSIONS,
  FAILURE_SETS_PER_MUSCLE_PER_SESSION,
  FINISHERS,
  FULL_BODY,
  IMPACT,
  PRIORITY_BONUS,
  PRIORITY_CEILING,
  RE_ENTRY_AFTER_DAYS,
  SESSION_TYPES,
  SPLIT,
  SPLIT_FROM,
  WEEKLY_SETS,
  WEEKS,
  type SessionType,
  type WeekPlan,
} from "./program";
import {
  DAY_MS,
  describeSets,
  enjoymentByFinisher,
  hardMinutesBetween,
  historyByExercise,
  isProgressed,
  jumpsBetween,
  kg,
  lastPeriodStart,
  recentCheckIns,
  repRange,
  sessionsPerWeek,
  setsPerMuscle,
  stalled,
  type Performance,
  type Session,
  type Stamp,
} from "./progress";
import { dateOnly, dayNumber } from "./when";

export interface Slot {
  startsAt: Date;
  minutes: number;
}

export type Action = "up" | "reps" | "hold" | "drop" | "reset" | "deload";

/** What a lift should be next time, and why, in words that fit under it. */
export interface Target {
  name: string;
  sets: number;
  reps: string;
  loadKg: number;
  action: Action;
  /** "Up 2.5kg. You hit 10, 10, 10." */
  reason: string;
  /** "70kg x 10, 10, 9". What she did, or what was asked if she did not say. */
  last: string;
  lastAt: Date;
  /** True when `last` is what she reported rather than what was prescribed. */
  logged: boolean;
}

export interface MuscleStatus {
  muscle: Muscle;
  done: number;
  range: [number, number];
  status: "under" | "in" | "over";
}

export interface Brief {
  sessionNumber: number;
  session: SessionType;
  rotation: "split" | "full body";
  block: number;
  week: number;
  weekPlan: WeekPlan;
  blockStartedAt: Date;
  deload: boolean;
  /** Back after a long gap: start somewhere forgiving. */
  reEntry: boolean;
  daysSinceLast: number | null;
  perWeek: number;
  budget: { warmup: number; primer: number; main: number; finisher: number };
  /** Last 7 days, every muscle. */
  volume: MuscleStatus[];
  /** Under target, and trainable today. Most behind first. */
  behind: Muscle[];
  impact: { done: number; weekly: readonly [number, number]; today: [number, number] };
  conditioning: { done: number; weekly: readonly [number, number]; needed: boolean };
  /** Keep these this block, in this order. */
  anchors: string[];
  /** Last block's anchors for this session, when this is the first of a new block. */
  previousAnchors: string[];
  targets: Target[];
  stalled: string[];
  finisher: { format: string; idea: string };
  /** What her most recent reply said about how she was. */
  readiness: string[];
  pain: string[];
  likes: string[];
  dislikes: string[];
  requests: string[];
  /** Only when she asked for cycle tracking and has logged a start. */
  cycleDay: number | null;
}

export interface CoachInput {
  preferences: Preferences;
  /** Sent sessions before this one, any order. Ninety days is plenty. */
  sessions: Session[];
  slot: Slot;
  /** All-time count of sessions, including this one. */
  sessionNumber: number;
}

const days = (ms: number) => ms / DAY_MS;

function byTime(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => a.at.getTime() - b.at.getTime());
}

/* ---------- where in the block ---------- */

export interface Position {
  block: number;
  week: number;
  blockStartedAt: Date;
  reEntry: boolean;
  daysSinceLast: number | null;
}

export function position(sessions: Session[], now: Date): Position {
  const sorted = byTime(sessions);
  const last = sorted.at(-1);
  const daysSinceLast = last ? days(now.getTime() - last.at.getTime()) : null;
  const stamped = [...sorted].reverse().find((s) => s.stamp);
  const longGap = daysSinceLast !== null && daysSinceLast >= RE_ENTRY_AFTER_DAYS;

  const fresh = (block: number): Position => ({
    block,
    week: 1,
    blockStartedAt: now,
    reEntry: longGap,
    daysSinceLast,
  });

  if (!stamped?.stamp) return fresh(1);
  if (longGap) return fresh(stamped.stamp.block + 1);

  // By calendar day, so a block that began on a Sunday evening is in its
  // fourth week from the fourth Sunday on, whatever the hour.
  const startedAt = new Date(stamped.stamp.blockStartedAt);
  const week = Math.floor((dayNumber(now) - dayNumber(startedAt)) / 7) + 1;

  if (!Number.isFinite(week) || week < 1) return fresh(stamped.stamp.block);
  if (week > BLOCK_WEEKS) return fresh(stamped.stamp.block + 1);

  return {
    block: stamped.stamp.block,
    week,
    blockStartedAt: startedAt,
    reEntry: false,
    daysSinceLast,
  };
}

/**
 * The fifth week is lighter, but only when the block had enough training in
 * it to need one. Twice a week for a month carries no fatigue worth shedding.
 */
export function weekPlanFor(pos: Position, sessions: Session[]): { plan: WeekPlan; deload: boolean } {
  const inBlock = sessions.filter((s) => s.stamp?.block === pos.block).length;
  const isDeloadWeek = pos.week === BLOCK_WEEKS && inBlock >= DELOAD_MIN_SESSIONS;
  if (isDeloadWeek) return { plan: WEEKS[BLOCK_WEEKS - 1], deload: true };
  return { plan: WEEKS[Math.min(pos.week, BLOCK_WEEKS - 1) - 1], deload: false };
}

/* ---------- which session ---------- */

/**
 * How often she actually trains. Her stated number until there are three
 * weeks of history to measure, then what she does.
 */
export function frequency(sessions: Session[], stated: number, now: Date): number {
  const sorted = byTime(sessions);
  const first = sorted[0];
  if (!first || days(now.getTime() - first.at.getTime()) < 21) return stated;
  return sessionsPerWeek(sessions, now);
}

function deficit(type: SessionType, volume: MuscleStatus[]): number {
  return type.primary.reduce((sum, m) => {
    const v = volume.find((x) => x.muscle === m);
    if (!v) return sum;
    return sum + Math.max(0, v.range[0] - v.done) / v.range[0];
  }, 0);
}

export function chooseSession(
  sessions: Session[],
  perWeek: number,
  volume: MuscleStatus[],
): { session: SessionType; rotation: "split" | "full body" } {
  const rotation = perWeek >= SPLIT_FROM ? SPLIT : FULL_BODY;
  const name = rotation === SPLIT ? "split" : "full body";
  const sorted = byTime(sessions);
  const lastStamp = [...sorted].reverse().find((s) => s.stamp)?.stamp;
  const lastType = SESSION_TYPES.find((t) => t.id === lastStamp?.typeId);

  // The normal case: the next one along.
  const at = rotation.findIndex((t) => t.id === lastType?.id);
  if (at !== -1) return { session: rotation[(at + 1) % rotation.length], rotation: name };

  /*
   * No stamped history in this rotation: a first session, a switch between
   * full body and split, or a workout from before the coach existed. Pick
   * the session whose muscles are furthest behind, and on the split never the
   * same half as the session before.
   */
  const candidates =
    rotation === SPLIT && lastType && lastType.half !== "full"
      ? rotation.filter((t) => t.half !== lastType.half)
      : rotation;

  const best = [...candidates].sort((a, b) => deficit(b, volume) - deficit(a, volume))[0];
  return { session: best, rotation: name };
}

/* ---------- volume ---------- */

export function weeklyRange(muscle: Muscle, preferences: Preferences): [number, number] {
  let [lo, hi] = WEEKLY_SETS[muscle];
  if (preferences.level === "beginner") {
    lo = Math.round(lo * BEGINNER_SCALE);
    hi = Math.round(hi * BEGINNER_SCALE);
  }
  if (preferences.priorities.includes(muscle)) {
    lo = Math.max(lo, hi - PRIORITY_BONUS);
    hi = Math.min(hi + PRIORITY_BONUS, PRIORITY_CEILING);
  }
  return [lo, hi];
}

export function volumeStatus(
  sessions: Session[],
  preferences: Preferences,
  now: Date,
): MuscleStatus[] {
  const done = setsPerMuscle(sessions, new Date(now.getTime() - 7 * DAY_MS), now);
  return (Object.keys(WEEKLY_SETS) as Muscle[]).map((muscle) => {
    const range = weeklyRange(muscle, preferences);
    const n = Math.round((done[muscle] ?? 0) * 2) / 2;
    return {
      muscle,
      done: n,
      range,
      status: n < range[0] ? "under" : n > range[1] ? "over" : "in",
    };
  });
}

/* ---------- progression ---------- */

/** The smallest sensible jump for a load. Microloading where it is light. */
export function increment(loadKg: number, lower: boolean): number {
  if (loadKg <= 0) return 0;
  if (loadKg < 10) return 1;
  if (loadKg < 20) return 2;
  if (lower && loadKg >= 60) return 5;
  return 2.5;
}

/** To what a gym actually has: halves when light, then whole kilos, then 2.5. */
export function roundLoad(loadKg: number): number {
  if (loadKg <= 0) return 0;
  if (loadKg < 10) return Math.round(loadKg * 2) / 2;
  if (loadKg < 20) return Math.round(loadKg);
  return Math.round(loadKg / 2.5) * 2.5;
}

const LOWER = new Set<Muscle>(["glutes", "quads", "hamstrings", "adductors"]);

function workingLoad(p: Performance): number {
  if (!p.logged || p.logged.length === 0) return p.loadKg;
  // The heaviest load she did all her sets at is the honest one; with mixed
  // loads, the most common one.
  const counts = new Map<number, number>();
  for (const s of p.logged) counts.set(s.weightKg, (counts.get(s.weightKg) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
}

/**
 * Double progression (Plotkin 2022: adding reps and adding load build muscle
 * about equally). Work up the rep range at a load; when every set reaches the
 * top, add the smallest step and start again from the bottom. Where that step
 * is a big fraction of the load, as with light dumbbells, earn it with two
 * extra reps first.
 */
export function nextTarget(
  history: Performance[],
  ctx: { deload: boolean; reEntry: boolean; now: Date },
): Target | null {
  const last = history.at(-1);
  if (!last) return null;

  const lower = last.primary.some((m) => LOWER.has(m));
  const range = repRange(last.reps);
  const load = workingLoad(last);
  const step = increment(load, lower);
  const logged = !!last.logged && last.logged.length > 0 && !last.skipped;

  const lastText = logged
    ? describeSets(last.logged!)
    : `${last.sets > 0 ? `${last.sets} x ` : ""}${last.reps}${last.loadKg > 0 ? ` at ${kg(last.loadKg)}` : ""} (as written)`;

  let target: Target = {
    name: last.name,
    sets: last.sets,
    reps: last.reps,
    loadKg: load,
    action: "hold",
    reason: "Same as last time.",
    last: lastText,
    lastAt: last.at,
    logged,
  };

  if (!range) {
    // Timed or distance work: nothing to double-progress, so hold it.
    target.reason = "Same again. Make it smoother.";
  } else if (logged) {
    const reps = last.logged!.map((s) => s.reps);
    const lowest = Math.min(...reps);
    const bigStep = load > 0 && step / load > 0.1;
    const topNeeded = range[1] + (bigStep ? 2 : 0);
    const repsText = reps.join(", ");

    if (last.effort === "failed" || lowest < range[0] - 1) {
      const lighter = roundLoad(load * 0.92);
      target = {
        ...target,
        action: "drop",
        loadKg: lighter,
        reason: lighter < load ? `Down to ${kg(lighter)}. Own every rep.` : "Same weight. Own every rep.",
      };
    } else if (last.effort === "easy" && load > 0) {
      // Said in so many words. Lifting lighter than she can is the commoner
      // mistake, so "easy" is taken at its word rather than second guessed.
      target = { ...target, action: "up", loadKg: roundLoad(load + step), reason: `Up ${kg(step)}. You said it was easy.` };
    } else if (reps.every((r) => r >= topNeeded) && last.effort !== "hard") {
      target =
        load > 0
          ? { ...target, action: "up", loadKg: roundLoad(load + step), reason: `Up ${kg(step)}. You hit ${repsText}.` }
          : { ...target, action: "up", reason: `Top of the range. Add 2 reps or a harder version.` };
    } else {
      target = {
        ...target,
        action: "reps",
        reason: bigStep && reps.every((r) => r >= range[1])
          ? `Same weight. Get ${range[1] + 2} on every set, then it goes up.`
          : `Same weight. Beat ${repsText}.`,
      };
    }
  } else {
    // No reply, so the prescription stands in. Two in a row at one load and
    // she has almost certainly adapted to it.
    const sameLoad = [...history]
      .reverse()
      .findIndex((p) => (p.logged && p.logged.length > 0) || p.loadKg !== last.loadKg);
    const runs = sameLoad === -1 ? history.length : sameLoad;

    target =
      runs >= 2 && load > 0
        ? { ...target, action: "up", loadKg: roundLoad(load + step), reason: `Up ${kg(step)}. Reply with your numbers to steer this.` }
        : { ...target, action: "reps", reason: "Same weight. Aim for the top of the range." };
  }

  if (ctx.reEntry) {
    target = {
      ...target,
      action: "reset",
      loadKg: roundLoad(target.loadKg * 0.9),
      reason: "About 10% lighter after the break.",
    };
  } else if (ctx.deload) {
    target = {
      ...target,
      action: "deload",
      loadKg: roundLoad(load * 0.9),
      sets: Math.max(1, Math.ceil(target.sets / 2)),
      reason: "Lighter week: half the sets, a little less weight.",
    };
  }

  return target;
}

/* ---------- the rest of the brief ---------- */

function anchorsOf(sessions: Session[], typeId: string, block: number | null): string[] {
  const names: string[] = [];
  const keys = new Set<string>();
  for (const s of byTime(sessions)) {
    if (s.stamp?.typeId !== typeId || !s.plan) continue;
    if (block !== null && s.stamp.block !== block) continue;
    for (const b of s.plan.blocks) {
      for (const e of b.exercises) {
        const key = exerciseKey(e.name);
        if (e.anchor && !keys.has(key)) {
          keys.add(key);
          names.push(e.name);
        }
      }
    }
  }
  return names;
}

function previousBlockAnchors(sessions: Session[], typeId: string, block: number): string[] {
  const earlier = byTime(sessions).filter(
    (s) => s.stamp?.typeId === typeId && s.stamp.block < block,
  );
  const lastBlock = earlier.at(-1)?.stamp?.block;
  return lastBlock === undefined ? [] : anchorsOf(earlier, typeId, lastBlock);
}

export function budgetFor(minutes: number): Brief["budget"] {
  const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
  const finisher = minutes < 35 ? 0 : clamp(Math.round(minutes * 0.15), 5, 12);
  const warmup = clamp(Math.round(minutes * 0.12), 5, 8);
  const primer = minutes < 30 ? 0 : clamp(Math.round(minutes * 0.08), 3, 6);
  return { warmup, primer, main: Math.max(10, minutes - warmup - primer - finisher), finisher };
}

export function chooseFinisher(
  sessions: Session[],
  needConditioning: boolean,
  dislikes: string[],
  sessionNumber: number,
): { format: string; idea: string } {
  const recent = byTime(sessions)
    .slice(-2)
    .map((s) => s.stamp?.finisher)
    .filter(Boolean);
  const disliked = (f: { format: string; idea: string }) =>
    dislikes.some((d) => {
      const word = d.toLowerCase();
      return f.format.toLowerCase().includes(word) || word.includes(f.format.toLowerCase());
    });

  let pool = FINISHERS.filter((f) => (!needConditioning || f.conditioning) && !disliked(f));
  if (pool.length === 0) pool = FINISHERS.filter((f) => !needConditioning || f.conditioning);

  const fresh = pool.filter((f) => !recent.includes(f.format));
  if (fresh.length > 0) pool = fresh;

  const rated = enjoymentByFinisher(sessions);
  const score = (f: { format: string }) => rated.get(f.format) ?? 3.5;
  const top = Math.max(...pool.map(score));
  const best = pool.filter((f) => score(f) === top);

  // Several equally good: rotate through them, so the same rating does not
  // mean the same finisher forever.
  return best[sessionNumber % best.length];
}

function recentWords(sessions: Session[], pick: (s: Session) => string[], within: number, now: Date): string[] {
  const out: string[] = [];
  for (const s of byTime(sessions).reverse()) {
    if (days(now.getTime() - s.at.getTime()) > within) break;
    for (const w of pick(s)) if (!out.some((o) => o.toLowerCase() === w.toLowerCase())) out.push(w);
  }
  return out.slice(0, 8);
}

function readinessOf(sessions: Session[], now: Date): string[] {
  const latest = recentCheckIns(sessions)[0];
  if (!latest || days(now.getTime() - latest.at.getTime()) > 7) return [];
  const c = latest.log.checkIn;
  const out: string[] = [];
  if (c.energy && c.energy <= 2) out.push(`energy ${c.energy} of 5`);
  if (c.sleep && c.sleep <= 2) out.push(`sleep ${c.sleep} of 5`);
  if (c.soreness >= 4) out.push(`soreness ${c.soreness} of 5`);
  if (c.symptoms.length) out.push(c.symptoms.join(", "));
  return out;
}

export function buildBrief(input: CoachInput): Brief {
  const { preferences, slot, sessionNumber } = input;
  const now = slot.startsAt;
  const sessions = byTime(input.sessions.filter((s) => s.at < now));

  const pos = position(sessions, now);
  const { plan: weekPlan, deload } = weekPlanFor(pos, sessions);
  const perWeek = frequency(sessions, preferences.trainingDaysPerWeek, now);
  const volume = volumeStatus(sessions, preferences, now);
  const { session, rotation } = chooseSession(sessions, perWeek, volume);

  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);

  const reachable = new Set<Muscle>([...session.primary, ...session.secondary, "core"]);
  const behind = volume
    .filter((v) => v.status === "under" && reachable.has(v.muscle))
    .sort((a, b) => (b.range[0] - b.done) / b.range[0] - (a.range[0] - a.done) / a.range[0])
    .map((v) => v.muscle);

  const jumps = jumpsBetween(sessions, weekAgo, now);
  const today: [number, number] =
    deload || pos.reEntry
      ? [20, 30]
      : jumps >= IMPACT.weekly[1]
        ? [10, 20]
        : [IMPACT.perSession[0], IMPACT.perSession[1]];

  const hard = hardMinutesBetween(sessions, weekAgo, now);
  const needConditioning = hard < CONDITIONING.weeklyHardMinutes[0];

  const dislikes = recentWords(sessions, (s) => s.logs.flatMap((l) => l.disliked), 120, now);
  const likes = recentWords(sessions, (s) => s.logs.flatMap((l) => l.liked), 120, now);

  const anchors = anchorsOf(sessions, session.id, pos.reEntry ? -1 : pos.block);
  const previousAnchors =
    anchors.length === 0 ? previousBlockAnchors(sessions, session.id, pos.block) : [];

  /*
   * Targets for everything she has done in the last six weeks, anchors for
   * today first. The model is told to use the number for any of these it
   * prescribes, so an accessory that comes back keeps its progression too.
   */
  const history = historyByExercise(
    sessions.filter((s) => days(now.getTime() - s.at.getTime()) <= 42),
  );
  const priority = new Set([...anchors, ...previousAnchors].map(exerciseKey));
  const targets = [...history.entries()]
    .map(([key, all]) => ({ key, h: all.filter(isProgressed) }))
    .filter(({ h }) => h.length > 0)
    .map(({ key, h }) => ({ key, target: nextTarget(h, { deload, reEntry: pos.reEntry, now }) }))
    .filter((t): t is { key: string; target: Target } => t.target !== null)
    .sort(
      (a, b) =>
        Number(priority.has(b.key)) - Number(priority.has(a.key)) ||
        b.target.lastAt.getTime() - a.target.lastAt.getTime(),
    )
    .slice(0, 24)
    .map((t) => t.target);

  const periodStart = preferences.cycleTracking ? lastPeriodStart(sessions) : null;
  const cycleDay = periodStart ? Math.floor(days(now.getTime() - periodStart.getTime())) + 1 : null;

  return {
    sessionNumber,
    session,
    rotation,
    block: pos.block,
    week: pos.week,
    weekPlan,
    blockStartedAt: pos.blockStartedAt,
    deload,
    reEntry: pos.reEntry,
    daysSinceLast: pos.daysSinceLast === null ? null : Math.round(pos.daysSinceLast * 10) / 10,
    perWeek: Math.round(perWeek * 10) / 10,
    budget: budgetFor(slot.minutes),
    volume,
    behind,
    impact: { done: jumps, weekly: IMPACT.weekly, today },
    conditioning: { done: hard, weekly: CONDITIONING.weeklyHardMinutes, needed: needConditioning },
    anchors,
    previousAnchors,
    targets,
    stalled: stalled(sessions),
    finisher: chooseFinisher(sessions, needConditioning, dislikes, sessionNumber),
    readiness: readinessOf(sessions, now),
    pain: recentWords(sessions, (s) => s.logs.flatMap((l) => l.checkIn.pain), 21, now),
    likes,
    dislikes,
    requests: recentWords(sessions, (s) => s.logs.map((l) => l.requests).filter(Boolean), 14, now),
    cycleDay: cycleDay !== null && cycleDay <= 45 ? cycleDay : null,
  };
}

/** What is kept on the workout row, so the next brief knows where it was. */
export function stampFor(brief: Brief, plan: Plan): Stamp {
  const finisher = plan.blocks.find((b) => b.kind === "finisher");
  return {
    typeId: brief.session.id,
    block: brief.block,
    week: brief.week,
    blockStartedAt: brief.blockStartedAt.toISOString(),
    deload: brief.deload,
    finisher: finisher?.format ?? brief.finisher.format,
  };
}

/** The target for an exercise by name, across spellings. */
export function targetFor(brief: Brief, name: string): Target | undefined {
  const key = exerciseKey(name);
  return brief.targets.find((t) => exerciseKey(t.name) === key);
}

/**
 * Puts the coach's loads back where the model drifted from them.
 *
 * Only where the model kept the same rep scheme: a target worked out for
 * 8 to 12 reps is wrong for a set of 5, and then the model's own number is
 * the better guess.
 */
export function enforceTargets(plan: Plan, brief: Brief): Plan {
  const same = (a: string, b: string) => {
    const x = repRange(a);
    const y = repRange(b);
    return x !== null && y !== null && x[0] === y[0] && x[1] === y[1];
  };

  return {
    ...plan,
    blocks: plan.blocks.map((block) => ({
      ...block,
      exercises: block.exercises.map((exercise) => {
        const target = targetFor(brief, exercise.name);
        if (!target || target.loadKg <= 0 || !same(exercise.reps, target.reps)) return exercise;
        return { ...exercise, loadKg: target.loadKg };
      }),
    })),
  };
}

/**
 * Rations failure, whatever the model wrote.
 *
 * Failure on the last set is allowed only where it is safe and cheap: lifts
 * outside the heavy strength block, never in a lighter week or the first
 * session back from a break, and at most a few per muscle per session.
 * Beyond that it buys fatigue, not muscle.
 */
export function enforceEffort(plan: Plan, brief: Brief): Plan {
  const used = new Map<Muscle, number>();
  const none = brief.deload || brief.reEntry;

  return {
    ...plan,
    blocks: plan.blocks.map((block) => ({
      ...block,
      exercises: block.exercises.map((exercise) => {
        if (!exercise.lastSetToFailure) return exercise;

        const allowed =
          !none &&
          exercise.kind === "lift" &&
          block.kind !== "strength" &&
          block.kind !== "warmup" &&
          block.kind !== "primer" &&
          block.kind !== "finisher" &&
          block.kind !== "cooldown" &&
          exercise.primary.every((m) => (used.get(m) ?? 0) < FAILURE_SETS_PER_MUSCLE_PER_SESSION);

        if (!allowed) return { ...exercise, lastSetToFailure: false };
        for (const m of exercise.primary) used.set(m, (used.get(m) ?? 0) + 1);
        return exercise;
      }),
    })),
  };
}

/** Everything the coach insists on, applied to a plan the model wrote. */
export function applyCoach(plan: Plan, brief: Brief): Plan {
  return enforceEffort(enforceTargets(plan, brief), brief);
}

/** "Thu 5 Nov" for a target's last time. Here so the mailer need not know. */
export function lastSeen(target: Target): string {
  return dateOnly(target.lastAt);
}

/* ---------- keeping a brief on the row ---------- */

/** What goes in workouts.brief: the stamp the next brief reads, and the brief itself. */
export interface StoredBrief {
  version: 1;
  stamp: Stamp;
  brief: Brief;
}

export function storeBrief(brief: Brief, plan: Plan): StoredBrief {
  return { version: 1, stamp: stampFor(brief, plan), brief };
}

/**
 * A brief read back from JSON, with its dates turned back into dates. Null
 * when there is nothing usable, which sends the caller down the path for
 * workouts from before briefs existed.
 */
export function reviveBrief(raw: unknown): Brief | null {
  if (!raw || typeof raw !== "object") return null;
  const stored = raw as Partial<StoredBrief>;
  const b = stored.brief as (Brief & { blockStartedAt: string | Date }) | undefined;
  if (!b || typeof b !== "object" || !b.session || !Array.isArray(b.targets)) return null;

  return {
    ...b,
    blockStartedAt: new Date(b.blockStartedAt),
    targets: b.targets.map((t) => ({ ...t, lastAt: new Date(t.lastAt) })),
  };
}
