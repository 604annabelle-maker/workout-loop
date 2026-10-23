import { test } from "node:test";
import assert from "node:assert/strict";
import { composeWorkoutMail, workoutSubject } from "./workout-mail.ts";
import { DESCRIPTIONS_HEADING } from "./workout-shape.ts";

const SLOT = { startsAt: new Date("2026-08-26T15:00:00Z"), minutes: 60 };

const PLAN = `FOCUS

Back and biceps

WARM UP

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
    "Back and biceps",
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

test("the focus is a title, not a list item", () => {
  const { html } = composeWorkoutMail(PLAN, SLOT);

  // Large and in the accent colour, so it is read before anything else.
  assert.match(html, /font-size:20px;font-weight:700;[^"]*color:#0f766e[^>]*>\s*Back and biceps/);
});

test("a plan with no focus section renders without an empty title", () => {
  const { html } = composeWorkoutMail("THE SESSION\n\n1. BACK SQUAT  4x5", SLOT);

  assert.ok(!html.includes("FOCUS"));
  assert.match(html, /BACK SQUAT/);
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

const PICTURES = [
  {
    exercise: "BACK SQUAT",
    shows: "",
    frames: [
      { cid: "exercise-barbell-squat-0@workout-loop", file: "Barbell_Squat-0.jpg" },
      { cid: "exercise-barbell-squat-1@workout-loop", file: "Barbell_Squat-1.jpg" },
    ],
  },
  { exercise: "DEADLIFT", shows: "Romanian Deadlift", frames: [{ cid: "exercise-rdl-0@workout-loop", file: "Romanian_Deadlift-0.jpg" }] },
];

const LAST_TIME = [
  {
    exercise: "BACK SQUAT",
    when: new Date("2026-08-12T15:00:00Z"),
    sets: "4x5",
    note: "55kg. Rest 3 min.",
  },
];

test("a picture sits in the body under its own exercise, not at the bottom", () => {
  const { html } = composeWorkoutMail(PLAN, SLOT, { pictures: PICTURES });

  const squat = html.indexOf("BACK SQUAT");
  const picture = html.indexOf("cid:exercise-barbell-squat-0@workout-loop");
  const deadlift = html.indexOf(">DEADLIFT<");

  assert.ok(squat < picture && picture < deadlift, "the picture is between the two exercises");
  assert.match(html, /<img src="cid:exercise-barbell-squat-1@workout-loop"/);
});

test("both frames of a movement go side by side, labelled start and finish", () => {
  const { html } = composeWorkoutMail(PLAN, SLOT, { pictures: PICTURES });

  assert.match(html, /alt="BACK SQUAT, start"/);
  assert.match(html, /alt="BACK SQUAT, finish"/);
  assert.match(html, /<table role="presentation"/);
});

test("only the pictures the body refers to are sent", () => {
  const { inline } = composeWorkoutMail(PLAN, SLOT, { pictures: PICTURES });

  assert.deepEqual(
    inline.map((i) => i.cid),
    [
      "exercise-barbell-squat-0@workout-loop",
      "exercise-barbell-squat-1@workout-loop",
      "exercise-rdl-0@workout-loop",
    ],
  );
  assert.deepEqual(inline.map((i) => i.filename), [
    "back-squat-1.jpg",
    "back-squat-2.jpg",
    "deadlift-1.jpg",
  ]);
});

test("a picture of a near enough movement says what it is of", () => {
  const { html } = composeWorkoutMail(PLAN, SLOT, { pictures: PICTURES });

  assert.match(html, /Shown: Romanian Deadlift/);
  // The one that is what it says it is gets no caption.
  assert.equal(html.match(/Shown:/g)?.length, 1);
});

test("an exercise searched for and not found says so rather than looking broken", () => {
  // What ./exercise-pictures.ts produces: an answer for every exercise, and
  // an empty one for the movement that is not in the set.
  const pictures = [PICTURES[0], { exercise: "DEADLIFT", shows: "", frames: [] }];
  const { html } = composeWorkoutMail(PLAN, SLOT, { pictures });

  assert.match(html, /No picture for this one\./);
  assert.equal(html.match(/No picture for this one\./g)?.length, 1);
});

test("a plan that could not be parsed sends no pictures at all", () => {
  const { html, inline } = composeWorkoutMail("freeform text", SLOT, { pictures: PICTURES });

  assert.deepEqual(inline, []);
  assert.ok(!html.includes("cid:"));
});

test("no pictures offered means no pictures and no apology", () => {
  const { html, inline } = composeWorkoutMail(PLAN, SLOT);

  assert.deepEqual(inline, []);
  assert.ok(!html.includes("cid:"));
  assert.ok(!html.includes("No picture for this one"));
});

test("last time's load is printed under the exercise, with its date", () => {
  const { html } = composeWorkoutMail(PLAN, SLOT, { lastTime: LAST_TIME });

  assert.match(html, /Last time<\/span> 4x5, 55kg\. Rest 3 min\./);
  assert.match(html, /Wed 12 Aug/);

  // Today's prescription first, last time's underneath it to be beaten.
  const today = html.indexOf(">4x5<");
  const before = html.indexOf("Last time");
  assert.ok(today < before);
});

test("a movement never done before carries no last time line", () => {
  const { html } = composeWorkoutMail(PLAN, SLOT, { lastTime: LAST_TIME });

  const deadlift = html.indexOf(">DEADLIFT<");
  assert.equal(html.indexOf("Last time", deadlift), -1);
});

test("the text body is still the plan exactly, pictures or not", () => {
  const { text } = composeWorkoutMail(PLAN, SLOT, { pictures: PICTURES, lastTime: LAST_TIME });

  assert.equal(text, PLAN.trim());
});
