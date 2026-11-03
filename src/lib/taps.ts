/**
 * Logging by tapping in the email.
 *
 * Pure. The dynamic email (./workout-amp.ts) has a row of pills under each
 * exercise: done, easy, hard, skip, and undo; a "did this instead" under its
 * swap; a box for what changed; and at the end, "all done" and a box for
 * anything else. Each tap posts to /api/log, which files it here.
 *
 * The rules she agreed:
 * - The last tap counts. Undo clears an exercise back to nothing logged.
 * - A new note replaces the old one for that exercise.
 * - "All done" marks everything not yet tapped as done.
 * - Nothing tapped means nothing is assumed.
 *
 * What is stored is what she did, in her terms. `tapsToLog` turns it into the
 * same log a reply produces, so the coach reads both the same way.
 */

import { mainExercises, type Plan } from "./plan";
import {
  checkInLine,
  EMPTY_CHECK_IN,
  parseShorthand,
  type LoggedExercise,
  type ReplyLog,
} from "./reply-log";

export const HOWS = ["done", "easy", "hard", "skip", "swap"] as const;
export type How = (typeof HOWS)[number];

/** Longest note kept, in characters. The boxes stop her at the same length. */
export const NOTE_MAX = 300;

/** The `ex` of the forms at the end, about the whole session. */
export const WHOLE = "all";

export interface TapEntry {
  how: How | null;
  note: string;
  /** ISO. When it last changed. */
  at: string;
}

export interface Taps {
  entries: Record<string, TapEntry>;
  /** "Anything else about today?" */
  comment: string;
  updatedAt: string;
}

export function emptyTaps(): Taps {
  return { entries: {}, comment: "", updatedAt: "" };
}

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Checks and tidies what was stored. Never throws. */
export function readTaps(raw: unknown): Taps {
  if (!raw || typeof raw !== "object") return emptyTaps();
  const r = raw as Record<string, unknown>;
  const entries: Record<string, TapEntry> = {};
  const rawEntries = r.entries && typeof r.entries === "object" ? (r.entries as Record<string, unknown>) : {};

  for (const [label, value] of Object.entries(rawEntries)) {
    if (!value || typeof value !== "object") continue;
    const v = value as Record<string, unknown>;
    const how = HOWS.includes(v.how as How) ? (v.how as How) : null;
    const note = text(v.note).slice(0, NOTE_MAX);
    if (!how && !note) continue;
    entries[label.toUpperCase()] = { how, note, at: text(v.at) };
  }

  return { entries, comment: text(r.comment).slice(0, NOTE_MAX), updatedAt: text(r.updatedAt) };
}

/** One post from a form in the email. */
export interface TapAction {
  /** An exercise label, or WHOLE. */
  ex: string;
  /** A pill, "clear" for undo, or for WHOLE: "alldone" or "skipall". */
  how?: string;
  note?: string;
}

export interface Applied {
  taps: Taps;
  /** What the email shows back, after "Saved: ". */
  saved: string;
}

const SAID: Record<How, string> = {
  done: "done",
  easy: "easy",
  hard: "hard",
  skip: "skipped",
  swap: "did the swap",
};

/**
 * Files one tap. Returns null when the post makes no sense for this workout,
 * which the endpoint answers with an error and the email shows as not saved.
 */
