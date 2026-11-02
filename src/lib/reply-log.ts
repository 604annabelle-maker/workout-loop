/**
 * What a reply says, as data.
 *
 * Pure. A reply used to be filed as prose and replayed to the model, which
 * meant progress was measured against what had been *prescribed*: nothing in
 * the system knew whether the hip thrusts went 10, 10, 9 or 6, 5, 4. Now a
 * reply is read into this shape, so the next load is set from what she
 * actually did and the weekly numbers count what actually happened.
 *
 * The prose is still kept and still replayed. This is read alongside it, never
 * instead of it, because a reply often says something no schema anticipated.
 *
 * Two readers produce it. With an API key, the model reads anything she writes
 * (./reply-read.ts). Without one, `parseShorthand` reads the compact format the
 * email suggests, so the loop is testable offline and a terse reply never
 * needs a model at all.
 */

export const EFFORTS = ["easy", "right", "hard", "failed", ""] as const;
export type Effort = (typeof EFFORTS)[number];

export interface LoggedSet {
  /** 0 for bodyweight. */
  weightKg: number;
  reps: number;
}

export interface LoggedExercise {
  /** The plan's label it answers, "A", "B1". Empty when it could not be tied. */
  label: string;
  /** As the plan names it when tied, otherwise as she wrote it. */
  name: string;
  sets: LoggedSet[];
  effort: Effort;
  skipped: boolean;
  note: string;
}

/**
 * How she was, on a 1 to 5 scale where 0 means not mentioned. Not mentioned is
 * the usual case and must never read as "terrible".
 */
export interface CheckIn {
  energy: number;
  sleep: number;
  soreness: number;
  /** How much she enjoyed it. Steers which formats come back. */
  enjoyment: number;
  /** She said her period started, today or around this session. */
  periodStarted: boolean;
  /** Cycle day if she gave one. 0 when not. */
  cycleDay: number;
  /** "cramps", "bloated", "headache". Only what she named. */
  symptoms: string[];
  /** Body parts or movements that hurt. Never guessed. */
  pain: string[];
}

export interface ReplyLog {
  exercises: LoggedExercise[];
  checkIn: CheckIn;
  /** Movements or formats she said she liked. */
  liked: string[];
  /** Movements or formats she said she did not. */
  disliked: string[];
  /** Anything she asked for next time, in her words. */
  requests: string;
}

export const EMPTY_CHECK_IN: CheckIn = {
  energy: 0,
  sleep: 0,
  soreness: 0,
  enjoyment: 0,
  periodStarted: false,
  cycleDay: 0,
  symptoms: [],
  pain: [],
};

const setSchema = {
  type: "object",
  additionalProperties: false,
  required: ["weightKg", "reps"],
  properties: {
    weightKg: { type: "number", description: "Kilograms. 0 for bodyweight. Convert pounds." },
    reps: { type: "integer" },
  },
} as const;

/** What the API is constrained to return when it reads a reply. */
export const REPLY_LOG_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["exercises", "checkIn", "liked", "disliked", "requests"],
  properties: {
    exercises: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "name", "sets", "effort", "skipped", "note"],
        properties: {
          label: { type: "string", description: "The plan label it answers, or empty." },
          name: { type: "string" },
          sets: { type: "array", items: setSchema },
          effort: { type: "string", enum: [...EFFORTS] },
          skipped: { type: "boolean" },
          note: { type: "string" },
        },
      },
    },
    checkIn: {
      type: "object",
      additionalProperties: false,
      required: [
        "energy",
        "sleep",
        "soreness",
        "enjoyment",
        "periodStarted",
        "cycleDay",
        "symptoms",
        "pain",
      ],
      properties: {
        energy: { type: "integer", description: "1 to 5, 0 if not mentioned." },
        sleep: { type: "integer", description: "1 to 5, 0 if not mentioned." },
        soreness: { type: "integer", description: "1 to 5, 0 if not mentioned." },
        enjoyment: { type: "integer", description: "1 to 5, 0 if not mentioned." },
        periodStarted: { type: "boolean" },
        cycleDay: { type: "integer", description: "0 if not mentioned." },
        symptoms: { type: "array", items: { type: "string" } },
        pain: { type: "array", items: { type: "string" } },
      },
    },
    liked: { type: "array", items: { type: "string" } },
    disliked: { type: "array", items: { type: "string" } },
    requests: { type: "string" },
  },
} as const;

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

