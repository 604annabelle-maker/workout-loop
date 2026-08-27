/**
 * Building the generation prompt (design §History window, §The workout email).
 *
 * Pure. Everything the model is told is decided here, so the interesting part of
 * this project can be read, diffed and tested without a key or a database.
 */

import { dateAndTime } from "./when";

/**
 * How many past workouts the model sees. Enough at three sessions a week to
 * rotate muscle groups and progress load, without the prompt growing forever.
 * A constant rather than a setting: there is no reason to tune it per person
 * when there is only one person.
 */
export const HISTORY_WINDOW = 6;

/**
 * The line that separates the workout from the explanations.
 *
 * Shared rather than described in prose, because the mailer splits on it and a
 * drift between the two would put the glossary in the wrong half of the email.
 */
export const DESCRIPTIONS_HEADING = "HOW TO DO THESE";

/** How much of a past workout is replayed as history. */
const HISTORY_EXCERPT_CHARS = 600;

export interface Preferences {
  goals: string;
  experience: string;
  trainingDaysPerWeek: number;
  /** Injuries and movements to stay away from. */
  avoid: string;
  /** What is actually in the gym. */
  equipment: string;
  /** Anything else, in their own words. */
  brief: string;
}

export interface PastWorkout {
  slotStartsAt: Date;
  planText: string;
  /** Replies filed against it. Usually none. */
  feedback: string[];
}

export interface Slot {
  startsAt: Date;
  minutes: number;
}

export interface Prompt {
  system: string;
  user: string;
}

/**
 * A past workout as history.
 *
 * The explanations are dropped. They are near-identical boilerplate every time,
 * and replaying six of them would triple the prompt to tell the model things it
 * already knows. Only the session itself carries information about what was
 * trained and how hard.
 */
function asHistory(workout: PastWorkout): string {
  const [session] = workout.planText.split(DESCRIPTIONS_HEADING);
  const trimmed = session.trim();

  const excerpt =
    trimmed.length > HISTORY_EXCERPT_CHARS
      ? `${trimmed.slice(0, HISTORY_EXCERPT_CHARS).trimEnd()}...`
      : trimmed;

  const notes = workout.feedback
    .map((f) => f.trim())
    .filter(Boolean)
    .map((f) => `  Afterwards they said: ${f}`)
    .join("\n");

  return [`${dateAndTime(workout.slotStartsAt)}`, excerpt, notes].filter(Boolean).join("\n");
}

const SYSTEM = `You write one gym workout at a time for a single person who trains alone.

They read it on a phone that cannot open a web browser, so the message you write
is the whole thing. There is nothing to click and nothing to look up.

Write in plain text. No markdown, no asterisks, no pound signs, no bullet
characters beyond a plain hyphen. Anything else shows up as literal punctuation
on their screen.

Structure your response as exactly two parts:

1. The session. Exercises in order, with sets, reps and rough loading or
   intensity. Terse enough to follow between sets. Do not restate the date, the
   duration, or anything else they already know.
2. A line containing only ${DESCRIPTIONS_HEADING}, then a short description of
   every exercise you used above: how it is performed, what it should feel like,
   and the one mistake most worth avoiding. Two or three sentences each. Cover
   every exercise you named, including the familiar ones.

Fit the session to the time available. Only prescribe what the listed equipment
allows. Respect anything they have said to avoid, without exception and without
mentioning that you are doing so.

Look at what they have trained recently and choose something that follows from
it, rather than repeating it. If they told you a session was too easy, too hard,
or hurt, that is the single most important thing you know.

Give no preamble, no sign-off and no encouragement. Start with the first
exercise.`;

export function buildPrompt(
  preferences: Preferences,
  history: PastWorkout[],
  slot: Slot,
): Prompt {
  const recent = history.slice(-HISTORY_WINDOW);

  const about = [
    `Goals: ${preferences.goals || "not stated"}`,
    `Experience: ${preferences.experience || "not stated"}`,
    `Trains about ${preferences.trainingDaysPerWeek} days a week`,
    `Avoid: ${preferences.avoid || "nothing stated"}`,
    `Equipment in the gym: ${preferences.equipment || "not stated"}`,
    preferences.brief.trim() ? `In their words: ${preferences.brief.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const past =
    recent.length > 0
      ? recent.map(asHistory).join("\n\n")
      : "Nothing yet. This is the first session.";

  const user = `ABOUT THEM
${about}

RECENT SESSIONS, oldest first
${past}

THIS SESSION
${dateAndTime(slot.startsAt)}, ${slot.minutes} minutes.`;

  return { system: SYSTEM, user };
}
