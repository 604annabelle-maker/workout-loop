import assert from "node:assert/strict";
import test from "node:test";
import { buildSession } from "../training/build.ts";
import { DEFAULT_EQUIPMENT as EQ } from "../training/equipment.ts";
import { exercise } from "../training/catalogue.ts";
import { readShorthand } from "./reply.ts";
import { checkinMail } from "./checkin.ts";

const plan = async (type = "lower_a") => {
  const position = { type, cycle: 0, index: type === "lower_a" ? 1 : 0 } as const;
  return (await buildSession({ history: [], notes: [], equipment: EQ, now: new Date("2026-11-15"), position: position as never })).plan;
};

test("done on its own logs everything as written", async () => {
  const r = readShorthand("done", await plan(), EQ);
  assert.equal(r.allDone, true);
  assert.equal(r.entries.length, 0);
  assert.equal(r.words, "");
});

test("RDL 42.5 8 8 7 hard: the Romanian deadlift, its weight, reps per set, and the tap", async () => {
  const p = await plan();
  const r = readShorthand("RDL 42.5 8 8 7 hard", p, EQ);
  assert.equal(r.entries.length, 1);
  const e = r.entries[0];
  assert.equal(exercise(e.exerciseId)!.name, "Romanian deadlift");
  assert.equal(e.weight, 42.5);
  assert.deepEqual(e.reps, [8, 8, 7]);
  assert.equal(e.tap, "hard");
});

test("a weight that does not exist is read as the nearest that does", async () => {
  const r = readShorthand("rdl 43 8 8 8", await plan(), EQ);
  assert.equal(r.entries[0].weight, 42.5);
  assert.equal(r.entries[0].tap, "done");
});

test("naming the swap logs the swap", async () => {
  const p = await plan();
  const x = p.exercises.find((e) => e.swap && exercise(e.swap.exerciseId)!.load !== "bodyweight")!;
  const name = exercise(x.swap!.exerciseId)!.name;
  const r = readShorthand(`${name} 20 10 10`, p, EQ);
  assert.equal(r.entries[0].usedSwap, true);
  assert.equal(r.entries[0].slot, x.slot);
});

test("words that are not shorthand are left for the comment reader", async () => {
  const r = readShorthand("RDL 40 8 8 8\nfelt great today, tired though", await plan(), EQ);
  assert.equal(r.entries.length, 1);
  assert.equal(r.words, "felt great today, tired though");
});

test("the monthly check-in has three questions in the dynamic version and works by reply", () => {
  const m = checkinMail({ month: "2026-12", url: "https://workout.example.app/api/checkin?t=abcdefghijklmnopq" });
  assert.match(m.subject, /2026-12/);
  assert.equal((m.amp!.match(/<form /g) ?? []).length, 3);
  assert.ok(!/\sstyle="/.test(m.amp!));
  assert.match(m.text, /Enjoying it\?/);
  assert.equal(checkinMail({ month: "2026-12", url: null }).amp, undefined);
});
