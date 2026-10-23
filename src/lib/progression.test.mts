import { test } from "node:test";
import assert from "node:assert/strict";
import { lastLifted, lastLiftedLines, lastTimeFor } from "./progression.ts";
import type { PastWorkout } from "./prompt.ts";

function session(date: string, body: string): PastWorkout {
  return {
    slotStartsAt: new Date(date),
    planText: `FOCUS\n\nLegs\n\nTHE SESSION\n\n${body}`,
    feedback: [],
  };
}

/** Oldest first, the way history reaches the prompt. */
const HISTORY: PastWorkout[] = [
  session(
    "2026-09-28T06:30:00Z",
    "1. SMITH OVERHEAD PRESS  4 x 8\n   7.5kg a side. Rest 2 min.\n\n2. DUMBBELL LATERAL RAISE  4 x 12\n   5kg per hand. Rest 75 sec.",
  ),
  session(
    "2026-10-12T06:30:00Z",
    "1. BARBELL SQUAT  4 x 6\n   45kg. Rest 3 min.",
  ),
  session(
    "2026-10-19T06:30:00Z",
    "1. SMITH OVERHEAD PRESS  4 x 8\n   10kg a side. Rest 2 min.",
  ),
];

test("each movement is remembered at its most recent load, not its first", () => {
  const done = lastLifted(HISTORY);
  const press = done.find((d) => d.exercise === "SMITH OVERHEAD PRESS");

  assert.equal(press?.sets, "4 x 8");
  assert.equal(press?.note, "10kg a side. Rest 2 min.");
  assert.equal(press?.when.toISOString(), "2026-10-19T06:30:00.000Z");
});

test("movements come back most recent first", () => {
  assert.deepEqual(
    lastLifted(HISTORY).map((d) => d.exercise),
    ["SMITH OVERHEAD PRESS", "BARBELL SQUAT", "DUMBBELL LATERAL RAISE"],
  );
});

test("one entry per movement, however often it was trained", () => {
  const done = lastLifted(HISTORY);
  assert.equal(new Set(done.map((d) => d.exercise)).size, done.length);
});

test("today's plan is told what today's movements were last loaded at", () => {
  const today = `THE SESSION\n\n1. SMITH OVERHEAD PRESS  4 x 8\n   12.5kg a side.\n\n2. CABLE REAR DELT FLYE  3 x 15\n   Light.`;

  const lastTime = lastTimeFor(today, HISTORY);

  assert.equal(lastTime.length, 1);
  assert.equal(lastTime[0].exercise, "SMITH OVERHEAD PRESS");
  assert.equal(lastTime[0].note, "10kg a side. Rest 2 min.");
});

test("a movement renamed between sessions is still the same movement", () => {
  const today = "THE SESSION\n\n1. SMITH MACHINE OVERHEAD PRESS  4 x 8\n   12.5kg a side.";

  const [lifted] = lastTimeFor(today, HISTORY);

  // Keyed by today's spelling, because that is what the email has to match up.
  assert.equal(lifted.exercise, "SMITH MACHINE OVERHEAD PRESS");
  assert.equal(lifted.note, "10kg a side. Rest 2 min.");
});

test("a first session has nothing to beat and says nothing", () => {
  assert.deepEqual(lastLifted([]), []);
  assert.deepEqual(lastTimeFor("THE SESSION\n\n1. BARBELL SQUAT  4 x 6\n   45kg.", []), []);
  assert.equal(lastLiftedLines([]), "");
});

test("the prompt gets one line per movement, with the date and the load", () => {
  const lines = lastLiftedLines(HISTORY).split("\n");

  assert.equal(lines[0], "SMITH OVERHEAD PRESS - Mon 19 Oct: 4 x 8, 10kg a side. Rest 2 min.");
  assert.equal(lines.length, 3);
});
