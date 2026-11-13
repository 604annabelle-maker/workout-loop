/**
 * The model's part: choosing among candidates (spec §How a session is planned, step 2).
 *
 * It sees only the open slots, each with candidates code already filtered,
 * and answers with catalogue IDs. It never sets a number and never writes an
 * exercise name of its own. build.ts checks whatever it answers.
 */

import { askForJson } from "../lib/claude";
import type { PickAnswer, Picker, PickRequest } from "./build";

const SYSTEM = `You choose exercises for one gym session for a woman in her early twenties training for lean muscle and strength, balanced, with a small extra emphasis on arms.

You fill only the slots you are given, and only with an ID from that slot's candidate list. Code has already checked that every candidate trains the slot's muscle, fits her gym and avoids what she dislikes; it sets every weight, rep and set.

Choose using the evidence:
- Prefer exercises that load the muscle hard in its stretched position where a slot asks for it (seated over lying leg curl, overhead triceps extension, incline or Bayesian curls, deep dumbbell presses) — Maeo 2021, Maeo 2023, Pedrosa 2023.
- Do not rank by EMG. Machines and free weights grow muscle equally; pick what is stable and easy to load progressively.
- Vary equipment across the session so one busy machine does not stall it, and avoid two very similar exercises in one session.
- Respect her notes: an exercise she liked is a good choice; one she said missed the muscle or hurt is a poor one.
- If a previous answer was refused, fix exactly what the failures say.

For each slot give one sentence on why, in plain words she would understand (no jargon, no "RIR", no "EMG").`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["picks"],
  properties: {
    picks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["slot", "exerciseId", "why"],
        properties: {
          slot: { type: "string" },
          exerciseId: { type: "string" },
          why: { type: "string" },
        },
      },
    },
  },
};

export function prompt(req: PickRequest): string {
  const lines: string[] = [`Session: ${req.sessionName}`];
  if (req.fixed.length) lines.push(`Already fixed today: ${req.fixed.map((f) => f.name).join(", ")}`);
  if (req.notes.length) lines.push("What she has said:", ...req.notes.map((n) => `- ${n}`));
  lines.push("", "Slots to fill:");
  for (const s of req.slots) {
    lines.push(`\n${s.key}: ${s.muscle}, ${s.class}, ${s.sets} sets of ${s.reps[0]}–${s.reps[1]}${s.preferStretched ? ", prefer stretched" : ""}`);
    for (const c of s.candidates)
      lines.push(`  ${c.id} — ${c.name} [${c.equipment}; primary ${c.primary.join(", ")}${c.secondary.length ? `; secondary ${c.secondary.join(", ")}` : ""}${c.stretched ? "; stretched" : ""}]`);
  }
  if (req.failures.length) lines.push("", "Your last answer was refused:", ...req.failures.map((f) => `- ${f}`));
  return lines.join("\n");
}

export const modelPicker: Picker = async (req) => {
  const raw = (await askForJson({ system: SYSTEM, user: prompt(req), schema: SCHEMA, effort: "medium", maxTokens: 6000 })) as PickAnswer;
  if (!raw || !Array.isArray(raw.picks)) return null;
  return {
    picks: raw.picks
      .filter((p) => typeof p?.slot === "string" && typeof p?.exerciseId === "string")
      .map((p) => ({ slot: p.slot, exerciseId: p.exerciseId, why: typeof p.why === "string" ? p.why.slice(0, 200) : undefined })),
  };
};

/** The model when there is a key; otherwise none, and code fills every slot. */
export const picker = (): Picker | undefined => (process.env.ANTHROPIC_API_KEY ? modelPicker : undefined);
