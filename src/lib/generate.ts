/**
 * Turning a session brief into a workout (design §Architecture).
 *
 * Without ANTHROPIC_API_KEY this returns a canned plan rather than throwing, so
 * the booking webhook, the mailer and the reply loop can all be exercised on a
 * laptop with nothing configured. The canned plan is a real `Plan`, built the
 * way the coach would ask for it, so everything downstream is genuinely
 * tested.
 */

import { askForJson, ClaudeError } from "./claude";
import type { Brief } from "./coach";
import { applyCoach } from "./coach";
import { PLAN_SCHEMA, readPlan, PlanError, type Plan } from "./plan";
import { buildPrompt, type PromptInput } from "./prompt";

/**
 * Generous. A plan runs to maybe 4,000 tokens of JSON, but adaptive thinking
 * is billed and capped out of the same budget, and a response cut off mid
 * object is worse than a slightly larger ceiling.
 */
const MAX_TOKENS = 32_000;

export interface Generated {
  plan: Plan;
  /** True when no API key was configured and this is the stand-in. */
  canned: boolean;
}

export class GenerationError extends Error {}

export async function generateWorkout(input: PromptInput): Promise<Generated> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { plan: applyCoach(cannedPlan(input.brief), input.brief), canned: true };
  }

  const { system, user } = buildPrompt(input);

  try {
    const raw = await askForJson({
      system,
      user,
      schema: PLAN_SCHEMA as unknown as Record<string, unknown>,
      // The coach has already made the decisions that need to be right; what
      // is left is choosing and describing movements. Medium is Opus 5.5's
      // default and keeps generation well inside the function's time limit.
      effort: "medium",
      maxTokens: MAX_TOKENS,
    });

    // The model proposes; the coach disposes. A load worked out from what she
    // actually lifted, and the rationing of failure sets, are not the
    // model's to change.
    return { plan: applyCoach(readPlan(raw), input.brief), canned: false };
  } catch (err) {
    if (err instanceof ClaudeError || err instanceof PlanError) {
      throw new GenerationError(err.message);
    }
    throw err;
  }
}

/**
 * A plan with the shape of a real one, for running without a key.
 *
 * Built from the brief so the stand-in still follows the rotation: a lower day
 * reads like a lower day, and the glutes day has its ab finisher. It is
 * deliberately ordinary.
 */
