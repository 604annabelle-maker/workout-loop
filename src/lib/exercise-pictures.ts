/**
 * Choosing which pictures go with a workout (design §Image attachments).
 *
 * Pure. The pictures themselves are vendored into assets/exercise-pictures by
 * `npm run vendor:pictures`; reading them off disk is ./picture-library.ts.
 *
 * Only the main exercises get pictures. Warm ups and stretches are short
 * items rather than movements to learn, and a picture beside every one of
 * them would bury the session itself.
 *
 * An exercise with no picture says so. Silently dropping one is worse than
 * admitting it, because on a phone with no browser there is no way to go and
 * look it up, and a gap with no explanation reads as a broken email.
 */

import { matchExerciseName, normalizeExerciseName } from "./exercise-name";

/**
 * Gym names the picture set spells differently, where word matching would
 * otherwise pick the wrong movement. "SIDE PLANK" shares every word with
 * "Push Up to Side Plank", which is a different exercise; the set's side
 * plank is called a side bridge.
 */
const ALIASES: Record<string, string> = {
  "side plank": "Side Bridge",
  "farmer carry": "Farmer's Walk",
  "farmers carry": "Farmer's Walk",
  "farmer walk": "Farmer's Walk",
  "med ball slam": "Overhead Slam",
  "medicine ball slam": "Overhead Slam",
};

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
 * Pictures for the exercises named, in the order named. The caller decides
 * which exercises deserve one; warm up items do not.
 */
export function picturesFor(index: PictureIndex, exercises: string[]): Pictured[] {
  const names = index.exercises.map((e) => e.name);

  return [...new Set(exercises)].map((exercise) => {
    const alias = ALIASES[normalizeExerciseName(exercise)];
    const aliased = alias ? names.indexOf(alias) : -1;
    const match = aliased !== -1 ? { at: aliased } : matchExerciseName(names, exercise);

    if (!match) return { exercise, shows: "", frames: [] };

    const found = index.exercises[match.at];

    return {
      exercise,
      // Named whenever the picture is not of exactly the movement asked for,
      // so a near-enough movement never passes as the one prescribed. A match
      // that covers every word asked for can still be a different exercise.
      shows: normalizeExerciseName(found.name) === normalizeExerciseName(exercise) ? "" : found.name,
      frames: found.files.map((file, frame) => ({
        cid: cidFor(found.id, frame),
        file,
      })),
    };
  });
}
