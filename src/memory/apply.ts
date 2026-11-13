/**
 * What her comments do (spec §Learning from her comments).
 *
 * Pure. Notes come from memory/read.ts; this decides their effect. Only
 * `dislike` is a hard rule: the model can never bring a disliked exercise
 * back. `pain` swaps the exercise next time and keeps it out for a few weeks,
 * but never bans it, because she may write "hurt" for a good burn. Everything
 * else is guidance. An undone note has no effect at all.
 */

import { ROTATION } from "../training/rules";
import type { Note } from "../training/types";

const WEEK = 7 * 864e5;

export const active = (notes: Note[]) => notes.filter((n) => !n.undoneAt);

const about = (notes: Note[], exerciseId: string) => active(notes).filter((n) => n.exerciseId === exerciseId);

/** Never chosen again. The only hard filter. */
export function disliked(notes: Note[], exerciseId: string): boolean {
  return about(notes, exerciseId).some((n) => n.reason === "dislike");
}

/** Left out while there is anything else: it missed the muscle for her, or hurt recently. */
export function avoided(notes: Note[], exerciseId: string, now: Date): boolean {
  return about(notes, exerciseId).some(
    (n) =>
      n.reason === "wrong_muscle" ||
      (n.reason === "pain" && now.getTime() - n.createdAt.getTime() < ROTATION.painWeeks * WEEK),
  );
}

export function liked(notes: Note[], exerciseId: string): boolean {
  return about(notes, exerciseId).some((n) => n.reason === "liked");
}

/** She found it too hard since `since`: an easier variation, or a lighter weight. */
export function tooHard(notes: Note[], exerciseId: string, since: Date | null): Note | undefined {
  return about(notes, exerciseId).find((n) => n.reason === "too_hard" && (!since || n.createdAt > since));
}

/**
 * The note that means a slot's current exercise has to change, if any: she
 * disliked it, it missed the muscle, or it hurt, since it was last planned.
 */
export function changeFor(notes: Note[], exerciseId: string, since: Date | null): Note | undefined {
  return about(notes, exerciseId).find(
    (n) => (n.reason === "dislike" || n.reason === "wrong_muscle" || n.reason === "pain") && (!since || n.createdAt > since),
  );
}

/** Notes said since the last session was planned: these are the ones the next email reports on. */
export function fresh(notes: Note[], since: Date | null): Note[] {
  return active(notes).filter((n) => !since || n.createdAt > since);
}

const quote = (text: string) => {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > 60 ? `${t.slice(0, 57).trimEnd()}…` : t;
};

export function swapLine(from: string, to: string, note: Note): string {
  return `Swapped ${from} for ${to}, since you said “${quote(note.text)}”.`;
}

export function weightLine(name: string, up: boolean, note: Note): string {
  return `${up ? "Heavier" : "Lighter"} ${name}, since you said “${quote(note.text)}”.`;
}