const scale = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(5, Math.round(v))) : 0;

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(text).filter(Boolean) : [];

function readSet(v: unknown): LoggedSet | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const reps = typeof r.reps === "number" && Number.isFinite(r.reps) ? Math.round(r.reps) : 0;
  const weight = typeof r.weightKg === "number" && Number.isFinite(r.weightKg) ? r.weightKg : 0;
  if (reps <= 0 || reps > 100 || weight < 0 || weight > 500) return null;
  return { weightKg: Math.round(weight * 4) / 4, reps };
}

/** Checks and tidies a log, whichever reader produced it. Never throws. */
export function readReplyLog(raw: unknown): ReplyLog {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const c = (r.checkIn && typeof r.checkIn === "object" ? r.checkIn : {}) as Record<
    string,
    unknown
  >;

  const exercises: LoggedExercise[] = [];
  for (const e of Array.isArray(r.exercises) ? r.exercises : []) {
    if (!e || typeof e !== "object") continue;
    const x = e as Record<string, unknown>;
    const sets = (Array.isArray(x.sets) ? x.sets : [])
      .map(readSet)
      .filter((s): s is LoggedSet => s !== null);
    const skipped = x.skipped === true;
    const effort = EFFORTS.includes(x.effort as Effort) ? (x.effort as Effort) : "";
    const label = text(x.label).toUpperCase();
    const name = text(x.name).toUpperCase();

    // An entry with nothing in it is noise the progress maths would have to skip.
    if (!label && !name) continue;
    if (sets.length === 0 && !skipped && !effort && !text(x.note)) continue;

    exercises.push({ label, name, sets, effort, skipped, note: text(x.note) });
  }

  return {
    exercises,
    checkIn: {
      energy: scale(c.energy),
      sleep: scale(c.sleep),
      soreness: scale(c.soreness),
      enjoyment: scale(c.enjoyment),
      periodStarted: c.periodStarted === true,
      cycleDay:
        typeof c.cycleDay === "number" && c.cycleDay > 0 && c.cycleDay < 60
          ? Math.round(c.cycleDay)
          : 0,
      symptoms: strings(c.symptoms),
      pain: strings(c.pain),
    },
    liked: strings(r.liked),
    disliked: strings(r.disliked),
    requests: text(r.requests),
  };
}

/** True when a log carries nothing at all, so it is not worth storing. */
export function isEmptyLog(log: ReplyLog): boolean {
  const c = log.checkIn;
  return (
    log.exercises.length === 0 &&
    !c.energy &&
    !c.sleep &&
    !c.soreness &&
    !c.enjoyment &&
    !c.periodStarted &&
    !c.cycleDay &&
    c.symptoms.length === 0 &&
    c.pain.length === 0 &&
    log.liked.length === 0 &&
    log.disliked.length === 0 &&
    !log.requests
  );
}

/** What a plan exercise looks like to the shorthand reader. */
export interface Prescribed {
  label: string;
  name: string;
  sets: number;
  loadKg: number;
}

const EFFORT_WORDS: Record<string, Effort> = {
  easy: "easy",
  light: "easy",
  ok: "right",
  good: "right",
  right: "right",
  solid: "right",
  hard: "hard",
  tough: "hard",
  heavy: "hard",
  failed: "failed",
  fail: "failed",
};

