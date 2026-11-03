import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBrief } from "./coach.ts";
import { buildPrompt, HISTORY_WINDOW, NOTES_WINDOW, SYSTEM, type PromptInput } from "./prompt.ts";
import { checkIn, DAY, lifted, log, PREFS, session, stamp } from "./test-fixtures.mts";

const SLOT = { startsAt: new Date("2026-10-20T15:00:00Z"), minutes: 60 };

function input(sessions = [session("2026-10-17T15:00:00Z")], preferences = PREFS): PromptInput {
  const brief = buildBrief({ preferences, sessions, slot: SLOT, sessionNumber: sessions.length + 1 });
  return { preferences, sessions, brief, slot: SLOT };
}

test("the philosophy is in the system prompt, the same every time", () => {
  assert.equal(buildPrompt(input()).system, SYSTEM);
  assert.match(SYSTEM, /same percentage rate as men, from a smaller start/);
  assert.match(SYSTEM, /every main lift comes twice a week: once heavy, once lighter/);
  assert.match(SYSTEM, /2 to 3 reps short on squats and deadlifts, 1 to 2 on presses and pulls/);
  assert.match(SYSTEM, /Nothing is programmed by menstrual cycle phase/);
  assert.match(SYSTEM, /never language about burning, toning, slimming/);
  assert.match(SYSTEM, /two biceps exercises on the back day, two triceps exercises on the chest day/);
});

test("what she banned is named, and jumps belong only in the warm up", () => {
  assert.match(SYSTEM, /Never anything braced on a chest pad/);
  assert.match(SYSTEM, /never a medicine ball chest pass/);
  assert.match(SYSTEM, /as a short block inside the warm up/);
  assert.match(SYSTEM, /No primer, no conditioning finisher/);
});

test("block instructions are kept to one line of how, because she asked for fewer words", () => {
  assert.match(SYSTEM, /Block instructions: empty for the warm up and the main lifts/);
  assert.match(SYSTEM, /Never advice, reasons or reminders/);
});

