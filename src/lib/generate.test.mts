import { test } from "node:test";
import assert from "node:assert/strict";
import { generateWorkout } from "./generate.ts";
import { DESCRIPTIONS_HEADING, type Preferences } from "./prompt.ts";

const PREFS: Preferences = {
  goals: "",
  experience: "",
  trainingDaysPerWeek: 3,
  avoid: "",
  equipment: "",
  brief: "",
};

const SLOT = { startsAt: new Date("2026-08-26T15:00:00Z"), minutes: 60 };

test("with no API key it returns the canned plan rather than throwing", async () => {
  delete process.env.ANTHROPIC_API_KEY;

  const result = await generateWorkout(PREFS, [], SLOT);

  assert.equal(result.canned, true);
  assert.ok(result.planText.length > 0);
});

test("the canned plan has the same shape as a real one", async () => {
  delete process.env.ANTHROPIC_API_KEY;

  const { planText } = await generateWorkout(PREFS, [], SLOT);
  const parts = planText.split(DESCRIPTIONS_HEADING);

  assert.equal(parts.length, 2, "must split into a session and its descriptions");
  assert.ok(parts[0].trim().length > 0, "the session half is not empty");
  assert.ok(parts[1].trim().length > 0, "the descriptions half is not empty");
});

test("the canned plan says it is canned, so it is never mistaken for real output", async () => {
  delete process.env.ANTHROPIC_API_KEY;

  const { planText } = await generateWorkout(PREFS, [], SLOT);

  assert.match(planText, /canned/i);
});

test("the canned session carries no markdown", async () => {
  delete process.env.ANTHROPIC_API_KEY;

  const { planText } = await generateWorkout(PREFS, [], SLOT);
  const [session] = planText.split(DESCRIPTIONS_HEADING);

  assert.equal(session.match(/[*#`]/g), null);
});
