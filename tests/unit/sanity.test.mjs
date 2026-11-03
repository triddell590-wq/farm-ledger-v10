// Soft number checks (review A #2): ranges and wording.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as S from "../../app/js/core/sanity.js";

test("beef £/kg: £2–£10 fine, 372 and 1.2 flagged", () => {
  assert.deepEqual(S.checkPricePerKg(4.85), []);
  assert.deepEqual(S.checkPricePerKg(2), []); assert.deepEqual(S.checkPricePerKg(10), []);
  assert.match(S.checkPricePerKg(372, "0112")[0], /^0112: £372\/kg is high.*weight in the price box/);
  assert.match(S.checkPricePerKg(1.2)[0], /low/);
  assert.deepEqual(S.checkPricePerKg(""), []); assert.deepEqual(S.checkPricePerKg(null), []);
});
test("dead kg 150–550, liveweight 20–1400", () => {
  assert.deepEqual(S.checkDeadKg(380), []); assert.equal(S.checkDeadKg(38).length, 1); assert.equal(S.checkDeadKg(3800).length, 1);
  assert.deepEqual(S.checkDeadKg(150), []); assert.deepEqual(S.checkDeadKg(550), []);
  assert.deepEqual(S.checkLiveKg(20), []); assert.deepEqual(S.checkLiveKg(1400), []);
  assert.equal(S.checkLiveKg(19).length, 1); assert.match(S.checkLiveKg(6500)[0], /6,500 kg liveweight/);
});
test("sale line: the reviewer's £372/kg typo flags the £/kg and the £5k line total", () => {
  const out = S.checkSaleLine({ deadKg: 372, pricePerKg: 372 }, "0112 4");
  assert.equal(out.length, 2); // dead kg fine; £/kg high and line total high
  assert.ok(out.some((t) => /£372\/kg/.test(t))); assert.ok(out.some((t) => /£138,384 for one animal/.test(t)));
  assert.deepEqual(S.checkSaleLine({ deadKg: 380, pricePerKg: 4.9 }), []);
  assert.deepEqual(S.checkLineTotal(5000), []); assert.equal(S.checkLineTotal(5000.01).length, 1);
  assert.equal(S.checkSaleLine({ price: 6200 }).length, 1);
});
test("money over £20k", () => {
  assert.deepEqual(S.checkMoney("20000"), []); assert.match(S.checkMoney("£25,000")[0], /£25,000 — more than £20,000/);
  assert.deepEqual(S.checkMoney(""), []);
});
test("weigh: more than 40% change against the last weight", () => {
  assert.deepEqual(S.checkWeightJump({ kg: 560, prevKg: 420 }), []); // +33%
  assert.match(S.checkWeightJump({ kg: 4200, prevKg: 420, prevDate: "2026-10-01", date: "2026-10-31" }, "0181")[0], /^0181: 4,200 kg is 900% up on the last weight \(420 kg, 30 days ago\)/);
  assert.match(S.checkWeightJump({ kg: 42, prevKg: 420 })[0], /90% down/);
  assert.deepEqual(S.checkWeightJump({ kg: 500 }), []);
});
test("dose: more than 3x or under a third of the label dose", () => {
  assert.deepEqual(S.checkDose(10, 10), []); assert.deepEqual(S.checkDose(30, 10), []); assert.deepEqual(S.checkDose(3.4, 10), []);
  assert.match(S.checkDose(100, 10, { product: "Draxxin" })[0], /more than 3 times the label dose of Draxxin \(10 ml\)/);
  assert.match(S.checkDose(1, 10)[0], /under a third/);
  assert.deepEqual(S.checkDose(100, ""), []);
});
test("dates: future deaths/births flagged, more than a year back always flagged", () => {
  assert.deepEqual(S.checkDate("2026-11-02", "2026-11-02"), []);
  assert.match(S.checkDate("2026-11-05", "2026-11-02", { what: "The date of death" })[0], /The date of death is in the future \(3 days from today\)/);
  assert.deepEqual(S.checkDate("2026-11-05", "2026-11-02", { future: true }), []);
  assert.deepEqual(S.checkDate("2025-11-02", "2026-11-02"), []); // exactly a year
  assert.match(S.checkDate("2025-10-31", "2026-11-02")[0], /more than a year ago/);
});
test("capacity, eggs and litres", () => {
  assert.deepEqual(S.checkCapacity(16000, 16000), []); assert.match(S.checkCapacity(160000, 16000)[0], /160,000 birds is more than the house holds \(16,000\)/);
  assert.deepEqual(S.checkEggs(15200, 15800), []); assert.match(S.checkEggs(152000, 15800)[0], /more than the 15,800 hens/);
  assert.deepEqual(S.checkLitres(3600, 120), []); assert.match(S.checkLitres(36000, 120)[0], /300 litres a cow a day/);
  assert.deepEqual(S.checkLitres(7200, 120, { days: 2 }), []);
});
