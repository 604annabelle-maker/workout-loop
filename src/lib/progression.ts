/**
 * Progressive overload: knowing what was lifted last time.
 *
 * Pure. Getting stronger means beating a number, which means the number has to
 * be in front of her while she is standing at the machine. The plans are
 * already stored, so the history is already there; this reads it back out per
 * movement rather than per session.
 *
 * Two uses, and they must agree. The model is told what each movement was last
 * loaded at so it can prescribe the next step up, and the email prints it
 * under the exercise so the prescription can be checked against what actually
 * happened.
 *
 * Nothing here measures what she really lifted. It knows what was prescribed,
 * and a reply is what corrects that, which is exactly the loop the rest of the
 * project is built on.
 */

import { matchExerciseName } from "./exercise-name";
import type { PastWorkout } from "./prompt";
import { dateOnly } from "./when";
import { shapePlan } from "./workout-shape";

export interface Lifted {
  /** The exercise, spelled as whoever is asking spells it. */
  exercise: string;
  when: Date;
  /** "4 x 8". Empty if the line carried no sets. */
  sets: string;
  /** The loading line as it was written: "10kg a side. Rest 2 min." */
  note: string;
}

/**
 * The last time each movement was trained, most recent first.
 *
 * One entry per movement, not per session: the question being answered is
 * "what did I put on the bar for this", and the answer is the most recent one.
 */
export function lastLifted(history: PastWorkout[]): Lifted[] {
  const latest = new Map<string, Lifted>();

  // Oldest first, so a later session simply overwrites an earlier one.
  for (const workout of history) {
    for (const section of shapePlan(workout.planText).sections) {
      for (const exercise of section.exercises) {
        if (!exercise.name) continue;

        latest.set(exercise.name.toUpperCase(), {
          exercise: exercise.name,
          when: workout.slotStartsAt,
          sets: exercise.sets,
          note: exercise.note,
        });
      }
    }
  }

  return [...latest.values()].sort((a, b) => b.when.getTime() - a.when.getTime());
}

/**
 * For the exercises in a plan, what each was last loaded at.
 *
 * Keyed on the name as this plan spells it, because that is what the mailer has
 * in hand when it renders the line. The movement is recognised across
 * spellings, so a squat written two ways is still the same squat.
 */
export function lastTimeFor(planText: string, history: PastWorkout[]): Lifted[] {
  const done = lastLifted(history);
  if (done.length === 0) return [];

  const names = done.map((d) => d.exercise);
  const out: Lifted[] = [];

  for (const section of shapePlan(planText).sections) {
    for (const exercise of section.exercises) {
      if (!exercise.name) continue;

      const match = matchExerciseName(names, exercise.name);
      if (!match) continue;

      out.push({ ...done[match.at], exercise: exercise.name });
    }
  }

  return out;
}

/** How many movements the model is reminded of. Six sessions' worth, capped. */
const TOLD_ABOUT = 20;

/**
 * The same history as lines for the prompt.
 *
 * Per movement rather than per session, because load is progressed per
 * movement. The sessions themselves are listed separately, and they are what
 * says which muscle group is due; this says what to put on the bar when it is.
 */
export function lastLiftedLines(history: PastWorkout[]): string {
  const done = lastLifted(history).slice(0, TOLD_ABOUT);
  if (done.length === 0) return "";

  return done
    .map((lift) => {
      const load = [lift.sets, lift.note].filter(Boolean).join(", ");
      return `${lift.exercise} - ${dateOnly(lift.when)}: ${load || "no load recorded"}`;
    })
    .join("\n");
}
