/**
 * Her comments, read into notes (spec §Learning from her comments).
 *
 * A comment from the end-of-email box, or the free text of a reply, becomes
 * a list of notes: which exercise it is about (or the whole session) and why.
 * The model reads it when there is a key; a keyword reader handles the plain
 * cases without one, and is what tests run against.
 *
 * "Hurt" is read with care: she may say it for a good burn, which is not
 * pain. The reader only says `pain` for something that sounds like a joint,
 * an injury or sharp pain, and never for a burn.
 */

import { askForJson } from "../lib/claude";
import { exercise } from "../training/catalogue";
import type { NoteReason } from "../training/types";

export const REASONS: NoteReason[] = ["wrong_muscle", "pain", "too_hard", "too_easy", "dislike", "one_off", "liked"];

export interface ReadNote {
  reason: NoteReason;
  exerciseId: string | null;
  text: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();

/** Which of today's exercises a clause is about: the one whose name's words it contains most of. */
export function whichExercise(clause: string, ids: string[]): string | null {
  const words = new Set(norm(clause).split(" "));
  const generic = new Set(["dumbbell", "cable", "machine", "barbell", "one", "arm", "the", "a", "single", "leg", "press", "raise", "curl", "row"]);
  let best: { id: string; score: number } | null = null;
  for (const id of ids) {
    const name = exercise(id)?.name;
    if (!name) continue;
    const parts = norm(name).split(" ");
    const hits = parts.filter((p) => words.has(p) || words.has(p + "s") || words.has(p.replace(/s$/, ""))).length;
    const distinctive = parts.filter((p) => !generic.has(p) && (words.has(p) || words.has(p + "s") || words.has(p.replace(/s$/, "")))).length;
    // Every word of the name counts even when they are all common ones ("leg press").
    const whole = hits === parts.length;
    const score = distinctive * 2 + hits + (whole ? 3 : 0);
    if ((distinctive > 0 || whole || hits >= 2) && (!best || score > best.score)) best = { id, score };
  }
  return best?.id ?? null;
}

const has = (t: string, ...xs: (string | RegExp)[]) => xs.some((x) => (typeof x === "string" ? t.includes(x) : x.test(t)));

/** A burn said anywhere in the sentence: "hurt" there is the good kind. */
const BURN = /burn|good pain|hurt so good|good hurt|sore in a good/;

function reasonOf(clause: string, sentence = clause): NoteReason | null {
  const t = norm(clause);
  if (has(t, "taken", "busy", "occupied", "was in use", "no free", "someone was on")) return "one_off";
  if (has(t, /\b(hate|hated|dislike|don't like|didn't like|never again|not a fan)\b/)) return "dislike";
  if (has(t, /didn't feel|did not feel|couldn't feel|felt it (in|on) my|felt it more in|not in my|only felt/)) return "wrong_muscle";
  const burn = BURN.test(norm(sentence));
  if (!burn && has(t, /\b(hurt|hurts|pain|painful|ache|aching|injur|tweak|pinch|sharp|twinge)/)) return "pain";
  if (has(t, /too easy|too light|way too easy|could have done more|easy peasy/)) return "too_easy";
  if (has(t, /too hard|too heavy|couldn't finish|could not finish|couldn't keep|form broke|lost form|struggled|worn out|exhausted|so tired|wiped/)) return "too_hard";
  if (has(t, /\b(love|loved|liked|enjoyed|great|amazing|felt good|favourite|favorite)\b/)) return "liked";
  return null;
}

/** The keyword reader: clause by clause, each with its exercise and reason. */
export function readByKeywords(comment: string, exerciseIds: string[]): ReadNote[] {
  const clauses = comment
    .split(/[.;!\n]+/)
    .flatMap((sentence) =>
      sentence
        .split(/,\s*(?:but|and)?\s*|\s+but\s+/i)
        .map((c) => ({ clause: c.trim(), sentence })),
    )
    .filter((c) => c.clause);
  const out: ReadNote[] = [];
  let lastExercise: string | null = null;
  for (const { clause, sentence } of clauses) {
    const id: string | null = whichExercise(clause, exerciseIds) ?? lastExercise;
    const reason = reasonOf(clause, sentence);
    if (whichExercise(clause, exerciseIds)) lastExercise = id;
    if (!reason) continue;
    // A session-wide "worn out" is about the session, not one exercise.
    const session = reason === "too_hard" && /worn out|exhausted|so tired|wiped/.test(norm(clause)) && !whichExercise(clause, exerciseIds);
    out.push({ reason, exerciseId: session ? null : id, text: clause });
  }
  return out;
}

const SYSTEM = `You read a woman's comment about today's gym session and turn it into notes for her coach.

Each note is about one exercise (by ID, from the list given) or about the whole session (exerciseId null), with one reason:
- wrong_muscle: she did not feel it where it was meant to work ("didn't feel it in my glutes").
- pain: something that sounds like a joint, injury or sharp pain ("hurt my knee", "pinched my shoulder"). She may say "hurt" or "burned" for the normal burn of a hard set: that is NOT pain; give no note, or liked if she sounds pleased.
- too_hard: she could not keep form or finish, or the weight was far too heavy. For the whole session (worn out, exhausted), use exerciseId null.
- too_easy: far too light.
- dislike: she does not want to do it again.
- one_off: something that should change nothing, such as a machine being taken.
- liked: she enjoyed it or it worked well.

Copy the part of her words each note comes from into text. Give no note for anything that does not fit a reason. Never invent an exercise ID.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["notes"],
  properties: {
    notes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["reason", "exerciseId", "text"],
        properties: {
          reason: { type: "string", enum: REASONS },
          exerciseId: { type: ["string", "null"] },
          text: { type: "string" },
        },
      },
    },
  },
};

/** Her comment as notes: the model when there is a key, the keyword reader otherwise or if the model fails. */
export async function readComment(comment: string, exerciseIds: string[]): Promise<ReadNote[]> {
  const text = comment.trim();
  if (!text) return [];
  if (!process.env.ANTHROPIC_API_KEY) return readByKeywords(text, exerciseIds);
  try {
    const list = exerciseIds.map((id) => `${id} — ${exercise(id)?.name ?? id}`).join("\n");
    const raw = (await askForJson({
      system: SYSTEM,
      user: `Today's exercises:\n${list}\n\nHer comment:\n${text}`,
      schema: SCHEMA,
      effort: "low",
      maxTokens: 3000,
    })) as { notes?: ReadNote[] };
    return (raw.notes ?? [])
      .filter((n) => REASONS.includes(n.reason))
      .map((n) => ({
        reason: n.reason,
        exerciseId: n.exerciseId && exerciseIds.includes(n.exerciseId) ? n.exerciseId : null,
        text: String(n.text ?? "").slice(0, 300) || text.slice(0, 300),
      }));
  } catch {
    return readByKeywords(text, exerciseIds);
  }
}
