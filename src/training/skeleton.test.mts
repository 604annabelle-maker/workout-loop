import assert from "node:assert/strict";
import test from "node:test";
import { floorFor, SESSION_MUSCLE_CAP, SESSION_SETS, TARGETED, WEEKLY, WEEKLY_CAP } from "./rules.ts";
import { balance, cycleTypes, nextPosition, plannedVolume, skeleton, TEMPLATES, targets, type Position } from "./skeleton.ts";

const weekVolume = (cycle: number) => {
  const types = cycleTypes(cycle);
  const sets = balance(types, targets());
  const v: Record<string, number> = {};
  types.forEach((t, i) => {
    const pv = plannedVolume(TEMPLATES[t].map((s, j) => ({ ...s, setCount: sets[i][j] })));
    for (const [m, n] of Object.entries(pv)) v[m] = (v[m] ?? 0) + (n as number);
  });
  return { types, sets, v };
};

test("four focused days in order, and every other cycle the quads and glutes day is full body", () => {
  let pos: Position | null = null;
  const seen: string[] = [];
  for (let i = 0; i < 8; i++) {
    pos = nextPosition(pos);
    seen.push(pos.type);
  }
  assert.deepEqual(seen, ["back_biceps", "glutes_hams", "chest_triceps", "quads_glutes", "back_biceps", "glutes_hams", "chest_triceps", "full"]);
});

test("a missed day shifts the order and loses nothing", () => {
  // Whatever day she comes back, the next session is the one after the last she was sent.
  assert.equal(nextPosition({ type: "glutes_hams", cycle: 3, index: 1 }).type, "chest_triceps");
});

test("each focused day trains its two groups and nothing else, apart from a little shoulders on chest day and abs on leg days", () => {
  const groups: Record<string, string[]> = {
    back_biceps: ["back", "biceps"],
    glutes_hams: ["glutes", "hamstrings", "abs"],
    chest_triceps: ["chest", "triceps", "side_delts"],
    quads_glutes: ["quads", "glutes", "abs"],
  };
  for (const [type, allowed] of Object.entries(groups))
    for (const slot of TEMPLATES[type as keyof typeof TEMPLATES]) assert.ok(allowed.includes(slot.muscle), `${type}: ${slot.muscle}`);
});

for (const cycle of [0, 1]) {
  test(`every muscle lands near its weekly target, arms a little above (${cycle ? "full body" : "normal"} week)`, () => {
    const { v } = weekVolume(cycle);
    for (const m of TARGETED) {
      assert.ok(v[m] >= floorFor(m), `${m} at ${v[m]}`);
      if (!cycle) assert.ok(v[m] >= WEEKLY[m].start - 1.5, `${m} at ${v[m]}`);
      assert.ok(v[m] <= Math.min(WEEKLY[m].start + 4, WEEKLY_CAP), `${m} at ${v[m]}`);
    }
    const others = (["hamstrings", "chest", "back"] as const).map((m) => v[m]);
    const avg = others.reduce((a, b) => a + b, 0) / others.length;
    assert.ok(v.biceps - avg >= 1.5 && v.triceps - avg >= 1.5, `arms ${v.biceps}/${v.triceps} vs ${avg}`);
  });

  test(`no session breaks its set budget or a muscle's session cap (${cycle ? "full body" : "normal"} week)`, () => {
    const { types, sets } = weekVolume(cycle);
    types.forEach((t, i) => {
      const work = TEMPLATES[t].reduce((s, slot, j) => s + (slot.finisher ? 0 : sets[i][j]), 0);
      const all = sets[i].reduce((a, b) => a + b, 0);
      assert.ok(all <= SESSION_SETS[1] && work >= SESSION_SETS[0], `${t}: ${all} sets, ${work} working`);
      const pv = plannedVolume(TEMPLATES[t].map((s, j) => ({ ...s, setCount: sets[i][j] })));
      for (const [m, n] of Object.entries(pv)) assert.ok((n as number) <= SESSION_MUSCLE_CAP, `${t} ${m} ${n}`);
    });
  });
}

test("both leg days and full body end with abs", () => {
  for (const pos of [{ type: "glutes_hams", cycle: 0, index: 1 }, { type: "quads_glutes", cycle: 0, index: 3 }, { type: "full", cycle: 1, index: 3 }] as Position[]) {
    const slots = skeleton(pos).slots;
    assert.equal(slots.filter((s) => s.finisher).length, 2, pos.type);
    assert.ok(slots[slots.length - 1].finisher, `${pos.type} ends with abs`);
  }
});

test("a deload halves the sets and keeps every exercise", () => {
  const pos: Position = { type: "back_biceps", cycle: 2, index: 0 };
  const normal = skeleton(pos).slots;
  const light = skeleton(pos, { deload: true }).slots;
  assert.equal(light.length, normal.length);
  light.forEach((s, i) => assert.equal(s.setCount, Math.max(1, Math.round(normal[i].setCount / 2))));
});

test("lateral raises use higher reps; heavy lifts use 5 to 8, and 6 to 10 on the full body day", () => {
  const ct = skeleton({ type: "chest_triceps", cycle: 0, index: 2 }).slots;
  assert.deepEqual(ct.find((s) => s.muscle === "side_delts")!.reps, [12, 20]);
  assert.deepEqual(ct.find((s) => s.class === "heavy")!.reps, [5, 8]);
  const full = skeleton({ type: "full", cycle: 1, index: 3 }).slots;
  assert.deepEqual(full.find((s) => s.class === "heavy")!.reps, [6, 10]);
});

test("growth raises a target but never past its ceiling", () => {
  assert.equal(targets({ chest: 2 }).chest, 12);
  assert.equal(targets({ chest: 50 }).chest, WEEKLY.chest.grow);
});
