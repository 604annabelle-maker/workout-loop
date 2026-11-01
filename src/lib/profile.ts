/**
 * What she has told the app about herself.
 *
 * Pure: the shape, the defaults and the parsing. Reading and writing the row
 * is ./preferences.ts.
 *
 * Structured where code needs to act on it (which muscles to prioritise, how
 * experienced she is, whether to track her cycle), and prose where nuance
 * matters more than parsing (goals, what to avoid, what she loves).
 */

import { MUSCLES, type Muscle } from "./plan";

export const LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type Level = (typeof LEVELS)[number];

export interface Preferences {
  goals: string;
  experience: string;
  level: Level;
  trainingDaysPerWeek: number;
  /** Up to two muscle groups taken to the top of their weekly range. */
  priorities: Muscle[];
  /** Injuries and movements to stay away from. Honoured without exception. */
  avoid: string;
  /** What is actually in the gym. */
  equipment: string;
  /** Movements and formats she loves. More of these. */
  enjoys: string;
  /** Show cycle day and read period mentions in replies. Never programs by phase. */
  cycleTracking: boolean;
  /** A short progress email once a week. */
  weeklyReview: boolean;
  /** Anything else, in her own words. */
  brief: string;
}

/** What a brand new install looks like, before anything is filled in. */
export const EMPTY: Preferences = {
  goals: "",
  experience: "",
  level: "intermediate",
  trainingDaysPerWeek: 3,
  priorities: [],
  avoid: "",
  equipment: "",
  enjoys: "",
  cycleTracking: false,
  weeklyReview: true,
  brief: "",
};

/** At most two. Prioritising everything prioritises nothing. */
export const MAX_PRIORITIES = 2;

/** "glutes, back" or ["glutes", "back"] to a clean list. */
export function readPriorities(raw: string | string[] | null | undefined): Muscle[] {
  const list = Array.isArray(raw) ? raw : (raw ?? "").split(/[,\s]+/);
  const out: Muscle[] = [];
  for (const item of list) {
    const m = item.trim().toLowerCase() as Muscle;
    if (MUSCLES.includes(m) && !out.includes(m)) out.push(m);
  }
  return out.slice(0, MAX_PRIORITIES);
}

export function readLevel(raw: unknown): Level {
  return LEVELS.includes(raw as Level) ? (raw as Level) : "intermediate";
}
