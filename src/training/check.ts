/**
 * The plan checker (spec §How a session is planned, step 3).
 *
 * Pure. This is what closes the two old bugs. A plan fails if any exercise
 * does not train its slot's muscle, if a swap trains something else, or if a
 * warm-up exercise is for a muscle today's workout does not train. It also
 * fails on anything banned or disliked, on volume out of range, and on
 * weights that do not exist. A plan that fails is never emailed: choose.ts
 * sends the failures back to the model, then fills the slots itself.
 */

import { disliked } from "../memory/apply";
import { banned, exercise, isBodyweight, type Exercise } from "./catalogue";
import { fits, fitsSwap } from "./candidates";
import { isWeighted, loadable, type Equipment } from "./equipment";
import {
  ROTATION,
  SECONDARY_CREDIT,
  SESSION_MUSCLE_CAP,
  SESSION_SETS,
  TARGETED,
  WEEKLY_CAP,
  WEEKLY_FLOOR,
  type Muscle,
} from "./rules";
import { balance, cycleTypes, plannedVolume, TEMPLATES, type Skeleton, type Targets } from "./skeleton";
import type { Note, PlanV2, Prescription, SessionRecord } from "./types";
import { practiceTarget } from "./warmup";

/** Fractional sets per muscle for exercises as actually chosen: 1 per primary, a half per secondary. */
export function volumeOf(items: { exerciseId: string; sets: number }[]): Partial<Record<Muscle, number>> {
  const v: Partial<Record<Muscle, number>> = {};
  for (const { exerciseId, sets } of items) {
    const e = exercise(exerciseId);
    if (!e) continue;
    for (const m of e.primary) v[m] = (v[m] ?? 0) + sets;
    for (const m of e.secondary) v[m] = (v[m] ?? 0) + sets * SECONDARY_CREDIT;
  }
  return v;
}

export const planVolume = (plan: PlanV2) =>
  volumeOf(plan.exercises.map((x) => ({ exerciseId: x.main.exerciseId, sets: x.sets })));

/** The muscles today's working exercises train as a primary muscle. */
export function trainedToday(plan: PlanV2): Set<Muscle> {
  const out = new Set<Muscle>();
  for (const x of plan.exercises) for (const m of exercise(x.main.exerciseId)?.primary ?? []) out.add(m);
  return out;
}

function weightExists(p: Prescription, eq: Equipment): boolean {
  if (!isWeighted(p.load)) return p.weight === null;
  if (p.weight === null) return false;
  return loadable(p.load, eq).some((w) => Math.abs(w - p.weight!) < 1e-9);
}

