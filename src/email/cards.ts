/**
 * The content of one workout email, shared by its three versions (spec §The email).
 *
 * Pure. Everything the dynamic, HTML and text versions show comes from here,
 * so the three can never disagree about a number.
 */

import { restText } from "../lib/text";
import { dateOnly } from "../lib/when";
import { exercise } from "../training/catalogue";
import { kg, label as weightLabel } from "../training/equipment";
import { LABEL } from "../training/rules";
import { SESSION_NAME } from "../training/skeleton";
import type { SummaryRow } from "../training/summary";
import type { PlannedExercise, PlanV2, Prescription } from "../training/types";
import { stepsOf } from "./draft";

export interface Frame {
  file: string;
  width: number;
  height: number;
}

export interface Numbers {
  exerciseId: string;
  name: string;
  /** Null for bodyweight and bands. */
  weight: number | null;
  /** "each hand", "total with bar", "on the stack", "bodyweight". */
  weightLabel: string;
  /** The weights − / + and the tap-a-weight row move between. */
  steps: number[];
  reps: number;
  range: [number, number];
  findIt: boolean;
  form: string;
  /** The drawing's two frames, and a line on how it differs when it shows a near version. */
  frames: Frame[];
  drawingNote: string;
}

export interface Card {
  /** Safe for an id: c1, c2, ... */
  id: string;
  slot: string;
  muscle: string;
  sets: number;
  rest: string;
  effort: string;
  main: Numbers;
  swap: Numbers | null;
  why?: string;
  finisher: boolean;
}

export interface WarmLine {
  name: string;
  text: string;
  practice: boolean;
  /** Its drawing, under the small arrow by its name. */
  frames: Frame[];
}

export interface Mail {
  subject: string;
  /** "Upper" */
  title: string;
  /** "55 min · 6 exercises · Fri 13 Nov" */
  sub: string;
  deload: boolean;
  changes: { noteId: string; text: string }[];
  warmup: WarmLine[];
  warmupMinutes: number;
  cards: Card[];
  summary: SummaryRow[];
  /** Where taps post to. Null: no dynamic version. */
  logUrl: string | null;
  /** Where pictures load from. */
  base: string | null;
  preview: boolean;
}

export type Pictures = (exerciseId: string) => { frames: Frame[]; note: string };

function numbers(p: Prescription, pictures: Pictures): Numbers {
  const e = exercise(p.exerciseId);
  const pic = pictures(p.exerciseId);
  return {
    exerciseId: p.exerciseId,
    name: e?.name ?? p.exerciseId,
    weight: p.weight,
    weightLabel: weightLabel(p.load),
    steps: stepsOf(p),
    reps: p.reps,
    range: p.range,
    findIt: p.findIt,
    form: e?.form ?? "",
    frames: pic.frames,
    drawingNote: pic.note,
  };
}

/** "3 × 8" */
export const dose = (sets: number, reps: number) => `${sets} × ${reps}`;

/** "40 kg each hand", "bodyweight", "find it, start at 20 kg total with bar" */
export function weightText(n: Numbers): string {
  if (n.weight === null) return n.weightLabel;
  const w = `${kg(n.weight)} kg ${n.weightLabel}`;
  return n.findIt ? `find it, start at ${w}` : w;
}

export function compose(input: {
  plan: PlanV2;
  date: Date;
  summary: SummaryRow[];
  logUrl: string | null;
  base: string | null;
  pictures: Pictures;
  preview?: boolean;
}): Mail {
  const { plan } = input;
  const title = SESSION_NAME[plan.position.type];
  const work = plan.exercises.filter((x) => !x.finisher).length;
  const cards: Card[] = plan.exercises.map((x: PlannedExercise, i) => ({
    id: `c${i + 1}`,
    slot: x.slot,
    muscle: LABEL[x.muscle],
    sets: x.sets,
    rest: restText(x.rest),
    effort: x.effort,
    main: numbers(x.main, input.pictures),
    swap: x.swap ? numbers(x.swap, input.pictures) : null,
    ...(x.why ? { why: x.why } : {}),
    finisher: !!x.finisher,
  }));
  const warmup: WarmLine[] = plan.warmup.map((w) => {
    const name = exercise(w.exerciseId)?.name ?? w.exerciseId;
    const frames = input.pictures(w.exerciseId).frames;
    return w.practice
      ? { name, text: `${name} × ${w.reps} at ${w.weight === null ? "a light weight" : `${kg(w.weight)} kg`}, light practice set`, practice: true, frames }
      : { name, text: `${name} × ${w.reps}`, practice: false, frames };
  });
  const day = dateOnly(input.date);
  return {
    subject: `${input.preview ? "Preview · " : ""}${title} · ${day}`,
    title,
    sub: `${plan.minutes} min · ${work} exercises${plan.deload ? " · easy week" : ""} · ${day}`,
    deload: plan.deload,
    changes: plan.changes,
    warmup,
    warmupMinutes: plan.warmup.length * 2,
    cards,
    summary: input.summary,
    logUrl: input.logUrl,
    base: input.base,
    preview: !!input.preview,
  };
}

/** How to log by replying, for the plain versions. */
export const REPLY_HELP = [
  "To log, reply with: done",
  "Or only what was different, one per line:",
  "RDL 42.5 8 8 7",
  "Anything else, in your own words.",
];
