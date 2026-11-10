// Typing a date in one go (Tom, 10 Nov).
import test from "node:test";
import assert from "node:assert/strict";
import { parseTyped } from "../../app/js/ui/date-picker.js";

test("whole dates in the usual ways", () => {
  assert.equal(parseTyped("10112026"), "2026-11-10");
  assert.equal(parseTyped("10/11/2026"), "2026-11-10");
  assert.equal(parseTyped("1/2/2026"), "2026-02-01");
  assert.equal(parseTyped("10.11.2026"), "2026-11-10");
  assert.equal(parseTyped("101126", true), "2026-11-10"); // two-figure year once they've finished
  assert.equal(parseTyped("10/11/26", true), "2026-11-10");
});
test("not finished or not a real date", () => {
  assert.equal(parseTyped("101126"), null); // could still become 10/11/26xx
  assert.equal(parseTyped("10/11"), null);
  assert.equal(parseTyped("31022026"), null);
  assert.equal(parseTyped("29022028"), "2028-02-29");
  assert.equal(parseTyped(""), "");
});
