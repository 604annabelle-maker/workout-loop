/**
 * The coach: everything decided before the model writes a word.
 *
 * Pure. Given her preferences, her training log and the slot she booked, this
 * works out what today is: which session in the rotation, which week of which
 * block, whether it is a lighter week, which muscles are behind, what every
 * lift she has done should be next time, and which exercises she keeps
 * skipping.
 *
 * The model is good at choosing movements and writing cues. It is not a
 * reliable bookkeeper, and progression is bookkeeping. So the numbers are
 * decided here, where they can be tested, and handed to the model as facts;
 * `applyCoach` puts them back if it drifts.
 */

import {
  exerciseKey,
  progressionKey,
  removeBanned,
  PlanError,
  type Muscle,
  type Plan,
  type Role,
} from "./plan";
import type { Preferences } from "./profile";
import {
  BEGINNER_SCALE,
  BLOCK_WEEKS,
  BUDGET,
  DELOAD_MIN_SESSIONS,
  FAILURE_SETS_PER_MUSCLE_PER_SESSION,
  FULL_BODY,
  JUMPING,
  JUMPS,
  PRIORITY_BONUS,
  PRIORITY_CEILING,
  RE_ENTRY_AFTER_DAYS,
  ROLES,
  ROTATION,
  SESSION_TYPES,
  SKIPS_BEFORE_SWAP,
  SPLIT,
  WEEKLY_SETS,
  WEEKS,
  type SessionType,
  type WeekPlan,
} from "./program";
import {
  DAY_MS,
  describeSets,
  historyByExercise,
  isProgressed,
  jumpSessionsBetween,
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

/** Stamps from this method on are the ones the coach reads. Older ones are history only. */
export const METHOD = 2;

export interface Slot {
  startsAt: Date;
  minutes: number;
}

export type Action = "up" | "reps" | "hold" | "drop" | "reset" | "deload";

/** What a lift should be next time, and why, in words that fit under it. */
export interface Target {
  name: string;
  role: Role;
  sets: number;
  /** Today's rep target, one number: "5". */
  reps: string;
  /** The range it moves through: "3-5". */
  range: string;
  loadKg: number;
  action: Action;
  /** "Up 2.5kg. You hit the top." */
  reason: string;
  /** "70kg x 5, 5, 5, 5". What she did, or what was asked if she did not say. */
  last: string;
  lastAt: Date;
  /** True when `last` is what she logged rather than what was prescribed. */
  logged: boolean;
}

export interface MuscleStatus {
  muscle: Muscle;
  done: number;
  range: [number, number];
  status: "under" | "in" | "over";
}

/** An exercise skipped too often, and what replaces it. */
export interface SwapIn {
  name: string;
  swap: string;
}

export interface Brief {
  sessionNumber: number;
  session: SessionType;
  rotation: "rotation" | "asked for";
  /** Where in ROTATION this session sits; an asked-for one keeps the last. */
  rotationAt: number;
  /** What she asked for by hand, if she did. */
  request: Request;
  block: number;
  week: number;
  weekPlan: WeekPlan;
  blockStartedAt: Date;
  deload: boolean;
  /** Back after a long gap: start somewhere forgiving. */
  reEntry: boolean;
  daysSinceLast: number | null;
  perWeek: number;
  budget: { warmup: number; main: number; core: number };
  /** Whether today's warm up has jumps, and how many. */
  jumps: JumpDay;
  /** Last 7 days, every muscle. */
  volume: MuscleStatus[];
  /** Under target, and trainable today. Most behind first. */
  behind: Muscle[];
  /** Keep these this block, in this order. */
  anchors: string[];
  /** Last block's main lifts for this session, when this is the first of a new block. */
  previousAnchors: string[];
  targets: Target[];
  stalled: string[];
  /** Skipped too often: use the swap instead. */
  swapIn: SwapIn[];
  /** What her most recent log said about how she was. */
  readiness: string[];
  pain: string[];
  likes: string[];
  dislikes: string[];
  requests: string[];
  /** Only when she asked for cycle tracking and has logged a start. */
  cycleDay: number | null;
}

export interface JumpDay {
  today: boolean;
  /** Foot contacts, when today is a jump day. */
  contacts: [number, number];
  /** What kind of jumps, from how many jump sessions she has done. */
  stage: string;
  /** Anything that changes today's jumps, for the prompt. */
  note: string;
  /** Why not, when it is not: said in the prompt, never in the email. */
  reason: string;
  /** True when this frequency is the dose shown to build bone. */
  forBone: boolean;
  doneThisWeek: number;
  perWeek: number;
}

/** Upper, lower or full body: what she asked today to be, when she asked. */
export type Focus = "upper" | "lower" | "full";

/** What she asked for when she sent a workout by hand. */
export interface Request {
  focus?: Focus | null;
  /** In her words: "no legs today", "short on time". */
  note?: string | null;
}

export interface CoachInput {
  preferences: Preferences;
  /** Sent sessions before this one, any order. Ninety days is plenty. */
  sessions: Session[];
  slot: Slot;
  /** All-time count of sessions, including this one. */
  sessionNumber: number;
  request?: Request;
}

const days = (ms: number) => ms / DAY_MS;

function byTime(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => a.at.getTime() - b.at.getTime());
}