export function applyTap(before: Taps, action: TapAction, labels: string[], now: Date): Applied | null {
  const taps: Taps = { ...before, entries: { ...before.entries }, updatedAt: now.toISOString() };
  const at = now.toISOString();
  const ex = text(action.ex).toUpperCase();
  const how = text(action.how).toLowerCase();
  const note = text(action.note).slice(0, NOTE_MAX);

  if (ex === WHOLE.toUpperCase()) {
    if (how === "alldone" || how === "skipall") {
      const fill: How = how === "alldone" ? "done" : "skip";
      let marked = 0;
      for (const label of labels) {
        const entry = taps.entries[label];
        if (entry?.how) continue;
        taps.entries[label] = { how: fill, note: entry?.note ?? "", at };
        marked += 1;
      }
      if (marked === 0) return { taps, saved: "all already logged" };
      return { taps, saved: fill === "done" ? "everything else done" : "everything else skipped" };
    }
    if (note) {
      taps.comment = note;
      return { taps, saved: `"${note}"` };
    }
    return null;
  }

  if (!labels.includes(ex)) return null;
  const entry = taps.entries[ex] ?? { how: null, note: "", at };

  if (how === "clear") {
    // Undo, unless she typed something after it: then the note stands alone.
    if (!note) {
      delete taps.entries[ex];
      return { taps, saved: "cleared" };
    }
    taps.entries[ex] = { how: null, note, at };
    return { taps, saved: `"${note}"` };
  }

  const pill = HOWS.find((h) => h === how) ?? null;
  if (!pill && !note) return null;

  const next: TapEntry = { how: pill ?? entry.how, note: note || entry.note, at };
  taps.entries[ex] = next;

  const parts = [next.how ? SAID[next.how] : "", next.note ? `"${next.note}"` : ""].filter(Boolean);
  return { taps, saved: parts.join(", ") };
}

/** "A done · B1 hard · C skipped". What the email's summary line shows. */
export function summary(taps: Taps, labels: string[]): string {
  const parts = labels
    .map((label) => {
      const e = taps.entries[label];
      if (!e) return "";
      const what = e.how ? SAID[e.how] : "note";
      return `${label} ${what}`;
    })
    .filter(Boolean);
  return parts.length ? parts.join(" · ") : "nothing yet";
}

const EFFORT_OF: Record<"done" | "easy" | "hard", LoggedExercise["effort"]> = {
  done: "right",
  easy: "easy",
  hard: "hard",
};

/**
 * What the taps say, as the same log a reply produces, plus her words as
 * notes for the model to read.
 *
 * A pill is the answer for its exercise. A note adds to it: numbers in it are
 * what she did ("20kg 10 10 8"), effort words count ("felt easy"), "skip" or
 * "swap" in it mean what they say, and anything else is kept as words. A
 * note on its own, with numbers, logs the exercise; one with only words logs
 * nothing, since nothing is assumed.
 */
export function tapsToLog(plan: Plan, taps: Taps): { log: ReplyLog; notes: string[] } {
  const log: ReplyLog = {
    exercises: [],
    checkIn: { ...EMPTY_CHECK_IN, symptoms: [], pain: [] },
    liked: [],
    disliked: [],
    requests: "",
  };
  const notes: string[] = [];

  for (const e of mainExercises(plan)) {
    const entry = taps.entries[e.label];
    if (!entry) continue;

    const read = entry.note
      ? parseShorthand(`${e.label} ${entry.note}`, [{ label: e.label, name: e.name, sets: e.sets, loadKg: e.loadKg }])
          .exercises[0]
      : undefined;
    if (entry.note) {
      notes.push(`${e.label} ${e.name}: ${entry.note}`);
      checkInLine(entry.note, log.checkIn);
    }

    const swapped = entry.how === "swap" || (!!entry.note && /\bswap(ped)?\b/i.test(entry.note));
    const skipped = entry.how === "skip" || (!entry.how && !!read?.skipped);
    const effort =
      read?.effort || (entry.how && entry.how in EFFORT_OF ? EFFORT_OF[entry.how as keyof typeof EFFORT_OF] : swapped ? "right" : "");
    const sets = read?.sets ?? [];

    if (!entry.how && !skipped && sets.length === 0 && !swapped) continue;

    log.exercises.push({
      label: e.label,
      name: e.name,
      sets: skipped ? [] : sets,
      effort: skipped ? "" : effort || "right",
      skipped,
      note: entry.note,
      ...(swapped && e.swap ? { swappedTo: e.swap.name } : {}),
    });
  }

  if (taps.comment) {
    notes.push(taps.comment);
    checkInLine(taps.comment, log.checkIn);
  }

  return { log, notes };
}
