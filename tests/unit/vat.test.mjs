// VAT (app/js/services/vat.js, Tom 3 Nov): each money entry's net / VAT / gross from its rate and
// whether the typed amount included VAT; return periods for each stagger; the nine boxes, with EU
// goods (NI, Windsor Framework) in boxes 2, 8 and 9 and outside-scope items left off.
import test from "node:test";
import assert from "node:assert/strict";
import * as V from "../../app/js/services/vat.js";

test("net, VAT and gross: inc, ex, zero-rated, older 'No VAT' entries, and the category's usual rate", () => {
  assert.deepEqual(V.vatOf({ kind: "expense", category: "Contractor", amount: 120, vat: "inc" }), { rate: 20, net: 100, vat: 20, gross: 120 });
  assert.deepEqual(V.vatOf({ kind: "expense", category: "Vet & medicine", amount: 100, vat: "ex" }), { rate: 20, net: 100, vat: 20, gross: 120 });
  assert.deepEqual(V.vatOf({ kind: "expense", category: "Feed", amount: 500, vat: "inc" }), { rate: 0, net: 500, vat: 0, gross: 500 });
  assert.equal(V.vatOf({ kind: "expense", category: "Contractor", amount: 120, vat: "none" }).vat, 0);
  assert.deepEqual(V.vatOf({ kind: "expense", category: "Diesel", amount: 105, vat: "inc", vatRate: 5 }), { rate: 5, net: 100, vat: 5, gross: 105 });
  assert.equal(V.vatOf({ kind: "revenue", category: "Livestock Sales", amount: 3000 }).vat, 0);
  assert.equal(V.vatOf({ kind: "revenue", category: "Other Income", amount: 60 }).vat, 10);
  assert.equal(V.usualRate("expense", "Insurance"), "exempt");
  assert.equal(V.usualRate("revenue", "Subsidy"), "outside");
  assert.equal(V.vatOf({ kind: "expense", category: "Vet & medicine", amount: 33.33, vat: "inc" }).net, 27.78); // pennies round, net + VAT = gross
});

test("return periods: quarterly for each stagger, monthly, across the year end", () => {
  assert.deepEqual(V.vatPeriods({ returns: "quarterly", stagger: 1 }, "2026-11-03", 2).map((p) => [p.from, p.to, p.label]),
    [["2026-10-01", "2026-12-31", "Oct–Dec 2026"], ["2026-07-01", "2026-09-30", "Jul–Sep 2026"]]);
  assert.deepEqual(V.vatPeriods({ returns: "quarterly", stagger: 2 }, "2026-11-03", 2).map((p) => [p.from, p.to]),
    [["2026-11-01", "2027-01-31"], ["2026-08-01", "2026-10-31"]]);
  assert.deepEqual(V.vatPeriods({ returns: "quarterly", stagger: 3 }, "2026-11-03", 2).map((p) => [p.from, p.to]),
    [["2026-09-01", "2026-11-30"], ["2026-06-01", "2026-08-31"]]);
  assert.deepEqual(V.vatPeriods({ returns: "monthly" }, "2026-01-15", 2).map((p) => [p.from, p.to, p.label]),
    [["2026-01-01", "2026-01-31", "Jan 2026"], ["2025-12-01", "2025-12-31", "Dec 2025"]]);
});

test("the nine boxes: sales, purchases, EU goods, outside-scope left off, deleted and other periods ignored", () => {
  const rows = [
    { kind: "revenue", category: "Livestock Sales", amount: 3000, date: "2026-10-05" },
    { kind: "revenue", category: "Other Income", amount: 240, date: "2026-10-06" }, // £40 VAT
    { kind: "revenue", category: "Livestock Sales", amount: 1500, date: "2026-10-07", eu: true }, // sold to ROI
    { kind: "expense", category: "Contractor", amount: 600, vat: "inc", date: "2026-10-10" }, // £100 VAT
    { kind: "expense", category: "Machinery Maintenance", amount: 1000, vat: "ex", date: "2026-10-11", eu: true }, // from ROI: £200 in box 2 and 4
    { kind: "expense", category: "Wages", amount: 900, date: "2026-10-12" }, // outside
    { kind: "expense", category: "Contractor", amount: 600, vat: "inc", date: "2026-10-13", deleted: true },
    { kind: "expense", category: "Contractor", amount: 600, vat: "inc", date: "2026-09-30" },
    { kind: "prices", amount: 9, date: "2026-10-01" },
  ];
  const { boxes, rows: used } = V.vatReturn(rows, "2026-10-01", "2026-12-31");
  assert.deepEqual(boxes, { 1: 40, 2: 200, 3: 240, 4: 300, 5: -60, 6: 4700, 7: 1500, 8: 1500, 9: 1000 });
  assert.equal(used.length, 6);
});
