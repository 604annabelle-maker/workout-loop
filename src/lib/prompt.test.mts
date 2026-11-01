import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBrief } from "./coach.ts";
import { buildPrompt, HISTORY_WINDOW, NOTES_WINDOW, SYSTEM, type PromptInput } from "./prompt.ts";
import { checkIn, DAY, lifted, log, PREFS, session } from "./test-fixtures.mts";

const SLOT = { startsAt: new Date("2026-10-20T15:00:00Z"), minutes: 60 };

function input(sessions = [session("2026-10-17T15:00:00Z")], preferences = PREFS): PromptInput {
  const brief = buildBrief({ preferences, sessions, slot: SLOT, sessionNumber: sessions.length + 1 });
  return { preferences, sessions, brief, slot: SLOT };
}

test("the philosophy is in the system prompt, the same every time", () => {
  assert.equal(buildPrompt(input()).system, SYSTEM);
  assert.match(SYSTEM, /same relative rate as men/);
  assert.match(SYSTEM, /Nothing is programmed by menstrual cycle phase/);
  assert.match(SYSTEM, /jumping are what build bone/);
  assert.match(SYSTEM, /Pull at least as much as push/);
  assert.match(SYSTEM, /never use language about burning, toning, slimming/);
});

test("the system prompt asks for every block kind the code knows how to render", () => {
  for (const kind of ["warmup", "primer", "strength", "superset", "finisher", "core", "cooldown"]) {
    assert.match(SYSTEM, new RegExp(`\\b${kind}:`));
  }
});

test("her preferences all reach the prompt", () => {
  const { user } = buildPrompt(
    input(undefined, {
      ...PREFS,
      priorities: ["glutes", "back"],
      avoid: "overhead pressing, my left shoulder",
      enjoys: "kettlebells",
      brief: "I like to feel athletic.",
    }),
  );
  assert.match(user, /Goals: build lean muscle/);
  assert.match(user, /Level: intermediate\. a year of lifting/);
  assert.match(user, /Priority muscles: glutes, back/);
  assert.match(user, /Avoid: overhead pressing, my left shoulder/);
  assert.match(user, /She loves: kettlebells/);
  assert.match(user, /In her words: I like to feel athletic\./);
});

test("the slot's local time and length reach the prompt", () => {
  const { user } = buildPrompt(input());
  // Jerusalem is three hours ahead of UTC in October before the clocks change.
  assert.match(user, /Tue, 20 Oct 2026, 18:00, 60 minutes/);
});

test("the coach's decisions arrive as facts", () => {
  const { user } = buildPrompt(input());
  assert.match(user, /Session 2: Legs and shoulders \(full body rotation\)/);
  // The fixture's block began on 4 Oct, so the 20th is its third week.
  assert.match(user, /Block 1, Week 3, build\. Effort this week: 1 to 2 in reserve\./);
  assert.match(user, /Time budget in minutes: warm up 7, primer 5, main work 39, finisher 9/);
  assert.match(user, /Jumps: 20 foot contacts in the last 7 days/);
  assert.match(user, /Finisher: /);
});

test("targets carry the exact load and why", () => {
  const sessions = [
    session("2026-10-17T15:00:00Z", { logs: [log({ exercises: [lifted("A", "HIP THRUST", 60, [10, 10, 10, 10])] })] }),
  ];
  const { user } = buildPrompt(input(sessions));
  assert.match(user, /HIP THRUST: 4 x 6-10 at 65kg\. Up 5kg\. You hit 10, 10, 10, 10\. Last \(Sat 17 Oct\): 60kg x 10, 10, 10, 10\./);
});

test("a first session says so and asks for calibration", () => {
  const { user } = buildPrompt(input([]));
  assert.match(user, /first session with the app/);
  assert.match(user, /None yet\. Every load today is a first calibration\./);
});

test("readiness, pain, likes and requests from replies are passed on", () => {
  const sessions = [
    session("2026-10-17T15:00:00Z", {
      notes: ["Felt flat. Knee niggle on lunges."],
      logs: [log({ checkIn: checkIn({ energy: 2, pain: ["knee on lunges"] }), liked: ["box jumps"], requests: "more pull ups" })],
    }),
  ];
  const { user } = buildPrompt(input(sessions));
  assert.match(user, /Her last reply said: energy 2 of 5\./);
  assert.match(user, /Pain she mentioned recently: knee on lunges\./);
  assert.match(user, /She said she liked: box jumps\./);
  assert.match(user, /She asked for: more pull ups\./);
  assert.match(user, /Sat 17 Oct: Felt flat\. Knee niggle on lunges\./);
});

test("recent sessions are summarised oldest first, within the window", () => {
  const sessions = Array.from({ length: HISTORY_WINDOW + 3 }, (_, i) =>
    session(new Date(Date.parse("2026-10-01T15:00:00Z") + i * 2 * DAY)),
  );
  const { user } = buildPrompt(input(sessions));
  const recent = user.slice(user.indexOf("RECENT SESSIONS"), user.indexOf("WHAT SHE WROTE"));
  assert.equal(recent.match(/Glutes and jumps\./g)?.length, HISTORY_WINDOW);
  assert.match(recent, /A HIP THRUST 4x6-10 @ 60kg/);
});

test("replies are replayed verbatim for the notes window only", () => {
  const sessions = Array.from({ length: NOTES_WINDOW + 2 }, (_, i) =>
    session(new Date(Date.parse("2026-10-01T15:00:00Z") + i * 2 * DAY), { notes: [`note ${i}`] }),
  );
  const { user } = buildPrompt(input(sessions));
  assert.ok(!user.includes("note 0"));
  assert.ok(!user.includes("note 1"));
  assert.ok(user.includes(`note ${NOTES_WINDOW + 1}`));
});

test("a workout from before plans were structured is still shown", () => {
  const legacy = session("2026-10-15T15:00:00Z", {
    plan: null,
    stamp: null,
    legacyText: "FOCUS\n\nLegs\n\n1. SQUAT  3x5\n   50kg\n\nHOW TO DO THESE\n\nSQUAT\nSit.",
  });
  const { user } = buildPrompt(input([legacy]));
  assert.match(user, /1\. SQUAT {2}3x5/);
  assert.ok(!user.includes("Sit."));
});
