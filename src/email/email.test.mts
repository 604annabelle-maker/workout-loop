import assert from "node:assert/strict";
import test from "node:test";
import { simulate } from "../training/fixtures.mts";
import { DEFAULT_EQUIPMENT as EQ, loadable } from "../training/equipment.ts";
import { targets } from "../training/skeleton.ts";
import { weekSummary } from "../training/summary.ts";
import { composeAmp } from "./amp.ts";
import { compose, type Mail } from "./cards.ts";
import { composeHtml } from "./html.ts";
import { composeText } from "./text.ts";

const pictures = (id: string) => ({ frames: id.startsWith("B") ? [{ file: `${id}-0.png`, width: 400, height: 315 }, { file: `${id}-1.png`, width: 400, height: 315 }] : [], note: "" });

async function mails(n = 6): Promise<Mail[]> {
  const h = await simulate(n, { seed: 21 });
  return h.map((s, i) =>
    compose({
      plan: s.plan,
      date: s.date,
      summary: weekSummary({ history: h.slice(0, i), today: s.plan, weekStart: new Date(0), targets: targets() }),
      logUrl: "https://workout.example.app/api/log?t=abcdefghijklmnop",
      base: "https://workout.example.app",
      pictures,
    }),
  );
}

test("the dynamic version keeps the AMP for Email rules", async () => {
  for (const m of await mails()) {
    const amp = composeAmp(m);
    assert.match(amp, /^<!doctype html>\n<html amp4email data-css-strict>/);
    assert.ok(!/\sstyle="/.test(amp), "no style attributes");
    assert.ok(!/<a\s/i.test(amp), "no links");
    assert.ok(!/<form[^>]*\saction="/.test(amp), "forms use action-xhr");
    for (const f of amp.match(/<form[^>]*>/g) ?? []) {
      assert.match(f, /method="post"/);
      assert.match(f, /action-xhr="https:\/\//);
    }
    const bound = [...amp.matchAll(/\s\[([a-z-]+)\]=/g)].map((x) => x[1]);
    for (const b of bound) assert.ok(["text", "class", "value"].includes(b), `[${b}] binding`);
    assert.ok(!/<amp-state[^>]*\ssrc=/.test(amp), "amp-state is inline only");
    const styles = amp.match(/<style amp-custom>([\s\S]*?)<\/style>/);
    assert.ok(styles && !/!important/.test(styles[1]));
    assert.equal((amp.match(/<style amp-custom>/g) ?? []).length, 1);
    const used = new Set([...amp.matchAll(/<(amp-[a-z]+)/g)].map((x) => x[1]));
    for (const el of used) if (el !== "amp-img" && el !== "amp-state") assert.match(amp, new RegExp(`custom-element="${el}"`), el);
    assert.ok(Buffer.byteLength(amp) < 200_000, `${Buffer.byteLength(amp)} bytes`);
    for (const id of amp.match(/\sid="([^"]+)"/g) ?? []) assert.match(id, /id="[a-z][a-zA-Z0-9-]*"/);
    const ids = [...amp.matchAll(/\sid="([^"]+)"/g)].map((x) => x[1]);
    assert.equal(new Set(ids).size, ids.length, "ids are unique");
  }
});

test("every weight − / + can reach exists, and is labelled", async () => {
  for (const m of await mails())
    for (const c of m.cards)
      for (const n of [c.main, c.swap]) {
        if (!n || n.weight === null) continue;
        assert.ok(n.steps.includes(n.weight));
        const all = new Set([...loadable("barbell", EQ), ...loadable("dumbbell", EQ), ...loadable("cable", EQ), ...loadable("machine:x", EQ), ...loadable("ezbar", EQ), ...loadable("freebar", EQ)]);
        for (const s of n.steps) assert.ok(all.has(s), `${s}`);
        assert.ok(["each hand", "total with bar", "on the stack"].includes(n.weightLabel));
      }
});

test("each card has − / +, the weights row, ✓ and ✗; no Save, nothing picked", async () => {
  const [m] = await mails(1);
  const amp = composeAmp(m);
  for (const c of m.cards) {
    const form = amp.slice(amp.indexOf(`<form id="f${c.id}"`), amp.indexOf("</form>", amp.indexOf(`<form id="f${c.id}"`)));
    assert.ok(form.includes('name="kind" value="card"') && form.includes(`name="card" value="${c.id}"`), c.id);
    for (const k of ["w", "r", "s", "d", "k"]) assert.ok(form.includes(`name="${c.id}${k}"`), `${c.id}${k}`);
    assert.ok(form.includes(`on="tap:AMP.setState({${c.id}: {d: true, k: false, e: false}}), f${c.id}.submit" aria-label="done">&#10003;</button>`), `${c.id} done`);
    assert.ok(form.includes(`on="tap:AMP.setState({${c.id}: {k: true, d: false, e: false}}), f${c.id}.submit" aria-label="skip">&#10007;</button>`), `${c.id} skip`);
    // Done folds to a line with the numbers and change; skip to a line that brings it back.
    assert.ok(form.includes(`[class]="${c.id}.d &amp;&amp; !${c.id}.e ? 'doneline' : 'gone'">&#10003; <span [text]=`));
    assert.ok(form.includes(`on="tap:AMP.setState({${c.id}: {e: true}})">change</button>`));
    assert.ok(form.includes(`<p class="gone" [class]="${c.id}.k ? 'skipline' : 'gone'">Skipped ${c.main.name.replace(/&/g, "&amp;")} · <button`));
    assert.ok(form.includes(`on="tap:AMP.setState({${c.id}: {k: false}}), f${c.id}.submit">bring back</button>`));
    assert.ok(form.includes(`<div [class]="${c.id}.k || (${c.id}.d &amp;&amp; !${c.id}.e) ? 'gone' : ''">`));
    if (c.main.weight !== null) {
      assert.ok(amp.includes(`<amp-state id="${c.id}w">`));
      assert.ok(amp.includes(`[class]="${c.id}.o ? 'row open' : 'row'"`));
    }
  }
  for (const t of ["easy", "hard"]) assert.ok(!new RegExp(`>${t}<`).test(amp), `no ${t}`);
  assert.ok(!/type="submit">Save</.test(amp), "no Save");
  assert.ok(!/name="kind" value="save"/.test(amp));
  assert.ok(!/\schecked/.test(amp), "nothing is picked for her");
});

test("numbers are kept as she taps, the note as she types, and one tap picks it back up", async () => {
  const [m] = await mails(1);
  const amp = composeAmp(m);
  const draft = amp.slice(amp.indexOf('<form id="draft"'), amp.indexOf("</form>", amp.indexOf('<form id="draft"')));
  assert.ok(draft.includes('name="kind" value="draft"'));
  for (const c of m.cards) {
    for (const k of ["w", "r", "s"]) assert.ok(draft.includes(`name="${c.id}${k}"`), `${c.id}${k} in the draft`);
    assert.ok(!draft.includes(`name="${c.id}d"`) && !draft.includes(`name="${c.id}k"`), "a numbers post never carries done or skip");
    if (c.swap) assert.ok(draft.includes(`name="${c.id}sw"`) && draft.includes(`name="${c.id}sr"`));
  }
  // Every − / + and weight chip posts the numbers, saying which card.
  const steps = amp.match(/on="tap:AMP\.setState\(\{c\d+s?: \{[wr]: [^"]*"/g) ?? [];
  assert.ok(steps.length > m.cards.length);
  for (const tap of steps) assert.match(tap, /, cur: \{c: 'c\d+'\}\}\), draft\.submit"$/, tap);
  assert.match(amp, /on="input-debounced:AMP\.setState\(\{nt: \{t: event\.value\}\}\), dnote\.submit"/);
  assert.match(amp, /read before your next workout is planned/);
  const restore = amp.slice(amp.indexOf('<form id="restore"'), amp.indexOf("</form>", amp.indexOf('<form id="restore"')));
  assert.ok(restore.includes('name="kind" value="restore"'));
  assert.ok(restore.includes("{{#draft}}") && restore.includes("Pick up where you left off"));
  for (const c of m.cards) assert.ok(restore.includes(`${c.id}: event.response.${c.id}`));
  assert.ok(restore.includes("cur: event.response.cur"));
});

test("the drawing drops down from a small arrow by the name, the swap's too; no separate How to", async () => {
  const [m] = await mails(1);
  const frames = [{ file: "0001-0.png", width: 400, height: 315 }, { file: "0001-1.png", width: 400, height: 315 }];
  const withSwap = m.cards.find((c) => c.swap)!;
  const c = { ...withSwap, main: { ...withSwap.main, frames }, swap: { ...withSwap.swap!, frames: [{ file: "0002-0.png", width: 400, height: 315 }] } };
  const amp = composeAmp({ ...m, cards: [c], warmup: [{ name: "Band squat", text: "Band squat × 10", practice: false, frames }] });
  assert.ok(amp.includes("/pictures/d/0001-0.png") && amp.includes("/pictures/d/0001-1.png"));
  assert.match(amp, /<table class="pics" role="presentation"><tr><td>/);
  assert.ok(!/How to/.test(amp), "no How to");
  assert.ok(!amp.includes(c.main.form), "no form line under the drawing");
  const arrow = (name: string) => `<h4>${name.replace(/&/g, "&amp;")} <span class="arrow">&#9662;</span></h4>`;
  assert.ok(amp.includes(`<amp-accordion class="look" animate>\n<section>\n${arrow(c.main.name)}`), "the name opens the drawing");
  const swap = amp.slice(amp.indexOf("<h4>Swap &#9662;</h4>"));
  assert.ok(swap.indexOf(arrow(c.swap.name)) > 0, "the swap's name opens its drawing");
  assert.ok(swap.indexOf("/pictures/d/0002-0.png") > 0);
  assert.match(amp, /<h4 class="warm">Band squat × 10 &#9662;<\/h4>/);
  assert.match(amp, /Everkinetic/);
  assert.ok(!amp.includes("/pictures/p/"), "no photos");
});

test("no drawing: the name alone, no arrow", async () => {
  const [m] = await mails(1);
  const c = { ...m.cards[0], main: { ...m.cards[0].main, frames: [] } };
  const amp = composeAmp({ ...m, cards: [c] });
  assert.ok(amp.includes(`<p class="name">${c.main.name.replace(/&/g, "&amp;")}</p>`));
});

test("the same exercises and numbers in all three versions", async () => {
  for (const m of await mails()) {
    const amp = composeAmp(m);
    const html = composeHtml(m);
    const text = composeText(m);
    for (const c of m.cards) {
      for (const v of [amp, html]) assert.ok(v.includes(c.main.name.replace(/&/g, "&amp;")), c.main.name);
      assert.ok(text.includes(c.main.name.toUpperCase()), c.main.name);
      assert.ok(text.includes(`${c.sets} × ${c.main.reps}`));
    }
    for (const w of m.warmup) assert.ok(text.includes(w.name));
  }
});

test("plain text lines stay inside 50 characters, and the plain versions say how to reply", async () => {
  for (const m of await mails()) {
    const text = composeText(m);
    for (const line of text.split("\n")) assert.ok(line.length <= 50, `${line.length}: ${line}`);
    assert.match(text, /reply with: done/);
    assert.match(composeHtml(m), /reply with: done/);
  }
});

test("a change made because of a comment shows with an undo", async () => {
  const [m] = await mails(1);
  const amp = composeAmp({ ...m, changes: [{ noteId: "11111111-2222-3333-4444-555555555555", text: "Swapped A for B, since you said “x”." }] });
  assert.ok(amp.includes('name="kind" value="undo"'));
  assert.ok(amp.includes('value="11111111-2222-3333-4444-555555555555"'));
});

test("no dynamic version without somewhere to log to", async () => {
  const [m] = await mails(1);
  assert.equal(composeAmp({ ...m, logUrl: null }), "");
});