/**
 * The sessions planned under this method. Everything before it was planned by
 * other rules and logged another way, so the progress she sees, and the
 * numbers the coach works from, start fresh with the first of these.
 */
export function current(sessions: Session[]): Session[] {
  return sessions.filter((s) => s.stamp?.method === METHOD);
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

function typeById(id: string): SessionType {
  return SESSION_TYPES.find((t) => t.id === id) ?? SPLIT[0];
}

/**
 * The next session in the rotation. Sessions come in order, not by weekday,
 * so a missed day moves everything along rather than losing a session.
 *
 * A session she asked for by hand does not move the rotation on, so the day
 * it stood in for still comes. If that day would be the same as the one she
 * just asked for, it is passed over.
 */
export function chooseSession(
  sessions: Session[],
  focus: Focus | null = null,
): { session: SessionType; rotation: Brief["rotation"]; rotationAt: number } {
  const sorted = byTime(sessions);
  const lastStamp = [...sorted].reverse().find((s) => s.stamp)?.stamp ?? null;
  const at = lastStamp ? lastStamp.rotationAt : -1;

  if (focus) {
    return { session: askedFor(sessions, focus), rotation: "asked for", rotationAt: Math.max(at, -1) };
  }

  let next = (at + 1) % ROTATION.length;
  if (lastStamp?.asked && ROTATION[next] === lastStamp.typeId) next = (next + 1) % ROTATION.length;
  return { session: typeById(ROTATION[next]), rotation: "rotation", rotationAt: next };
}

/**
 * The session she asked for: of the days in that half, the one done least
 * recently. "No legs today" is an upper body day.
 */
function askedFor(sessions: Session[], focus: Focus): SessionType {
  if (focus === "full") return FULL_BODY;
  const pool = SPLIT.filter((t) => t.half === focus);
  const lastDone = (t: SessionType) => {
    const hit = byTime(sessions).reverse().find((s) => s.stamp?.typeId === t.id);
    return hit ? hit.at.getTime() : -Infinity;
  };
  return [...pool].sort((a, b) => lastDone(a) - lastDone(b))[0];
}

/* ---------- volume ---------- */

export function weeklyRange(muscle: Muscle, preferences: Preferences): [number, number] {
  let [lo, hi] = WEEKLY_SETS[muscle];
  if (preferences.level === "beginner") {
    lo = Math.round(lo * BEGINNER_SCALE);
    hi = Math.round(hi * BEGINNER_SCALE);
  }
  if (preferences.priorities.includes(muscle)) {
    lo = hi;
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
  // The load she did most of her sets at; between two equally common, the heavier.
  const counts = new Map<number, number>();
  for (const s of p.logged) counts.set(s.weightKg, (counts.get(s.weightKg) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
}

/** The range a performance moves through: its own, else its role's, else its reps. */
function rangeOf(p: Performance): [number, number] | null {
  return repRange(p.range) ?? repRange(ROLES[p.role]?.range ?? "") ?? repRange(p.reps);
}

/** The rep target as a number: the reps if one number, else the bottom of the range. */
function targetReps(p: Performance, range: [number, number]): number {
  const r = repRange(p.reps);
  if (!r) return range[0];
  return r[0] === r[1] ? r[0] : r[0];
}

/**
 * What a lift should be next time, from what she logged.
 *
 * Double progression with an exact target (Plotkin 2022: adding reps and
 * adding load build muscle about equally). Each time she does the target, it
 * goes up by a rep; at the top of the range the weight goes up a step and the
 * reps go back to the bottom.
 *
 * - done: one more rep, or the weight up at the top of the range.
 * - easy: the weight up a step now, at the same reps.
 * - hard: the same again. Hard twice in a row, and the weight comes down a step.
 * - skipped, or nothing logged: the same again. Nothing is assumed.
 * - numbers she typed: read as what she did. Short of the target by more than
 *   a rep, and the weight comes down a step.
 */
export function nextTarget(
  history: Performance[],
  ctx: { deload: boolean; reEntry: boolean; now: Date },
): Target | null {
  const last = history.at(-1);
  if (!last) return null;

  const lower = last.primary.some((m) => LOWER.has(m));
  const range = rangeOf(last);
  const load = workingLoad(last);
  const step = increment(load, lower);
  const logged = !!last.logged && last.logged.length > 0 && !last.skipped;
  const rangeText = range ? `${range[0]}-${range[1]}` : last.range;

  const lastText = logged
    ? describeSets(last.logged!)
    : last.skipped
      ? "skipped"
      : `${last.sets > 0 ? `${last.sets} x ` : ""}${last.reps}${last.loadKg > 0 ? ` at ${kg(last.loadKg)}` : ""} (not logged)`;

  const base: Target = {
    name: last.name,
    role: last.role,
    sets: last.sets,
    reps: range ? String(targetReps(last, range)) : last.reps,
    range: rangeText,
    loadKg: load,
    action: "hold",
    reason: "Same as last time.",
    last: lastText,
    lastAt: last.at,
    logged,
  };

  let target = base;

  if (!range) {
    target = { ...base, reason: "Same again. Make it smoother." };
  } else if (last.skipped) {
    target = { ...base, reason: "Same as last time, since you skipped it." };
  } else if (!logged) {
    target = { ...base, reason: "Not logged, so the same again." };
  } else {
    const reps = last.logged!.map((s) => s.reps);
    const lowest = Math.min(...reps);
    const goal = targetReps(last, range);
    const previous = [...history].slice(0, -1).reverse().find((p) => p.logged && p.logged.length > 0 && !p.skipped);

    if (last.effort === "failed" || lowest < goal - 1) {
      const lighter = load > 0 ? roundLoad(load - step) : 0;
      target = {
        ...base,
        action: "drop",
        loadKg: lighter,
        reps: String(range[0]),
        reason: lighter < load ? `Down ${kg(load - lighter)}. Own every rep.` : "Same weight. Own every rep.",
      };
    } else if (last.effort === "hard") {
      if (previous?.effort === "hard" && load > 0) {
        const lighter = roundLoad(load - step);
        target = { ...base, action: "drop", loadKg: lighter, reason: `Down ${kg(load - lighter)}. Hard twice in a row.` };
      } else {
        target = { ...base, reps: String(goal), reason: "Same again. You said it was hard." };
      }
    } else if (last.effort === "easy" && load > 0) {
      target = { ...base, action: "up", loadKg: roundLoad(load + step), reps: String(goal), reason: `Up ${kg(step)}. You said it was easy.` };
    } else if (reps.every((r) => r >= range[1])) {
      target =
        load > 0
          ? { ...base, action: "up", loadKg: roundLoad(load + step), reps: String(range[0]), reason: `Up ${kg(step)}. You hit the top, so back to ${range[0]} reps.` }
          : { ...base, action: "up", reps: String(range[1]), reason: "Top of the range. Try a harder version." };
    } else if (reps.every((r) => r >= goal)) {
      const more = Math.min(range[1], Math.min(...reps) + 1);
      target = { ...base, action: "reps", reps: String(more), reason: `One more rep: ${more}.` };
    } else {
      target = { ...base, reps: String(goal), reason: `Same again. Beat ${reps.join(", ")}.` };
    }
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
        const key = progressionKey(e.name, e.role);
        if (e.anchor && !keys.has(key)) {
          keys.add(key);
          names.push(e.role === "light" ? `${e.name} (light)` : e.name);
        }
      }
    }
  }
  return names;
}

/**
 * The main lifts last time this session came round, in any block. Main lifts
 * stay from block to block, so a new block starts from these.
 */
function previousBlockAnchors(sessions: Session[], typeId: string, block: number): string[] {
  const earlier = byTime(sessions).filter((s) => s.stamp?.typeId === typeId && s.stamp.block < block);
  const lastBlock = earlier.at(-1)?.stamp?.block;
  return lastBlock === undefined ? [] : anchorsOf(earlier, typeId, lastBlock);
}

export function budgetFor(minutes: number, session: SessionType): Brief["budget"] {
  const warmup = Math.max(BUDGET.warmup[0], Math.min(BUDGET.warmup[1], Math.round(minutes * 0.12)));
  const core = session.id === "glutes-hams" && minutes >= 40 ? BUDGET.core : 0;
  return { warmup, core, main: Math.max(15, minutes - warmup - core) };
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

/**
 * Exercises she skipped the last two times they came up, each with the swap
 * that was offered. The swap takes over.
 */
export function swapsIn(sessions: Session[]): SwapIn[] {
  const out: SwapIn[] = [];
  for (const [, history] of historyByExercise(sessions)) {
    const recent = history.slice(-SKIPS_BEFORE_SWAP);
    if (recent.length < SKIPS_BEFORE_SWAP || !recent.every((p) => p.skipped)) continue;
    const last = recent.at(-1)!;
    if (last.swap) out.push({ name: last.name, swap: last.swap });
  }
  return out;
}

/**
 * Whether today's warm up has jumps, and what they are.
 *
 * Only when she has jump days left this week and the session is lower or full
 * body. Never after a log that mentioned pain in the joints that take the
 * landing, never with a red flag that needs a clinician first (pregnancy, a
 * bone stress injury), and never when cycle tracking shows no period for two
 * months, because that is under-fuelling until shown otherwise. Leaking keeps
 * the jumps, gentle and two footed, with pelvic floor training: that is the
 * advice, not stopping.
 */
export function jumpDay(
  preferences: Preferences,
  session: SessionType,
  sessions: Session[],
  now: Date,
  ctx: { deload: boolean; reEntry: boolean; pain: string[]; notes?: string[] },
): JumpDay {
  const perWeek = preferences.jumpDays;
  const forBone = perWeek >= JUMPS.frequentFrom;
  const doneThisWeek = jumpSessionsBetween(sessions, new Date(now.getTime() - 7 * DAY_MS), now);
  const no = (reason: string): JumpDay => ({
    today: false,
    contacts: [0, 0],
    stage: "",
    note: "",
    reason,
    forBone,
    doneThisWeek,
    perWeek,
  });

  const said = [preferences.avoid, preferences.brief, ...ctx.pain, ...(ctx.notes ?? [])];
  if (perWeek <= 0) return no("she has jumping turned off");
  if (said.some((t) => JUMPS.redFlags.test(t))) return no("something she wrote needs a clinician's say before any impact work");
  if (preferences.cycleTracking) {
    const start = lastPeriodStart(sessions);
    if (start && days(now.getTime() - start.getTime()) > JUMPS.periodGapDays) {
      return no("no period logged for over two months");
    }
  }
  if (session.half === "upper") return no("an upper body day");
  if (ctx.pain.some((p) => JUMPS.painStops.test(p))) return no("she mentioned pain in a joint that takes the landing");
  if (doneThisWeek >= perWeek) return no("this week's jump day is done");

  const dose = forBone ? JUMPS.frequent : JUMPS.weekly;
  const leaking = ctx.pain.some((p) => JUMPS.leak.test(p));
  let contacts: [number, number] = ctx.deload || ctx.reEntry || leaking ? [...dose.easy] : [...dose.contacts];
  const notes: string[] = [];

  if (JUMPS.heavyLegDays.includes(session.id) && contacts[1] > JUMPS.heavyLegCap) {
    contacts = [Math.min(contacts[0], JUMPS.heavyLegCap), JUMPS.heavyLegCap];
    notes.push("Squat day, so keep the jumps short and two footed.");
  }
  if (leaking) {
    notes.push("She mentioned leaking: gentle two foot jumps only.");
  }

  const done = jumpSessionsBetween(sessions, new Date(0), now);
  const stage = leaking
    ? JUMPS.stages[0].text
    : (JUMPS.stages.find((s) => done < s.before) ?? JUMPS.stages[JUMPS.stages.length - 1]).text;

  return { today: true, contacts, stage, note: notes.join(" "), reason: "", forBone, doneThisWeek, perWeek };
}

export function buildBrief(input: CoachInput): Brief {
  const { preferences, slot, sessionNumber } = input;
  const now = slot.startsAt;
  const sessions = byTime(current(input.sessions).filter((s) => s.at < now));

  const pos = position(sessions, now);
  const { plan: weekPlan, deload } = weekPlanFor(pos, sessions);
  const perWeek = frequency(sessions, preferences.trainingDaysPerWeek, now);
  const volume = volumeStatus(sessions, preferences, now);
  const request: Request = {
    focus: input.request?.focus ?? null,
    note: input.request?.note?.trim() || null,
  };
  const { session, rotation, rotationAt } = chooseSession(sessions, request.focus ?? null);

  const reachable = new Set<Muscle>([...session.primary, ...session.secondary]);
  const behind = volume
    .filter((v) => v.status === "under" && v.range[0] > 0 && reachable.has(v.muscle))
    .sort((a, b) => (b.range[0] - b.done) / b.range[0] - (a.range[0] - a.done) / a.range[0])
    .map((v) => v.muscle);

  const dislikes = recentWords(sessions, (s) => s.logs.flatMap((l) => l.disliked), 120, now);
  const likes = recentWords(sessions, (s) => s.logs.flatMap((l) => l.liked), 120, now);

  const pain = recentWords(sessions, (s) => s.logs.flatMap((l) => l.checkIn.pain), 21, now);
  const notes = recentWords(sessions, (s) => s.notes, 60, now);
  const jumps = jumpDay(preferences, session, sessions, now, { deload, reEntry: pos.reEntry, pain, notes });

  const anchors = anchorsOf(sessions, session.id, pos.reEntry ? -1 : pos.block);
  const previousAnchors = anchors.length === 0 ? previousBlockAnchors(sessions, session.id, pos.block) : [];

  /*
   * Targets for everything she has done in the last six weeks, main lifts
   * first. The model is told to use the number for any of these it
   * prescribes, so an accessory that comes back keeps its progression too.
   */
  const history = historyByExercise(sessions.filter((s) => days(now.getTime() - s.at.getTime()) <= 42));
  const priority = new Set(
    [...anchors, ...previousAnchors].map((a) =>
      a.endsWith(" (light)") ? progressionKey(a.slice(0, -8), "light") : progressionKey(a),
    ),
  );
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
    rotationAt,
    block: pos.block,
    week: pos.week,
    weekPlan,
    blockStartedAt: pos.blockStartedAt,
    deload,
    reEntry: pos.reEntry,
    daysSinceLast: pos.daysSinceLast === null ? null : Math.round(pos.daysSinceLast * 10) / 10,
    perWeek: Math.round(perWeek * 10) / 10,
    budget: budgetFor(slot.minutes, session),
    jumps,
    volume,
    behind,
    anchors,
    previousAnchors,
    targets,
    stalled: stalled(sessions),
    swapIn: swapsIn(sessions),
    readiness: readinessOf(sessions, now),
    pain,
    likes,
    dislikes,
    request,
    requests: recentWords(sessions, (s) => s.logs.map((l) => l.requests).filter(Boolean), 14, now),
    cycleDay: cycleDay !== null && cycleDay <= 45 ? cycleDay : null,
  };
}

/** What is kept on the workout row, so the next brief knows where it was. */
export function stampFor(brief: Brief): Stamp {
  return {
    method: METHOD,
    typeId: brief.session.id,
    rotationAt: brief.rotationAt,
    asked: brief.rotation === "asked for",
    block: brief.block,
    week: brief.week,
    blockStartedAt: brief.blockStartedAt.toISOString(),
    deload: brief.deload,
  };
}

/** The target for an exercise in a given role, across spellings. */
export function targetFor(brief: Brief, name: string, role: Role | "" = ""): Target | undefined {
  const key = progressionKey(name, role);
  return brief.targets.find((t) => progressionKey(t.name, t.role) === key);
}

/**
 * Puts the coach's numbers back where the model drifted from them: the load
 * and the rep target, for anything she has a target for in that role.
 */
export function enforceTargets(plan: Plan, brief: Brief): Plan {
  return {
    ...plan,
    blocks: plan.blocks.map((block) => ({
      ...block,
      exercises: block.exercises.map((exercise) => {
        const target = targetFor(brief, exercise.name, exercise.role);
        if (!target || !repRange(target.reps)) return exercise;
        return {
          ...exercise,
          reps: target.reps,
          range: target.range || exercise.range,
          loadKg: target.loadKg > 0 ? target.loadKg : exercise.loadKg,
        };
      }),
    })),
  };
}

/**
 * Rations failure, whatever the model wrote.
 *
 * Only small exercises take a last set to failure, never in a lighter week or
 * the first session back from a break, and at most a few per muscle per
 * session. Beyond that it buys fatigue, not muscle.
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
          exercise.role === "accessory" &&
          exercise.primary.every((m) => (used.get(m) ?? 0) < FAILURE_SETS_PER_MUSCLE_PER_SESSION);

        if (!allowed) return { ...exercise, lastSetToFailure: false };
        for (const m of exercise.primary) used.set(m, (used.get(m) ?? 0) + 1);
        return exercise;
      }),
    })),
  };
}

/**
 * Takes out anything that leaves the ground, except, on a jump day, in the
 * warm up, which is where the jumps belong. A rule that matters to her should
 * not depend on the model remembering it. A block left empty goes too. A plan
 * that was nothing but jumps is an error, so it is regenerated rather than
 * sent half empty.
 */
export function removeJumps(plan: Plan, keepInWarmup = false): Plan {
  const blocks = plan.blocks
    .map((block) => ({
      ...block,
      exercises:
        keepInWarmup && block.kind === "warmup"
          ? block.exercises
          : block.exercises.filter((e) => e.kind !== "jump" && !JUMPING.test(e.name)),
    }))
    .filter((block) => block.exercises.length > 0);

  if (blocks.length === 0) throw new PlanError("The plan was nothing but jumps.");
  return { ...plan, blocks };
}

const LEG_MUSCLES = new Set<Muscle>(["glutes", "quads", "hamstrings", "adductors", "calves"]);
const ARM_AND_TORSO = new Set<Muscle>(["back", "chest", "shoulders", "biceps", "triceps"]);

/**
 * When she asked for upper or lower body, the other half's work comes out:
 * "no legs today" means no squats anywhere. Warm up items stay, since they
 * are mobility, not training. A plan left empty is regenerated.
 */
export function keepToFocus(plan: Plan, focus: Focus | null | undefined): Plan {
  if (!focus || focus === "full") return plan;
  const other = focus === "upper" ? LEG_MUSCLES : ARM_AND_TORSO;

  const blocks = plan.blocks
    .map((block) => ({
      ...block,
      exercises:
        block.kind === "warmup" || block.kind === "cooldown"
          ? block.exercises
          : block.exercises.filter((e) => !e.primary.some((m) => other.has(m))),
    }))
    .filter((block) => block.exercises.length > 0);

  if (!blocks.some((b) => b.kind !== "warmup" && b.kind !== "cooldown")) {
    throw new PlanError(`Nothing was left once the ${focus === "upper" ? "leg" : "upper body"} work came out.`);
  }
  return { ...plan, blocks };
}

/** Everything the coach insists on, applied to a plan the model wrote. */
export function applyCoach(plan: Plan, brief: Brief): Plan {
  const focused = keepToFocus(removeBanned(plan), brief.request?.focus);
  return enforceEffort(enforceTargets(removeJumps(focused, brief.jumps?.today === true), brief), brief);
}

/** "Thu 5 Nov" for a target's last time. Here so the mailer need not know. */
export function lastSeen(target: Target): string {
  return dateOnly(target.lastAt);
}

/* ---------- keeping a brief on the row ---------- */

/** What goes in workouts.brief: the stamp the next brief reads, and the brief itself. */
export interface StoredBrief {
  version: 2;
  stamp: Stamp;
  brief: Brief;
}

export function storeBrief(brief: Brief): StoredBrief {
  return { version: 2, stamp: stampFor(brief), brief };
}

/**
 * A brief read back from JSON, with its dates turned back into dates. Null
 * when there is nothing usable, or when it is from before this method, which
 * sends the caller to plan afresh.
 */
export function reviveBrief(raw: unknown): Brief | null {
  if (!raw || typeof raw !== "object") return null;
  const stored = raw as Partial<StoredBrief>;
  if (stored.version !== 2) return null;
  const b = stored.brief as (Brief & { blockStartedAt: string | Date }) | undefined;
  if (!b || typeof b !== "object" || !b.session || !Array.isArray(b.targets)) return null;

  return {
    ...b,
    blockStartedAt: new Date(b.blockStartedAt),
    targets: b.targets.map((t) => ({ ...t, lastAt: new Date(t.lastAt) })),
  };
}

export { SPLIT, ROTATION };
