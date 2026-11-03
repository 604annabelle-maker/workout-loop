/**
 * The vendored pictures on disk.
 *
 * The only place that knows where they live. Everything else works in file
 * names, so the choosing is pure (./exercise-pictures.ts) and the reading is
 * here. Two sets: line drawings, and photos for what the drawings miss.
 *
 * Never throws. A missing or unreadable set means a workout with fewer
 * pictures, which is still a perfectly good workout. It must never mean no
 * email.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { drawnNames, picturesFor, type PictureIndex, type Pictured, type Source } from "./exercise-pictures";

/**
 * Relative to the process root, which is the project root both locally and in
 * a Vercel function. next.config.ts has to name these directories so the
 * deployment carries them; a function only ships the files it is traced to
 * use, and these are read by name rather than imported.
 */
const DRAWINGS = path.join("assets", "exercise-drawings");
const PHOTOS = path.join("assets", "exercise-pictures");

/*
 * Each directory spelled out where it is joined, rather than looked up, so
 * the build's file tracing sees exactly these two directories and not every
 * file the project has.
 */
function directory(source: Source): string {
  return source === "d" ? path.join(process.cwd(), DRAWINGS) : path.join(process.cwd(), PHOTOS);
}

const EMPTY: PictureIndex = { exercises: [] };

const loaded: Partial<Record<Source, PictureIndex>> = {};

/** Read once per process. They never change. */
function index(source: Source): PictureIndex {
  const cached = loaded[source];
  if (cached) return cached;

  let result = EMPTY;
  try {
    const file = path.join(directory(source), "index.json");
    const parsed = JSON.parse(readFileSync(file, "utf8")) as PictureIndex;
    result = Array.isArray(parsed.exercises) ? parsed : EMPTY;
  } catch (err) {
    console.error(`exercise pictures (${source}) unavailable, sending without them: ${err}`);
  }

  loaded[source] = result;
  return result;
}

/**
 * Where a vendored picture actually is, for the mailer to attach or the
 * picture route to serve. Null for anything that is not a plain file name in
 * one of the two sets, so a request cannot walk out of the directory.
 */
export function pictureFile(source: Source, file: string): string | null {
  if (source !== "d" && source !== "p") return null;
  const name = path.basename(file);
  if (name !== file || !/^[\w.-]+\.(png|jpg)$/i.test(name)) return null;
  return path.join(directory(source), name);
}

/**
 * The drawings for a workout. Photos are no longer used: two of them side by
 * side were too small and too busy to see on her phone, and the drawings are
 * clear at full width.
 */
export function workoutPictures(exercises: string[]): Pictured[] {
  const drawings = index("d");
  if (drawings.exercises.length === 0) return [];
  return picturesFor(EMPTY, exercises, drawings);
}

/** The gym names that come with a drawing, for the coach to prefer. */
export function drawnExerciseNames(): string[] {
  return drawnNames(index("d"));
}
