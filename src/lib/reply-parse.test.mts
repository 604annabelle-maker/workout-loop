import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addressOf,
  normalizeMessageId,
  normalizeSubject,
  parseReply,
  stripQuoted,
} from "./reply-parse.ts";

/* ----------------------------------------------------- stripping quoted text */

test("a reply with nothing quoted is returned as written", () => {
  assert.equal(stripQuoted("Legs were fine, shoulder still sore."), "Legs were fine, shoulder still sore.");
});

test("Gmail: attribution line and everything under it goes", () => {
  const raw = [
    "Felt strong today, went up 5kg on the squat.",
    "",
    "On Wed, 26 Aug 2026 at 18:04, Workout Loop <loop@example.com> wrote:",
    "> Tuesday, 60 minutes",
    "> Back squat 3x5",
  ].join("\n");

  assert.equal(stripQuoted(raw), "Felt strong today, went up 5kg on the squat.");
});

test("Gmail: attribution wrapped across lines is still caught", () => {
  const raw = [
    "Too easy.",
    "",
    "On Wed, 26 Aug 2026 at 18:04, Workout Loop",
    "<a-rather-long-address@example.com>",
    "wrote:",
    "> Back squat 3x5",
  ].join("\n");

  assert.equal(stripQuoted(raw), "Too easy.");
});

test("Apple Mail: quoted attribution beginning with > is cut at the marker", () => {
  const raw = [
    "Shoulder hurt on the overhead press, skip it next time.",
    "",
    "> On 26 Aug 2026, at 18:04, Workout Loop <loop@example.com> wrote:",
    ">",
    "> Overhead press 3x8",
  ].join("\n");

  assert.equal(stripQuoted(raw), "Shoulder hurt on the overhead press, skip it next time.");
});

test("Outlook: the underscore rule and pasted headers both cut", () => {
  const rule = [
    "Good session.",
    "",
    "________________________________",
    "From: Workout Loop <loop@example.com>",
    "Sent: 26 August 2026 18:04",
  ].join("\n");
  assert.equal(stripQuoted(rule), "Good session.");

  const pasted = [
    "Good session.",
    "",
    "From: Workout Loop <loop@example.com>",
    "Sent: 26 August 2026 18:04",
    "Subject: Your workout",
  ].join("\n");
  assert.equal(stripQuoted(pasted), "Good session.");
});

test("-----Original Message----- cuts", () => {
  const raw = ["Did it all.", "", "-----Original Message-----", "From: loop@example.com"].join("\n");
  assert.equal(stripQuoted(raw), "Did it all.");
});

test("a forwarded-message banner cuts", () => {
  const raw = ["See below.", "", "---------- Forwarded message ---------", "From: loop@example.com"].join("\n");
  assert.equal(stripQuoted(raw), "See below.");
});

test("mobile and desktop signatures go", () => {
  assert.equal(stripQuoted("Felt great.\n\nSent from my iPhone"), "Felt great.");
  assert.equal(stripQuoted("Felt great.\n\n--\nChana"), "Felt great.");
  assert.equal(stripQuoted("Felt great.\n\nGet Outlook for Android"), "Felt great.");
});

test("CRLF line endings are handled", () => {
  const raw = "Tough one.\r\n\r\nOn Wed, 26 Aug 2026 at 18:04, Loop <a@b.com> wrote:\r\n> Squat";
  assert.equal(stripQuoted(raw), "Tough one.");
});

test("a sentence that merely starts with On is not an attribution", () => {
  const raw = "On Tuesday I felt much better than on Sunday.";
  assert.equal(stripQuoted(raw), raw);
});

test("From: in ordinary prose does not cut", () => {
  const raw = "The soreness went From: nothing to a lot overnight, oddly.";
  assert.equal(stripQuoted(raw), raw);
});

test("a reply that is entirely quoted comes back empty rather than throwing", () => {
  assert.equal(stripQuoted("> Squat 3x5\n> Bench 3x8"), "");
  assert.equal(stripQuoted(""), "");
});

test("blank lines around the real text are trimmed", () => {
  assert.equal(stripQuoted("\n\n  Felt good.  \n\n\n> quoted"), "Felt good.");
});

test("multi-paragraph replies keep their internal blank lines", () => {
  const raw = "Squats felt strong.\n\nBut the press aggravated my shoulder.\n\nOn Wed, 26 Aug 2026 at 18:04, Loop <a@b.com> wrote:\n> x";
  assert.equal(stripQuoted(raw), "Squats felt strong.\n\nBut the press aggravated my shoulder.");
});

/* ------------------------------------------------------------------ subjects */

test("stacked Re: and Fwd: prefixes are stripped", () => {
  assert.equal(normalizeSubject("Re: Your workout, Wed 26 Aug"), "Your workout, Wed 26 Aug");
  assert.equal(normalizeSubject("RE: re: Fwd: Your workout"), "Your workout");
  assert.equal(normalizeSubject("Re[2]: Your workout"), "Your workout");
  assert.equal(normalizeSubject("  Your workout  "), "Your workout");
});

test("a subject that merely contains Re is untouched", () => {
  assert.equal(normalizeSubject("Recovery week"), "Recovery week");
});

/* --------------------------------------------------------------- message ids */

test("angle brackets are stripped and a list takes the first", () => {
  assert.equal(normalizeMessageId("<abc@mail.example.com>"), "abc@mail.example.com");
  assert.equal(normalizeMessageId("abc@mail.example.com"), "abc@mail.example.com");
  assert.equal(normalizeMessageId("<one@x> <two@x>"), "one@x");
});

test("absent or empty message ids come back null", () => {
  assert.equal(normalizeMessageId(null), null);
  assert.equal(normalizeMessageId(undefined), null);
  assert.equal(normalizeMessageId("   "), null);
  assert.equal(normalizeMessageId("<>"), null);
});

/* ------------------------------------------------------------------ addresses */

test("an address is extracted from a display name and lowercased", () => {
  assert.equal(addressOf("Chana <Chana@Example.com>"), "chana@example.com");
  assert.equal(addressOf("chana@example.com"), "chana@example.com");
});

test("a non-address comes back null rather than being trusted", () => {
  assert.equal(addressOf("Chana"), null);
  assert.equal(addressOf(""), null);
  assert.equal(addressOf(null), null);
});

/* ---------------------------------------------------------------- the whole */

test("parseReply pulls a full reply apart", () => {
  const parsed = parseReply({
    headers: {
      "in-reply-to": "<workout-42@loop.example.com>",
      subject: "Re: Your workout, Wed 26 Aug",
      from: "Chana <chana@example.com>",
    },
    text: "Legs were toast.\n\nOn Wed, 26 Aug 2026 at 18:04, Loop <a@b.com> wrote:\n> Squat 3x5",
  });

  assert.deepEqual(parsed, {
    body: "Legs were toast.",
    inReplyTo: "workout-42@loop.example.com",
    subject: "Your workout, Wed 26 Aug",
    from: "chana@example.com",
  });
});

test("parseReply survives a message with no headers at all", () => {
  const parsed = parseReply({ headers: {}, text: "hello" });

  assert.deepEqual(parsed, { body: "hello", inReplyTo: null, subject: "", from: null });
});
