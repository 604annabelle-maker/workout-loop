import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBrief } from "./coach.ts";
import type { Pictured } from "./exercise-pictures.ts";
import { forgotten, appUrl } from "./reminders.ts";
import { snapshot } from "./summary.ts";
import { lifted, log, lowerPlan, PREFS, session, stamp } from "./test-fixtures.mts";
import { composeAmp } from "./workout-amp.ts";
import { composeWorkoutMail, type MailInput } from "./workout-mail.ts";

const SLOT = { startsAt: new Date("2026-10-20T15:00:00Z"), minutes: 60 };
const BASE = "https://workout.example.app";
const TOKEN = "tok_0123456789abcdefghij";

const DRAWN: Pictured = {
  exercise: "DEADLIFT",
  shows: "",
  drawn: true,
  frames: [
    { cid: "drawing-0001-0@workout-loop", source: "d", file: "0001-0.png", width: 400, height: 315 },
    { cid: "drawing-0001-1@workout-loop", source: "d", file: "0001-1.png", width: 400, height: 320 },
  ],
};

function input(over: Partial<MailInput> = {}): MailInput {
  const sessions = [
    session("2026-10-17T15:00:00Z", { logs: [log({ exercises: [lifted("A", "DEADLIFT", 60, [3, 3, 3, 3])] })] }),
  ];
  const brief = buildBrief({ preferences: PREFS, sessions, slot: SLOT, sessionNumber: 2 });
  const plan = lowerPlan();
  return {
    plan,
    brief,
    slot: SLOT,
    snapshot: snapshot(sessions, brief, SLOT.startsAt, plan),
    pictures: [DRAWN],
    learning: new Set(["DEADLIFT"]),
    log: { base: BASE, token: TOKEN },
    unlogged: [],
    ...over,
  };
}

const mail = (over: Partial<MailInput> = {}) => composeWorkoutMail(input(over), composeAmp);

/* ---------- what every version says ---------- */

test("the subject is the day and the date", () => {
  assert.equal(mail().subject, "Glutes + hamstrings · Tue 20 Oct");
});

test("each exercise shows its target, weight, rest, effort and last time, in few words", () => {
  const { text } = mail();
  assert.match(text, /A  DEADLIFT  4 × 3/);
  assert.match(text, /60kg · rest 2 min · stop 2 short/);
  assert.match(text, /Last 60kg x 3, 3, 3, 3 · One more rep: 4\./);
  assert.match(text, /or: TRAP BAR DEADLIFT · 4 × 3 · 60kg/);
});

test("no tips, no off-day advice, no Sunday review: just the session and the bars", () => {
  const { text, html } = mail();
  for (const gone of ["TIP", "IF TODAY FEELS OFF", "FROM YOUR LAST REPLY", "HOW TO DO THESE", "NEW BESTS"]) {
    assert.ok(!text.includes(gone), gone);
  }
  assert.match(text, /THIS WEEK/);
  assert.match(html, /This week/);
});

test("the plain versions say how to log by replying", () => {
  const { text, html } = mail();
  assert.match(text, /Log by replying: done, or only what was\s+different/);
  assert.match(html, /Log by replying/);
});

test("plain text lines stay inside 50 characters", () => {
  const over = mail().text.split("\n").filter((l) => l.length > 50);
  assert.deepEqual(over, []);
});

/* ---------- pictures ---------- */

test("no pictures in the plain version: the how-to in words while she is learning it", () => {
  const learning = mail();
  assert.equal(learning.inline.length, 0);
  assert.ok(!learning.html.includes("<img"));
  assert.match(learning.html, /Do it well\./);
  assert.ok(!mail({ learning: new Set() }).html.includes("Do it well."));
});

test("no frame around the email: it uses the whole of a small screen", () => {
  const { html, amp } = mail();
  assert.ok(!html.includes("border-radius:10px"));
  assert.ok(!amp!.includes('class="card"'));
  assert.match(amp!, /body\{[^}]*margin:0;padding:0 2px\}/);
});