/** "A", "B1", "C2'". At the start of a line, before the numbers. */
const LABEL = /^([A-Za-z]\d?'?)\s*[:.)-]?\s+/;

function effortIn(words: string): Effort {
  for (const word of words.toLowerCase().split(/[^a-z]+/)) {
    if (EFFORT_WORDS[word]) return EFFORT_WORDS[word];
  }
  return "";
}

function repsIn(s: string): number[] {
  return (s.match(/\d+/g) ?? []).map(Number).filter((n) => n > 0 && n <= 100);
}

function checkInLine(line: string, checkIn: CheckIn): boolean {
  const l = line.toLowerCase();
  let hit = false;

  const rated = [
    ["energy", /\benergy\s*[:=]?\s*(\d)/],
    ["sleep", /\bsleep\s*[:=]?\s*(\d)/],
    ["soreness", /\bsore(?:ness)?\s*[:=]?\s*(\d)/],
    ["enjoyment", /\b(?:fun|enjoy(?:ment|ed)?)\s*[:=]?\s*(\d)/],
  ] as const;

  for (const [key, pattern] of rated) {
    const m = l.match(pattern);
    if (m) {
      checkIn[key] = scale(Number(m[1]));
      hit = true;
    }
  }

  const day = l.match(/\b(?:cycle|period)\s*day\s*(\d{1,2})\b/);
  if (day) {
    checkIn.cycleDay = Number(day[1]);
    hit = true;
  }

  if (/\bperiod\b/.test(l) && /\b(started|start|came|today|day\s*1)\b/.test(l)) {
    checkIn.periodStarted = true;
    if (!checkIn.cycleDay) checkIn.cycleDay = 1;
    hit = true;
  }

  for (const symptom of ["cramps", "bloated", "headache", "tired", "nauseous"]) {
    if (l.includes(symptom) && !checkIn.symptoms.includes(symptom)) {
      checkIn.symptoms.push(symptom);
      hit = true;
    }
  }

  const pain = l.match(/\b(?:pain|hurt|hurts|sore|tweaked)\b\s*(?:in|on|my)?\s*(?:my\s+)?([a-z ]{3,30})?/);
  if (pain && /\b(?:pain|hurt|hurts|tweaked)\b/.test(l)) {
    checkIn.pain.push(line.trim());
    hit = true;
  }

  return hit;
}

/**
 * Reads the compact format the email suggests:
 *
 *   A 72.5 x 10 10 9
 *   B1 12x12,12,11 hard
 *   C done
 *   D skip
 *   energy 4, fun 5
 *
 * A line it does not understand is left for the prose, which is replayed to
 * the model regardless. Only exercises whose label is in the plan are read,
 * because "I 3 x 10" could otherwise be anything.
 */
export function parseShorthand(body: string, plan: Prescribed[]): ReplyLog {
  const byLabel = new Map(plan.map((p) => [p.label.toUpperCase(), p]));
  const log: ReplyLog = {
    exercises: [],
    checkIn: { ...EMPTY_CHECK_IN, symptoms: [], pain: [] },
    liked: [],
    disliked: [],
    requests: "",
  };

  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    const labelled = line.match(LABEL);
    const prescribed = labelled ? byLabel.get(labelled[1].toUpperCase()) : undefined;

    if (labelled && prescribed) {
      const rest = line.slice(labelled[0].length).trim();
      const entry: LoggedExercise = {
        label: prescribed.label,
        name: prescribed.name,
        sets: [],
        effort: effortIn(rest),
        skipped: /\b(skip|skipped|didn'?t|did not)\b/i.test(rest),
        note: "",
      };

      // "72.5 x 10 10 9", "72.5kg x 10,10,9", "12x12/12/11"
      const loaded = rest.match(/^(\d+(?:[.,]\d+)?)\s*(?:kg)?\s*[x×*]\s*([\d\s,/]+)/i);
      // "done" or "as written": every set at the prescribed load and reps
      // is not knowable, so it is recorded as done without numbers.
      if (loaded) {
        const weight = Number(loaded[1].replace(",", "."));
        entry.sets = repsIn(loaded[2]).map((reps) => ({ weightKg: weight, reps }));
      } else if (/^[\d\s,/]+(\s|$)/.test(rest)) {
        // Reps only, at the prescribed load: "A 10 10 9".
        const reps = repsIn(rest.match(/^[\d\s,/]+/)?.[0] ?? "");
        entry.sets = reps.map((r) => ({ weightKg: prescribed.loadKg, reps: r }));
      }

      if (/\bdone\b|as written|all sets/i.test(rest) && !entry.effort) entry.effort = "right";

      if (entry.sets.length || entry.skipped || entry.effort) log.exercises.push(entry);
      continue;
    }

    checkInLine(line, log.checkIn);
  }

  return readReplyLog(log);
}
