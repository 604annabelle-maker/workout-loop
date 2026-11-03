/**
 * Vendoring the exercise line drawings (design §Image attachments).
 *
 * `npm run vendor:drawings`. Run once, and again only to refresh the set.
 *
 * Downloads the Everkinetic drawings, turns every one into a PNG the width an
 * email needs, and writes the lot into assets/ alongside an index of names, the
 * same way vendor-pictures.mts does for the photos. Simple line drawings tend
 * to be easier to follow than photos, which is the reason for having them.
 *
 * The originals are SVG, which is why they are converted here rather than
 * attached as they are. Most mail apps will not show an SVG attachment, and
 * Gmail strips an <svg> written into the HTML, so a PNG is the only form that
 * reliably shows up on a phone.
 *
 * The set is CC BY-SA 4.0, so it has to be credited wherever it is shown; see
 * assets/exercise-drawings/CREDITS.md. Changing the format alone does not make
 * the PNGs an adaptation, so keep it that way: no cropping, recolouring or
 * combining frames here.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const REPO = "https://raw.githubusercontent.com/everkinetic/data/main";
const INDEX_URL = `${REPO}/dist/exercises.json`;
const FRAME_URL = (id: string, frame: string) => `${REPO}/src/exercises/${id}/${id}-${frame}.svg`;

const OUT = path.join(process.cwd(), "assets", "exercise-drawings");

/**
 * The set names its two frames after the muscle rather than the movement, so
 * neither one is reliably the start. In the cable row the relaxed frame is the
 * start, arms out; in the squat it is the bottom, and the standing start is the
 * tensed one. They are kept in this fixed order and nothing downstream should
 * read them as start then end.
 */
const FRAMES = ["relaxation", "tension"];

/** The same width as the photos, so the two sets can sit in one email. */
const WIDTH = 400;

/**
 * Stored as a 16 colour palette. The drawings are one dark grey on white, so
 * the only other colours are the greys that smooth the edges of the lines, and
 * sixteen is plenty for those. Full colour PNGs made the set about 12MB; this
 * makes it under 5MB and looks the same.
 */
const COLOURS = 16;

/** Polite, and plenty: the whole set lands in well under a minute. */
const AT_ONCE = 10;

interface Source {
  id: string;
  /** The exercise as the set names it, for example "Bench Press". */
  title: string;
  /** Frames the set has, as paths like "svg/0042-relaxation.svg". */
  svg?: string[];
}

interface Entry {
  id: string;
  name: string;
  /** File names inside this directory, in order: relaxation, then tension. */
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

/**
 * Drawn at the size it will be used, not drawn small and stretched. The SVGs
 * are about 200 points wide, which comes out as about 200 pixels unless the
 * renderer is told otherwise, and enlarging that afterwards blurs the lines.
 */
async function toPng(svg: Buffer): Promise<Buffer> {
  const { width } = await sharp(svg).metadata();
  if (!width) throw new Error("the drawing has no width");

  return (
    sharp(svg, { density: (72 * WIDTH) / width })
      // The density only gets it close, so this makes it exact.
      .resize({ width: WIDTH })
      // The drawings have a white background of their own, but the edges of
      // the lines are partly see-through, and some mail apps show see-through
      // as black. Filling in with white and dropping transparency altogether
      // means they look the same everywhere.
      .flatten({ background: "#ffffff" })
      .png({ compressionLevel: 9, palette: true, colours: COLOURS, effort: 10 })
      .toBuffer()
  );
}

/**
 * Both frames or nothing. One frame alone shows a position but not the
 * movement, and the email would then need a second way of laying it out.
 */
async function vendor(source: Source): Promise<Entry | null> {
  try {
    const pngs: Buffer[] = [];

    for (const frame of FRAMES) {
      const response = await fetchRetrying(FRAME_URL(source.id, frame));
      pngs.push(await toPng(Buffer.from(await response.arrayBuffer())));
    }

    const files = pngs.map((_, frame) => `${source.id}-${frame}.png`);
    await Promise.all(files.map((file, frame) => writeFile(path.join(OUT, file), pngs[frame])));

    // Trimmed because the set has at least one name with a stray space on the
    // end ("Pull Down: V Bar "), and an exact comparison would trip on it.
    return { id: source.id, name: source.title.trim(), files };
  } catch (err) {
    console.error(`  ${source.title}: skipped (${err})`);
    return null;
  }
}

/** Whether the set's own index lists both frames, which saves asking for ones that are not there. */
function hasBothFrames(source: Source): boolean {
  const frames = source.svg ?? [];
  return FRAMES.every((frame) => frames.includes(`svg/${source.id}-${frame}.svg`));
}

await mkdir(OUT, { recursive: true });

console.log("Fetching the exercise index...");
const all: Source[] = await (await fetchRetrying(INDEX_URL)).json();
const withDrawings = all.filter(hasBothFrames);

for (const source of all.filter((s) => !hasBothFrames(s))) {
  console.log(`  ${source.title}: skipped (no ${FRAMES.join(" and ")} pair)`);
}
console.log(`${withDrawings.length} of ${all.length} exercises have both drawings. Downloading.`);

const entries: Entry[] = [];
let done = 0;

for (let at = 0; at < withDrawings.length; at += AT_ONCE) {
  const batch = withDrawings.slice(at, at + AT_ONCE);
  const results = await Promise.all(batch.map(vendor));

  for (const entry of results) if (entry) entries.push(entry);

  done += batch.length;
  if (done % 100 < AT_ONCE) console.log(`  ${done}/${withDrawings.length}`);
}

entries.sort((a, b) => a.name.localeCompare(b.name));

await writeFile(
  path.join(OUT, "index.json"),
  `${JSON.stringify(
    {
      source: "https://github.com/everkinetic/data",
      licence: "CC BY-SA 4.0",
      vendoredAt: new Date().toISOString().slice(0, 10),
      width: WIDTH,
      exercises: entries,
    },
    null,
    2,
  )}\n`,
);

const index = await readFile(path.join(OUT, "index.json"));
const drawings = entries.reduce((n, e) => n + e.files.length, 0);

console.log(
  `\n${entries.length} exercises, ${drawings} drawings, ${all.length - entries.length} skipped, ` +
    `index ${Math.round(index.length / 1024)}kB. In assets/exercise-drawings.`,
);
