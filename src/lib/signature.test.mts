import { test } from "node:test";
import assert from "node:assert/strict";
import { fingerprint, sign, verify } from "./signature.ts";

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

test("a secret with stray whitespace still matches a clean one", () => {
  // The value gets pasted into two deployment forms; a trailing newline is
  // invisible in both and produced a 401 that looked like a wrong secret.
  const clean = "shared-secret";

  assert.equal(verify(BODY, sign(BODY, clean), `${clean}\n`), true);
  assert.equal(verify(BODY, sign(BODY, ` ${clean} `), clean), true);
  assert.equal(verify(BODY, sign(BODY, `${clean}\n`), ` ${clean}`), true);
});

test("a secret that is only whitespace never validates", () => {
  assert.equal(verify(BODY, sign(BODY, "   "), "   "), false);
});

test("the fingerprint matches for equal secrets and differs for others", () => {
  assert.equal(fingerprint("shared-secret"), fingerprint("  shared-secret\n"));
  assert.notEqual(fingerprint("shared-secret"), fingerprint("other-secret"));
  assert.equal(fingerprint("shared-secret").length, 8);
});