test("the drawings are behind How to, full width, one frame under the other, with the credit", () => {
  const amp = mail().amp!;
  const how = amp.slice(amp.indexOf('<amp-accordion class="how"'), amp.indexOf("</amp-accordion>", amp.indexOf('<amp-accordion class="how"')));
  assert.match(how, /<h4>How to &#9662;<\/h4>/);
  assert.equal(how.match(/<div class="frame"><amp-img /g)?.length, 2);
  assert.match(how, /<amp-img src="https:\/\/workout\.example\.app\/pictures\/d\/0001-0\.png" alt="DEADLIFT" width="400" height="315" layout="responsive">/);
  assert.match(amp, /Everkinetic/);
});

test("without a drawing, How to opens on two plain sentences; with no words either, there is none", () => {
  const amp = mail({ pictures: [] }).amp!;
  assert.match(amp, /<h4>How to &#9662;<\/h4>\n<div class="howbody"><p class="howto">Do it well\.<\/p><\/div>/);
  assert.ok(!amp.includes("Everkinetic"));
});

test("a near drawing carries its one line on what differs", () => {
  const near: Pictured = { ...DRAWN, shows: "Shown seated; standing, it is the same press." };
  assert.match(mail({ pictures: [near] }).amp!, /<div class="howbody"><p class="shows">Shown seated; standing, it is the same press\.<\/p><div class="frame">/);
});

test("photos are never shown, only drawings", () => {
  const photo: Pictured = { exercise: "DEADLIFT", shows: "", drawn: false, frames: [{ cid: "x@y", source: "p", file: "a.jpg", width: 400, height: 267 }] };
  assert.ok(!mail({ pictures: [photo] }).amp!.includes("amp-img"));
});

/* ---------- the dynamic version ---------- */

test("no dynamic version without somewhere to log to", () => {
  assert.equal(mail({ log: null }).amp, undefined);
});

test("each exercise has its pills, undo, swap and a box, posting to this workout", () => {
  const amp = mail().amp!;
  const form = amp.slice(amp.indexOf('<form id="f-A"'), amp.indexOf("</form>", amp.indexOf('<form id="f-A"')));
  assert.match(form, new RegExp(`action-xhr="${BASE}/api/log\\?t=${TOKEN}"`));
  for (const how of ["done", "easy", "hard", "skip", "clear", "swap"]) {
    assert.match(form, new RegExp(`value="${how}" on="change:f-A.submit"`), how);
  }
  assert.match(form, /<amp-accordion class="swap" animate>/);
  assert.match(form, /TRAP BAR DEADLIFT/);
  assert.match(form, /did this instead/);
  assert.match(form, /name="note" maxlength="300"/);
});

test("warm up items have no buttons", () => {
  assert.ok(!mail().amp!.includes('id="f-W1"'));
});

test("the end has all done and a box for anything else", () => {
  const amp = mail().amp!;
  assert.match(amp, /name="how" value="alldone">\s*<button class="alldone" type="submit">All done<\/button>/);
  assert.match(amp, /Anything else about today\?/);
  assert.match(amp, /<textarea class="box" name="note"/);
});

test("the line at the top reads what is logged so far, and every save refreshes it", () => {
  const amp = mail().amp!;
  assert.match(amp, /<amp-list id="logged" layout="fixed-height" height="40" src="https:\/\/workout\.example\.app\/api\/log\?t=/);
  assert.ok((amp.match(/on="submit-success:logged.refresh"/g) ?? []).length >= 6);
});

test("forgotten workouts are asked about at the top, logging to their own row", () => {
  const amp = mail({ unlogged: [{ at: new Date("2026-10-15T15:00:00Z"), title: "Back + biceps", token: "older_token_abcdefghijk" }] }).amp!;
  assert.match(amp, /Thu 15 Oct, Back \+ biceps, isn't logged\./);
  assert.match(amp, /api\/log\?t=older_token_abcdefghijk/);
  assert.match(amp, /value="skipall"/);
});

/*
 * Gmail shows the plain version instead of a dynamic one that breaks any AMP
 * for Email rule, with no error she would ever see. These are the rules this
 * file can break.
 */
test("the dynamic version keeps the AMP for Email rules", () => {
  const amp = mail({ unlogged: [{ at: new Date("2026-10-15T15:00:00Z"), title: "Back + biceps", token: "older_token_abcdefghijk" }] }).amp!;
  assert.match(amp, /^<!doctype html>\n<html amp4email data-css-strict>\n<head>\n<meta charset="utf-8">/);
  assert.match(amp, /<script async src="https:\/\/cdn\.ampproject\.org\/v0\.js"><\/script>/);
  for (const component of ["amp-accordion", "amp-form", "amp-list"]) {
    assert.match(amp, new RegExp(`custom-element="${component}" src="https://cdn.ampproject.org/v0/${component}-0.1.js"`));
  }
  assert.match(amp, /custom-template="amp-mustache" src="https:\/\/cdn\.ampproject\.org\/v0\/amp-mustache-0\.2\.js"/);
  assert.match(amp, /<style amp4email-boilerplate>body\{visibility:hidden\}<\/style>/);
  assert.equal(amp.match(/<style amp-custom>/g)?.length, 1);
  // Nothing email refuses: inline styles, !important, jump links, plain
  // actions, and attributes that are fine on the web but disabled in email.
  assert.ok(!/\sstyle="/.test(amp), "no style attributes");
  assert.ok(!amp.includes("!important"));
  assert.ok(!/href="#/.test(amp));
  assert.ok(!/<form[^>]*\saction="/.test(amp));
  for (const refused of ["disable-session-states", "no-verify", "autofocus", "inputmode", "enterkeyhint", "[type]", "<img ", "<a "]) {
    assert.ok(!amp.includes(refused), refused);
  }
  // Every form posts by XHR over https.
  const forms = amp.match(/<form [^>]*>/g) ?? [];
  assert.ok(forms.length >= 7);
  for (const f of forms) assert.match(f, /method="post" action-xhr="https:\/\//);
  assert.ok(amp.length < 200_000);
});

/* ---------- small decisions ---------- */

test("two workouts in a row with nothing logged, and the next email asks", () => {
  const plain = (at: string, token: string) => session(at, { logToken: token });
  const done = session("2026-10-10T15:00:00Z", { logToken: "a", logs: [log({ exercises: [lifted("A", "DEADLIFT", 60, [3])] })] });
  assert.deepEqual(forgotten([done, plain("2026-10-13T15:00:00Z", "b")]), []);
  assert.deepEqual(
    forgotten([done, plain("2026-10-13T15:00:00Z", "b"), plain("2026-10-16T15:00:00Z", "c")]).map((u) => u.token),
    ["c", "b"],
  );
});

test("the app's address comes from APP_URL or Vercel's, always https", () => {
  const saved = { app: process.env.APP_URL, vercel: process.env.VERCEL_PROJECT_PRODUCTION_URL };
  delete process.env.APP_URL;
  delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  assert.equal(appUrl(), null);
  process.env.VERCEL_PROJECT_PRODUCTION_URL = "workout.example.app";
  assert.equal(appUrl(), "https://workout.example.app");
  process.env.APP_URL = "http://other.example.app/";
  assert.equal(appUrl(), "https://other.example.app");
  if (saved.app === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = saved.app;
  if (saved.vercel === undefined) delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  else process.env.VERCEL_PROJECT_PRODUCTION_URL = saved.vercel;
});

test("the bars count today as planned, and only what she logged before it", () => {
  const brief = buildBrief({ preferences: PREFS, sessions: [], slot: SLOT, sessionNumber: 1 });
  const unloggedBefore = [session("2026-10-17T15:00:00Z", { stamp: stamp() })];
  const s = snapshot(unloggedBefore, brief, SLOT.startsAt, lowerPlan());
  assert.equal(s.volume.find((v) => v.muscle === "glutes")!.done, 8.5);
});
