import { test } from "node:test";
import assert from "node:assert/strict";
import { composeWorkoutMail, workoutSubject } from "./workout-mail.ts";
import { DESCRIPTIONS_HEADING } from "./prompt.ts";

const SLOT = { startsAt: new Date("2026-08-26T15:00:00Z"), minutes: 60 };

const PLAN = `Back squat 3x5
Dumbbell row 3x10

${DESCRIPTIONS_HEADING}

Back squat: sit down between your hips.

Dumbbell row: pull to your hip, not your shoulder.`;

test("the subject carries the date, so two workouts never share one", () => {
  assert.equal(workoutSubject(SLOT), "Workout for Wed 26 Aug");

  const later = { startsAt: new Date("2026-09-02T15:00:00Z"), minutes: 60 };
  assert.notEqual(workoutSubject(SLOT), workoutSubject(later));
});

test("the text body is the plan exactly, with nothing added", () => {
  const { text } = composeWorkoutMail(PLAN, SLOT);

  assert.equal(text, PLAN.trim());
});

test("the html carries the session and every description", () => {
  const { html } = composeWorkoutMail(PLAN, SLOT);

  assert.match(html, /Back squat 3x5/);
  assert.match(html, /sit down between your hips/);
  assert.match(html, /pull to your hip/);
});

test("descriptions become separate paragraphs", () => {
  const { html } = composeWorkoutMail(PLAN, SLOT);

  assert.equal((html.match(/<p style/g) ?? []).length, 2);
});

test("the session keeps its line breaks and the descriptions do not need them", () => {
  const { html } = composeWorkoutMail(PLAN, SLOT);

  assert.match(html, /white-space:pre-wrap/);
});

test("html is escaped, so a plan can mention < or &", () => {
  const plan = `Row at <60% & keep it easy\n\n${DESCRIPTIONS_HEADING}\n\nRow: "steady".`;
  const { html } = composeWorkoutMail(plan, SLOT);

  assert.match(html, /&lt;60% &amp; keep it easy/);
  assert.ok(!html.includes('<60%'));
  assert.match(html, /&quot;steady&quot;/);
});

test("a plan with no heading still produces a sendable email", () => {
  const { text, html } = composeWorkoutMail("Back squat 3x5\nRow 3x10", SLOT);

  assert.equal(text, "Back squat 3x5\nRow 3x10");
  assert.match(html, /Back squat 3x5/);
  assert.ok(!html.includes(DESCRIPTIONS_HEADING), "no empty descriptions section");
});

test("surrounding whitespace on the plan is trimmed", () => {
  const { text } = composeWorkoutMail(`\n\n${PLAN}\n\n`, SLOT);

  assert.equal(text, PLAN.trim());
});
