/**
 * The training rules, as data.
 *
 * Pure. Every number the coach works from is here, in one file, with the
 * reason beside it, so the philosophy can be read and argued with without
 * reading any code. The evidence behind each is in docs/training-research.md,
 * and the follow-up on sex differences and training to failure is in
 * docs/training-research-women-and-failure.md.
 *
 * The short version, for a woman in her early twenties training for lean
 * muscle, health and the long run:
 *
 * - Muscle is built by enough hard sets taken close to failure, progressed
 *   over weeks. Young women grow muscle by the same mechanisms and at about
 *   the same percentage rate as men, but from a smaller start, with about 40%
 *   less muscle in the upper body, and they fatigue less from one set to the
 *   next. So the upper body gets full volume, rests sit at the shorter end of
 *   normal, and loads are chosen to genuinely reach the target effort: the
 *   commonest mistake is lifting lighter than she can.
 * - Heavy lifting and jumping are the two things that build bone, and the
 *   years before thirty are when there is still bone to build.
 * - A little hard conditioning goes a long way for the heart, and does not
 *   cost muscle when it is kept short and away from heavy leg days.
 * - Nothing is programmed by cycle phase. The best current trials find no
 *   advantage to it. How she feels on the day is what adjusts the session.
 * - The fun parts are real parts: jumps, throws, carries, finishers. They are
 *   capped so they never eat the time the muscle work needs.
 */

import type { Muscle } from "./plan";

/** Upper and lower halves alternate, so legs are never trained two days running. */
export type Half = "lower" | "upper" | "full";

export interface SessionType {
  id: string;
  /** "Glutes and hamstrings". What the email says the day is for. */
  name: string;
  half: Half;
  focus: string;
  /** The muscles this day exists to train. Counted first and hardest. */
  primary: Muscle[];
  /** Trained on the day, but as the supporting act. */
  secondary: Muscle[];
  /** The movement patterns the anchor lifts come from. */
  anchorPatterns: string[];
  /** What the primer usually is. */
  primer: string;
}

/**
 * The upper and lower rotation, for four or more sessions a week.
 *
 * Upper and lower alternate, so legs are never trained two days running, and
 * at four sessions a week every muscle is trained directly twice.
 */
export const SPLIT: SessionType[] = [
  {
    id: "lower-glutes",
    name: "Glutes and hamstrings",
    half: "lower",
    focus: "Glutes, hamstrings",
    primary: ["glutes", "hamstrings"],
    secondary: ["adductors", "core", "calves"],
    anchorPatterns: [
      "hip thrust or glute bridge, heavy",
      "hinge: Romanian deadlift, trap bar or conventional deadlift",
    ],
    primer: "jumps: broad jumps, box jumps or skater bounds",
  },
  {
    id: "upper-pull",
    name: "Back and shoulders",
    half: "upper",
    focus: "Back, rear and side shoulders, biceps",
    primary: ["back", "shoulders"],
    secondary: ["biceps", "core"],
    anchorPatterns: [
      "vertical pull: pull up, assisted pull up or lat pulldown",
      "horizontal row: chest supported, cable or barbell row",
    ],
    primer: "throws: med ball slams or rotational throws, plus 20 to 30 pogo hops",
  },
  {
    id: "lower-legs",
    name: "Legs and power",
    half: "lower",
    focus: "Quads, glutes, adductors",
    primary: ["quads", "glutes"],
    secondary: ["adductors", "hamstrings", "calves", "core"],
    anchorPatterns: [
      "squat, heavy: back squat, front squat, hack squat or goblet squat",
      "single leg: Bulgarian split squat, step up or walking lunge",
    ],
    primer: "jumps: lateral bounds, hurdle hops or squat jumps, several directions",
  },
  {
    id: "upper-push",
    name: "Shoulders, chest and arms",
    half: "upper",
    focus: "Shoulders, chest, arms, upper back",
    primary: ["shoulders", "chest", "triceps"],
    secondary: ["back", "biceps", "core"],
    anchorPatterns: [
      "overhead press, heavy: barbell, dumbbell or landmine",
      "horizontal press: incline dumbbell press, bench press or deficit push up",
    ],
    primer: "throws: med ball chest pass or push press, plus 20 to 30 pogo hops",
  },
];

