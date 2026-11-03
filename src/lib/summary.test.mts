import { test } from "node:test";
import assert from "node:assert/strict";
import { bar, title } from "./summary.ts";

test("names read as prose, abbreviations kept", () => {
  assert.equal(title("HIP THRUST"), "Hip thrust");
  assert.equal(title("DB RDL"), "DB RDL");
});

test("a bar fills to the top of the range", () => {
  assert.equal(bar(8, 16), "■■■■■□□□□□");
  assert.equal(bar(20, 16), "■■■■■■■■■■");
  assert.equal(bar(3, 0), "□□□□□□□□□□");
});