export function checkPlan(input: {
  plan: PlanV2;
  skeleton: Skeleton;
  notes: Note[];
  equipment: Equipment;
  /** This cycle's earlier sessions, for the weekly projection. */
  history: SessionRecord[];
  targets: Targets;
}): string[] {
  const { plan, skeleton, notes, equipment } = input;
  const failures: string[] = [];
  const bans = banned();
  const bad = (id: string): Exercise | null => {
    const e = exercise(id);
    if (!e) {
      failures.push(`${id} is not in the catalogue`);
      return null;
    }
    if (bans.includes(id)) failures.push(`${e.name} is banned`);
    if (disliked(notes, id)) failures.push(`${e.name} is disliked`);
    return e;
  };

  // Every slot filled, each by an exercise that trains its muscle; its swap too.
  const ids: string[] = [];
  for (const slot of skeleton.slots) {
    const x = plan.exercises.find((p) => p.slot === slot.key);
    if (!x) {
      failures.push(`slot ${slot.key} is empty`);
      continue;
    }
    const main = bad(x.main.exerciseId);
    if (main && !fits(main, slot)) failures.push(`${main.name} does not train ${slot.muscle} as a ${slot.class} ${slot.patterns.join("/")} exercise (${slot.key})`);
    if (main) ids.push(main.id);
    if (!weightExists(x.main, equipment)) failures.push(`${main?.name ?? x.main.exerciseId}: ${x.main.weight} kg does not exist`);
    if (x.swap) {
      const swap = bad(x.swap.exerciseId);
      if (swap && !fitsSwap(swap, slot)) failures.push(`swap ${swap.name} does not train ${slot.muscle} (${slot.key})`);
      if (swap && swap.id === x.main.exerciseId) failures.push(`swap for ${slot.key} is the same exercise`);
      if (!weightExists(x.swap, equipment)) failures.push(`swap ${swap?.name ?? x.swap.exerciseId}: ${x.swap.weight} kg does not exist`);
    }
    if (x.sets !== slot.setCount) failures.push(`${slot.key} has ${x.sets} sets, the skeleton says ${slot.setCount}`);
  }
  for (const x of plan.exercises)
    if (!skeleton.slots.some((s) => s.key === x.slot)) failures.push(`${x.slot} is not a slot today`);
  if (new Set(ids).size !== ids.length) failures.push("the same exercise is in two slots");

  // The warm-up is about today's muscles, and the practice set is today's first heavy lift.
  const today = trainedToday(plan);
  for (const w of plan.warmup) {
    const e = bad(w.exerciseId);
    if (!e) continue;
    if (w.practice) {
      const first = practiceTarget(plan.exercises);
      if (!first || first.main.exerciseId !== w.exerciseId) failures.push(`practice set ${e.name} is not today's first heavy lift`);
      continue;
    }
    if (e.class !== "drill" && !e.warmup) failures.push(`${e.name} is not a warm-up exercise`);
    if (!e.primary.some((m) => today.has(m))) failures.push(`warm-up ${e.name} is for ${e.primary.join(", ")}, which today does not train`);
  }

  // Rotation and bodyweight limits.
  const rotations = plan.exercises.filter((x) => x.change?.kind === "rotation").length;
  if (rotations > ROTATION.maxRotationsPerSession) failures.push(`${rotations} exercises rotated at once`);
  const bodyweight = plan.exercises.filter((x) => {
    const e = exercise(x.main.exerciseId);
    return e && isBodyweight(e) && !x.finisher;
  }).length;
  if (bodyweight > ROTATION.maxBodyweightPerSession) failures.push(`${bodyweight} bodyweight exercises in one session`);

  // Volume: this session, then the cycle it belongs to.
  const v = planVolume(plan);
  const working = plan.exercises.reduce((s, x) => s + (x.finisher ? 0 : x.sets), 0);
  const total = plan.exercises.reduce((s, x) => s + x.sets, 0);
  if (!plan.deload && working < SESSION_SETS[0]) failures.push(`${working} working sets, under ${SESSION_SETS[0]}`);
  if (total > SESSION_SETS[1]) failures.push(`${total} sets, over ${SESSION_SETS[1]}`);
  for (const m of TARGETED)
    if ((v[m] ?? 0) > SESSION_MUSCLE_CAP + 1e-9) failures.push(`${v[m]} sets of ${m} in one session`);

  if (!plan.deload) {
    const types = cycleTypes(skeleton.cycle);
    const sets = balance(types, input.targets);
    const week: Partial<Record<Muscle, number>> = { ...v };
    const add = (x: Partial<Record<Muscle, number>>) => {
      for (const [m, n] of Object.entries(x) as [Muscle, number][]) week[m] = (week[m] ?? 0) + n;
    };
    for (let i = 0; i < 4; i++) {
      if (i === skeleton.index) continue;
      const earlier = input.history.find(
        (s) => s.plan.position.cycle === skeleton.cycle && s.plan.position.index === i,
      );
      if (earlier && i < skeleton.index) add(planVolume(earlier.plan));
      else add(plannedVolume(TEMPLATES[types[i]].map((spec, j) => ({ ...spec, setCount: sets[i][j] }))));
    }
    for (const m of TARGETED) {
      const n = week[m] ?? 0;
      if (n < WEEKLY_FLOOR - 1e-9) failures.push(`${m} is projected at ${n} sets this week, under ${WEEKLY_FLOOR}`);
      if (n > WEEKLY_CAP + 1e-9) failures.push(`${m} is projected at ${n} sets this week, over ${WEEKLY_CAP}`);
    }
  }
  return failures;
}
