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
import { enforceTargets } from "./coach";
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
    return { plan: enforceTargets(cannedPlan(input.brief), input.brief), canned: true };
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

    // The model proposes; the progression rules dispose. A load the coach
    // worked out from what she actually lifted is not the model's to change.
    return { plan: enforceTargets(readPlan(raw), input.brief), canned: false };
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
 * reads like a lower day. It is deliberately ordinary.
 */
export function cannedPlan(brief: Brief): Plan {
  const lower =
    brief.session.half === "lower" ||
    (brief.session.half === "full" && (brief.session.primary.includes("glutes") || brief.session.primary.includes("quads")) && brief.sessionNumber % 2 === 1);

  const warmup = {
    kind: "warmup" as const,
    title: "Warm up",
    format: "circuit" as const,
    rounds: 1,
    minutes: 6,
    instructions: "Easy pace. Get warm, not tired.",
    exercises: [
      ex("W1", "BIKE", "cardio", 0, "3 min easy", 0, "Nose breathing pace.", [], []),
      ex("W2", "WORLD'S GREATEST STRETCH", "mobility", 0, "3 each side", 0, "Slow and long.", [], []),
      ex("W3", "SINGLE LEG BALANCE REACH", "mobility", 0, "5 each side", 0, "Soft knee, tall chest.", [], []),
    ],
  };

  const primer = {
    kind: "primer" as const,
    title: lower ? "Jump primer" : "Throw primer",
    format: "straight sets" as const,
    rounds: 0,
    minutes: 5,
    instructions: "Fast and crisp. Full rest, these are not cardio.",
    exercises: lower
      ? [ex("P", "BOX JUMP", "jump", 4, "5", 0, "Land quiet, step down.", ["quads", "glutes"], ["calves"], 45)]
      : [ex("P", "MED BALL SLAM", "throw", 4, "6", 6, "Reach tall, slam hard.", ["core"], ["back"], 45)],
  };

  const strength = {
    kind: "strength" as const,
    title: lower ? "Glute strength" : "Back strength",
    format: "straight sets" as const,
    rounds: 0,
    minutes: 15,
    instructions: "",
    exercises: lower
      ? [ex("A", "HIP THRUST", "lift", 4, "6-10", 50, "Ribs down, squeeze at top.", ["glutes"], ["hamstrings"], 150, true, 2)]
      : [ex("A", "LAT PULLDOWN", "lift", 4, "6-10", 35, "Elbows to back pockets.", ["back"], ["biceps"], 120, true, 2)],
  };

  const superset = {
    kind: "superset" as const,
    title: "Superset",
    format: "superset" as const,
    rounds: 3,
    minutes: 14,
    instructions: "B1 then B2, rest 75 sec after the pair.",
    exercises: lower
      ? [
          ex("B1", "DUMBBELL ROMANIAN DEADLIFT", "lift", 3, "8-12", 16, "Hips back, long hamstrings.", ["hamstrings", "glutes"], [], 0, true, 2),
          ex("B2", "BULGARIAN SPLIT SQUAT", "lift", 3, "8-10 each", 10, "Lean in for glutes.", ["glutes", "quads"], ["adductors"], 0, false, 2),
        ]
      : [
          ex("B1", "ONE ARM DUMBBELL ROW", "lift", 3, "8-12 each", 16, "Pull to the hip.", ["back"], ["biceps"], 0, true, 2),
          ex("B2", "DUMBBELL SHOULDER PRESS", "lift", 3, "8-12", 9, "Ribs down, press up.", ["shoulders"], ["triceps"], 0, false, 2),
        ],
  };

  const finisher = {
    kind: "finisher" as const,
    title: "EMOM finisher",
    format: "EMOM" as const,
    rounds: 8,
    minutes: 8,
    instructions: "Every minute on the minute for 8 min. Odd minutes C1, even minutes C2.",
    exercises: [
      ex("C1", "KETTLEBELL SWING", "lift", 0, "15", 16, "Snap the hips.", ["glutes", "hamstrings"], ["core"]),
      ex("C2", "FARMER CARRY", "carry", 0, "40 m", 20, "Tall and quiet.", ["core"], ["back"]),
    ],
  };

  return {
    title: brief.session.name,
    focus: brief.session.focus,
    why: "A canned plan: ANTHROPIC_API_KEY is not set.",
    blocks: [warmup, primer, strength, superset, finisher],
    tip: "",
  };
}

function ex(
  label: string,
  name: string,
  kind: Plan["blocks"][number]["exercises"][number]["kind"],
  sets: number,
  reps: string,
  loadKg: number,
  cue: string,
  primary: Plan["blocks"][number]["exercises"][number]["primary"],
  secondary: Plan["blocks"][number]["exercises"][number]["secondary"],
  restSec = 0,
  anchor = false,
  rir = -1,
): Plan["blocks"][number]["exercises"][number] {
  return {
    label,
    name,
    kind,
    sets,
    reps,
    loadKg,
    loadNote: "",
    rir,
    restSec,
    cue,
    howTo: `${name.charAt(0)}${name.slice(1).toLowerCase()}, done with control. ${cue}`,
    primary,
    secondary,
    anchor,
  };
}

export { PlanError };
