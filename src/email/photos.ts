/**
 * Photos for How to, from free-exercise-db (public domain), vendored in
 * assets/exercise-pictures and served by /pictures/p/<file>.
 *
 * Not pure: reads the index once. Never throws: a missing index means a
 * workout without pictures, never no email. Custom exercises have none.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import type { Frame, Photos } from "./cards";

interface Index {
  exercises: { id: string; files: string[]; sizes?: [number, number][] }[];
}

let cached: Map<string, Frame[]> | null = null;

function load(): Map<string, Frame[]> {
  if (cached) return cached;
  const map = new Map<string, Frame[]>();
  try {
    const file = path.join(process.cwd(), "assets", "exercise-pictures", "index.json");
    const index = JSON.parse(readFileSync(file, "utf8")) as Index;
    for (const e of index.exercises ?? [])
      map.set(
        e.id,
        e.files.map((f, i) => ({ file: f, width: e.sizes?.[i]?.[0] ?? 400, height: e.sizes?.[i]?.[1] ?? 267 })),
      );
  } catch (err) {
    console.error(`exercise photos unavailable, sending without them: ${err}`);
  }
  cached = map;
  return map;
}

export const photos: Photos = (id) => load().get(id) ?? [];
