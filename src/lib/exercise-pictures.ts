/**
 * Choosing which pictures go with a workout.
 *
 * Pure. Two vendored sets: line drawings (Everkinetic, assets/exercise-drawings,
 * `npm run vendor:drawings`), which she chose, and photos (free-exercise-db,
 * assets/exercise-pictures, `npm run vendor:pictures`), kept for the lifts the
 * drawings do not cover. Reading them off disk is ./picture-library.ts.
 *
 * Drawings are matched only by an exact name or a name checked by hand
 * below, because a near match in a set of 268 is as likely to be a different
 * movement as the right one. Photos, a set of 873, are matched by words, and
 * a photo of something other than what was asked says what it shows.
 */

import { matchExerciseName, normalizeExerciseName } from "./exercise-name";

/**
 * Gym names, and the drawing of exactly that movement. Each was checked
 * against the drawing itself, so a hit here is shown without a caption.
 */
export const DRAWING_ALIASES: Record<string, string> = {
  squat: "Barbell Squat",
  "back squat": "Barbell Squat",
  "barbell back squat": "Barbell Squat",
  "barbell squat": "Barbell Squat",
  "high bar squat": "Barbell Squat",
  "front squat": "Front Squat with Barbell",
  "barbell front squat": "Front Squat with Barbell",
  "hack squat": "Hack Squat: Machine",
  "machine hack squat": "Hack Squat: Machine",
  deadlift: "Dead Lifts: Barbell",
  "barbell deadlift": "Dead Lifts: Barbell",
  "conventional deadlift": "Dead Lifts: Barbell",
  "romanian deadlift": "Romanian Dead Lift",
  "barbell romanian deadlift": "Romanian Dead Lift",
  rdl: "Romanian Dead Lift",
  "glute bridge": "Bridging",
  "bench press": "Bench Press: Barbell",
  "barbell bench press": "Bench Press: Barbell",
  "dumbbell bench press": "Bench Press: Dumbbell",
  "close grip bench press": "Bench Press: Barbell (Close Grip)",
  "incline bench press": "Bench Press: Barbell (Incline)",
  "incline barbell bench press": "Bench Press: Barbell (Incline)",
  "incline dumbbell press": "Incline Dumbbell Press",
  "incline dumbbell bench press": "Incline Dumbbell Press",
  "seated overhead press": "Seated Military Press",
  "seated barbell overhead press": "Seated Military Press",
  "seated military press": "Seated Military Press",
  "pull up": "Pull Ups",
  "assisted pull up": "Pull Ups",
  "weighted pull up": "Pull Ups",
  "underhand lat pulldown": "Pull Down: Underhand",
  "close grip lat pulldown": "Pull Down: V Bar",
  "v bar lat pulldown": "Pull Down: V Bar",
  "seated cable row": "Seated Cable Rows",
  "cable row": "Seated Cable Rows",
  "one arm dumbbell row": "Rear Deltoid Row Dumbbell",
  "single arm dumbbell row": "Rear Deltoid Row Dumbbell",
  "dumbbell row": "Rear Deltoid Row Dumbbell",
  "t bar row": "T-Bar Rows",
  "barbell curl": "Biceps Curl: Barbell",
  "barbell biceps curl": "Biceps Curl: Barbell",
  "ez bar curl": "EZ Bar Curl with Barbell",
  "dumbbell curl": "Biceps Curl: Dumbbell",
  "dumbbell biceps curl": "Biceps Curl: Dumbbell",
  "incline curl": "Alternating Incline Curl with Dumbbell",
  "incline dumbbell curl": "Alternating Incline Curl with Dumbbell",
  "hammer curl": "Biceps Curl: Dumbbell (Hammer)",
  "dumbbell hammer curl": "Biceps Curl: Dumbbell (Hammer)",
  "rope hammer curl": "Hammer Curls with Rope and Cable",
  "cable curl": "Standing Biceps Curl with Cable",
  "cable biceps curl": "Standing Biceps Curl with Cable",
  "preacher curl": "Preacher Curl: Barbell",
  "concentration curl": "Concentration Curls with Dumbbell",
  "zottman curl": "Zottman Curl with Dumbbells",
  "triceps pushdown": "Triceps Pushdown: Cable",
  "cable triceps pushdown": "Triceps Pushdown: Cable",
  "rope pushdown": "Triceps Pushdown: Cable (Rope)",
  "rope triceps pushdown": "Triceps Pushdown: Cable (Rope)",
  "overhead triceps extension": "Triceps Extension: Dumbbell (Standing)",
  "dumbbell overhead triceps extension": "Triceps Extension: Dumbbell (Standing)",
  "overhead dumbbell triceps extension": "Triceps Extension: Dumbbell (Standing)",
  "skull crusher": "Lying Triceps Press with Barbell",
  "ez bar skull crusher": "Lying Triceps Press with Barbell",
  "lying triceps extension": "Lying Triceps Press with Barbell",
  "triceps kickback": "Triceps Kickback with Dumbbell",
  "lateral raise": "Lateral Dumbbell Raises",
  "dumbbell lateral raise": "Lateral Dumbbell Raises",
  "rear delt fly": "Bent Over Rear Deltoid Raise With Head On Bench",
  "leg press": "Leg Press",
  "leg extension": "Leg Extensions",
  "lying leg curl": "Lying Leg Curl Machine",
  "seated leg curl": "Seated Leg Curl",
  "bulgarian split squat": "One Leg Squat with Barbell",
  "walking lunge": "Lunges: Dumbbell (Walking)",
  "dumbbell walking lunge": "Lunges: Dumbbell (Walking)",
  "reverse lunge": "Lunges: Dumbbell (Rear)",
  "dumbbell reverse lunge": "Lunges: Dumbbell (Rear)",
  "step up": "Step Ups: Dumbbell",
  "dumbbell step up": "Step Ups: Dumbbell",
  "hip abduction": "Thigh Abductor",
  "seated hip abduction": "Thigh Abductor",
  "hip abduction machine": "Thigh Abductor",
  "standing calf raise": "Standing Calf Raises using Machine",
  "seated calf raise": "Seated Calf Raise using Machine",
  crunch: "Crunches",
  "cable crunch": "Seated Ab Crunch with Cable",
  "side plank": "Side Plank",
  "back extension": "Hyperextensions",
  "triceps dips": "Triceps Dips: Body Weight",
  "bench dips": "Bench Dips",
  "push up": "Push Up: Body Weight",
};

