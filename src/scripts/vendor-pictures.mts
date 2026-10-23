/**
 * Vendoring the exercise pictures (design §Image attachments).
 *
 * `npm run vendor:pictures`. Run once, and again only to refresh the set.
 *
 * Downloads free-exercise-db, shrinks every still to the width an email needs,
 * and writes the lot into assets/ alongside an index of names. The pictures are
 * then part of the repository: no API to call while a workout is going out, no
 * rate limit, no third party that has to be up at 6am, and nothing to pay for.
 *
 * Shrinking is the point of doing this at vendor time rather than at send time.
 * The originals are 750px wide and 40 to 70kB each; a workout carries ten or
 * twelve of them, and that is a slow mail to open on a phone.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const REPO = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main";
const INDEX_URL = `${REPO}/dist/exercises.json`;
const IMAGE_URL = (file: string) => `${REPO}/exercises/${file}`;

const OUT = path.join(process.cwd(), "assets", "exercise-pictures");

/**
 * Wide enough to be clear on a phone showing it at half that, small enough
 * that a dozen of them do not make the email slow to open.
 */
const WIDTH = 400;
const QUALITY = 70;

/** Polite, and plenty: the whole set lands in about a minute. */
const AT_ONCE = 10;

interface Source {
  id: string;
  name: string;
  images: string[];
}

interface Entry {
  id: string;
  name: string;
  /** File names inside this directory, in order: start of the movement, then end. */
  files: string[];
}

async function fetchRetrying(url: string, tries = 3): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      throw new Error(`${response.status} ${response.statusText}`);
    } catch (err) {
      if (attempt >= tries) throw new Error(`${url}: ${err}`);
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
}

async function vendor(source: Source): Promise<Entry | null> {
  const files: string[] = [];

  for (const [frame, image] of source.images.entries()) {
    const name = `${source.id}-${frame}.jpg`;

    try {
      const response = await fetchRetrying(IMAGE_URL(image));
      const original = Buffer.from(await response.arrayBuffer());

      const shrunk = await sharp(original)
        .resize({ width: WIDTH, withoutEnlargement: true })
        .jpeg({ quality: QUALITY, progressive: true, mozjpeg: true })
        .toBuffer();

      await writeFile(path.join(OUT, name), shrunk);
      files.push(name);
    } catch (err) {
      console.error(`  ${source.name}: frame ${frame} skipped (${err})`);
    }
  }

  if (files.length === 0) return null;
  return { id: source.id, name: source.name, files };
}

await mkdir(OUT, { recursive: true });

console.log("Fetching the exercise index...");
const all: Source[] = await (await fetchRetrying(INDEX_URL)).json();
const withPictures = all.filter((e) => (e.images ?? []).length > 0);
console.log(`${withPictures.length} exercises have pictures. Downloading.`);

const entries: Entry[] = [];
let done = 0;

for (let at = 0; at < withPictures.length; at += AT_ONCE) {
  const batch = withPictures.slice(at, at + AT_ONCE);
  const results = await Promise.all(batch.map(vendor));

  for (const entry of results) if (entry) entries.push(entry);

  done += batch.length;
  if (done % 100 < AT_ONCE) console.log(`  ${done}/${withPictures.length}`);
}

entries.sort((a, b) => a.name.localeCompare(b.name));

await writeFile(
  path.join(OUT, "index.json"),
  `${JSON.stringify(
    {
      source: "https://github.com/yuhonas/free-exercise-db",
      licence: "Unlicense (public domain)",
      vendoredAt: new Date().toISOString().slice(0, 10),
      width: WIDTH,
      exercises: entries,
    },
    null,
    2,
  )}\n`,
);

const index = await readFile(path.join(OUT, "index.json"));
const pictures = entries.reduce((n, e) => n + e.files.length, 0);

console.log(
  `\n${entries.length} exercises, ${pictures} pictures, ` +
    `index ${Math.round(index.length / 1024)}kB. In assets/exercise-pictures.`,
);
