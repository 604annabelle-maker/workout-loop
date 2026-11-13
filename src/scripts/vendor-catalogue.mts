/**
 * Vendoring the exercise catalogue's raw data.
 *
 * `npm run vendor:catalogue`. Run once, and again only to refresh it.
 *
 * Downloads free-exercise-db's metadata and keeps what the catalogue reads:
 * names, the database's own muscle tags, equipment and the first lines of the
 * instructions. The tags here are the database's, and are not trusted on their
 * own: assets/exercises/overrides.json holds the reviewed tags, and only
 * exercises reviewed there can ever be chosen (src/training/catalogue.ts).
 * The pictures were vendored earlier, into assets/exercise-pictures.
 */

import { writeFile } from "node:fs/promises";
import path from "node:path";

const URL_ = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";
const OUT = path.join(process.cwd(), "assets", "exercises", "raw.json");

interface Source {
  id: string;
  name: string;
  equipment: string | null;
  category: string;
  mechanic: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
}

const response = await fetch(URL_);
if (!response.ok) throw new Error(`${URL_}: ${response.status}`);
const all = (await response.json()) as Source[];

const exercises = all
  .map((e) => ({
    id: e.id,
    name: e.name,
    equipment: e.equipment,
    category: e.category,
    mechanic: e.mechanic,
    primary: e.primaryMuscles,
    secondary: e.secondaryMuscles,
    instructions: e.instructions.slice(0, 3),
  }))
  .sort((a, b) => a.id.localeCompare(b.id));

await writeFile(
  OUT,
  JSON.stringify(
    {
      source: "https://github.com/yuhonas/free-exercise-db",
      licence: "Unlicense (public domain)",
      vendoredAt: new Date().toISOString().slice(0, 10),
      exercises,
    },
    null,
    1,
  ) + "\n",
);
console.log(`${exercises.length} exercises written to ${OUT}`);