/**
 * Gym names whose movement the set draws a little differently: a different
 * grip, seated rather than standing, on the floor rather than on a bench.
 * The drawing still shows the movement well, so it is used, with one short
 * line saying what differs.
 */
export const NEAR_DRAWINGS: Record<string, { name: string; note: string }> = {
  "barbell row": { name: "Reverse Grips Bent Over Barbell Rows", note: "Shown with palms up; grip it either way." },
  "bent over row": { name: "Reverse Grips Bent Over Barbell Rows", note: "Shown with palms up; grip it either way." },
  "bent over barbell row": { name: "Reverse Grips Bent Over Barbell Rows", note: "Shown with palms up; grip it either way." },
  "pendlay row": { name: "Reverse Grips Bent Over Barbell Rows", note: "Shown with palms up. A Pendlay row starts each rep from the floor." },
  "lat pulldown": { name: "Pull Down: V Bar", note: "Shown with the V-bar handle." },
  "wide grip lat pulldown": { name: "Pull Down: V Bar", note: "Shown with the V-bar handle; use the wide bar." },
  "cable lat pulldown": { name: "Pull Down: V Bar", note: "Shown with the V-bar handle." },
  "chin up": { name: "Narrow Parallel Grip Chin-ups", note: "Shown with palms facing each other; a chin up has palms facing you." },
  "assisted chin up": { name: "Narrow Parallel Grip Chin-ups", note: "Shown unassisted, palms facing each other." },
  "overhead press": { name: "Seated Military Press", note: "Shown seated; standing, it is the same press." },
  "standing overhead press": { name: "Seated Military Press", note: "Shown seated; standing, it is the same press." },
  "barbell overhead press": { name: "Seated Military Press", note: "Shown seated; standing, it is the same press." },
  "military press": { name: "Seated Military Press", note: "Shown seated; standing, it is the same press." },
  "dumbbell shoulder press": { name: "Seated Military Press", note: "Shown with a barbell; with dumbbells, it is the same press." },
  "seated dumbbell shoulder press": { name: "Seated Military Press", note: "Shown with a barbell; with dumbbells, it is the same press." },
  "goblet squat": { name: "Squats: Dumbbells", note: "Shown with dumbbells at the sides; hold one at your chest." },
  "hip thrust": { name: "Bridging", note: "Shown on the floor. For a hip thrust, your upper back rests on a bench and the bar sits across your hips." },
  "barbell hip thrust": { name: "Bridging", note: "Shown on the floor. For a hip thrust, your upper back rests on a bench and the bar sits across your hips." },
  plank: { name: "Push Up: Body Weight", note: "Hold the top of a push up, body in one straight line." },
  "high plank": { name: "Push Up: Body Weight", note: "Hold the top of a push up, body in one straight line." },
  "ab wheel rollout": { name: "Ab Rollout on Knees with Barbell", note: "Shown with a barbell; a wheel moves the same way." },
  "ab wheel": { name: "Ab Rollout on Knees with Barbell", note: "Shown with a barbell; a wheel moves the same way." },
  "trap bar deadlift": { name: "Dead Lifts: Barbell", note: "Shown with a straight bar; with a trap bar you stand inside it." },
  "reverse crunch": { name: "Bent Knee Hip Raise", note: "" },
  "lying leg raise": { name: "Flat Bench Leg Raises", note: "" },
  "smith machine bench press": { name: "Bench Press: Smith Machine", note: "" },
  "machine chest press": { name: "Bench Press: Machine", note: "Shown lying; a seated machine moves the same way." },
  "leg curl": { name: "Lying Leg Curl Machine", note: "" },
  "cable rear delt fly": { name: "Bent-over Lateral Cable Raises", note: "" },
  "reverse fly": { name: "Bent Over Rear Deltoid Raise With Head On Bench", note: "" },
  "dumbbell rear delt fly": { name: "Bent Over Rear Deltoid Raise With Head On Bench", note: "" },
  "close grip pulldown": { name: "Pull Down: V Bar", note: "" },
  "underhand pulldown": { name: "Pull Down: Underhand", note: "" },
};

