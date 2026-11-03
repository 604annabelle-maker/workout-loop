/**
 * Progress as something to read: the weekly bars at the end of every workout.
 *
 * Pure. ./progress.ts counts; this decides what is shown.
 */

import type { Brief, MuscleStatus } from "./coach";
import type { Muscle, Plan } from "./plan";
import { DAY_MS, setsPerMuscle, type Session } from "./progress";

export interface Snapshot {
  volume: MuscleStatus[];
}

/**
 * The seven days ending with today's session, counting what she logged and
 * today as planned.
 *
 * Today is included because the bars are read in the gym, about the week this
 * session completes. Counted without it, every muscle today trains looks
 * behind, which is true for an hour and discouraging all the same.
 */
export function snapshot(sessions: Session[], brief: Brief, now: Date, today: Plan | null = null): Snapshot {
  const from = new Date(now.getTime() - 6 * DAY_MS);
  const to = new Date(now.getTime() + DAY_MS);
  const withToday: Session[] = today
    ? [...sessions, { at: now, minutes: 0, plan: today, legacyText: "", stamp: null, notes: [], logs: [], planned: true }]
    : sessions;

  const sets = setsPerMuscle(withToday, from, to);
  const volume = brief.volume.map((v) => {
    const done = Math.round((sets[v.muscle] ?? 0) * 2) / 2;
    return {
      ...v,
      done,
      status: done < v.range[0] ? ("under" as const) : done > v.range[1] ? ("over" as const) : ("in" as const),
    };
  });

  return { volume };
}

/** The muscles shown in the panel, in a fixed order, skipping the minor ones. */
export const PANEL_MUSCLES: Muscle[] = [
  "glutes",
  "quads",
  "hamstrings",
  "back",
  "chest",
  "shoulders",
  "biceps",
  "triceps",
  "core",
];

export const LABELS: Record<Muscle, string> = {
  glutes: "Glutes",
  quads: "Quads",
  hamstrings: "Hamstrings",
  adductors: "Adductors",
  calves: "Calves",
  back: "Back",
  chest: "Chest",
  shoulders: "Shoulders",
  biceps: "Biceps",
  triceps: "Triceps",
  core: "Core",
};

/** "HIP THRUST" to "Hip thrust", for prose. */
export function title(name: string): string {
  // Words with no vowels are abbreviations, RDL, DB, KB, and stay capitals.
  const lower = name
    .split(" ")
    .map((w) => (/^[^AEIOUY]+$/i.test(w) && w.length > 1 ? w.toUpperCase() : w.toLowerCase()))
    .join(" ");
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** "■■■■■■□□□□", filled to `done` out of the top of the range. */
export function bar(done: number, top: number, width = 10): string {
  const filled = top > 0 ? Math.max(0, Math.min(width, Math.round((done / top) * width))) : 0;
  return "■".repeat(filled) + "□".repeat(width - filled);
}
