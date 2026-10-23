/**
 * Building the generation prompt (design §History window, §The workout email).
 *
 * Pure. Everything the model is told is decided here, so the interesting part of
 * this project can be read, diffed and tested without a key or a database.
 */

import { lastLiftedLines } from "./progression";
import { dateAndTime } from "./when";
import { DESCRIPTIONS_HEADING } from "./workout-shape";

/**
 * How many past workouts the model sees. Enough at three sessions a week to
 * rotate muscle groups and progress load, without the prompt growing forever.
 * A constant rather than a setting: there is no reason to tune it per person
 * when there is only one person.
 */
export const HISTORY_WINDOW = 6;

/**
 * How much of a past workout is replayed as history.
 *
 * Long enough to reach the end of a full session, loading lines included,
 * because progression reads those: a session truncated mid way through is a
 * session whose last two exercises look as though they never happened.
 */
const HISTORY_EXCERPT_CHARS = 1_000;

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

They read it on a phone with a very small screen and no web browser, so the
message you write is the whole thing. There is nothing to click and nothing to
look up. They read it between sets, standing up, so it has to be scannable at a
glance rather than merely correct.

Write in plain text. No markdown, no asterisks, no pound signs, no bullet
characters beyond a plain hyphen. Anything else shows up as literal punctuation
on their screen.

Keep every line under 50 characters. A line that wraps on a narrow screen
breaks the layout and is the main thing that makes these hard to read.

Structure your response as exactly two parts.

PART ONE, the session. Use these headings, each alone on its line in capitals,
with a blank line before and after:

FOCUS
WARM UP
THE SESSION
FINISH

Under FOCUS, a single line naming the one or two muscle groups this session
works, and nothing else. "Back and biceps". "Legs". It is the first thing they
read, so it says what today is for.

Under WARM UP and FINISH, one short line per item.

Under THE SESSION, exactly two lines per exercise:

  Line one: the number, a full stop, a space, the exercise name in capitals,
  two spaces, then the sets and reps. Nothing else. This is the line they read
  mid set, so it must be short and it must never wrap.

  Line two: the loading and the rest, indented three spaces. One sentence.
  Under 50 characters. Name an actual weight in kg whenever the movement takes
  one, because a weight is the thing that gets progressed and "moderate" can
  never be beaten.

Name exercises the way a gym does, and the same way every time: SMITH
OVERHEAD PRESS stays SMITH OVERHEAD PRESS. A movement renamed between
sessions reads as a different movement and its loading history is lost.

Leave one blank line between exercises. Do not restate the date, the duration,
or anything else they already know.

PART TWO. A line containing only ${DESCRIPTIONS_HEADING}, then for every
exercise you named above, including the warm up ones: its name in capitals
alone on a line, then two or three sentences saying which muscle it works, how
it is performed, and the one mistake most worth avoiding. Leave a blank
line between them. Keep these lines under 50 characters too.

Work one or two muscle groups per session and work them properly. Not a
circuit, not a bit of everything.

Choose which groups from the recent sessions listed below, and from nothing
else. They train when they book, which is irregular, so there is no week to
balance and no schedule to fill. Read the sessions in order and pick whatever
has gone longest without attention. Never repeat what the session immediately
before worked.

The dates on those sessions matter as much as their contents. Two days since
the last one is different from two weeks, and a long gap means starting
somewhere forgiving rather than picking up where they left off.

When there are no recent sessions at all, choose whichever groups give the
broadest base to build from, and say nothing about it being a first session.

Fit the session to the time available. Only prescribe what the listed equipment
allows. Respect anything they have said to avoid, without exception and without
mentioning that you are doing so.

Look at what they have trained recently and choose something that follows from
it, rather than repeating it. If they told you a session was too easy, too hard,
or hurt, that is the single most important thing you know.

PROGRESSIVE OVERLOAD. This is the point of the whole thing, not a bonus. They
are trying to get stronger, which only happens if the work gets harder over
time, and it only gets harder if you can see what it was last time.

WHAT THEY LAST LIFTED below gives the most recent loading for each movement.
Use it:

- Keep the main lifts for a muscle group the same from session to session, so
  there is something to beat. Two or three anchors per group, then vary the
  smaller work. Rotating every exercise feels varied and progresses nothing.
- When a movement is listed, prescribe the next step up: usually the smallest
  increment the gym allows, 2.5kg on a bar or machine, 1 to 2kg a dumbbell.
  Where the weight cannot move that finely, add a rep or a set instead, and
  only then go up in weight.
- Say what the step is on the loading line, in their units: "12.5kg a side, up
  2.5kg on last time". They are standing at the machine when they read it, so
  it has to be a number and not an instruction to judge.
- Hold the load, or drop it, when a reply said it was too hard, or something
  hurt, or there has been a long gap. One honest easy session is worth more
  than a number that cannot be hit. Say so in one short line when you do.
- When a movement has never been done, pick a sensible starting weight and
  say it plainly, so there is something to progress from next time.

Give no preamble, no sign-off and no encouragement. Start with the FOCUS
heading.`;

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

  const lifted = lastLiftedLines(recent);

  const user = `ABOUT THEM
${about}

RECENT SESSIONS, oldest first
${past}

WHAT THEY LAST LIFTED, most recent first
${lifted || "Nothing yet. Pick sensible starting weights."}

THIS SESSION
${dateAndTime(slot.startsAt)}, ${slot.minutes} minutes.`;

  return { system: SYSTEM, user };
}
