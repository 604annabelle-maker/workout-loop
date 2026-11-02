/**
 * The vendored pictures on disk.
 *
 * The only place that knows where they live. Everything else works in file
 * names, so the choosing is pure (./exercise-pictures.ts) and the reading is
 * here.
 *
 * Never throws. A missing or unreadable set means a workout with no pictures,
 * which is the email this project sent for its first month and is still a
 * perfectly good workout. It must never mean no email.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { picturesFor, type PictureIndex, type Pictured } from "./exercise-pictures";

/**
 * Relative to the process root, which is the project root both locally and in
 * a Vercel function. next.config.ts has to name this directory so the
 * deployment carries it; a function only ships the files it is traced to use,
 * and these are read by name rather than imported.
 */
const DIRECTORY = path.join("assets", "exercise-pictures");

const EMPTY: PictureIndex = { exercises: [] };

let loaded: PictureIndex | null = null;

/** Read once per process. 873 exercises of names, and it never changes. */
function index(): PictureIndex {
  if (loaded) return loaded;

  try {
    const file = path.join(process.cwd(), DIRECTORY, "index.json");
    const parsed = JSON.parse(readFileSync(file, "utf8")) as PictureIndex;
    loaded = Array.isArray(parsed.exercises) ? parsed : EMPTY;
  } catch (err) {
    console.error(`exercise pictures unavailable, sending without them: ${err}`);
    loaded = EMPTY;
  }

  return loaded;
}

/** Where a vendored picture actually is, for the mailer to attach. */
export function pictureFile(file: string): string {
  return path.join(process.cwd(), DIRECTORY, path.basename(file));
}

export function workoutPictures(exercises: string[]): Pictured[] {
  const set = index();

  /*
   * No set at all is a different thing from no picture for an exercise. The
   * mailer says so when a movement is missing from a set it searched, which is
   * right; saying it under every exercise because the directory did not load
   * would be noise about something she cannot do anything about.
   */
  if (set.exercises.length === 0) return [];

  return picturesFor(set, exercises);
}