export function cannedPlan(brief: Brief): Plan {
  const lower = brief.session.half === "lower";
  const core = brief.budget.core > 0;

  const warmup = {
    kind: "warmup" as const,
    title: "Warm up",
    format: "circuit" as const,
    rounds: 1,
    minutes: brief.budget.warmup,
    instructions: "",
    exercises: [
      ex({ label: "W1", name: "BIKE", kind: "cardio", role: "warmup", reps: "3 min easy", cue: "Easy pace." }),
      ex({ label: "W2", name: lower ? "HIP AIRPLANE" : "BAND PULL APART", kind: "mobility", role: "warmup", reps: "8 each side", cue: "Slow and controlled." }),
    ],
  };

  const strength = {
    kind: "strength" as const,
    title: "Main lifts",
    format: "straight sets" as const,
    rounds: 0,
    minutes: 24,
    instructions: "",
    exercises: lower
      ? [
          ex({ label: "A", name: "BARBELL SQUAT", role: "heavy", sets: 4, reps: "3", range: "3-5", loadKg: 50, rir: 2, restSec: 180, cue: "Brace, then sit between the hips.", primary: ["quads", "glutes"], secondary: ["adductors"], swap: { name: "HACK SQUAT", reps: "5", loadKg: 60 } }),
          ex({ label: "B", name: "ROMANIAN DEADLIFT", role: "light", sets: 3, reps: "6", range: "6-8", loadKg: 40, rir: 2, restSec: 150, cue: "Hips back, long hamstrings.", primary: ["hamstrings", "glutes"], secondary: [], swap: { name: "DUMBBELL ROMANIAN DEADLIFT", reps: "8", loadKg: 16 } }),
        ]
      : [
          ex({ label: "A", name: "BENCH PRESS", role: "heavy", sets: 4, reps: "3", range: "3-5", loadKg: 35, rir: 1, restSec: 180, cue: "Shoulder blades back and down.", primary: ["chest"], secondary: ["triceps", "shoulders"], swap: { name: "DUMBBELL BENCH PRESS", reps: "5", loadKg: 14 } }),
          ex({ label: "B", name: "LAT PULLDOWN", role: "light", sets: 3, reps: "6", range: "6-8", loadKg: 35, rir: 2, restSec: 120, cue: "Elbows to back pockets.", primary: ["back"], secondary: ["biceps"], swap: { name: "ASSISTED PULL UP", reps: "6", loadKg: 0 } }),
        ],
  };

  const superset = {
    kind: "superset" as const,
    title: "Superset",
    format: "superset" as const,
    rounds: 3,
    minutes: 18,
    instructions: "C1 then C2, rest 75 sec after the pair.",
    exercises: lower
      ? [
          ex({ label: "C1", name: "BULGARIAN SPLIT SQUAT", role: "second", sets: 3, reps: "8", range: "6-10", loadKg: 10, rir: 2, restSec: 0, cue: "Lean in for glutes.", primary: ["glutes", "quads"], secondary: ["adductors"], loadNote: "per hand", swap: { name: "WALKING LUNGE", reps: "10", loadKg: 10 } }),
          ex({ label: "C2", name: "LEG EXTENSION", role: "accessory", sets: 3, reps: "10", range: "8-15", loadKg: 25, rir: 1, restSec: 0, cue: "Squeeze at the top.", primary: ["quads"], secondary: [], swap: { name: "SISSY SQUAT", reps: "10", loadKg: 0 } }),
        ]
      : [
          ex({ label: "C1", name: "TRICEPS PUSHDOWN", role: "accessory", sets: 3, reps: "10", range: "8-15", loadKg: 15, rir: 1, restSec: 0, cue: "Elbows pinned.", primary: ["triceps"], secondary: [], swap: { name: "BENCH DIPS", reps: "10", loadKg: 0 } }),
          ex({ label: "C2", name: "INCLINE DUMBBELL CURL", role: "accessory", sets: 3, reps: "10", range: "8-15", loadKg: 6, rir: 1, restSec: 0, cue: "Arms hang behind you.", primary: ["biceps"], secondary: [], loadNote: "per hand", swap: { name: "CABLE CURL", reps: "10", loadKg: 15 } }),
        ],
  };

  const abs = {
    kind: "core" as const,
    title: "Ab finisher",
    format: "circuit" as const,
    rounds: 3,
    minutes: brief.budget.core,
    instructions: "K1 then K2, three rounds.",
    exercises: [
      ex({ label: "K1", name: "CABLE CRUNCH", kind: "core", role: "core", sets: 3, reps: "12", range: "8-15", loadKg: 20, rir: 2, cue: "Curl the ribs down.", primary: ["core"], secondary: [], swap: { name: "CRUNCH", reps: "15", loadKg: 0 } }),
      ex({ label: "K2", name: "DEAD BUG", kind: "core", role: "core", sets: 3, reps: "8 each side", cue: "Low back stays down.", primary: ["core"], secondary: [], swap: { name: "SIDE PLANK", reps: "30 sec", loadKg: 0 } }),
    ],
  };

  return {
    title: brief.session.name,
    focus: brief.session.primary.join(", "),
    blocks: core ? [warmup, strength, superset, abs] : [warmup, strength, superset],
  };
}

type Exercise = Plan["blocks"][number]["exercises"][number];

function ex(
  e: Partial<Omit<Exercise, "swap">> & { label: string; name: string; swap?: { name: string; reps: string; loadKg: number } },
): Exercise {
  return {
    label: e.label,
    name: e.name,
    kind: e.kind ?? "lift",
    role: e.role ?? "accessory",
    sets: e.sets ?? 0,
    reps: e.reps ?? "",
    range: e.range ?? "",
    loadKg: e.loadKg ?? 0,
    loadNote: e.loadNote ?? "",
    rir: e.rir ?? -1,
    lastSetToFailure: false,
    restSec: e.restSec ?? 0,
    cue: e.cue ?? "",
    howTo: `${e.name.charAt(0)}${e.name.slice(1).toLowerCase()}, done with control. ${e.cue ?? ""}`.trim(),
    primary: e.primary ?? [],
    secondary: e.secondary ?? [],
    anchor: e.role === "heavy" || e.role === "light",
    swap: e.swap ? { ...e.swap, loadNote: "", howTo: "" } : null,
  };
}

export { PlanError };
