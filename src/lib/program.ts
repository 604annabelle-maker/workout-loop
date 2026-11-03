/**
 * The training rules, as data.
 *
 * Pure. Every number the coach works from is here, in one file, with the
 * reason beside it, so the plan can be read and argued with without reading
 * any code. The evidence is in docs/training-research*.md, and the plan she
 * approved is in docs/rebuild-plan.md.
 *
 * The short version, for a woman of 22 training for lean muscle and strength,
 * with arms as her priority:
 *
 * - Four lifting days, two muscle groups each, in order rather than by
 *   weekday, plus her own classes. Every other week one day is full body.
 * - Each main lift is done twice a week: once heavy, 4 to 5 sets of 3 to 5,
 *   and once lighter, 2 to 3 sets of 6 to 8. Strength grows most with heavy
 *   weights and is partly a skill practised lift by lift; muscle grows about
 *   the same at any weight as long as the sets are hard.
 * - Heavy lifts stop short of failure: 2 to 3 reps short on squats and
 *   deadlifts, 1 to 2 on presses and pulls. Small exercises can take the last
 *   set to failure, where it is safe and cheap.
 * - Every fifth week is lighter.
 * - Main lifts stay the same so strength can be seen going up. Everything
 *   else rotates each block.
 * - Jumps once a week, as a short block in the warm up.
 * - Nothing is programmed by cycle phase; how she feels is what adjusts a
 *   session.
 */

import type { Muscle, Role } from "./plan";

/** Upper and lower halves alternate, so legs are never trained two days running. */
export type Half = "lower" | "upper" | "full";

export interface SessionType {
  id: string;
  /** "Back + biceps". The title and subject of the email. */
  name: string;
  half: Half;
  /** The muscles this day exists to train. Counted first and hardest. */
  primary: Muscle[];
  /** Trained on the day, but as the supporting act. */
  secondary: Muscle[];
  /** What the session is made of, in order, for the prompt. */
  shape: string[];
}

/**
 * The four days, in order. Each names its heavy main lift and the light day
 * of another, so every main lift comes twice a week.
 */
export const SPLIT: SessionType[] = [
  {
    id: "back-biceps",
    name: "Back + biceps",
    half: "upper",
    primary: ["back", "biceps"],
    secondary: ["chest", "shoulders", "core"],
    shape: [
      "heavy: a vertical pull or a row, the same one every block (weighted or assisted pull up, chin up, or barbell row)",
      "light: the bench press from the chest day",
      "second: another back exercise, the other pull direction from the heavy one (lat pulldown, cable row, one-arm dumbbell row)",
      "accessory: two biceps exercises, one with the arm behind the body (incline curl, bayesian cable curl) and one hammer or straight bar curl",
      "accessory: rear delts or face pulls if time allows",
    ],
  },
  {
    id: "glutes-hams",
    name: "Glutes + hamstrings",
    half: "lower",
    primary: ["glutes", "hamstrings"],
    secondary: ["quads", "adductors", "core"],
    shape: [
      "heavy: the deadlift (conventional, sumo or trap bar), the same one every block",
      "light: the squat from the quads day",
      "second: hip thrust",
      "accessory: a hamstring curl (seated or lying)",
      "core: an ab finisher of 5 to 6 minutes, two or three movements (hanging knee raise, cable crunch, dead bug, Pallof press, ab wheel)",
    ],
  },
  {
    id: "chest-triceps",
    name: "Chest + triceps",
    half: "upper",
    primary: ["chest", "triceps"],
    secondary: ["shoulders", "back", "core"],
    shape: [
      "heavy: the bench press (barbell or dumbbell), the same one every block",
      "light: the heavy pull or row from the back day",
      "second: a shoulder press or an incline press",
      "accessory: lateral raises",
      "accessory: two triceps exercises, one overhead (overhead cable or dumbbell extension) and one pushdown or skull crusher",
    ],
  },
  {
    id: "quads-glutes",
    name: "Quads + glutes",
    half: "lower",
    primary: ["quads", "glutes"],
    secondary: ["hamstrings", "adductors", "calves"],
    shape: [
      "heavy: the squat (back squat, front squat or hack squat), the same one every block",
      "light: the deadlift from the glutes day, or its Romanian deadlift",
      "second: a single leg exercise (Bulgarian split squat, walking lunge or step up)",
      "accessory: leg extension",
      "accessory: hip abduction or calf raises",
    ],
  },
];

/**
 * Every other week, one of the four days is full body instead: a practice day
 * for the main lifts at lower volume, with an arms pair. It replaces a day
 * rather than adding one.
 */
export const FULL_BODY: SessionType = {
  id: "full-body",
  name: "Full body",
  half: "full",
  primary: ["quads", "glutes", "back", "chest"],
  secondary: ["hamstrings", "shoulders", "biceps", "triceps", "core"],
  shape: [
    "heavy: three or four of the main lifts (squat, deadlift, bench press, the heavy pull), each 2 to 3 sets of 3 to 5",
    "accessory: a biceps and triceps pair to finish",
  ],
};

