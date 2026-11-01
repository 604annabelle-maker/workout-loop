/**
 * Progress as something to read.
 *
 * Pure. ./progress.ts counts; this decides what is worth saying about the
 * counts, for the panel at the bottom of every workout and for the weekly
 * review. Both emails say the same things the same way because both are built
 * from this.
 */

import type { Brief, MuscleStatus } from "./coach";
import type { Muscle, Plan } from "./plan";
import {
  bestsBetween,
  describeSets,
  DAY_MS,
  hardMinutesBetween,
  jumpsBetween,
  kg,
  sessionsBetween,
  setsPerMuscle,
  trendsBetween,
  type Best,
  type Session,
  type Trend,
} from "./progress";
import type { ReplyLog } from "./reply-log";

export interface Snapshot {
  sessions: number;
  jumps: number;
  hardMinutes: number;
  volume: MuscleStatus[];
  bests: Best[];
  trends: Trend[];
}

/**
 * The seven days ending with today's session, counting today as planned.
 *
 * Today is included because the panel is read in the gym, about the week
 * this session completes. Counted without it, every muscle today trains looks
 * behind, which is true for an hour and discouraging all the same.
 *
 * Bests and trends are from logged sessions only, so today adds nothing there.
 */
export function snapshot(
  sessions: Session[],
  brief: Brief,
  now: Date,
  today: Plan | null = null,
): Snapshot {
  const from = new Date(now.getTime() - 6 * DAY_MS);
  const to = new Date(now.getTime() + DAY_MS);
  const withToday: Session[] = today
    ? [...sessions, { at: now, minutes: 0, plan: today, legacyText: "", stamp: null, notes: [], logs: [] }]
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

  return {
    sessions: sessionsBetween(withToday, from, to),
    jumps: jumpsBetween(withToday, from, to),
    hardMinutes: hardMinutesBetween(withToday, from, to),
    volume,
    bests: bestsBetween(sessions, new Date(now.getTime() - 7 * DAY_MS), now),
    trends: trendsBetween(sessions, brief.blockStartedAt, now).filter((t) => t.change !== 0),
  };
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

/** "HIP THRUST 70kg x 10". */
export function bestLine(best: Best): string {
  return `${title(best.name)} ${best.set.weightKg > 0 ? `${kg(best.set.weightKg)} x ${best.set.reps}` : `${best.set.reps} reps`}`;
}

/** "Hip thrust 60kg x 8 → 70kg x 10 (+15%)". */
export function trendLine(trend: Trend): string {
  const fmt = (s: { weightKg: number; reps: number }) =>
    s.weightKg > 0 ? `${kg(s.weightKg)} x ${s.reps}` : `${s.reps} reps`;
  const sign = trend.change > 0 ? "+" : "";
  return `${title(trend.name)} ${fmt(trend.from)} → ${fmt(trend.to)} (${sign}${trend.change}%)`;
}

/** "HIP THRUST" to "Hip thrust", for prose. */
export function title(name: string): string {
  const lower = name.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * What was read from her last reply, so she can see it was understood and
 * correct it if not. A loop that files replies silently has to show its
 * working somewhere, and the next workout is where she will look.
 */
export function heardLines(log: ReplyLog | null): string[] {
  if (!log) return [];
  const out: string[] = [];

  for (const e of log.exercises) {
    const what = e.skipped ? "skipped" : describeSets(e.sets) || e.effort || "noted";
    const effort = e.effort && e.sets.length ? `, ${e.effort}` : "";
    // Without the label: last session's B1 is not today's B1.
    out.push(`${title(e.name)}: ${what}${effort}`);
  }

  const c = log.checkIn;
  const rated = [
    c.energy ? `energy ${c.energy}/5` : "",
    c.sleep ? `sleep ${c.sleep}/5` : "",
    c.soreness ? `soreness ${c.soreness}/5` : "",
    c.enjoyment ? `fun ${c.enjoyment}/5` : "",
    c.periodStarted ? "period started" : c.cycleDay ? `cycle day ${c.cycleDay}` : "",
    ...c.symptoms,
  ].filter(Boolean);
  if (rated.length) out.push(rated.join(", "));
  if (c.pain.length) out.push(`Pain: ${c.pain.join("; ")}`);
  if (log.requests) out.push(`Asked for: ${log.requests}`);

  return out;
}

/** The latest reply's log across the most recent session that had one. */
export function lastLog(sessions: Session[]): { at: Date; log: ReplyLog } | null {
  const sorted = [...sessions].sort((a, b) => b.at.getTime() - a.at.getTime());
  const latest = sorted[0];
  if (!latest || latest.logs.length === 0) return null;

  // Several replies to one workout: merge them, later ones winning.
  const merged: ReplyLog = {
    exercises: [],
    checkIn: { ...latest.logs[0].checkIn },
    liked: [],
    disliked: [],
    requests: "",
  };
  for (const log of latest.logs) {
    for (const e of log.exercises) {
      const at = merged.exercises.findIndex((x) => (x.label && x.label === e.label) || x.name === e.name);
      if (at === -1) merged.exercises.push(e);
      else merged.exercises[at] = e;
    }
    const c = log.checkIn;
    merged.checkIn = {
      energy: c.energy || merged.checkIn.energy,
      sleep: c.sleep || merged.checkIn.sleep,
      soreness: c.soreness || merged.checkIn.soreness,
      enjoyment: c.enjoyment || merged.checkIn.enjoyment,
      periodStarted: c.periodStarted || merged.checkIn.periodStarted,
      cycleDay: c.cycleDay || merged.checkIn.cycleDay,
      symptoms: [...new Set([...merged.checkIn.symptoms, ...c.symptoms])],
      pain: [...new Set([...merged.checkIn.pain, ...c.pain])],
    };
    merged.requests = log.requests || merged.requests;
  }

  return { at: latest.at, log: merged };
}

/** "■■■■■■□□□□", filled to `done` out of the top of the range. */
export function bar(done: number, top: number, width = 10): string {
  const filled = top > 0 ? Math.max(0, Math.min(width, Math.round((done / top) * width))) : 0;
  return "■".repeat(filled) + "□".repeat(width - filled);
}
