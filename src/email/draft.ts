/**
 * What she has set in the dynamic email so far (her reply, 19 Nov 2026: "if
 * I close the Gmail app and I didn't press save it forgets").
 *
 * Pure. Every tap in the email posts the email's state here as it happens,
 * so the server holds it. A dynamic email cannot read anything on open by
 * itself (amp-state is inline only), so when she comes back a button asks
 * for it, and the answer is the whole email's state in the shape amp.ts
 * keeps it, ready for one AMP.setState.
 *
 * Each post carries every card, so a tap Gmail dropped while the one before
 * was still sending is caught up by the next. It replaces the draft only when
 * the email already shows the draft (she picked up where she left off, or
 * there was nothing to pick up); otherwise only the card she touched is
 * taken, so reopening and tapping before picking up never wipes the rest.
 *
 * Not training: only the Save logs. The draft is kept after a Save too, so
 * reopening shows what was saved.
 */

import { nearest } from "../training/equipment";
import type { PlanV2, Prescription } from "../training/types";

/** One card as she left it. Weights are indices into the card's steps. */
export interface CardDraft {
  /** Main exercise: weight index and reps. */
  w: number;
  r: number;
  /** Skipped. */
  k: boolean;
  /** Did the swap instead. */
  s: boolean;
  /** The swap's weight index and reps. */
  sw: number;
  sr: number;
}

export interface Draft {
  cards: Record<string, CardDraft>;
  note: string;
  /** The note last filed as a comment, so saving twice does not file it twice. */
  filed: string;
}

type Planned = PlanV2["exercises"][number];

/** The weights − / + move between, the same list the email shows. */
export const stepsOf = (p: Prescription): number[] => (p.steps.length ? p.steps : p.weight !== null ? [p.weight] : []);

/** Where a weight sits in its steps; 0 when it is not a weighted exercise. */
export function indexOf(weight: number | null, steps: number[]): number {
  if (weight === null || !steps.length) return 0;
  const at = nearest(weight, steps);
  return Math.max(0, steps.findIndex((s) => Math.abs(s - (at ?? weight)) < 1e-9));
}

/** The card as the email starts it: the planned numbers, nothing skipped. */
export function plannedCard(x: Planned): CardDraft {
  return {
    w: indexOf(x.main.weight, stepsOf(x.main)),
    r: x.main.reps,
    k: false,
    s: false,
    sw: x.swap ? indexOf(x.swap.weight, stepsOf(x.swap)) : 0,
    sr: x.swap ? x.swap.reps : 0,
  };
}

const int = (raw: unknown): number | null => {
  const n = Number(raw);
  return Number.isInteger(n) ? n : null;
};

const index = (raw: unknown, steps: number[], fallback: number) => {
  const n = int(raw);
  return n !== null && n >= 0 && n < Math.max(1, steps.length) ? n : fallback;
};

const reps = (raw: unknown, fallback: number) => {
  const n = int(raw);
  return n !== null && n >= 1 && n <= 50 ? n : fallback;
};

const flag = (raw: unknown) => raw === true || raw === "1" || raw === 1 || raw === "true";

/** One card's state from what was posted or stored, anything out of range replaced by the plan. */
export function readCard(raw: Record<string, unknown>, x: Planned): CardDraft {
  const p = plannedCard(x);
  return {
    w: index(raw.w, stepsOf(x.main), p.w),
    r: reps(raw.r, p.r),
    k: flag(raw.k),
    s: !!x.swap && flag(raw.s),
    sw: x.swap ? index(raw.sw, stepsOf(x.swap), p.sw) : 0,
    sr: x.swap ? reps(raw.sr, p.sr) : 0,
  };
}

/** Card ids are c1, c2, ... in plan order, as in cards.ts. */
export const cardId = (i: number) => `c${i + 1}`;

/** A stored draft, every card filled in: what she set, or the plan where she set nothing. */
export function readDraft(raw: unknown, plan: PlanV2): Draft {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const cards: Record<string, CardDraft> = {};
  plan.exercises.forEach((x, i) => {
    const c = r[cardId(i)];
    cards[cardId(i)] = c && typeof c === "object" ? readCard(c as Record<string, unknown>, x) : plannedCard(x);
  });
  return {
    cards,
    note: typeof r.note === "string" ? r.note.slice(0, 1000) : "",
    filed: typeof r.filed === "string" ? r.filed.slice(0, 1000) : "",
  };
}

/** She has set something: a card or a note was saved as she went. */
export function hasDraft(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  return Object.keys(raw).some((k) => /^c\d+$/.test(k) || (k === "note" && !!(raw as Record<string, unknown>).note));
}

/** The answer to "pick up where I left off": the email's state, keyed as amp.ts keys it. */
export function restoreState(plan: PlanV2, draft: Draft): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  plan.exercises.forEach((x, i) => {
    const id = cardId(i);
    const c = draft.cards[id] ?? plannedCard(x);
    out[id] = { w: c.w, r: c.r, o: false, k: c.k, s: c.s };
    if (x.swap) out[`${id}s`] = { w: c.sw, r: c.sr, o: false };
  });
  out.nt = { t: draft.note };
  out.cur = { c: "", b: true };
  return out;
}

/** The cards one draft post carries: c1w, c1r, c1k, c1s, c1sw, c1sr for each card. */
export function postedCards(get: (name: string) => unknown, plan: PlanV2): Record<string, CardDraft> {
  const out: Record<string, CardDraft> = {};
  plan.exercises.forEach((x, i) => {
    const id = cardId(i);
    if (get(`${id}r`) === null || get(`${id}r`) === undefined) return;
    out[id] = readCard({ w: get(`${id}w`), r: get(`${id}r`), k: get(`${id}k`), s: get(`${id}s`), sw: get(`${id}sw`), sr: get(`${id}sr`) }, x);
  });
  return out;
}

/**
 * What a draft post changes: every card when the email shows the draft
 * (`back`) or there is none yet, else only the card she touched.
 */
export function draftUpdate(input: {
  stored: unknown;
  posted: Record<string, CardDraft>;
  touched: string;
  back: boolean;
}): Record<string, CardDraft> {
  if (input.back || !hasCards(input.stored)) return input.posted;
  const one = input.posted[input.touched];
  return one ? { [input.touched]: one } : {};
}

const hasCards = (raw: unknown) => !!raw && typeof raw === "object" && Object.keys(raw).some((k) => /^c\d+$/.test(k));
