/**
 * Reading a reply into a log.
 *
 * Replies are the backup now: she logs by tapping in the email. A reply in
 * the short form ("done", "B1 hard 22 10 10 8, C1 skip") is read by the
 * shorthand reader in ./reply-log.ts, for free. Only a reply that reader can
 * make nothing of goes to the model, because she writes however she writes:
 * "hip thrusts were 70 all the way, last set only 7, felt amazing" is a good
 * reply and no pattern reads it.
 */

import { askForJson } from "./claude";
import { mainExercises, type Plan } from "./plan";
import {
  REPLY_LOG_SCHEMA,
  parseShorthand,
  readReplyLog,
  type Prescribed,
  type ReplyLog,
} from "./reply-log";

const SYSTEM = `You read one short email reply about a gym session and record what it says as data.

Record only what the reply actually says. Never infer a number, a rating or a
symptom that is not there. Something not mentioned is 0, false or empty, and
that is the usual case.

Exercises:
- Tie each exercise she mentions to a label from the plan when you can, by
  label ("A", "B1") or by name ("the RDLs", "hip thrusts"). Use the plan's
  name for it. If it cannot be tied, leave the label empty and use her words.
- One entry in sets per set she reports. "70 for 10, 10, 9" is three sets of
  70kg. "Did all sets at 70" with no reps is one entry per prescribed set at
  70kg with the prescribed reps only if the plan gives a single rep number;
  otherwise record the effort and no sets.
- Weights are kilograms. Convert pounds. Bodyweight is 0.
- effort: easy, right, hard or failed, only if she says so or it is plain
  ("couldn't finish the last set" is failed). Otherwise empty.
- skipped is true only if she says she did not do it.
- If she says "done", or names only some exercises, every other exercise in
  the plan is done as written: an entry with effort right and no sets.

Check in, each 1 to 5, 0 when not mentioned:
- energy, sleep, soreness (5 is very sore), enjoyment (5 is loved it).
- "felt amazing" is energy 5 or enjoyment 5 depending on what it describes.
- periodStarted true only if she says her period started. cycleDay only if
  she gives one, or 1 if it started that day.
- symptoms only as named: cramps, bloating, headache, fatigue.
- pain: each thing she says hurt, in her words. Soreness from training is
  not pain; a sharp or joint pain is.

liked and disliked: movements or formats she said she enjoyed or did not.
requests: anything she asks for next time, in her words, or empty.`;

function describe(plan: Plan): string {
  return mainExercises(plan)
    .map((e) => {
      const load = e.loadKg > 0 ? ` at ${e.loadKg}kg` : "";
      const sets = e.sets > 0 ? `${e.sets} x ${e.reps}` : e.reps;
      return `${e.label}. ${e.name}: ${sets}${load}`;
    })
    .join("\n");
}

export function prescribedOf(plan: Plan): Prescribed[] {
  return mainExercises(plan).map((e) => ({
    label: e.label,
    name: e.name,
    sets: e.sets,
    loadKg: e.loadKg,
  }));
}

/**
 * The log a reply carries. The plan is null for a workout from before plans
 * were structured; the reply is still read, just without labels to tie to.
 */
export async function readReply(body: string, plan: Plan | null): Promise<ReplyLog> {
  const short = parseShorthand(body, plan ? prescribedOf(plan) : []);
  if (!process.env.ANTHROPIC_API_KEY || short.exercises.length > 0) return short;

  const user = `THE PLAN
${plan ? describe(plan) : "Not available. Tie nothing to labels."}

HER REPLY
${body.trim()}`;

  const raw = await askForJson({
    system: SYSTEM,
    user,
    schema: REPLY_LOG_SCHEMA as unknown as Record<string, unknown>,
    effort: "low",
    maxTokens: 8_000,
  });

  return readReplyLog(raw);
}
