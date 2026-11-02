import { test } from "node:test";
import assert from "node:assert/strict";
import { composeReview, reviewFacts } from "./review.ts";
import { checkIn, DAY, lifted, log, PREFS, session, stamp } from "./test-fixtures.mts";

// Sunday 18 Oct to Sunday 25 Oct, midnight in Jerusalem.
const FROM = new Date("2026-10-17T21:00:00Z");
const TO = new Date("2026-10-24T21:00:00Z");

const started = new Date("2026-10-04T00:00:00Z").toISOString();

function week(extra: Parameters<typeof session>[1] = {}) {
  return [
    session("2026-10-12T15:00:00Z", { stamp: stamp({ blockStartedAt: started }), logs: [log({ exercises: [lifted("A", "HIP THRUST", 60, [10, 10])] })] }),
    session("2026-10-19T15:00:00Z", { stamp: stamp({ blockStartedAt: started }), logs: [log({ exercises: [lifted("A", "HIP THRUST", 65, [10, 10])], checkIn: checkIn({ enjoyment: 4 }) })] }),
    session("2026-10-22T15:00:00Z", { stamp: stamp({ blockStartedAt: started }), ...extra }),
  ];
}

test("the subject counts sessions and new bests", () => {
  const review = composeReview({ sessions: week(), preferences: PREFS, from: FROM, to: TO });
  assert.equal(review.subject, "Your week: 2 sessions, 1 new best");
});

test("the review lists the week's sessions and stays narrow", () => {
  const { text } = composeReview({ sessions: week(), preferences: PREFS, from: FROM, to: TO });
  assert.match(text, /WEEK OF SUN 18 OCT/);
  assert.match(text, /- Mon 19 Oct: Glutes and power/);
  assert.ok(!/jump/i.test(text));
  assert.ok(!text.includes("Mon 12 Oct"));
  assert.deepEqual(text.split("\n").filter((l) => l.length > 50), []);
});

test("it says plainly when sessions went unlogged", () => {
  const { text } = composeReview({ sessions: week(), preferences: PREFS, from: FROM, to: TO });
  assert.match(text, /1 of 2 sessions had no numbers in a reply/);
});

test("next week is named from where the block is", () => {
  const facts = reviewFacts({ sessions: week(), preferences: PREFS, from: FROM, to: TO });
  assert.match(facts.next, /week 4 of block 1: peak/);
});

test("low energy in more than one reply is worth a gentle word", () => {
  const sessions = week({ logs: [log({ checkIn: checkIn({ energy: 2 }) })] });
  sessions[1].logs.push(log({ checkIn: checkIn({ energy: 1 }) }));
  const facts = reviewFacts({ sessions, preferences: PREFS, from: FROM, to: TO });
  assert.equal(facts.health.length, 1);
  assert.match(facts.health[0], /not eating enough/);
});

test("a long gap since a logged period is mentioned only when tracking is on", () => {
  const sessions = week();
  sessions[0].logs.push(log({ checkIn: checkIn({ periodStarted: true }) }));
  sessions.unshift(session(new Date(Date.parse("2026-10-12T15:00:00Z") - 40 * DAY), { logs: [log({ checkIn: checkIn({ periodStarted: true }) })] }));
  sessions.splice(1, 1, session("2026-10-12T15:00:00Z", { stamp: stamp({ blockStartedAt: started }) }));

  const off = reviewFacts({ sessions, preferences: PREFS, from: FROM, to: TO });
  assert.equal(off.health.length, 0);

  const on = reviewFacts({ sessions, preferences: { ...PREFS, cycleTracking: true }, from: FROM, to: TO });
  assert.equal(on.health.length, 1);
  assert.match(on.health[0], /Your last logged period started \d+ days ago/);
});

test("the HTML escapes and carries the same headline", () => {
  const { html } = composeReview({ sessions: week(), preferences: PREFS, from: FROM, to: TO });
  assert.match(html, /2 sessions, 1 new best/);
  assert.match(html, /Hard sets per muscle/);
});
