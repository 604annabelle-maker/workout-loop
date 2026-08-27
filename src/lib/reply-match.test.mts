import { test } from "node:test";
import assert from "node:assert/strict";
import { matchWorkout, type Candidate } from "./reply-match.ts";
import type { ParsedReply } from "./reply-parse.ts";

const CANDIDATES: Candidate[] = [
  { id: "w1", messageId: "one@loop.invalid", subject: "Workout for Wed 26 Aug" },
  { id: "w2", messageId: "two@loop.invalid", subject: "Workout for Fri 28 Aug" },
];

function reply(over: Partial<ParsedReply> = {}): ParsedReply {
  return {
    body: "felt good",
    inReplyTo: null,
    subject: "",
    from: "chana@example.com",
    ...over,
  };
}

test("In-Reply-To wins when it matches", () => {
  const m = matchWorkout(reply({ inReplyTo: "two@loop.invalid" }), CANDIDATES);

  assert.deepEqual(m, { how: "in-reply-to", workoutId: "w2" });
});

test("In-Reply-To wins even when the subject was changed", () => {
  const m = matchWorkout(
    reply({ inReplyTo: "one@loop.invalid", subject: "something else entirely" }),
    CANDIDATES,
  );

  assert.deepEqual(m, { how: "in-reply-to", workoutId: "w1" });
});

test("the subject carries it when In-Reply-To is absent", () => {
  const m = matchWorkout(reply({ subject: "Workout for Fri 28 Aug" }), CANDIDATES);

  assert.deepEqual(m, { how: "subject", workoutId: "w2" });
});

test("Re: prefixes on either side do not prevent a subject match", () => {
  const m = matchWorkout(reply({ subject: "Re: Re: Workout for Wed 26 Aug" }), CANDIDATES);

  assert.deepEqual(m, { how: "subject", workoutId: "w1" });
});

test("an ambiguous subject matches nothing rather than the wrong one", () => {
  const twoOnOneDay: Candidate[] = [
    { id: "a", messageId: "a@x", subject: "Workout for Wed 26 Aug" },
    { id: "b", messageId: "b@x", subject: "Workout for Wed 26 Aug" },
  ];

  const m = matchWorkout(reply({ subject: "Re: Workout for Wed 26 Aug" }), twoOnOneDay);

  assert.equal(m.how, "none");
  assert.match(m.how === "none" ? m.why : "", /2 workouts share/);
});

test("an unknown message id falls through to the subject rather than failing", () => {
  const m = matchWorkout(
    reply({ inReplyTo: "never-seen@x", subject: "Workout for Wed 26 Aug" }),
    CANDIDATES,
  );

  assert.deepEqual(m, { how: "subject", workoutId: "w1" });
});

test("nothing at all matches nothing, with a reason", () => {
  const m = matchWorkout(reply(), CANDIDATES);

  assert.equal(m.how, "none");
  assert.match(m.how === "none" ? m.why : "", /no In-Reply-To/);
});

test("no candidates at all is not an error", () => {
  const m = matchWorkout(reply({ inReplyTo: "one@loop.invalid" }), []);

  assert.equal(m.how, "none");
});

test("a candidate with no stored subject is never matched by subject", () => {
  const m = matchWorkout(reply({ subject: "Workout for Wed 26 Aug" }), [
    { id: "x", messageId: "x@x", subject: null },
  ]);

  assert.equal(m.how, "none");
});
