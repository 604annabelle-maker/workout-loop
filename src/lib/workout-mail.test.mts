import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBrief } from "./coach.ts";
import type { Pictured } from "./exercise-pictures.ts";
import { heardLines, snapshot } from "./summary.ts";
import { DAY, lifted, log, checkIn, lowerPlan, PREFS, session } from "./test-fixtures.mts";
import {
  composeLegacyMail,
  composeWorkoutMail,
  replyExample,
  whereLine,
  workoutSubject,
  type MailInput,
} from "./workout-mail.ts";

const SLOT = { startsAt: new Date("2026-10-07T15:00:00Z"), minutes: 60 };

const HISTORY = [
  session(new Date(SLOT.startsAt.getTime() - 3 * DAY), {
    logs: [log({ exercises: [lifted("A", "HIP THRUST", 60, [10, 10, 10, 10])], checkIn: checkIn({ energy: 4, enjoyment: 5 }) })],
  }),
];

function input(over: Partial<MailInput> = {}): MailInput {
  const brief = buildBrief({ preferences: PREFS, sessions: HISTORY, slot: SLOT, sessionNumber: 2 });
  const plan = lowerPlan({ thrustKg: 65 });
  return {
    plan,
    brief,
    slot: SLOT,
    snapshot: snapshot(HISTORY, brief, SLOT.startsAt, plan),
    heard: heardLines(HISTORY[0].logs[0]),
    ...over,
  };
}

const PICTURES: Pictured[] = [
  {
    exercise: "HIP THRUST",
    shows: "",
    frames: [
      { cid: "exercise-hip-thrust-0@workout-loop", file: "Hip_Thrust-0.jpg" },
      { cid: "exercise-hip-thrust-1@workout-loop", file: "Hip_Thrust-1.jpg" },
    ],
  },
  {
    exercise: "ROMANIAN DEADLIFT",
    shows: "Stiff Legged Deadlift",
    frames: [{ cid: "exercise-sldl-0@workout-loop", file: "SLDL-0.jpg" }],
  },
  { exercise: "CHEST SUPPORTED ROW", shows: "", frames: [] },
];

test("the subject is today's title and date, so the subject fallback can match it", () => {
  assert.equal(workoutSubject(lowerPlan(), SLOT), "Glutes and power · Wed 7 Oct");
});

test("where in the block is said up front, and the cycle day only when tracked", () => {
  const { brief } = input();
  assert.equal(whereLine(brief), "Session 2 · Block 1, week 1 of 5");
  assert.equal(whereLine({ ...brief, cycleDay: 12 }), "Session 2 · Block 1, week 1 of 5 · Cycle day 12");
  assert.match(whereLine({ ...brief, deload: true }), /lighter week/);
});

test("no plain text line is wider than a narrow phone", () => {
  const { text } = composeWorkoutMail(input());
  const over = text.split("\n").filter((l) => l.length > 50);
  assert.deepEqual(over, []);
});

test("the plain text reads in gym order", () => {
  const { text } = composeWorkoutMail(input());
  const order = ["GLUTES AND POWER", "FROM YOUR LAST REPLY", "WARM UP", "POWER PRIMER", "GLUTE STRENGTH", "SUPERSET", "EMOM", "IF TODAY FEELS OFF", "THIS WEEK, COUNTING TODAY", "REPLY WITH", "HOW TO DO THESE"];
  const at = order.map((h) => text.indexOf(h));
  assert.ok(at.every((n) => n >= 0), `missing: ${order.filter((_, i) => at[i] < 0)}`);
  assert.deepEqual([...at].sort((a, b) => a - b), at);
});

test("each exercise carries its label, sets, load, rest and reps in reserve", () => {
  const { text, html } = composeWorkoutMail(input());
  assert.match(text, /A  HIP THRUST  4 x 6-10/);
  assert.match(text, /65kg · rest 2 min · 2 in reserve/);
  assert.match(html, /HIP THRUST<\/span>\s*<span[^>]*>4 x 6-10</);
});

test("a last set to failure is said on the loading line", () => {
  const plan = lowerPlan({ thrustKg: 65 });
  plan.blocks[3].exercises[1].lastSetToFailure = true;
  const { text } = composeWorkoutMail(input({ plan }));
  assert.match(text, /14kg · rest 2 min · 2 in reserve, last set to\s+failure/);
  assert.match(text.replace(/\s+/g, " "), /Heavy barbell lifts stop a rep or two before that/);
});

test("last time and what changed sit under the exercise they belong to", () => {
  const { text, html } = composeWorkoutMail(input());
  assert.match(text, /Last Sun 4 Oct: 60kg x 10, 10, 10, 10/);
  assert.match(text, /Up 5kg\. You hit 10, 10, 10, 10\./);
  assert.ok(html.indexOf("HIP THRUST") < html.indexOf("Up 5kg"));
  assert.ok(html.indexOf("Up 5kg") < html.indexOf("ROMANIAN DEADLIFT"));
});

test("what was read from the last reply is shown back, without stale labels", () => {
  const { text, html } = composeWorkoutMail(input());
  assert.match(text, /- Hip thrust: 60kg x 10, 10, 10, 10/);
  assert.match(text, /energy 4\/5, fun 5\/5/);
  assert.match(html, /Wrong\? Reply and say so\./);
});

