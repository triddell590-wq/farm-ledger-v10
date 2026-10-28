// Beef reads region rules from content (design/01 §17.1, design/10 §22–23): changing a content
// record changes Beef's deadlines and checks with no code change.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { useRegionRules, resetRegionRules } from "../../app/js/content/region-rules.js";
import { nifaisOnline, nifaisOnlineText, usesNifaisRegister, standstillDays, bvdFemaleRule, beefBanner } from "../../app/js/sectors/beef/model/region.js";
import { nifaisDays } from "../../app/js/sectors/beef/model/duties.js";
import { regDeadlines } from "../../app/js/sectors/beef/model/breeding.js";
import { ON_FARM } from "../../app/js/sectors/beef/model/rules.js";

afterEach(() => resetRegionRules());
const NI = { region: "NI", registerMode: "nifais" };

test("NIFAIS Online register: deadlines come from the herdRegisterNifais record", () => {
  assert.deepEqual(nifaisOnline(NI), { birth: 23, moveOff: 0, other: 3 });
  assert.deepEqual(nifaisDays(NI), { birth: 23, moveOff: 0, moveOn: 3, death: 3, retag: 3 });
  assert.equal(regDeadlines(NI).register, 23);
  assert.equal(nifaisOnlineText(NI), "births within 23 days, moves off on the day, other events within 3 days");
  useRegionRules([{ region: "NI", key: "herdRegisterNifais", status: "in force", values: { birthDays: 21, moveOffDays: 1, otherEventDays: 5 }, sectors: ["beef"] }]);
  assert.deepEqual(nifaisDays(NI), { birth: 21, moveOff: 1, moveOn: 5, death: 5, retag: 5 });
  assert.equal(regDeadlines(NI).register, 21);
});

test("on-farm register (or a region with no NIFAIS rule) uses the region-pack defaults", () => {
  assert.equal(nifaisDays({ region: "NI", registerMode: "farm" }).birth, ON_FARM.nifaisBirth);
  assert.equal(usesNifaisRegister({ region: "ENG", registerMode: "nifais" }), false);
  assert.equal(nifaisDays({ region: "ENG", registerMode: "nifais" }).moveOff, ON_FARM.nifaisMove);
});

test("BVD breeding-female rule: announced blocks only once its date has passed; withdrawn = no rule", () => {
  const r = bvdFemaleRule({ region: "NI" }, "2026-02-01"); assert.equal(r.inForce, false); assert.equal(r.minAgeMonths, 12); assert.equal(r.restrictWeeks, 41);
  assert.equal(bvdFemaleRule({ region: "NI" }, "2026-10-19").inForce, true);
  useRegionRules([{ region: "NI", key: "bvdBreedingFemale", status: "delayed", from: "2027-03-01", values: { minAgeMonths: 15, restrictWeeks: 30 } }]);
  const d = bvdFemaleRule({ region: "NI" }, "2026-10-19"); assert.equal(d.inForce, false); assert.equal(d.minAgeMonths, 15); assert.equal(d.fromText, "1 Mar 2027");
  useRegionRules([{ region: "NI", key: "bvdBreedingFemale", status: "withdrawn", values: {} }]);
  assert.equal(bvdFemaleRule({ region: "NI" }, "2026-10-19"), null);
});

test("market standstill days and the disease banner come from content", () => {
  assert.equal(standstillDays({ region: "NI" }), 6);
  assert.equal(standstillDays({ region: "ENG" }), null);
  assert.ok(beefBanner({ region: "NI" }).some((b) => /Bluetongue/.test(b.text)));
  assert.ok(!beefBanner({ region: "NI" }).some((b) => b.topic === "avian influenza"));
});
