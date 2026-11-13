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

const frames = (id: string) => (id.startsWith("B") ? [{ file: `${id}-0.jpg`, width: 400, height: 267 }] : []);

async function mails(n = 6): Promise<Mail[]> {
  const h = await simulate(n, { seed: 21 });
  return h.map((s, i) =>
    compose({
      plan: s.plan,
      date: s.date,
      summary: weekSummary({ history: h.slice(0, i), today: s.plan, weekStart: new Date(0), targets: targets() }),
      logUrl: "https://workout.example.app/api/log?t=abcdefghijklmnop",
      base: "https://workout.example.app",
      photos: frames,
      familiar: new Set(),
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
        const all = new Set([...loadable("barbell", EQ), ...loadable("dumbbell", EQ), ...loadable("cable", EQ), ...loadable("machine:x", EQ), ...loadable("ezbar", EQ)]);
        for (const s of n.steps) assert.ok(all.has(s), `${s}`);
        assert.ok(["each hand", "total with bar", "on the stack"].includes(n.weightLabel));
      }
});

test("each card has − / +, the weights row, easy / done / hard, and posts its slot", async () => {
  const [m] = await mails(1);
  const amp = composeAmp(m);
  for (const c of m.cards) {
    assert.ok(amp.includes(`name="slot" value="${c.slot}"`));
    assert.ok(amp.includes(`id="${c.id}-easy"`) && amp.includes(`id="${c.id}-done"`) && amp.includes(`id="${c.id}-hard"`));
    if (c.main.weight !== null) {
      assert.ok(amp.includes(`<amp-state id="${c.id}w">`));
      assert.ok(amp.includes(`[class]="${c.id}.o ? 'row open' : 'row'"`));
    }
  }
  assert.ok(amp.includes('name="kind" value="all"') && amp.includes('name="kind" value="comment"'));
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
