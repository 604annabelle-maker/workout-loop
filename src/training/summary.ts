/**
 * The weekly summary (spec §The email, item 7).
 *
 * Pure. Sets per muscle since Sunday, against the target, as rows the email
 * shows. Sets she logged before today count as done; today's plan is shown
 * as planned on top. It starts over each Sunday, in Jerusalem.
 */

import { volumeOf } from "./check";
import { LABEL, TARGETED, type Targeted } from "./rules";
import type { Targets } from "./skeleton";
import type { PlanV2, SessionRecord } from "./types";

export interface SummaryRow {
  muscle: Targeted;
  label: string;
  done: number;
  today: number;
  target: number;
}

const r1 = (n: number) => Math.round(n * 2) / 2;

export function weekSummary(input: { history: SessionRecord[]; today: PlanV2; weekStart: Date; targets: Targets }): SummaryRow[] {
  const logged = input.history
    .filter((s) => s.date >= input.weekStart)
    .flatMap((s) => s.logs.map((l) => ({ exerciseId: l.exerciseId, sets: l.reps.length })));
  const done = volumeOf(logged);
  const today = volumeOf(input.today.exercises.map((x) => ({ exerciseId: x.main.exerciseId, sets: x.sets })));
  return TARGETED.map((m) => ({ muscle: m, label: LABEL[m], done: r1(done[m] ?? 0), today: r1(today[m] ?? 0), target: input.targets[m] }));
}
