import assert from "node:assert/strict";
import test from "node:test";
import { simulate } from "../training/fixtures.mts";
import { draftUpdate, hasDraft, indexOf, plannedCard, postedCards, readDraft, restoreState, stepsOf } from "./draft.ts";

async function plan() {
  const [s] = await simulate(1, { seed: 3 });
  return s.plan;
}

test("with nothing set, the draft is the plan", async () => {
  const p = await plan();
  const d = readDraft(null, p);
  p.exercises.forEach((x, i) => {
    const c = d.cards[`c${i + 1}`];
    assert.equal(c.r, x.main.reps);
    if (x.main.weight !== null) assert.equal(stepsOf(x.main)[c.w], x.main.weight);
    assert.equal(c.k, false);
    assert.equal(c.s, false);
  });
  assert.equal(d.note, "");
  assert.equal(hasDraft(null), false);
  assert.equal(hasDraft({ note: "" }), false);
  assert.equal(hasDraft({ c1: plannedCard(p.exercises[0]) }), true);
});

test("a post is read into cards, and anything out of range falls back to the plan", async () => {
  const p = await plan();
  const x = p.exercises[0];
  const form: Record<string, string> = { c1w: "1", c1r: "11", c1k: "1", c1s: "0", c2w: "999", c2r: "0" };
  const got = postedCards((n) => form[n] ?? null, p);
  assert.equal(got.c1.r, 11);
  assert.equal(got.c1.k, true);
  assert.equal(got.c1.w, stepsOf(x.main).length > 1 ? 1 : 0);
  assert.equal(got.c2.w, plannedCard(p.exercises[1]).w, "an index past the steps is the plan's");
  assert.equal(got.c2.r, p.exercises[1].main.reps, "0 reps is the plan's");
  assert.equal(got.c3, undefined, "a card not posted is left out");
});

test("the swap counts only when the card has one", async () => {
  const p = await plan();
  const i = p.exercises.findIndex((x) => !x.swap);
  if (i < 0) return;
  const id = `c${i + 1}`;
  const got = postedCards((n) => ({ [`${id}r`]: "8", [`${id}s`]: "1" })[n] ?? null, p);
  assert.equal(got[id].s, false);
});

test("a post replaces the draft when the email shows it, else takes only the card she touched", async () => {
  const p = await plan();
  const posted = postedCards((n) => ({ c1r: "9", c2r: "9", c3r: "9" })[n] ?? null, p);
  const stored = { c1: { ...plannedCard(p.exercises[0]), r: 12 }, c2: { ...plannedCard(p.exercises[1]), r: 12 } };
  // First open, nothing stored: every card, so a dropped tap is caught up by the next.
  assert.deepEqual(Object.keys(draftUpdate({ stored: null, posted, touched: "c1", back: false })), ["c1", "c2", "c3"]);
  // She picked up where she left off: the email shows the draft, so all of it.
  assert.deepEqual(Object.keys(draftUpdate({ stored, posted, touched: "c1", back: true })), ["c1", "c2", "c3"]);
  // Reopened and tapped before picking up: only that card, the rest kept.
  assert.deepEqual(draftUpdate({ stored, posted, touched: "c2", back: false }), { c2: posted.c2 });
  assert.deepEqual(draftUpdate({ stored, posted, touched: "", back: false }), {});
});

test("picking up gives every card's state in the email's shape, and says the email now shows the draft", async () => {
  const p = await plan();
  const d = readDraft({ c1: { w: 0, r: 7, d: true, s: false, sw: 0, sr: 0 }, c2: { k: true }, note: "knee was fine" }, p);
  const st = restoreState(p, d) as Record<string, Record<string, unknown>>;
  assert.deepEqual(st.c1, { w: 0, r: 7, o: false, s: false, d: true, k: false, e: false });
  assert.equal(st.c2.k, true);
  assert.equal(st.c3.d, false, "untouched: not done");
  p.exercises.forEach((x, i) => {
    assert.ok(st[`c${i + 1}`], `c${i + 1}`);
    assert.equal(!!st[`c${i + 1}s`], !!x.swap);
  });
  assert.deepEqual(st.nt, { t: "knee was fine" });
  assert.deepEqual(st.cur, { c: "", b: true });
});

test("a weight's index is its nearest step", () => {
  assert.equal(indexOf(40, [20, 30, 35, 40, 45]), 3);
  assert.equal(indexOf(42, [20, 30, 35, 40, 45]), 3);
  assert.equal(indexOf(null, [20, 30]), 0);
  assert.equal(indexOf(10, []), 0);
});

test("done and skip are one or the other; a numbers post carries no flags", async () => {
  const p = await plan();
  const got = postedCards((n) => ({ c1r: "8", c1d: "1", c1k: "1" })[n] ?? null, p);
  assert.equal(got.c1.d, true);
  assert.equal(got.c1.k, false, "done wins");
  const { numbersOf } = await import("./draft.ts");
  assert.deepEqual(Object.keys(numbersOf(got.c1)).sort(), ["r", "s", "sr", "sw", "w"]);
});
