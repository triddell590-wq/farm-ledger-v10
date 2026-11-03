// Sheep wave 2A: money per ewe says how far through selling the year is (B #13).
import { test } from "node:test";
import assert from "node:assert/strict";
import { yearProgress } from "../../app/js/sectors/sheep/money.js";

test("under 75% of the lambs sold this year: 'so far this year (62 of ~350 lambs sold)' and no benchmark", () => {
  assert.deepEqual(yearProgress(62, 350, true), { partial: true, label: "so far this year (62 of ~350 lambs sold)" });
  assert.equal(yearProgress(263, 350, true).partial, false);
  assert.equal(yearProgress(62, 350, false).partial, false, "last year is complete");
  assert.equal(yearProgress(62, null, true).partial, false, "nothing to compare with: show as before");
});