/**
 * The full body rotation, for three sessions a week or fewer.
 *
 * Training each muscle at least twice a week is the rule that matters, and at
 * two or three sessions only full body sessions keep it. The emphasis rotates
 * so each session still has a headline.
 */
export const FULL_BODY: SessionType[] = [
  {
    id: "full-glutes",
    name: "Glutes and back",
    half: "full",
    focus: "Glutes, hamstrings, back",
    primary: ["glutes", "hamstrings", "back"],
    secondary: ["shoulders", "chest", "biceps", "core"],
    anchorPatterns: [
      "hip thrust, heavy",
      "vertical pull: pull up, assisted pull up or lat pulldown",
      "hinge or incline press, as the accessory pair",
    ],
    primer: "jumps: broad jumps or box jumps",
  },
  {
    id: "full-legs",
    name: "Legs and shoulders",
    half: "full",
    focus: "Quads, glutes, shoulders, back",
    primary: ["quads", "glutes", "shoulders"],
    secondary: ["back", "adductors", "triceps", "core"],
    anchorPatterns: [
      "squat, heavy: back, front, hack or goblet squat",
      "overhead press: barbell, dumbbell or landmine",
      "row and hamstring curl, as the accessory pair",
    ],
    primer: "jumps: lateral bounds or squat jumps, several directions",
  },
  {
    id: "full-athletic",
    name: "Single leg, chest and arms",
    half: "full",
    focus: "Glutes, quads, chest, back, arms",
    primary: ["glutes", "quads", "chest", "back"],
    secondary: ["biceps", "triceps", "hamstrings", "core"],
    anchorPatterns: [
      "single leg, heavy: Bulgarian split squat, step up or reverse lunge",
      "horizontal press: incline dumbbell press, bench press or push up",
      "row and an arms superset",
    ],
    primer: "power: kettlebell swings or med ball throws, plus 20 to 30 pogo hops",
  },
];

export const SESSION_TYPES = [...SPLIT, ...FULL_BODY];

/** Below this many sessions a week, every session is full body. */
export const SPLIT_FROM = 3.5;

/**
 * Hard sets per muscle per week, as a range, for someone past her first few
 * months of lifting.
 *
 * At least 10 sets a week (ACSM 2026), with most of the growth between about
 * 12 and 20 (Baz-Valle 2022), and diminishing but real returns above that
 * (Pelland 2025). Secondary muscles count half a set, which is the counting
 * that predicted growth best. Smaller muscles get plenty of indirect work from
 * the big lifts, which is why their ranges are lower.
 *
 * The upper body is not short changed. Women start with proportionally less
 * upper body muscle and gain it at the same percentage rate (Refalo 2025;
 * Roberts 2020), so back, chest and shoulders get the same weight as glutes.
 */
export const WEEKLY_SETS: Record<Muscle, [number, number]> = {
  glutes: [12, 20],
  quads: [10, 16],
  hamstrings: [8, 14],
  adductors: [4, 8],
  calves: [4, 8],
  back: [12, 20],
  chest: [10, 16],
  shoulders: [10, 16],
  biceps: [6, 12],
  triceps: [6, 12],
  core: [4, 10],
};

/** A beginner grows on less, and recovers from less. */
export const BEGINNER_SCALE = 0.7;

/** A priority muscle is taken to the top of its range and a little past. */
export const PRIORITY_BONUS = 4;
export const PRIORITY_CEILING = 24;

/** Past about 10 hard sets for one muscle in one session, the rest is junk. */
export const MAX_SETS_PER_MUSCLE_PER_SESSION = 10;

