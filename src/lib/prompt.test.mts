import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DESCRIPTIONS_HEADING,
  HISTORY_WINDOW,
  buildPrompt,
  type PastWorkout,
  type Preferences,
} from "./prompt.ts";

const PREFS: Preferences = {
  goals: "get stronger, keep my back healthy",
  experience: "three years, comfortable with barbells",
  trainingDaysPerWeek: 3,
  avoid: "overhead pressing, my left shoulder",
  equipment: "barbell, rack, dumbbells to 30kg, one bench, kettlebells",
  brief: "I would rather do fewer exercises properly than lots of them.",
};

const SLOT = { startsAt: new Date("2026-08-26T15:00:00Z"), minutes: 60 };

function pastWorkout(i: number, feedback: string[] = []): PastWorkout {
  return {
    slotStartsAt: new Date(`2026-08-${String(10 + i).padStart(2, "0")}T15:00:00Z`),
    planText: `Session ${i}\nBack squat 3x5\n\n${DESCRIPTIONS_HEADING}\nBack squat: sit down between your hips.`,
    feedback,
  };
}

test("preferences all reach the prompt", () => {
  const { user } = buildPrompt(PREFS, [], SLOT);

  assert.match(user, /get stronger, keep my back healthy/);
  assert.match(user, /three years, comfortable with barbells/);
  assert.match(user, /3 days a week/);
  assert.match(user, /overhead pressing, my left shoulder/);
  assert.match(user, /kettlebells/);
  assert.match(user, /fewer exercises properly/);
});

test("the slot's time and length reach the prompt", () => {
  const { user } = buildPrompt(PREFS, [], SLOT);

  // Jerusalem is three hours ahead of UTC in August.
  assert.match(user, /Wed, 26 Aug 2026, 18:00/);
  assert.match(user, /60 minutes/);
});

test("an empty history produces a valid prompt that says so", () => {
  const { system, user } = buildPrompt(PREFS, [], SLOT);

  assert.ok(system.length > 0);
  assert.match(user, /This is the first session/);
});

test("history is capped at the window, keeping the most recent", () => {
  const history = Array.from({ length: HISTORY_WINDOW + 4 }, (_, i) => pastWorkout(i));
  const { user } = buildPrompt(PREFS, history, SLOT);

  assert.ok(!user.includes("Session 0"), "the oldest should have fallen out");
  assert.ok(!user.includes("Session 3"), "still outside the window");
  assert.ok(user.includes("Session 4"), "the first inside the window");
  assert.ok(user.includes(`Session ${HISTORY_WINDOW + 3}`), "the most recent");
});

test("history is ordered oldest first, so progression reads forwards", () => {
  const { user } = buildPrompt(PREFS, [pastWorkout(1), pastWorkout(2)], SLOT);

  assert.ok(user.indexOf("Session 1") < user.indexOf("Session 2"));
});

test("feedback is attached to the session it belongs to", () => {
  const history = [pastWorkout(1, ["Too easy, add weight."]), pastWorkout(2)];
  const { user } = buildPrompt(PREFS, history, SLOT);

  assert.match(user, /Afterwards they said: Too easy, add weight\./);
});

test("a session with no feedback carries none, and does not say so", () => {
  const { user } = buildPrompt(PREFS, [pastWorkout(1)], SLOT);

  assert.ok(!user.includes("Afterwards they said"));
});

test("blank feedback is dropped rather than filed as an empty note", () => {
  const { user } = buildPrompt(PREFS, [pastWorkout(1, ["  ", ""])], SLOT);

  assert.ok(!user.includes("Afterwards they said"));
});

test("the explanations are not replayed as history", () => {
  const { user } = buildPrompt(PREFS, [pastWorkout(1)], SLOT);

  assert.ok(user.includes("Back squat 3x5"), "the session itself is history");
  assert.ok(
    !user.includes("sit down between your hips"),
    "the glossary is boilerplate and would triple the prompt for nothing",
  );
});

test("a very long past session is excerpted rather than replayed whole", () => {
  const long: PastWorkout = {
    slotStartsAt: new Date("2026-08-20T15:00:00Z"),
    planText: "x".repeat(5000),
    feedback: [],
  };
  const { user } = buildPrompt(PREFS, [long], SLOT);

  assert.ok(user.length < 3000, `prompt ran to ${user.length} characters`);
  assert.match(user, /\.\.\./);
});

test("the system prompt states the constraints that matter", () => {
  const { system } = buildPrompt(PREFS, [], SLOT);

  // Whitespace-normalised, because the prompt is hard-wrapped for readability
  // and a phrase can straddle a line break. The instruction is what matters,
  // not where it happens to fold.
  const flat = system.replace(/\s+/g, " ");

  assert.match(flat, /plain text/i);
  assert.match(flat, /markdown/i);
  assert.ok(flat.includes(DESCRIPTIONS_HEADING));
  assert.match(flat, /every exercise/i);
  assert.match(flat, /under 50 characters/i);
  // The split follows the recent sessions, not a calendar week. They book
  // irregularly, so a weekly frame breaks whenever the rhythm changes.
  assert.match(flat, /recent sessions/i);
  assert.match(flat, /no week to balance/i);
  assert.ok(!/across a week/i.test(flat), "no calendar framing");
  assert.match(flat, /WARM UP/);
  assert.match(flat, /THE SESSION/);
});

test("empty preferences degrade to a usable prompt rather than blanks", () => {
  const empty: Preferences = {
    goals: "",
    experience: "",
    trainingDaysPerWeek: 0,
    avoid: "",
    equipment: "",
    brief: "",
  };
  const { user } = buildPrompt(empty, [], SLOT);

  assert.match(user, /Goals: not stated/);
  assert.match(user, /Avoid: nothing stated/);
  assert.ok(!user.includes("In their words"));
});
