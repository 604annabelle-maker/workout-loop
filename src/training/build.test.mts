import assert from "node:assert/strict";
import test from "node:test";
import { buildSession, type Picker } from "./build.ts";
import { catalogue, exercise } from "./catalogue.ts";
import { checkPlan } from "./check.ts";
import { DEFAULT_EQUIPMENT as EQ, isWeighted, loadable } from "./equipment.ts";
import { rng, simulate } from "./fixtures.mts";
import { skeleton, targets } from "./skeleton.ts";
import type { Note, PlanV2 } from "./types.ts";

const now = new Date("2026-11-15T08:00:00Z");
const fresh = async (pick?: Picker, notes: Note[] = []) => buildSession({ history: [], notes, equipment: EQ, now, pick });

test("with no history, the first session is Upper A and passes every check", async () => {
  const { plan } = await fresh();
  assert.equal(plan.position.type, "upper_a");
  assert.ok(plan.exercises.length >= 5);
  for (const x of plan.exercises) assert.ok(exercise(x.main.exerciseId), x.main.exerciseId);
});

test("a wrong-muscle answer is refused, asked again with the reason, then filled by code", async () => {
  const asked: string[][] = [];
  // Always answers a hamstring curl for every slot: it trains none of the upper body.
  const stub: Picker = async (req) => {
    asked.push(req.failures);
    return { picks: req.slots.map((s) => ({ slot: s.key, exerciseId: "Seated_Leg_Curl" })) };
  };
  const built = await fresh(stub);
  assert.equal(asked.length, 3, "first ask and two retries");
  assert.ok(asked[1].some((f) => /does not train/.test(f)), asked[1].join("; "));
  assert.equal(built.modelUsed, false);
  for (const x of built.plan.exercises) assert.notEqual(x.main.exerciseId, "Seated_Leg_Curl");
});

test("a good answer is used as given", async () => {
  const stub: Picker = async (req) => ({ picks: req.slots.map((s) => ({ slot: s.key, exerciseId: s.candidates[s.candidates.length - 1].id, why: "variety" })) });
  const built = await fresh(stub);
  assert.equal(built.modelUsed, true);
  assert.ok(built.plan.exercises.some((x) => x.why === "variety"));
});

test("a disliked exercise never ships, even when the model answers it", async () => {
  const notes: Note[] = [{ id: "n1", reason: "dislike", exerciseId: "Barbell_Bench_Press_-_Medium_Grip", text: "hate bench", createdAt: now, undoneAt: null }];
  const stub: Picker = async (req) => ({ picks: req.slots.map((s) => ({ slot: s.key, exerciseId: "Barbell_Bench_Press_-_Medium_Grip" })) });
  const { plan } = await fresh(stub, notes);
  const ids = plan.exercises.flatMap((x) => [x.main.exerciseId, x.swap?.exerciseId]);
  assert.ok(!ids.includes("Barbell_Bench_Press_-_Medium_Grip"));
});

test("200 random histories and answers: every plan passes the checks, every weight exists, every warm-up matches", async () => {
  const ids = catalogue().map((e) => e.id);
  for (let seed = 1; seed <= 200; seed++) {
    const r = rng(seed);
    const stub: Picker = async (req) =>
      r() < 0.3 ? null : { picks: req.slots.map((s) => ({ slot: s.key, exerciseId: r() < 0.5 ? ids[Math.floor(r() * ids.length)] : s.candidates[Math.floor(r() * s.candidates.length)].id })) };
    const history = await simulate(1 + (seed % 9), { seed, pick: stub });
    for (const s of history) assertGood(s.plan);
  }
});

function assertGood(plan: PlanV2) {
  const today = new Set(plan.exercises.flatMap((x) => exercise(x.main.exerciseId)!.primary));
  for (const x of plan.exercises)
    for (const p of [x.main, x.swap]) {
      if (!p) continue;
      if (isWeighted(p.load)) assert.ok(loadable(p.load, EQ).includes(p.weight!), `${p.exerciseId} at ${p.weight}`);
      else assert.equal(p.weight, null);
    }
  for (const w of plan.warmup) {
    const e = exercise(w.exerciseId)!;
    if (w.practice) assert.ok(loadable(w.load, EQ).includes(w.weight!));
    else assert.ok(e.primary.some((m) => today.has(m)), `warm-up ${e.name} for ${e.primary} on ${plan.position.type}`);
  }
}