test("nothing heard means no section for it", () => {
  const { text, html } = composeWorkoutMail(input({ heard: [] }));
  assert.ok(!text.includes("FROM YOUR LAST REPLY"));
  assert.ok(!html.includes("From your last reply"));
});

test("the progress panel counts today, so today's muscles are not shown as low", () => {
  const { text } = composeWorkoutMail(input());
  const glutes = text.split("\n").find((l) => l.startsWith("Glutes ") && l.includes("■"))!;
  assert.match(glutes, /14\/12-20$/);
});

test("the reply example uses today's own labels and loads", () => {
  const example = replyExample(lowerPlan({ thrustKg: 65 }));
  assert.equal(example[0], "A 65 x 10 10 9");
  assert.match(example[1], /^B1 40 x /);
});

test("warm up items are one line each and get no pictures", () => {
  const { text, inline } = composeWorkoutMail(input({ pictures: [...PICTURES, { exercise: "BIKE", shows: "", frames: [{ cid: "bike@x", file: "bike.jpg" }] }] }));
  assert.match(text, /W1 Bike, 3 min\. Brace\./);
  assert.ok(!inline.some((i) => i.cid === "bike@x"));
});

test("pictures sit under their own exercise, start and finish", () => {
  const { html } = composeWorkoutMail(input({ pictures: PICTURES }));
  const thrust = html.indexOf("HIP THRUST");
  const picture = html.indexOf("cid:exercise-hip-thrust-0@workout-loop");
  const rdl = html.indexOf(">ROMANIAN DEADLIFT<");
  assert.ok(thrust < picture && picture < rdl);
  assert.match(html, /alt="HIP THRUST, start"/);
  assert.match(html, /alt="HIP THRUST, finish"/);
});

test("only the pictures the body refers to are sent, each once", () => {
  const { inline } = composeWorkoutMail(input({ pictures: PICTURES }));
  assert.deepEqual(inline.map((i) => i.cid), [
    "exercise-hip-thrust-0@workout-loop",
    "exercise-hip-thrust-1@workout-loop",
    "exercise-sldl-0@workout-loop",
  ]);
  assert.deepEqual(inline.map((i) => i.filename), ["hip-thrust-1.jpg", "hip-thrust-2.jpg", "romanian-deadlift-1.jpg"]);
});

test("a near enough picture says what it is of, and a missing one is explained in words", () => {
  const plan = lowerPlan({ thrustKg: 65 });
  plan.blocks[3].exercises[1].howTo = "Pull to your lower ribs.";
  const { html } = composeWorkoutMail(input({ plan, pictures: PICTURES }));
  assert.equal(html.match(/Shown: Stiff Legged Deadlift/g)?.length, 1);
  // The row has no picture, so its explanation sits under it instead.
  const row = html.indexOf(">CHEST SUPPORTED ROW<");
  assert.ok(html.indexOf("Pull to your lower ribs.") > row);
  assert.ok(!html.includes("No picture for this one"));
});

test("a missing picture with no explanation says so rather than leaving a gap", () => {
  const plan = lowerPlan({ thrustKg: 65 });
  plan.blocks[3].exercises[1].howTo = "";
  const { html } = composeWorkoutMail(input({ plan, pictures: PICTURES }));
  assert.equal(html.match(/No picture for this one\./g)?.length, 1);
});

test("the HTML has no written explanations at the bottom; the pictures do that job", () => {
  const plan = lowerPlan({ thrustKg: 65 });
  plan.blocks[2].exercises[0].howTo = "Drive through your heels to lockout.";
  const { html } = composeWorkoutMail(input({ plan, pictures: PICTURES }));
  assert.ok(!/How to do these/i.test(html));
  // The hip thrust has pictures, so it is not also explained in words.
  assert.ok(!html.includes("Drive through your heels to lockout."));
});

test("no pictures at all means every movement is explained in words, with no apology", () => {
  const { html, inline } = composeWorkoutMail(input());
  assert.deepEqual(inline, []);
  assert.ok(!html.includes("cid:"));
  assert.ok(!html.includes("No picture for this one"));
  assert.ok(html.includes("Do it well."));
});

test("anything the model wrote is escaped in the HTML", () => {
  const plan = lowerPlan();
  plan.why = `<script>alert("x")</script> & more`;
  const { html } = composeWorkoutMail(input({ plan }));
  assert.ok(!html.includes("<script>"));
  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; &amp; more/);
});

test("every exercise is explained at the bottom, once", () => {
  const plan = lowerPlan();
  plan.blocks[3].exercises[0].howTo = "Hinge at the hips.";
  const { text } = composeWorkoutMail(input({ plan }));
  const howTo = text.slice(text.indexOf("HOW TO DO THESE"));
  assert.match(howTo, /ROMANIAN DEADLIFT\nHinge at the hips\./);
  assert.ok(!howTo.includes("BIKE"));
});

test("a workout from before plans were structured goes out as written", () => {
  const mail = composeLegacyMail("FOCUS\n\nLegs\n\n1. SQUAT  3x5 <b>", SLOT);
  assert.equal(mail.text, "FOCUS\n\nLegs\n\n1. SQUAT  3x5 <b>");
  assert.equal(mail.subject, "Workout for Wed 7 Oct");
  assert.match(mail.html, /&lt;b&gt;/);
  assert.deepEqual(mail.inline, []);
});
