/**
 * The warm-up (spec §The warm-up).
 *
 * Pure, and built from the finished plan, never written on its own: easier
 * bodyweight or band exercises for the muscles the session's first exercises
 * train, then one light practice set of the first heavy lift. check.ts
 * refuses a warm-up exercise whose primary muscle today does not train.
 */

import { catalogue, exercise, type Exercise } from "./catalogue";
import { isWeighted, loadable, roundDown, type Equipment } from "./equipment";
import { WARMUP, type Muscle } from "./rules";
import type { PlannedExercise, WarmupItem } from "./types";

/** The lift the practice set is for: the first heavy one, else the first weighted compound. */
export function practiceTarget(exercises: PlannedExercise[]): PlannedExercise | undefined {
  const weighted = exercises.filter((x) => isWeighted(x.main.load) && !x.finisher);
  return weighted.find((x) => x.class === "heavy") ?? weighted.find((x) => x.class === "compound");
}

const isDrill = (e: Exercise) => (e.class === "drill" || e.warmup) && (e.load === "bodyweight" || e.load === "band");

export function warmup(exercises: PlannedExercise[], equipment: Equipment): WarmupItem[] {
  const mains = exercises.filter((x) => !x.finisher).map((x) => exercise(x.main.exerciseId)).filter(Boolean) as Exercise[];
  const today = new Set<Muscle>(mains.flatMap((e) => e.primary));
  // The first three exercises set the order of what to warm up first.
  const lead = mains.slice(0, 3);
  const leadMuscles = [...new Set(lead.flatMap((e) => e.primary))];
  const leadPatterns = new Set(lead.map((e) => e.pattern));

  const drills = catalogue().filter(
    (e) => isDrill(e) && e.primary.some((m) => today.has(m)) && !mains.some((x) => x.id === e.id),
  );
  const score = (e: Exercise) =>
    (leadPatterns.has(e.pattern) ? 3 : 0) +
    (e.class === "drill" ? 2 : 0) +
    (e.primary.some((m) => leadMuscles.includes(m)) ? 2 : 0) -
    leadMuscles.findIndex((m) => e.primary.includes(m)) * 0.1;
  const ranked = [...drills].sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));

  // One drill per muscle first, in the order the session reaches them, then fill.
  const picked: Exercise[] = [];
  for (const m of leadMuscles) {
    const d = ranked.find((e) => e.primary.includes(m) && !picked.includes(e));
    if (d && picked.length < WARMUP.drills[1]) picked.push(d);
  }
  for (const d of ranked) if (picked.length < WARMUP.drills[0] && !picked.includes(d)) picked.push(d);

  const items: WarmupItem[] = picked.map((e) => ({
    exerciseId: e.id,
    reps: WARMUP.drillReps,
    weight: null,
    load: e.load,
  }));

  const target = practiceTarget(exercises);
  if (target) {
    const steps = loadable(target.main.load, equipment);
    const working = target.main.weight ?? steps[0];
    // On a first try the card already starts light, so the practice set is that start weight.
    const weight = target.main.findIt ? working : (roundDown(working * WARMUP.practiceFraction, steps) ?? working);
    items.push({ exerciseId: target.main.exerciseId, reps: WARMUP.practiceReps, weight, load: target.main.load, practice: true });
  }
  return items;
}

/** Rough minutes: two per drill, moving between them included, and two for the practice set. */
export const warmupMinutes = (items: WarmupItem[]) => items.length * 2;
