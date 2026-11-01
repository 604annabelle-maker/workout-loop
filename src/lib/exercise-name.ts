/**
 * Deciding when two exercise names mean the same movement.
 *
 * Pure. Two things need this and they need the same answer: finding the
 * picture of a prescribed exercise in the vendored set, and recognising that
 * the squat in today's session is the squat that was done three weeks ago so
 * the load can be compared.
 *
 * The names are written by a model, in the gym's vocabulary rather than a
 * catalogue's: "SMITH OVERHEAD PRESS" for what the picture set calls "Smith
 * Machine Overhead Shoulder Press". So matching is fuzzy by necessity, and
 * every part of it is tuned against names that actually came out of real
 * sessions.
 */

/**
 * Words that mean the same movement. Plurals, abbreviations, and the spellings
 * that differ between a catalogue and a gym.
 */
const SYNONYMS: Record<string, string> = {
  flye: "fly",
  flyes: "fly",
  flies: "fly",
  db: "dumbbell",
  dumbell: "dumbbell",
  dumbells: "dumbbell",
  dumbbells: "dumbbell",
  bb: "barbell",
  barbells: "barbell",
  kb: "kettlebell",
  kettlebells: "kettlebell",
  delts: "delt",
  deltoid: "delt",
  triceps: "tricep",
  biceps: "bicep",
  abs: "ab",
  abdominal: "ab",
  abdominals: "ab",
  glutes: "glute",
  hamstrings: "hamstring",
  pullups: "pullup",
  chinup: "pullup",
  chinups: "pullup",
  pulldowns: "pulldown",
  raises: "raise",
  rows: "row",
  curls: "curl",
  presses: "press",
  squats: "squat",
  extensions: "extension",
  lunges: "lunge",
  crunches: "crunch",
  dips: "dip",
  thrust: "thrust",
  thrusts: "thrust",
  thruster: "thrust",
  ohp: "overhead press",
  rdl: "romanian deadlift",
  rdls: "romanian deadlift",
  deadlifts: "deadlift",
  bridges: "bridge",
  swings: "swing",
  jumps: "jump",
  carries: "carry",
  pushups: "pushup",
  bw: "bodyweight",
  // A hanging knee raise and a hanging leg raise are the same picture.
  knee: "leg",
  knees: "leg",
  legs: "leg",
};

/**
 * Words that say how a movement is set up rather than which movement it is.
 * They still count, but a mismatch on one is not a different exercise.
 */
const SETUP = new Set([
  "machine",
  "seated",
  "standing",
  "lying",
  "kneeling",
  "alternating",
  "alternate",
  "one",
  "two",
  "arm",
  "arms",
  "single",
  "side",
  "with",
  "a",
  "the",
  "and",
  "of",
  "to",
  "on",
  "up",
  "grip",
  "medium",
  "bar",
  "smith",
  "cable",
  "barbell",
  "dumbbell",
  "kettlebell",
  "band",
  "bands",
  "plate",
  "bodyweight",
  "weighted",
  "assisted",
  "style",
]);

/**
 * Words that change which exercise it is. A rear lateral raise is not a
 * lateral raise, so a candidate carrying one of these that was not asked for
 * is pushed down rather than merely ranked lower.
 */
const VARIANTS = new Set([
  "rear",
  "front",
  "reverse",
  "incline",
  "decline",
  "behind",
  "overhead",
  "close",
  "wide",
  "deficit",
  "oblique",
  "twist",
  "twists",
  "jump",
  "sprint",
  "negative",
  "isometric",
  "bosu",
  "physioball",
  "chain",
  "chains",
  "pike",
  "sumo",
  "zercher",
  "hack",
  "landmine",
]);

/** How much of the asked-for name has to be found before it is a match. */
const THRESHOLD = 0.55;

/** What an unasked-for variant word costs. Two of them sink a candidate. */
const VARIANT_COST = 0.25;

/** A setup word is worth having, but missing one is not fatal. */
const SETUP_WEIGHT = 0.35;

export function words(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .flatMap((word) => (SYNONYMS[word] ?? word).split(" "))
    .filter(Boolean);
}

/**
 * The name reduced to what it means, so two spellings of one movement collide.
 * "Dumbbell Flyes" and "DUMBBELL FLY" both become "dumbbell fly".
 */
export function normalizeExerciseName(name: string): string {
  return words(name).join(" ");
}

interface Fit {
  /** Coverage of the asked-for name, less what the extra variant words cost. */
  score: number;
  /** Words the candidate adds that were not asked for. Lower is closer. */
  extras: number;
}

function fit(query: string[], candidate: string): Fit | null {
  const theirs = words(candidate);
  const unmatched = [...theirs];

  let found = 0;
  let asked = 0;

  for (const word of query) {
    const weight = SETUP.has(word) ? SETUP_WEIGHT : 1;
    asked += weight;

    const at = unmatched.indexOf(word);
    if (at !== -1) {
      found += weight;
      unmatched.splice(at, 1);
    }
  }

  /*
   * The last word is the movement itself: raise, press, row, squat. A
   * candidate that does not do the same thing is not a near miss, it is a
   * different exercise, however many other words it shares.
   */
  if (!theirs.includes(query.at(-1) ?? "")) return null;

  const extras = unmatched.filter((word) => !SETUP.has(word));
  const wrongVariant = extras.filter((word) => VARIANTS.has(word)).length;
  const coverage = asked === 0 ? 0 : found / asked;

  return { score: coverage - VARIANT_COST * wrongVariant, extras: extras.length };
}

export interface Match {
  /** Index into the candidates that were offered. */
  at: number;
  /** 1 when the name means exactly the same thing. */
  score: number;
}

/**
 * The candidate that means the same movement as `name`, or null.
 *
 * Closest coverage of what was asked for wins. Where two candidates cover it
 * equally, the one that adds least wins, so "Side Lateral Raise" beats
 * "Dumbbell Lying Rear Lateral Raise" for a plain lateral raise. Ties break on
 * the shorter and then the alphabetically earlier name, so the same plan
 * always picks the same picture.
 */
export function matchExerciseName(
  candidates: readonly string[],
  name: string,
): Match | null {
  const query = words(name);
  if (query.length === 0) return null;

  const wanted = query.join(" ");

  let best: { at: number; fit: Fit; name: string } | null = null;

  for (const [at, candidate] of candidates.entries()) {
    if (normalizeExerciseName(candidate) === wanted) return { at, score: 1 };

    const scored = fit(query, candidate);
    if (!scored || scored.score < THRESHOLD) continue;

    if (!best || closer(scored, candidate, best)) {
      best = { at, fit: scored, name: candidate };
    }
  }

  return best ? { at: best.at, score: best.fit.score } : null;
}

function closer(
  scored: Fit,
  name: string,
  best: { fit: Fit; name: string },
): boolean {
  if (scored.score !== best.fit.score) return scored.score > best.fit.score;
  if (scored.extras !== best.fit.extras) return scored.extras < best.fit.extras;
  if (name.length !== best.name.length) return name.length < best.name.length;
  return name < best.name;
}