/**
 * Gym names the photo set spells differently, where word matching would
 * otherwise pick the wrong movement. "SIDE PLANK" shares every word with
 * "Push Up to Side Plank", which is a different exercise.
 */
const PHOTO_ALIASES: Record<string, string> = {
  "side plank": "Side Bridge",
  "farmer carry": "Farmer's Walk",
  "farmers carry": "Farmer's Walk",
  "farmer walk": "Farmer's Walk",
  "med ball slam": "Overhead Slam",
  "medicine ball slam": "Overhead Slam",
};

/** One exercise in a vendored set, as index.json records it. */
export interface PictureSet {
  id: string;
  name: string;
  /** File names, in order. */
  files: string[];
  /** [width, height] of each file, in pixels. */
  sizes?: [number, number][];
}

export interface PictureIndex {
  exercises: PictureSet[];
}

/** Which set a picture is from: d for drawings, p for photos. */
export type Source = "d" | "p";

export interface Frame {
  /** The Content-ID the plain HTML refers to, without angle brackets. */
  cid: string;
  source: Source;
  file: string;
  width: number;
  height: number;
}

export interface Pictured {
  /** The exercise as prescribed, which is how the renderer finds its place. */
  exercise: string;
  /**
   * What differs in the picture from the movement asked for, as a line to
   * show under it. Empty when it is the same movement, the usual case.
   */
  shows: string;
  /** Empty when nothing in either set matched. */
  frames: Frame[];
  /** True when they are the line drawings, which need a credit. */
  drawn: boolean;
}