/**
 * The role an exercise plays decides its reps, how close to failure it goes,
 * and its rest.
 *
 * Anything from about 5 to 30 reps builds muscle when the set ends close to
 * failure (Schoenfeld 2017), so the ranges are chosen for what else they buy.
 *
 * Close to failure matters: growth improves as sets end nearer to it
 * (Robinson 2024). Going all the way adds little on average (Refalo 2023,
 * 2024; Grgic 2022) and costs a day or two of extra recovery on heavy
 * compounds (Moran-Navarro 2017). So: heavy barbell work stops a rep or two
 * short and never fails on purpose; isolation and machine work, where failure
 * is safe and cheap, takes its last set all the way. Light, high rep sets only
 * work when taken to or very near failure (Lasevicius 2022).
 *
 * Rest is never under a minute, because rushing rest between hard sets costs
 * growth, with no clear benefit past about 90 seconds for most work (Singer
 * 2024). Women hold their reps better from set to set (Hunter; Fulco 1999;
 * Nuckols 2026), so rests sit at the shorter end, set by readiness.
 */
export const ROLES = {
  heavy: {
    what: "heavy anchor: barbell squat, deadlift, hip thrust, bench, overhead press",
    reps: "5-8",
    rir: "2 to 3 reps in reserve early in a block, 1 to 2 late",
    failure: "never planned; the set ends when form starts to slip",
    restSec: "120 to 150",
  },
  compound: {
    what: "machine, cable or dumbbell compound",
    reps: "8-12",
    rir: "1 to 2 reps in reserve",
    failure: "last set may go to failure in weeks 3 and 4, on machines and cables only",
    restSec: "75 to 120",
  },
  isolation: {
    what: "isolation: curls, raises, extensions, leg curls, abduction",
    reps: "10-20",
    rir: "0 to 1 reps in reserve",
    failure: "last set to failure",
    restSec: "60 to 75",
  },
  bodyweight: {
    what: "bodyweight: push ups, inverted rows, pull ups, dips",
    reps: "6-20",
    rir: "1 to 2 reps in reserve",
    failure: "last set may go to failure",
    restSec: "60 to 90",
  },
  light: {
    what: "light, high rep work over 20 reps",
    reps: "20-30",
    rir: "0 to 1 reps in reserve",
    failure: "required: a light set only counts when it ends at or next to failure",
    restSec: "60 to 75",
  },
};

/**
 * Failure is a tool with a recovery bill, so it is rationed: at most one
 * failure set per exercise, three per muscle per session, and none at all on
 * a heavy anchor or in the lighter week. The coach enforces these whatever
 * the model writes.
 */
export const FAILURE_SETS_PER_MUSCLE_PER_SESSION = 3;

/**
 * Training blocks: four weeks building, then one lighter week.
 *
 * Effort rises through the block, from three reps in reserve to one, and the
 * fifth week halves the sets and backs off, so the next block starts fresh.
 * A deload every four to eight weeks is the expert consensus (Bell 2023); the
 * five week rhythm is short enough to fit around a life.
 */
export const BLOCK_WEEKS = 5;

export interface WeekPlan {
  /** "build", "lighter week". Said as "week 3 of block 2, build". */
  name: string;
  label: string;
  /** Reps in reserve for the main work this week. */
  rir: string;
  /** What changes, in one line, for the prompt. */
  note: string;
  deload: boolean;
}

export const WEEKS: WeekPlan[] = [
  {
    name: "settle in",
    label: "Week 1, settle in",
    rir: "2 to 3 in reserve on compounds, 1 on isolation",
    note: "First week of a block. New accessories, anchors at a weight she owns. Calibrate: on one machine or isolation exercise, she calls 2 in reserve on the last set, then keeps going to failure and counts. Four or more extra reps means the weight goes up. Most people underestimate what they have left by about a rep.",
    deload: false,
  },
  {
    name: "build",
    label: "Week 2, build",
    rir: "2 in reserve on compounds, isolation last set to failure",
    note: "Add load or reps where last week allowed.",
    deload: false,
  },
  {
    name: "build",
    label: "Week 3, build",
    rir: "1 to 2 in reserve on compounds; machine, cable and isolation last sets to failure",
    note: "Push the anchors.",
    deload: false,
  },
  {
    name: "peak",
    label: "Week 4, peak",
    rir: "1 in reserve on heavy compounds; machine, cable and isolation last sets to failure",
    note: "The hardest week. One drop set on the last set of an isolation exercise is fine here. Heavy barbell work still never fails on purpose.",
    deload: false,
  },
  {
    name: "lighter week",
    label: "Week 5, lighter week",
    rir: "4 to 5 in reserve, nothing to failure",
    note: "Deload. Same exercises and same days, about half the hard sets, the same load or 10% less. Keep the jumps and the fun at lower volume.",
    deload: true,
  },
];