test("every exercise asks for a role, an exact target and one swap", () => {
  assert.match(SYSTEM, /reps is one number, today's target, inside range/);
  assert.match(SYSTEM, /exactly one swap/);
  for (const role of ["heavy", "light", "second", "accessory", "core", "warmup"]) {
    assert.match(SYSTEM, new RegExp(`- ${role}: `));
  }
  assert.match(SYSTEM, /heavy: a main lift on its heavy day\. 4 to 5 sets, range 3-5/);
  assert.match(SYSTEM, /light: a main lift on its light day\. 2 to 3 sets, range 6-8/);
});

test("the system prompt asks for every block kind the email lays out", () => {
  for (const kind of ["warmup", "strength", "superset", "core"]) {
    assert.match(SYSTEM, new RegExp(`\\b${kind}:`));
  }
});

test("her preferences all reach the prompt", () => {
  const { user } = buildPrompt(
    input(undefined, {
      ...PREFS,
      priorities: ["biceps", "triceps"],
      avoid: "overhead pressing, my left shoulder",
      enjoys: "arms",
      brief: "Two muscle groups a day.",
    }),
  );
  assert.match(user, /Priority muscles: biceps, triceps/);
  assert.match(user, /Avoid: overhead pressing, my left shoulder/);
  assert.match(user, /She loves: arms/);
  assert.match(user, /In her words: Two muscle groups a day\./);
});

test("the coach's decisions arrive as facts: the day, its shape, the week", () => {
  const { user } = buildPrompt(input());
  // After the glutes day comes the chest day.
  assert.match(user, /Chest \+ triceps \(next in the rotation\)\. Primary: chest, triceps/);
  assert.match(user, /- heavy: the bench press/);
  assert.match(user, /Block 1, Week 3, build/);
  assert.match(user, /Minutes: warm up 7, lifting 53\./);
  assert.match(user, /No jumps today: she has jumping turned off\./);
});

test("targets carry the role, the exact target and the range", () => {
  const sessions = [
    session("2026-10-17T15:00:00Z", { logs: [log({ exercises: [lifted("C1", "HIP THRUST", 60, [8, 8, 8])] })] }),
  ];
  const { user } = buildPrompt(input(sessions));
  assert.match(user, /HIP THRUST \(second\): 3 x 9 at 60kg, range 6-10\. One more rep: 9\. Last \(Sat 17 Oct\): 60kg x 8, 8, 8\./);
});

test("an exercise skipped twice is swapped in", () => {
  const skipped = (at: string) =>
    session(at, { logs: [log({ exercises: [{ label: "C2", name: "SEATED LEG CURL", sets: [], effort: "", skipped: true, note: "" }] })] });
  const { user } = buildPrompt(input([skipped("2026-10-13T15:00:00Z"), skipped("2026-10-17T15:00:00Z")]));
  assert.match(user, /Skipped twice in a row, so use the swap instead: SEATED LEG CURL becomes LYING LEG CURL\./);
});

test("a first session says so", () => {
  const { user } = buildPrompt(input([]));
  assert.match(user, /first session with this plan/);
  assert.match(user, /None yet\. Every load today is a first calibration\./);
  assert.match(user, /Back \+ biceps/);
});

test("readiness, pain and what she wrote are passed on", () => {
  const sessions = [
    session("2026-10-17T15:00:00Z", {
      notes: ["had tabata yesterday", "C2 SEATED LEG CURL: knee hurts"],
      logs: [log({ checkIn: checkIn({ energy: 2, pain: ["knee hurts"] }) })],
    }),
  ];
  const { user } = buildPrompt(input(sessions));
  assert.match(user, /Her last log said: energy 2 of 5\./);
  assert.match(user, /Pain she mentioned recently: knee hurts\./);
  assert.match(user, /Sat 17 Oct: had tabata yesterday/);
});

test("recent sessions are summarised oldest first, within the window", () => {
  const sessions = Array.from({ length: HISTORY_WINDOW + 3 }, (_, i) =>
    session(new Date(Date.parse("2026-10-01T15:00:00Z") + i * 2 * DAY), { stamp: stamp({ rotationAt: i % 8 }) }),
  );
  const { user } = buildPrompt(input(sessions));
  const recent = user.slice(user.indexOf("RECENT SESSIONS"), user.indexOf("WHAT SHE WROTE"));
  assert.equal(recent.match(/Glutes \+ hamstrings\./g)?.length, HISTORY_WINDOW);
  assert.match(recent, /A DEADLIFT 4x3 @ 60kg/);
});

test("what she wrote is replayed verbatim for the notes window only", () => {
  const sessions = Array.from({ length: NOTES_WINDOW + 2 }, (_, i) =>
    session(new Date(Date.parse("2026-10-01T15:00:00Z") + i * 2 * DAY), { notes: [`note ${i}`] }),
  );
  const { user } = buildPrompt(input(sessions));
  assert.ok(!user.includes("note 0"));
  assert.ok(!user.includes("note 1"));
  assert.ok(user.includes(`note ${NOTES_WINDOW + 1}`));
});

test("a jump day says so, with the dose, in the warm up", () => {
  const preferences = { ...PREFS, jumpDays: 1 };
  const sessions = [session("2026-10-17T15:00:00Z", { stamp: stamp({ rotationAt: 0, typeId: "back-biceps" }) })];
  const brief = buildBrief({ preferences, sessions, slot: SLOT, sessionNumber: 2 });
  const { user } = buildPrompt({ preferences, sessions, brief, slot: SLOT });
  assert.match(user, /Jump day: put 15-25 jumps in the warm up/);
  assert.match(user, /two foot jumps in place and forward/);
});

test("an asked-for session says what she asked, in her words", () => {
  const sessions = [session("2026-10-17T15:00:00Z")];
  const brief = buildBrief({ preferences: PREFS, sessions, slot: SLOT, sessionNumber: 2, request: { focus: "upper", note: "no legs today" } });
  const { user } = buildPrompt({ preferences: PREFS, sessions, brief, slot: SLOT });
  assert.match(user, /she asked for this one/);
  assert.match(user, /She asked for no legs today\. No leg exercise anywhere/);
  assert.match(user, /She wrote, asking for this session: "no legs today"/);
});
