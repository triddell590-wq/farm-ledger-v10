// Shared region rule records (design/01 §17.1) and disease banner (§16.1). Coordinator-owned.
import { test } from "node:test";
import assert from "node:assert/strict";
import { regionRule, ruleRecord, ruleInForce, rulesFor, bannerItems, useRegionRules, resetRegionRules, DEFAULT_RULES } from "../../app/js/content/region-rules.js";

test("every §17.1 key has an NI record with source and checked date", () => {
  for (const k of ["bvdBreedingFemale", "herdRegisterNifais", "marketStandstill", "xiTags", "inventories", "freeRangeHousingOrder"]) {
    const r = ruleRecord(k, "NI");
    assert.ok(r, k); assert.ok(r.source && r.checkedOn && r.values, k);
  }
  for (const r of DEFAULT_RULES) assert.match(r.checkedOn, /^\d{4}-\d{2}-\d{2}$/);
});

test("values and region fallbacks", () => {
  assert.equal(regionRule("marketStandstill").days, 6);
  assert.equal(regionRule("herdRegisterNifais").birthDays, 23);
  assert.equal(regionRule("marketStandstill", "ENG"), null, "GB not added yet: no silent NI fallback");
});

test("announced rule comes into force on its date; withdrawn returns null", () => {
  assert.equal(ruleInForce("bvdBreedingFemale", "2026-02-28"), false);
  assert.equal(ruleInForce("bvdBreedingFemale", "2026-03-01"), true);
  useRegionRules([{ region: "NI", key: "bvdBreedingFemale", status: "delayed", from: "2027-03-01", values: { minAgeMonths: 12, restrictWeeks: 41 }, source: "test", checkedOn: "2026-10-19" }]);
  assert.equal(ruleInForce("bvdBreedingFemale", "2026-10-19"), false);
  useRegionRules([{ region: "NI", key: "xiTags", status: "withdrawn", values: {}, source: "test", checkedOn: "2026-10-19" }]);
  assert.equal(regionRule("xiTags"), null);
  resetRegionRules();
  assert.equal(regionRule("xiTags").prefix, "XI");
});

test("rulesFor and bannerItems filter by sector", () => {
  assert.ok(rulesFor("NI", "layers").some((r) => r.key === "freeRangeHousingOrder"));
  assert.ok(!rulesFor("NI", "beef").some((r) => r.key === "freeRangeHousingOrder"));
  assert.deepEqual(bannerItems("NI", ["layers"]).map((b) => b.topic), ["avian influenza"]);
  assert.deepEqual(bannerItems("NI", ["beef", "broilers"]).map((b) => b.topic).sort(), ["avian influenza", "bluetongue"]);
});
