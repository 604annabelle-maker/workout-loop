import assert from "node:assert/strict";
import test from "node:test";
import { buildSession } from "../training/build.ts";
import { exercise } from "../training/catalogue.ts";
import { DEFAULT_EQUIPMENT as EQ } from "../training/equipment.ts";
import { logAll } from "../training/fixtures.mts";
import type { Note, SessionRecord } from "../training/types.ts";
import { avoided, disliked } from "./apply.ts";
import { readByKeywords } from "./read.ts";

const DAY = 864e5;
const t0 = new Date("2026-11-15T08:00:00Z");

/** Upper A, logged as written, then a note, then Upper A again a cycle later. */
async function upperAWith(noteFor: (plan: SessionRecord["plan"]) => Note[]) {
  const history: SessionRecord[] = [];
  let now = t0;
  for (let i = 0; i < 4; i++) {
    const { plan } = await buildSession({ history, notes: [], equipment: EQ, now });
    history.push({ workoutId: `w${i}`, date: now, plan, logs: logAll(plan, () => ({ reps: 8, tap: "done" })) });
    now = new Date(now.getTime() + 2 * DAY);
  }
  const notes = noteFor(history[0].plan).map((n) => ({ ...n, createdAt: new Date(history[3].date.getTime() + DAY) }));
  const next = await buildSession({ history, notes, equipment: EQ, now });
  return { first: history[0].plan, next: next.plan, history, notes, now };
}
const note = (reason: Note["reason"], exerciseId: string | null, text: string, id = "n1"): Note => ({ id, reason, exerciseId, text, createdAt: t0, undoneAt: null });
const slotOf = (plan: SessionRecord["plan"], muscle: string) => plan.exercises.find((x) => x.muscle === muscle && x.class === "isolation")!;

test("wrong muscle: swapped next time for another exercise for the same muscle, with a line saying why", async () => {
  const { first, next } = await upperAWith((p) => [note("wrong_muscle", slotOf(p, "biceps").main.exerciseId, "didn't feel it in my biceps")]);
  const before = slotOf(first, "biceps");
  const after = next.exercises.find((x) => x.slot === before.slot)!;
  assert.notEqual(after.main.exerciseId, before.main.exerciseId);
  assert.ok(exercise(after.main.exerciseId)!.primary.includes("biceps"));
  assert.ok(next.changes.some((c) => /^Swapped .* since you said “didn't feel it in my biceps”/.test(c.text)), JSON.stringify(next.changes));
});

test("dislike can never come back, whatever the model answers", async () => {
  const { first, history, now } = await upperAWith(() => []);
  const id = first.exercises[0].main.exerciseId;
  const notes = [note("dislike", id, "hated it")];
  for (let k = 0; k < 3; k++) {
    const built = await buildSession({
      history, notes, equipment: EQ, now: new Date(now.getTime() + k * 60 * DAY),
      position: first.position,
      pick: async (req) => ({ picks: req.slots.map((s) => ({ slot: s.key, exerciseId: id })) }),
    });
    assert.ok(!built.plan.exercises.some((x) => x.main.exerciseId === id || x.swap?.exerciseId === id));
  }
  assert.equal(disliked(notes, id), true);
});

test("pain swaps it next time but is never a ban: after a few weeks it can return", () => {
  const n = note("pain", "Leg_Press", "hurt my knee");
  assert.equal(avoided([n], "Leg_Press", new Date(t0.getTime() + 7 * DAY)), true);
  assert.equal(avoided([n], "Leg_Press", new Date(t0.getTime() + 40 * DAY)), false);
  assert.equal(disliked([n], "Leg_Press"), false);
});

test("undo deletes the note's effect and the original exercise comes back", async () => {
  const { first, next, history, notes, now } = await upperAWith((p) => [note("wrong_muscle", slotOf(p, "biceps").main.exerciseId, "didn't feel it")]);
  const slot = slotOf(first, "biceps").slot;
  const swapped = next.exercises.find((x) => x.slot === slot)!;
  assert.notEqual(swapped.main.exerciseId, slotOf(first, "biceps").main.exerciseId);
  const later = [...history, { workoutId: "w5", date: now, plan: next, logs: logAll(next, () => ({ reps: 8, tap: "done" as const })) }];
  const undone = notes.map((n) => ({ ...n, undoneAt: new Date(now.getTime() + DAY) }));
  // Run to the next Upper A.
  let h = later;
  let t = new Date(now.getTime() + 2 * DAY);
  let plan = next;
  for (let i = 0; i < 4; i++) {
    plan = (await buildSession({ history: h, notes: undone, equipment: EQ, now: t })).plan;
    h = [...h, { workoutId: `u${i}`, date: t, plan, logs: logAll(plan, () => ({ reps: 8, tap: "done" as const })) }];
    t = new Date(t.getTime() + 2 * DAY);
    if (plan.position.type === "upper_a") break;
  }
  assert.equal(plan.exercises.find((x) => x.slot === slot)!.main.exerciseId, slotOf(first, "biceps").main.exerciseId);
});

test("too easy: heavier now, with a line; too hard with no easier version: a step lighter", async () => {
  const { next } = await upperAWith((p) => [
    note("too_easy", p.exercises[0].main.exerciseId, "way too light", "a"),
    note("too_hard", p.exercises[1].main.exerciseId, "couldn't keep form", "b"),
  ]);
  assert.ok(next.changes.some((c) => c.noteId === "a" && /^Heavier/.test(c.text)));
  assert.ok(next.changes.some((c) => c.noteId === "b" && /^Lighter/.test(c.text)));
});

test("the keyword reader: reasons, the exercise, and a burn is not pain", () => {
  const ids = ["Barbell_Hip_Thrust", "Leg_Press", "Seated_Leg_Curl"];
  assert.deepEqual(readByKeywords("didn't feel the hip thrust in my glutes", ids).map((n) => [n.reason, n.exerciseId]), [["wrong_muscle", "Barbell_Hip_Thrust"]]);
  assert.deepEqual(readByKeywords("leg press hurt my knee", ids).map((n) => [n.reason, n.exerciseId]), [["pain", "Leg_Press"]]);
  assert.deepEqual(readByKeywords("leg curl hurt, good burn", ids).map((n) => n.reason), []);
  assert.deepEqual(readByKeywords("leg press machine was taken", ids).map((n) => n.reason), ["one_off"]);
  assert.deepEqual(readByKeywords("hated the leg curls", ids).map((n) => [n.reason, n.exerciseId]), [["dislike", "Seated_Leg_Curl"]]);
  assert.deepEqual(readByKeywords("so worn out today", ids).map((n) => [n.reason, n.exerciseId]), [["too_hard", null]]);
  assert.deepEqual(readByKeywords("loved the hip thrusts but leg press was too easy", ids).map((n) => [n.reason, n.exerciseId]), [["liked", "Barbell_Hip_Thrust"], ["too_easy", "Leg_Press"]]);
});

test("saying worn out makes the rest of the cycle lighter", async () => {
  const { history, now } = await upperAWith(() => []);
  const built = await buildSession({ history, notes: [{ ...note("too_hard", null, "worn out"), createdAt: new Date(now.getTime() - DAY) }], equipment: EQ, now });
  assert.equal(built.plan.deload, true);
});
