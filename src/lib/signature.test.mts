import { test } from "node:test";
import assert from "node:assert/strict";
import { sign, verify } from "./signature.ts";

const SECRET = "a-shared-secret";
const BODY = '{"bookingRef":"abc","slotMinutes":60}';

test("a signature it produced verifies", () => {
  assert.equal(verify(BODY, sign(BODY, SECRET), SECRET), true);
});

test("a tampered body fails", () => {
  const sig = sign(BODY, SECRET);
  assert.equal(verify(BODY + " ", sig, SECRET), false);
  assert.equal(verify('{"bookingRef":"xyz"}', sig, SECRET), false);
});

test("the wrong secret fails", () => {
  assert.equal(verify(BODY, sign(BODY, SECRET), "another-secret"), false);
});

test("an empty secret never validates, even against itself", () => {
  assert.equal(verify(BODY, sign(BODY, ""), ""), false);
});

test("a missing or malformed signature fails rather than throwing", () => {
  assert.equal(verify(BODY, null, SECRET), false);
  assert.equal(verify(BODY, undefined, SECRET), false);
  assert.equal(verify(BODY, "", SECRET), false);
  assert.equal(verify(BODY, "sha256=short", SECRET), false);
  assert.equal(verify(BODY, "garbage", SECRET), false);
});

test("surrounding whitespace on the presented value is tolerated", () => {
  assert.equal(verify(BODY, `  ${sign(BODY, SECRET)}\n`, SECRET), true);
});
