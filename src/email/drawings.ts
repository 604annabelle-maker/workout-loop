/**
 * The drawings for How to: Everkinetic's line drawings (CC BY-SA 4.0), the
 * set she chose, vendored in assets/exercise-drawings and served by
 * /pictures/d/<file>. Each reviewed exercise names its drawing in
 * assets/exercises/overrides.json, checked by hand.
 *
 * Not pure: reads the index once. Never throws: a missing index means How to
 * shows the line on form alone, never no email.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { exercise } from "../training/catalogue";
import type { Frame, Pictures } from "./cards";

interface Index {
  exercises: { name: string; files: string[]; sizes?: [number, number][] }[];
}

let cached: Map<string, Frame[]> | null = null;

function load(): Map<string, Frame[]> {
  if (cached) return cached;
  const map = new Map<string, Frame[]>();
  try {
    const file = path.join(process.cwd(), "assets", "exercise-drawings", "index.json");
    const index = JSON.parse(readFileSync(file, "utf8")) as Index;
    for (const e of index.exercises ?? [])
      if (!map.has(e.name))
        map.set(
          e.name,
          e.files.map((f, i) => ({ file: f, width: e.sizes?.[i]?.[0] ?? 400, height: e.sizes?.[i]?.[1] ?? 315 })),
        );
  } catch (err) {
    console.error(`exercise drawings unavailable, sending without them: ${err}`);
  }
  cached = map;
  return map;
}

export const drawings: Pictures = (id) => {
  const e = exercise(id);
  const frames = e?.drawing ? (load().get(e.drawing) ?? []) : [];
  return { frames, note: frames.length ? (e?.drawingNote ?? "") : "" };
};
