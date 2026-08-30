import { test } from "node:test";
import assert from "node:assert/strict";
import { composeWorkoutMail, workoutSubject } from "./workout-mail.ts";
import { DESCRIPTIONS_HEADING } from "./prompt.ts";

const SLOT = { startsAt: new Date("2026-08-26T15:00:00Z"), minutes: 60 };

const PLAN = `WARM UP

- Bike 3 min
- Bodyweight squat 10 reps

THE SESSION

1. BACK SQUAT  4x5
   Heavier than last week. 3 min rest.

2. DEADLIFT  3x5
   Stop with 2 reps left. 3 min rest.

FINISH

- Hip flexor stretch 45 sec each side

${DESCRIPTIONS_HEADING}

BACK SQUAT
Bar on the upper back, brace hard.

DEADLIFT
Bar over midfoot, chest up.`;

test("the subject carries the date, so two workouts never share one", () => {
  assert.equal(workoutSubject(SLOT), "Workout for Wed 26 Aug");

  const later = { startsAt: new Date("2026-09-02T15:00:00Z"), minutes: 60 };
  assert.notEqual(workoutSubject(SLOT), workoutSubject(later));
});

test("the text body is the plan exactly, with nothing added", () => {
  assert.equal(composeWorkoutMail(PLAN, SLOT).text, PLAN.trim());
});

test("the html carries every section, exercise and description", () => {
  const { html } = composeWorkoutMail(PLAN, SLOT);

  for (const expected of [
    "WARM UP",
    "THE SESSION",
    "FINISH",
    "BACK SQUAT",
    "DEADLIFT",
    "Bike 3 min",
    "Heavier than last week",
    "Bar over midfoot",
  ]) {
    assert.match(html, new RegExp(expected), `missing: ${expected}`);
  }
});

test("the sets are coloured, because that is the line read mid set", () => {
  const { html } = composeWorkoutMail(PLAN, SLOT);

  assert.match(html, /color:#0f766e;font-weight:700">4x5</);
  assert.match(html, /color:#0f766e;font-weight:700">3x5</);
});

test("every colour is stated outright, so dark mode cannot invert half of it", () => {
  const { html } = composeWorkoutMail(PLAN, SLOT);

  assert.match(html, /background:#ffffff/);
  assert.match(html, /background:#f5f5f4/);
  assert.match(html, /color:#1c1917/);
});

test("a note is rendered under its own exercise, not merged into the next", () => {
  const { html } = composeWorkoutMail(PLAN, SLOT);

  const squat = html.indexOf("BACK SQUAT");
  const note = html.indexOf("Heavier than last week");
  const deadlift = html.indexOf(">DEADLIFT<");

  assert.ok(squat < note && note < deadlift, "the note sits between the two exercises");
});

test("html is escaped, so a plan can mention < or &", () => {
  const plan = `THE SESSION\n\n1. ROW  <60% & easy\n   Keep it "steady".`;
  const { html } = composeWorkoutMail(plan, SLOT);

  assert.match(html, /&lt;60% &amp; easy/);
  assert.match(html, /&quot;steady&quot;/);
  assert.ok(!html.includes("<60%"));
});

test("a plan that does not follow the format is shown verbatim rather than lost", () => {
  const freeform = "just some text the model wrote its own way";
  const { html, text } = composeWorkoutMail(freeform, SLOT);

  assert.equal(text, freeform);
  assert.match(html, /just some text the model wrote its own way/);
});

test("a plan with no descriptions produces no empty descriptions section", () => {
  const { html } = composeWorkoutMail("THE SESSION\n\n1. BACK SQUAT  4x5", SLOT);

  assert.match(html, /BACK SQUAT/);
  assert.ok(!html.includes(DESCRIPTIONS_HEADING));
});

test("surrounding whitespace on the plan is trimmed", () => {
  assert.equal(composeWorkoutMail(`\n\n${PLAN}\n\n`, SLOT).text, PLAN.trim());
});
