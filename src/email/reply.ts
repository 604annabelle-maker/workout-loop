/**
 * A reply to a v2 workout, read in code (spec §Logging in, reply shorthand).
 *
 * Pure. For the plain versions, logged by replying: "done" logs everything
 * as written; otherwise one line per exercise that was different, such as
 * "RDL 42.5 8 8 7 hard" or "swap leg press 40 10 done". Exercise names are
 * matched against that workout's own cards only. Lines that are not
 * shorthand are her words, and go to the comment reader.
 */

import { whichExercise } from "../memory/read";
import { exercise } from "../training/catalogue";
import { isWeighted, loadable, nearest, type Equipment } from "../training/equipment";
import type { LogEntry, PlanV2, Tap } from "../training/types";

export interface ReplyRead {
  /** "done" on its own: everything not otherwise logged, as written. */
  allDone: boolean;
  entries: LogEntry[];
  /** What is left over, for the comment reader. */
  words: string;
}

/** Common short names, so "RDL" finds a Romanian deadlift. */
const ALIASES: [RegExp, string][] = [
  [/\brdl\b/i, "romanian deadlift"],
  [/\bohp\b/i, "overhead press"],
  [/\bdb\b/i, "dumbbell"],
  [/\bbss\b/i, "bulgarian split squat"],
  [/\bsldl\b/i, "romanian deadlift"],
];

const TAPS: Tap[] = ["easy", "done", "hard"];

export function asLogged(plan: PlanV2, slot: string): LogEntry | null {
  const x = plan.exercises.find((e) => e.slot === slot);
  if (!x) return null;
  return { slot, exerciseId: x.main.exerciseId, usedSwap: false, weight: x.main.weight, reps: Array(x.sets).fill(x.main.reps), tap: "done" };
}

export function readShorthand(body: string, plan: PlanV2, equipment: Equipment): ReplyRead {
  const lines = body.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const entries: LogEntry[] = [];
  const words: string[] = [];
  let allDone = false;

  for (const raw of lines) {
    const line = ALIASES.reduce((s, [re, to]) => s.replace(re, to), raw);
    if (/^(all\s+)?done[.!]*$/i.test(line)) {
      allDone = true;
      continue;
    }
    const swap = /^swap\b/i.test(line);
    const text = line.replace(/^swap\s+/i, "");
    const numbers = [...text.matchAll(/(\d+(?:[.,]\d+)?)/g)].map((m) => Number(m[1].replace(",", ".")));
    const tapWord = TAPS.find((t) => new RegExp(`\\b${t}\\b`, "i").test(text)) ?? null;
    const name = text.replace(/\d+(?:[.,]\d+)?\s*(kg|x|×)?/gi, " ").replace(/\b(easy|done|hard)\b/gi, " ").trim();

    const ids = plan.exercises.flatMap((x) => [x.main.exerciseId, ...(x.swap ? [x.swap.exerciseId] : [])]);
    const id = name ? whichExercise(name, ids) : null;
    if (!id || (!numbers.length && !tapWord)) {
      words.push(raw);
      continue;
    }
    const planned = plan.exercises.find((x) => x.main.exerciseId === id || x.swap?.exerciseId === id)!;
    const usedSwap = swap || planned.swap?.exerciseId === id;
    const p = usedSwap && planned.swap ? planned.swap : planned.main;
    const e = exercise(p.exerciseId);
    const weighted = e ? isWeighted(e.load) : p.weight !== null;
    let weight = weighted ? p.weight : null;
    let reps = numbers;
    // With a weight: the first number is the weight when there are more numbers than one, or when it is not a plausible rep count.
    if (weighted && numbers.length > 1) {
      weight = nearest(numbers[0], loadable(p.load, equipment)) ?? numbers[0];
      reps = numbers.slice(1);
    }
    reps = reps.filter((r) => Number.isInteger(r) && r > 0 && r <= 50);
    if (!reps.length) reps = Array(planned.sets).fill(p.reps);
    if (reps.length === 1 && planned.sets > 1) reps = Array(planned.sets).fill(reps[0]);
    entries.push({ slot: planned.slot, exerciseId: p.exerciseId, usedSwap, weight, reps, tap: tapWord ?? "done" });
  }
  return { allDone, entries, words: words.join("\n") };
}
