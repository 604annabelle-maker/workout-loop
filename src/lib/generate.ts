/**
 * Turning a prompt into a workout (design §Architecture).
 *
 * Without ANTHROPIC_API_KEY this returns a canned plan rather than throwing, so
 * the booking webhook, the mailer and the reply loop can all be exercised on a
 * laptop with nothing configured. The canned plan carries the same shape as a
 * real one, heading and descriptions included, so anything downstream that
 * splits on that heading is genuinely tested.
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  DESCRIPTIONS_HEADING,
  buildPrompt,
  type PastWorkout,
  type Preferences,
  type Slot,
} from "./prompt";

const MODEL = "claude-opus-5";

/**
 * Generous. A workout and its descriptions run to maybe 2,000 tokens, but
 * adaptive thinking is billed and capped out of the same budget, and a response
 * cut off mid-sentence is worse than a slightly larger ceiling.
 */
const MAX_TOKENS = 16_000;

export interface Generated {
  planText: string;
  /** True when no API key was configured and this is the stand-in. */
  canned: boolean;
}

export class GenerationError extends Error {}

const CANNED = `[canned plan: ANTHROPIC_API_KEY is not set]

WARM UP

5 min easy: bodyweight squats and hinges
Goblet squat: light set of 8

THE SESSION

1. GOBLET SQUAT  3x8
   Moderate weight. Rest 90 sec.

2. ROMANIAN DEADLIFT  3x8
   Stop at the stretch. Rest 90 sec.

3. DUMBBELL ROW  3x10 each side
   Pull to the hip. Rest 60 sec.

FINISH

4. PLANK  3x40 sec

${DESCRIPTIONS_HEADING}

GOBLET SQUAT
Hold a dumbbell against your chest and sit
straight down between your hips, heels flat.
It should feel like your thighs are working.
Do not lean forward as you stand up.

ROMANIAN DEADLIFT
Knees slightly bent, push your hips back and
let the weight travel down your thighs. You
should feel a stretch in the hamstrings, not
the lower back. Stop when the stretch arrives.

DUMBBELL ROW
Brace one hand on a bench and pull the bell to
your hip, not your shoulder. It should feel
like your back pulling, not your arm. Do not
twist your torso to get the weight up.

PLANK
Elbows under shoulders, hips level with them.
It should feel like your stomach holding you
up. Do not let your hips drift upwards.`;

export async function generateWorkout(
  preferences: Preferences,
  history: PastWorkout[],
  slot: Slot,
): Promise<Generated> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { planText: CANNED, canned: true };
  }

  const { system, user } = buildPrompt(preferences, history, slot);
  const client = new Anthropic();

  /*
   * Streamed rather than awaited whole. The response is long enough that a
   * non-streaming request risks the SDK's HTTP timeout, and streaming costs
   * nothing here because nobody is watching it arrive.
   */
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    thinking: { type: "adaptive" },
    system,
    messages: [{ role: "user", content: user }],
  });

  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") {
    throw new GenerationError(
      `The model declined to answer (${message.stop_details?.category ?? "no category"}).`,
    );
  }

  const planText = message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  if (!planText) {
    throw new GenerationError("The model returned no text.");
  }

  if (message.stop_reason === "max_tokens") {
    // Truncated mid-sentence. Better to retry than to send half a workout.
    throw new GenerationError(`Ran out of tokens at ${MAX_TOKENS}.`);
  }

  return { planText, canned: false };
}