test("the checker refuses wrong muscles, wrong swaps, off-target warm-ups and banned exercises", async () => {
  const { plan, skeleton: sk } = await fresh();
  const ok = (p: PlanV2) => checkPlan({ plan: p, skeleton: sk, notes: [], equipment: EQ, history: [], targets: targets() });
  assert.deepEqual(ok(plan), []);

  const swapMain = structuredClone(plan);
  swapMain.exercises[0].main.exerciseId = "Leg_Extensions";
  assert.ok(ok(swapMain).some((f) => /does not train chest/.test(f)));

  const badSwap = structuredClone(plan);
  badSwap.exercises[0].swap!.exerciseId = "Seated_Leg_Curl";
  assert.ok(ok(badSwap).some((f) => /swap .* does not train/.test(f)));

  const badWarm = structuredClone(plan);
  badWarm.warmup[0] = { exerciseId: "Bodyweight_Squat", reps: 10, weight: null, load: "bodyweight" };
  assert.ok(ok(badWarm).some((f) => /warm-up Bodyweight squat .* today does not train/.test(f)));

  const bannedPlan = structuredClone(plan);
  bannedPlan.exercises[1].main.exerciseId = "Dumbbell_Incline_Row";
  assert.ok(ok(bannedPlan).some((f) => /not in the catalogue/.test(f)));

  const tooMuch = structuredClone(plan);
  tooMuch.exercises[0].sets = 12;
  assert.ok(ok(tooMuch).length > 0);

  const badWeight = structuredClone(plan);
  badWeight.exercises[0].main.weight = 21.3;
  assert.ok(ok(badWeight).some((f) => /does not exist/.test(f)));
});

test("lower days warm up the legs, upper days the upper body", async () => {
  const h = await simulate(4, { seed: 3 });
  const legs = new Set(["quads", "hamstrings", "glutes"]);
  for (const s of h) {
    const lower = s.plan.position.type.startsWith("lower");
    for (const w of s.plan.warmup.filter((w) => !w.practice)) {
      const isLeg = exercise(w.exerciseId)!.primary.some((m) => legs.has(m));
      assert.equal(isLeg, lower, `${s.plan.position.type}: ${exercise(w.exerciseId)!.name}`);
    }
    assert.ok(s.plan.warmup.some((w) => w.practice), "one practice set");
    assert.ok(s.plan.warmup.length >= 4 && s.plan.warmup.length <= 5);
  }
});

test("big lifts keep their exercise week to week; at most two small ones rotate in a session", async () => {
  const h = await simulate(24, { seed: 5 });
  const byKey = new Map<string, string[]>();
  for (const s of h) for (const x of s.plan.exercises) byKey.set(x.slot, [...(byKey.get(x.slot) ?? []), x.main.exerciseId]);
  for (const s of h) {
    assert.ok(s.plan.exercises.filter((x) => x.change?.kind === "rotation").length <= 2);
  }
  const heavy = h[0].plan.exercises.filter((x) => x.class === "heavy").map((x) => x.slot);
  for (const k of heavy) {
    const changes = (byKey.get(k) ?? []).filter((id, i, a) => i > 0 && id !== a[i - 1]).length;
    assert.ok(changes <= 2, `${k} changed ${changes} times`);
  }
  const small = [...byKey.entries()].filter(([k]) => !heavy.includes(k) && !k.endsWith(":7") && !k.endsWith(":8"));
  assert.ok(small.some(([, ids]) => new Set(ids).size > 1), "small exercises do rotate over six weeks");
});

test("at most one bodyweight exercise in a session's working sets", async () => {
  const h = await simulate(12, { seed: 9 });
  for (const s of h) {
    const n = s.plan.exercises.filter((x) => !x.finisher && exercise(x.main.exerciseId)!.load === "bodyweight").length;
    assert.ok(n <= 1, `${n} in ${s.plan.position.type}`);
  }
});

test("a deload is never scheduled without a trigger", async () => {
  const h = await simulate(40, { seed: 11, how: (_r, x) => ({ reps: x.main.range[1], tap: "done" }) });
  assert.ok(h.every((s) => !s.plan.deload));
});

test("mostly hard taps two sessions running makes the next sessions lighter", async () => {
  const h = await simulate(3, { seed: 2, how: (_r, x) => ({ reps: x.main.range[0], tap: "hard" }) });
  const after = await buildSession({ history: h, notes: [], equipment: EQ, now: new Date(now.getTime() + 10 * 864e5) });
  assert.equal(after.plan.deload, true);
  assert.ok(after.plan.exercises.every((x) => x.effort.startsWith("easy week")));
  void skeleton;
});