/** Fewer sessions than this in a block and there is no fatigue to shed. */
export const DELOAD_MIN_SESSIONS = 8;

/** A break this long starts a new block, gently. */
export const RE_ENTRY_AFTER_DAYS = 12;

/**
 * Impact for bone.
 *
 * Jumping builds bone in young women at doses as small as 10 to 50 jumps a
 * day (Kato 2006, Bassey 1998), and bone responds best to short bouts with
 * rest between jumps rather than one long bout. A hypertrophy program gives
 * almost none of this on its own, which makes it the biggest gap a muscle
 * plan leaves.
 */
export const IMPACT = {
  /** Foot contacts a week. */
  weekly: [100, 200] as const,
  perSession: [30, 60] as const,
  /** Jumps per set, and seconds between sets. */
  perSet: [5, 10] as const,
  restSec: [20, 60] as const,
};

/**
 * Hard conditioning, for the heart.
 *
 * Cardiorespiratory fitness is among the strongest predictors of long life,
 * and short hard intervals raise it efficiently (Helgerud 2007, Gillen 2016).
 * Adding cardio does not measurably cost muscle (Schumann 2022), especially on
 * a bike or rower rather than running.
 */
export const CONDITIONING = {
  /** Hard minutes a week, from finishers and intervals. */
  weeklyHardMinutes: [8, 20] as const,
  preferredModes: ["bike", "rower", "ski erg", "sled", "kettlebell"],
};

/**
 * The share of a session each part gets.
 *
 * At least 70% of the time is the muscle work. The fun parts (primer, finisher,
 * core and carries) are real, and capped: when time is short the finisher is
 * cut first, the primer second, and the muscle work last.
 */
export const BUDGET = {
  warmup: 0.12,
  primer: 0.08,
  main: 0.65,
  finisher: 0.15,
} as const;

/**
 * The fun, as a menu.
 *
 * Every format here keeps the muscle work honest when it is used in its
 * place. Supersets of opposing muscles build the same muscle in less time
 * (Zhang 2025). Finishers are where the variety lives, because nothing there
 * has to be progressed week to week.
 */
export const FINISHERS: { format: string; idea: string; conditioning: boolean }[] = [
  { format: "EMOM", idea: "8 to 12 min alternating a swing, a carry and a bodyweight move", conditioning: true },
  { format: "intervals", idea: "Norwegian style: 4 x 3 to 4 min hard on bike or rower, 2 to 3 min easy", conditioning: true },
  { format: "intervals", idea: "sprint ladder: 6 to 8 x 15 to 20 sec all out on the bike, 60 to 90 sec easy", conditioning: true },
  { format: "AMRAP", idea: "8 to 10 min of three movements, steady, counting rounds to beat next time", conditioning: true },
  { format: "complex", idea: "dumbbell or kettlebell complex: 4 to 5 moves back to back without putting it down", conditioning: true },
  { format: "carries", idea: "carry medley: farmer, suitcase, front rack, overhead, 30 to 40 m each", conditioning: false },
  { format: "ladder", idea: "up and down ladder of two moves, 1 to 5 to 1", conditioning: true },
  { format: "flow", idea: "ground flow: bear crawl, crab reach, beast to lateral step, 6 to 8 min", conditioning: false },
  { format: "intervals", idea: "sled push and pull, 6 to 8 lengths", conditioning: true },
];

/**
 * Things always in the mix, because they protect the joints of a young woman
 * who jumps and lifts: landing well, strong hamstrings and adductors, calves
 * that can take impact, and as much pulling as pushing.
 */
export const ALWAYS = [
  "The warm up raises temperature, then rehearses landing: soft knees over toes, hips back, quiet feet.",
  "Every lower day has single leg work. Balance or a single leg reach belongs in every warm up.",
  "Hamstrings are trained lengthened at least once a week: Romanian deadlift, Nordic curl or seated curl.",
  "Adductors and calves get direct work at least once a week each.",
  "Pulling sets at least equal pushing sets across the week.",
  "Carries at least once a week.",
];
