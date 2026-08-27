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

Goblet squat 3x8, moderate weight
Romanian deadlift 3x8
Dumbbell row 3x10 each side
Plank 3x40 seconds

${DESCRIPTIONS_HEADING}

Goblet squat: hold a dumbbell against your chest and sit straight down between
your hips, keeping your heels flat. It should feel like your thighs are doing
the work. The usual mistake is leaning forward as you stand up.

Romanian deadlift: with a slight bend in the knees, push your hips backwards
and let the weight travel down your thighs. You should feel a stretch in your
hamstrings, not in your lower back. Stop lowering when the stretch arrives.

Dumbbell row: brace one hand on a bench, pull the dumbbell to your hip rather
than your shoulder. It should feel like your back is pulling, not your arm.
The usual mistake is twisting your torso to get the weight up.

Plank: elbows under shoulders, hips level with your shoulders. It should feel
like your stomach is holding you up. The usual mistake is letting your hips
drift upwards to make it easier.`;

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
