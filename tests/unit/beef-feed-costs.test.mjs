// Feed cost a head and margin over feed per group (Tom, 10 Nov); invoices against feed used.
import test from "node:test";
import assert from "node:assert/strict";
import { groupCosts, feedCheck, isFeedInvoice } from "../../app/js/sectors/beef/model/feed-costs.js";

const animals = [{ id: "a", groupId: "g" }, { id: "b", groupId: "g" }];
const ix = { weights: new Map([["a", [{ date: "2026-10-01", kg: 400 }, { date: "2026-10-31", kg: 430 }]], ["b", [{ date: "2026-10-01", kg: 410 }, { date: "2026-10-31", kg: 440 }]]]) };
const fg = { id: "f", groupId: "g", name: "Shed 2", rations: [{ from: "2026-11-01", mealGroup: 10, silageGroup: 50 }] };

test("cost a head a day, this month's cost, and margin over feed from weight gain", () => {
  const k = groupCosts({ feedGroups: [fg], adjust: [], data: { animals }, ix, today: "2026-11-10", mealPrice: 300, silagePrice: 40, valuePerKgLive: 3 });
  const r = k.rows[0];
  assert.equal(k.days, 10);
  assert.equal(r.dayCost, 10 / 1000 * 300 + 50 / 1000 * 40); // £3 meal + £2 silage
  assert.equal(r.headDay, 2.5);
  assert.equal(r.cost, 50); // 10 days × £5
  assert.equal(r.gain, 1); // 30 kg in 30 days
  assert.equal(r.marginHeadDay, 0.5); // 1 kg × £3 − £2.50
  assert.equal(k.marginDay, 1);
  assert.ok(k.priced);
});
test("no weighings or no price: no margin, and says so", () => {
  const k = groupCosts({ feedGroups: [fg], adjust: [], data: { animals }, ix: { weights: new Map() }, today: "2026-11-10", mealPrice: 300 });
  assert.equal(k.rows[0].marginHeadDay, null); assert.equal(k.marginDay, null);
  assert.equal(groupCosts({ feedGroups: [fg], adjust: [], data: { animals }, ix, today: "2026-11-10" }).priced, false);
});
test("feed invoices this month against meal fed; prices and sales aren't invoices", () => {
  const fin = [{ kind: "expense", category: "Feed", amount: 600, date: "2026-11-03" }, { kind: "expense", category: "Vet & medicine", amount: 90, date: "2026-11-04" },
    { kind: "prices", category: "Feed", amount: 0, date: "2026-11-01" }, { kind: "expense", category: "Feed", amount: 500, date: "2026-10-28" }];
  assert.equal(fin.filter(isFeedInvoice).length, 2);
  const c = feedCheck(fin, { from: "2026-11-01", today: "2026-11-10", mealFedKg: 1000, mealPrice: 300 });
  assert.deepEqual(c, { invoices: 1, bought: 600, fed: 300, diff: 300 });
  assert.equal(feedCheck(fin, { from: "2026-11-01", today: "2026-11-10", mealFedKg: 1000, mealPrice: 0 }).fed, null);
});
