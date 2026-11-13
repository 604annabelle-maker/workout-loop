import assert from "node:assert/strict";
import test from "node:test";
import { SESSION_MUSCLE_CAP, SESSION_SETS, TARGETED, WEEKLY, WEEKLY_CAP } from "./rules.ts";
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

test("sessions go in order, and every other cycle Lower B is full body", () => {
  let pos: Position | null = null;
  const seen: string[] = [];
  for (let i = 0; i < 8; i++) {
    pos = nextPosition(pos);
    seen.push(pos.type);
  }
  assert.deepEqual(seen, ["upper_a", "lower_a", "upper_b", "lower_b", "upper_a", "lower_a", "upper_b", "full"]);
});

test("a missed day shifts the order and loses nothing", () => {
  // Whatever day she comes back, the next session is the one after the last she was sent.
  assert.equal(nextPosition({ type: "lower_a", cycle: 3, index: 1 }).type, "upper_b");
});

for (const cycle of [0, 1]) {
  test(`every muscle lands near its weekly target, arms a little above (${cycle ? "full body" : "normal"} week)`, () => {
    const { v } = weekVolume(cycle);
    for (const m of TARGETED) {
      assert.ok(v[m] >= WEEKLY[m].start - 1.5, `${m} at ${v[m]}`);
      assert.ok(v[m] <= Math.min(WEEKLY[m].start + 3, WEEKLY_CAP), `${m} at ${v[m]}`);
    }
    const others = (["quads", "hamstrings", "chest", "back"] as const).map((m) => v[m]);
    const avg = others.reduce((a, b) => a + b, 0) / others.length;
    assert.ok(v.biceps - avg >= 1.5 && v.triceps - avg >= 1.5, `arms ${v.biceps}/${v.triceps} vs ${avg}`);
  });

  test(`no session breaks its set budget or a muscle's session cap (${cycle ? "full body" : "normal"} week)`, () => {
    const { types, sets } = weekVolume(cycle);
    types.forEach((t, i) => {
      const work = TEMPLATES[t].reduce((s, slot, j) => s + (slot.finisher ? 0 : sets[i][j]), 0);
      const all = sets[i].reduce((a, b) => a + b, 0);
      assert.ok(all <= SESSION_SETS[1] && work >= SESSION_SETS[0] - 4, `${t}: ${all} sets`);
      const pv = plannedVolume(TEMPLATES[t].map((s, j) => ({ ...s, setCount: sets[i][j] })));
      for (const [m, n] of Object.entries(pv)) assert.ok((n as number) <= SESSION_MUSCLE_CAP, `${t} ${m} ${n}`);
    });
  });
}

test("upper days carry biceps and triceps, both lower days end with abs, full body has abs too", () => {
  for (const t of ["upper_a", "upper_b"] as const) {
    const muscles = skeleton({ type: t, cycle: 0, index: t === "upper_a" ? 0 : 2 }).slots.map((s) => s.muscle);
    assert.ok(muscles.includes("biceps") && muscles.includes("triceps"), t);
  }
  for (const pos of [{ type: "lower_a", cycle: 0, index: 1 }, { type: "lower_b", cycle: 0, index: 3 }, { type: "full", cycle: 1, index: 3 }] as Position[]) {
    const slots = skeleton(pos).slots;
    assert.equal(slots.filter((s) => s.finisher).length, 2, pos.type);
    assert.ok(slots[slots.length - 1].finisher, `${pos.type} ends with abs`);
  }
});

test("a deload halves the sets and keeps every exercise", () => {
  const pos: Position = { type: "upper_a", cycle: 2, index: 0 };
  const normal = skeleton(pos).slots;
  const light = skeleton(pos, { deload: true }).slots;
  assert.equal(light.length, normal.length);
  light.forEach((s, i) => assert.equal(s.setCount, Math.max(1, Math.round(normal[i].setCount / 2))));
});

test("lateral raises use higher reps; heavy lifts use 6 to 10 on the second day", () => {
  const ua = skeleton({ type: "upper_a", cycle: 0, index: 0 }).slots;
  assert.deepEqual(ua.find((s) => s.muscle === "side_delts")!.reps, [12, 20]);
  assert.deepEqual(ua.find((s) => s.class === "heavy")!.reps, [5, 8]);
  const lb = skeleton({ type: "lower_b", cycle: 0, index: 3 }).slots;
  assert.deepEqual(lb.find((s) => s.class === "heavy")!.reps, [6, 10]);
});

test("growth raises a target but never past its ceiling", () => {
  assert.equal(targets({ chest: 2 }).chest, 12);
  assert.equal(targets({ chest: 50 }).chest, WEEKLY.chest.grow);
});
