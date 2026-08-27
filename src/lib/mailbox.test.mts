import { test } from "node:test";
import assert from "node:assert/strict";
import { mailbox } from "./mailbox.ts";

test("no address means no mailbox, which is what prints to the console", () => {
  delete process.env.MAILBOX_ADDRESS;
  assert.equal(mailbox(), null);
});

test("a Google app password loses its display spaces", () => {
  process.env.MAILBOX_ADDRESS = "a@b.com";
  process.env.MAILBOX_PASSWORD = "abcd efgh ijkl mnop";

  assert.equal(mailbox()?.password, "abcdefghijklmnop");
});

test("a password that is not that exact shape keeps its spaces", () => {
  process.env.MAILBOX_ADDRESS = "a@b.com";
  process.env.MAILBOX_PASSWORD = "correct horse battery staple";

  assert.equal(mailbox()?.password, "correct horse battery staple");
});

test("surrounding whitespace goes either way", () => {
  process.env.MAILBOX_ADDRESS = "  a@b.com \n";
  process.env.MAILBOX_PASSWORD = "  abcd efgh ijkl mnop  ";

  assert.deepEqual(mailbox(), { address: "a@b.com", password: "abcdefghijklmnop" });
});