/** Stable, so the same plan always produces the same message. */
function cidFor(source: Source, id: string, frame: number): string {
  return `${source === "d" ? "drawing" : "exercise"}-${id.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${frame}@workout-loop`;
}

function framesOf(set: PictureSet, source: Source): Frame[] {
  return set.files.map((file, frame) => {
    const [width, height] = set.sizes?.[frame] ?? [400, 300];
    return { cid: cidFor(source, set.id, frame), source, file, width, height };
  });
}

/** Keyed the way names are compared, so "RDL" and "BICEPS CURL" find theirs. */
const byKey = (aliases: Record<string, string>) =>
  new Map(Object.entries(aliases).map(([k, v]) => [normalizeExerciseName(k), v]));
const DRAWN = byKey(DRAWING_ALIASES);
const PHOTOGRAPHED = byKey(PHOTO_ALIASES);

const NEAR = new Map(Object.entries(NEAR_DRAWINGS).map(([k, v]) => [normalizeExerciseName(k), v]));

/**
 * The drawing for an exercise, and what to say about it: by a checked alias or
 * an exact name (nothing to say), or a near one (one line on what differs).
 */
function drawingFor(drawings: PictureIndex, exercise: string): { set: PictureSet; note: string } | null {
  const key = normalizeExerciseName(exercise);
  const find = (name: string) => drawings.exercises.find((d) => normalizeExerciseName(d.name) === normalizeExerciseName(name)) ?? null;
  const alias = DRAWN.get(key);
  const exact = find(alias ?? exercise);
  if (exact) return { set: exact, note: "" };
  const near = NEAR.get(key);
  const close = near ? find(near.name) : null;
  return close ? { set: close, note: near!.note } : null;
}

/**
 * The gym names that come with a drawing, for the coach to prefer: a session
 * where every exercise can be opened and seen is easier to follow alone.
 */
export function drawnNames(drawings: PictureIndex): string[] {
  const have = new Set(drawings.exercises.map((d) => normalizeExerciseName(d.name)));
  const names = [...Object.entries(DRAWING_ALIASES), ...Object.entries(NEAR_DRAWINGS).map(([k, v]) => [k, v.name] as const)]
    .filter(([, name]) => have.has(normalizeExerciseName(name)))
    .map(([gym]) => gym.toUpperCase());
  return [...new Set(names)].sort();
}

/**
 * Pictures for the exercises named, in the order named: the drawing when
 * there is one, otherwise the closest photo. The caller decides which
 * exercises deserve one.
 */
export function picturesFor(photos: PictureIndex, exercises: string[], drawings: PictureIndex = { exercises: [] }): Pictured[] {
  const names = photos.exercises.map((e) => e.name);

  return [...new Set(exercises)].map((exercise) => {
    const drawing = drawingFor(drawings, exercise);
    if (drawing) return { exercise, shows: drawing.note, frames: framesOf(drawing.set, "d"), drawn: true };

    const alias = PHOTOGRAPHED.get(normalizeExerciseName(exercise));
    const aliased = alias ? names.indexOf(alias) : -1;
    const match = aliased !== -1 ? { at: aliased } : matchExerciseName(names, exercise);

    if (!match) return { exercise, shows: "", frames: [], drawn: false };

    const found = photos.exercises[match.at];

    return {
      exercise,
      // Named whenever the picture is not of exactly the movement asked for,
      // so a near-enough movement never passes as the one prescribed.
      shows: normalizeExerciseName(found.name) === normalizeExerciseName(exercise) ? "" : found.name,
      frames: framesOf(found, "p"),
      drawn: false,
    };
  });
}
