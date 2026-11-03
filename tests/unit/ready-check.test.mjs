// Inspection ready (review A #14): only what the app checks scores; self-ticks are apart; no % before data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readyScore, readyLine } from "../../app/js/ui/ready-check.js";

const rows = [
  { id: "a", auto: true, state: "ok" }, { id: "b", auto: true, state: "gap" }, { id: "c", auto: true, state: "due" }, { id: "d", auto: true, state: "na" },
  { id: "e", auto: false, state: "open", done: true }, { id: "f", auto: false, state: "open", done: false }, { id: "g", auto: false, state: "na" },
];
test("score = auto items in place / auto items that apply; self-ticks don't move it", () => {
  const s = readyScore(rows, true);
  assert.equal(s.pct, 33); assert.equal(s.ok, 1); assert.equal(s.n, 3); assert.equal(s.gaps.length, 1);
  assert.equal(s.selfDone, 1); assert.equal(s.selfN, 2);
  const ticked = readyScore(rows.map((r) => (r.auto ? r : { ...r, done: true })), true);
  assert.equal(ticked.pct, 33);
});
test("no % until the ledger has data", () => {
  const s = readyScore(rows, false); assert.equal(s.pct, null);
  assert.equal(readyLine(s).value, "—"); assert.match(readyLine(s).sub, /starts when you've added records/);
  assert.equal(readyLine(readyScore(rows, true)).value, "33%");
});
