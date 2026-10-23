/**
 * Choosing which pictures go with a workout (design §Image attachments).
 *
 * Pure. The pictures themselves are vendored into assets/exercise-pictures by
 * `npm run vendor:pictures`; reading them off disk is ./picture-library.ts.
 *
 * Only the numbered exercises get pictures. Warm ups and stretches are lines
 * of prose rather than named movements, and a picture beside every one of them
 * would bury the session itself.
 *
 * An exercise with no picture says so. Silently dropping one is worse than
 * admitting it, because on a phone with no browser there is no way to go and
 * look it up, and a gap with no explanation reads as a broken email.
 */

import { matchExerciseName } from "./exercise-name";
import { shapePlan } from "./workout-shape";

/** One exercise in the vendored set, as index.json records it. */
export interface PictureSet {
  id: string;
  name: string;
  /** File names, in order: the start of the movement, then the end. */
  files: string[];
}

export interface PictureIndex {
  exercises: PictureSet[];
}

export interface Frame {
  /** The Content-ID the HTML refers to, without angle brackets. */
  cid: string;
  file: string;
}

export interface Pictured {
  /** The exercise as prescribed, which is how the renderer finds its place. */
  exercise: string;
  /**
   * What the pictures are actually of. Empty when it is the same movement
   * under the same name, which is the usual case and needs no caption.
   */
  shows: string;
  /** Empty when nothing in the set matched. */
  frames: Frame[];
}

/** Stable, so the same plan always produces the same message. */
function cidFor(id: string, frame: number): string {
  return `exercise-${id.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${frame}@workout-loop`;
}

/**
 * The exercises a plan actually prescribes, in order.
 *
 * Exported because the prompt side needs the same list to work out what was
 * loaded last time, and two definitions of "the exercises in this plan" would
 * eventually disagree.
 */
export function exercisesIn(planText: string): string[] {
  return shapePlan(planText)
    .sections.flatMap((section) => section.exercises)
    .map((exercise) => exercise.name)
    .filter(Boolean);
}

export function picturesFor(index: PictureIndex, planText: string): Pictured[] {
  const names = index.exercises.map((e) => e.name);

  return exercisesIn(planText).map((exercise) => {
    const match = matchExerciseName(names, exercise);

    if (!match) return { exercise, shows: "", frames: [] };

    const found = index.exercises[match.at];

    return {
      exercise,
      // Named only when it is not what was asked for, so the caption earns its
      // line: a picture of a near-enough movement must not pass as the one
      // prescribed.
      shows: match.score === 1 ? "" : found.name,
      frames: found.files.map((file, frame) => ({
        cid: cidFor(found.id, frame),
        file,
      })),
    };
  });
}