export const SESSION_TYPES = [...SPLIT, FULL_BODY];

/**
 * The order sessions come in, eight to a cycle: two rounds of the four days,
 * with the full body day standing in for the last day of the second round.
 * At four sessions a week that is full body every other week.
 */
export const ROTATION: string[] = [
  "back-biceps",
  "glutes-hams",
  "chest-triceps",
  "quads-glutes",
  "back-biceps",
  "glutes-hams",
  "chest-triceps",
  "full-body",
];

/**
 * Hard sets per muscle per week, as a range.
 *
 * At least 10 sets a week (ACSM 2026), with most of the growth between about
 * 12 and 20 (Baz-Valle 2022). Secondary muscles count half a set, which is
 * the counting that predicted growth best (Pelland 2025). Arms are her
 * priority (a setting, so it can change): a priority muscle's range becomes
 * the top of its normal one and a little past, which takes biceps and
 * triceps to 12 to 16. Glutes get a normal share, since squats and deadlifts
 * already work them hard.
 */
export const WEEKLY_SETS: Record<Muscle, [number, number]> = {
  glutes: [12, 16],
  quads: [10, 16],
  hamstrings: [8, 14],
  adductors: [0, 8],
  calves: [0, 8],
  back: [12, 20],
  chest: [10, 16],
  shoulders: [8, 14],
  biceps: [8, 12],
  triceps: [8, 12],
  core: [4, 10],
};

/** A beginner grows on less, and recovers from less. */
export const BEGINNER_SCALE = 0.7;

/** A priority muscle is taken to the top of its range and a little past. */
export const PRIORITY_BONUS = 4;
export const PRIORITY_CEILING = 24;

/** Past about 10 hard sets for one muscle in one session, the rest is junk. */
export const MAX_SETS_PER_MUSCLE_PER_SESSION = 10;

export interface RoleRule {
  what: string;
  sets: string;
  /** The range the rep target moves through. */
  range: string;
  rir: string;
  failure: string;
  restSec: string;
}

/**
 * The job an exercise does decides its sets, its rep range, how close to
 * failure it goes and its rest.
 *
 * Close to failure is what grows muscle (Robinson 2024). Going all the way
 * adds little on average (Refalo 2023, 2024) and costs a day or two of extra
 * recovery on heavy lifts (Moran-Navarro 2017), and the last grinding reps of
 * a heavy lift are where form breaks down. So heavy lifts stop short, by more
 * on squats and deadlifts than on presses and pulls, and failure is kept for
 * small exercises, on the last set only.
 *
 * Heavy sets get long rests, because strength needs full recovery between
 * sets (Schoenfeld 2016); everything else rests by readiness, never under a
 * minute (Singer 2024).
 */
export const ROLES: Record<Role, RoleRule> = {
  heavy: {
    what: "a main lift on its heavy day",
    sets: "4 to 5",
    range: "3-5",
    rir: "2 to 3 in reserve on squats and deadlifts, 1 to 2 on presses and pulls",
    failure: "never",
    restSec: "150 to 240",
  },
  light: {
    what: "a main lift on its light day",
    sets: "2 to 3",
    range: "6-8",
    rir: "2 to 3 in reserve",
    failure: "never",
    restSec: "120 to 180",
  },
  second: {
    what: "the session's second lift",
    sets: "2 to 3",
    range: "6-10",
    rir: "1 to 2 in reserve",
    failure: "never",
    restSec: "90 to 150",
  },
  accessory: {
    what: "small exercises: curls, extensions, raises, leg curls and extensions, abduction",
    sets: "2 to 3",
    range: "8-15",
    rir: "0 to 1 in reserve",
    failure: "the last set may go to failure",
    restSec: "60 to 90",
  },
  core: {
    what: "the ab finisher",
    sets: "2 to 3 rounds",
    range: "8-15",
    rir: "1 to 2 in reserve",
    failure: "never",
    restSec: "30 to 60",
  },
  warmup: {
    what: "warm up, and the jumps on a jump day",
    sets: "1 to 2",
    range: "",
    rir: "not applicable",
    failure: "never",
    restSec: "0 to 60",
  },
};

/**
 * Failure is a tool with a recovery bill, so it is rationed: at most one
 * failure set per exercise, three per muscle per session, and none at all on
 * a main lift or in the lighter week. The coach enforces these whatever the
 * model writes.
 */
export const FAILURE_SETS_PER_MUSCLE_PER_SESSION = 3;

/**
 * Training blocks: four weeks building, then one lighter week.
 *
 * Effort rises through the block, and the fifth week halves the sets and
 * backs off, so the next block starts fresh. A deload every four to eight
 * weeks is the expert consensus (Bell 2023).
 */
export const BLOCK_WEEKS = 5;

export interface WeekPlan {
  /** "build", "lighter week". */
  name: string;
  label: string;
  /** How close to failure the week goes, for the prompt. */
  rir: string;
  /** What changes, in one line, for the prompt. */
  note: string;
  deload: boolean;
}

