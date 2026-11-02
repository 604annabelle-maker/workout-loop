import { test } from "node:test";
import assert from "node:assert/strict";
import { ampLogResponse, ampTestMail } from "./amp-test.ts";

const SENDER = "chanasworkouts@gmail.com";
const LOG = "https://example.app/api/amp-log";

function req(headers: Record<string, string>, query = "") {
  return { url: `${LOG}${query}`, headers: new Headers(headers) };
}

test("the dynamic part has what Gmail requires", () => {
  const { amp } = ampTestMail(LOG);
  assert.match(amp, /^<!doctype html>\n<html amp4email data-css-strict>/);
  assert.match(amp, /<meta charset="utf-8">/);
  assert.match(amp, /<script async src="https:\/\/cdn\.ampproject\.org\/v0\.js"><\/script>/);
  assert.match(amp, /custom-element="amp-accordion"/);
  assert.match(amp, /custom-element="amp-form"/);
  assert.match(amp, /custom-template="amp-mustache"/);
  assert.match(amp, /<style amp4email-boilerplate>body\{visibility:hidden\}<\/style>/);
  assert.equal(amp.match(/<style amp-custom>/g)?.length, 1);
  assert.ok(!amp.includes("!important"));
  assert.ok(!/href="#/.test(amp));
  // Three buttons, each its own form posting to the log address.
  assert.equal(amp.match(new RegExp(`<form class="log" method="post" action-xhr="${LOG}">`, "g"))?.length, 3);
  // A section is a heading and one block, which is what amp-accordion needs.
  assert.match(amp, /<section>\n<h4>Swap &#9662;<\/h4>\n<div class="inner">[^\n]*<\/div>\n<\/section>/);
});

test("the plain versions say in their first line that they are the plain version", () => {
  const mail = ampTestMail(LOG);
  assert.match(mail.text, /^PLAIN VERSION/);
  assert.match(mail.html, /PLAIN VERSION/);
  assert.ok(!mail.html.includes("amp"));
});

test("a tap from her workout address is answered with what was tapped", () => {
  const answer = ampLogResponse(req({ "AMP-Email-Sender": SENDER }), { ex: "B1", how: "hard" }, SENDER);
  assert.equal(answer.status, 200);
  assert.deepEqual(answer.body, { saved: "B1 hard" });
  assert.deepEqual(answer.headers, { "AMP-Email-Allow-Sender": SENDER });
});

test("the older form of the check is answered too", () => {
  const answer = ampLogResponse(
    req({ origin: "https://mail.google.com" }, `?__amp_source_origin=${encodeURIComponent(SENDER)}`),
    { ex: "B1", how: "easy" },
    SENDER,
  );
  assert.equal(answer.status, 200);
  assert.equal(answer.headers["AMP-Access-Control-Allow-Source-Origin"], SENDER);
  assert.equal(answer.headers["Access-Control-Allow-Origin"], "https://mail.google.com");
});

test("anything else is refused", () => {
  assert.equal(ampLogResponse(req({ "AMP-Email-Sender": "someone@else.com" }), { ex: "B1", how: "done" }, SENDER).status, 403);
  assert.equal(ampLogResponse(req({}), { ex: "B1", how: "done" }, SENDER).status, 403);
  assert.equal(ampLogResponse(req({ "AMP-Email-Sender": SENDER }), { ex: "B1", how: "maybe" }, SENDER).status, 400);
  assert.equal(ampLogResponse(req({ "AMP-Email-Sender": SENDER }), { ex: "Z9", how: "done" }, SENDER).status, 400);
  assert.equal(ampLogResponse(req({ "AMP-Email-Sender": SENDER }), { ex: "B1", how: "done" }, null).status, 403);
});