export const WEEKS: WeekPlan[] = [
  {
    name: "settle in",
    label: "Week 1, settle in",
    rir: "one rep more in reserve than the role says, on everything",
    note: "First week of a block. New accessories; main lifts at a weight she owns.",
    deload: false,
  },
  {
    name: "build",
    label: "Week 2, build",
    rir: "as the role says",
    note: "Add a rep or a step of load where last time allowed.",
    deload: false,
  },
  {
    name: "build",
    label: "Week 3, build",
    rir: "as the role says",
    note: "Push the main lifts.",
    deload: false,
  },
  {
    name: "peak",
    label: "Week 4, peak",
    rir: "the low end of each role's range",
    note: "The hardest week. Heavy lifts still never go to failure.",
    deload: false,
  },
  {
    name: "lighter week",
    label: "Week 5, lighter week",
    rir: "4 to 5 in reserve, nothing to failure",
    note: "Deload. Same exercises, about half the sets, the same load or 10% less.",
    deload: true,
  },
];

/** Fewer sessions than this in a block and there is no fatigue to shed. */
export const DELOAD_MIN_SESSIONS = 8;

/** A break this long starts a new block, gently. */
export const RE_ENTRY_AFTER_DAYS = 12;

/**
 * Two skips in a row of the same exercise, and its swap takes over. Something
 * skipped twice is either disliked or never free.
 */
export const SKIPS_BEFORE_SWAP = 2;

/** Drawings are shown the first this many times she is given an exercise. */
export const PICTURE_EXPOSURES = 10;

/**
 * Jumping for bone, in the warm up, on the days she chooses.
 *
 * Jumping suits her stage: most of the positive trials were in women of about
 * 20 to 45, and premenopausal women gained at the hip on the same programme
 * that did nothing after menopause (Bassey 1998). In college women, 10
 * maximal jumps three days a week added about 2.6% at the hip in six months
 * (Kato 2006).
 *
 * Frequency is the catch. No trial supports once a week for bone, so at one
 * day a week the jumps are power and landing practice, kept short so the
 * warm up stays a warm up. Three days a week gets the short bone dose.
 *
 * On a jump day the warm up carries the jumps; anywhere else, anything whose
 * name says it leaves the ground is taken out by the coach.
 */
export const JUMPS = {
  /** At or above this many jump days, each gets the short bone dose. */
  frequentFrom: 3,
  frequent: { contacts: [10, 20] as [number, number], easy: [10, 10] as [number, number] },
  /** Fewer jump days: power and landing practice, kept warm-up sized. */
  weekly: { contacts: [15, 25] as [number, number], easy: [10, 15] as [number, number] },
  /** Squat days keep the jumps short. */
  heavyLegDays: ["quads-glutes", "full-body"],
  heavyLegCap: 15,
  /** Seconds between single maximal jumps, and between sets. */
  restBetweenJumps: "10 to 20",
  restBetweenSets: "about 60",
  /**
   * Progression by how many jump sessions she has done. A stage moves on
   * only with quiet, stable landings and knees that do not cave in.
   */
  stages: [
    { before: 4, text: "two foot jumps in place and forward, landing softly and quietly with knees over toes" },
    { before: 10, text: "two foot jumps plus lateral jumps and low step off landings" },
    { before: Infinity, text: "mixed directions, adding single leg hops and skater bounds" },
  ],
  /** Pain recently mentioned in any of these means no jumps today. */
  painStops: /\b(knee|knees|ankle|ankles|shin|shins|foot|feet|achilles|calf|calves|hip|hips|back)\b/i,
  /** Leaking means gentle two foot jumps and pelvic floor training, not stopping. */
  leak: /\b(leak|leaks|leaking|leaked|pelvic|bladder|incontinen\w*)\b/i,
  /** Never with these: they need a clinician first. */
  redFlags: /\b(pregnan\w*|stress fracture\w*|bone stress)\b/i,
  /** With cycle tracking on, this long without a logged period stops the jumps. */
  periodGapDays: 60,
};

export const JUMPING =
  /\b(jumps?|jumping|hops?|hopping|bounds?|bounding|pogos?|skips?|skipping|burpees?|plyometrics?)\b/i;

/**
 * Minutes for each part of a session. The warm up is short and the ab
 * finisher only comes on the glutes day; everything else is the lifting.
 */
export const BUDGET = {
  warmup: [6, 8] as const,
  core: 6,
};

/**
 * Things always in the mix, because they protect the joints of a young woman
 * who lifts.
 */
export const ALWAYS = [
  "The warm up raises temperature and opens up the joints today's lifts use, with warm up sets of the first lift.",
  "Hamstrings are trained lengthened at least once a week: Romanian deadlift or seated leg curl.",
  "Pulling sets at least equal pushing sets across the week.",
  "Prefer exercises that load the muscle stretched: deep squats and lunges, RDLs, incline curls, overhead triceps extensions, seated leg curls.",
  "A new eccentric heavy movement (slow negatives, a first RDL) starts with fewer sets and builds over two or three sessions.",
];
