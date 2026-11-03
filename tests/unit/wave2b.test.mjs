// Wave 2B (platform and first-time experience): readable export, farmer words for ledgers,
// onboarding numbers turned into houses.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readableFiles, readable, ukDate } from "../../app/js/services/readable-export.js";
import { makeLookup } from "../../app/js/content/record-kinds.js";
import { friendlyName, setupNumber, SETUP_FIELDS } from "../../app/js/sectors/meta.js";
import { SECTOR_NAMES } from "../../app/js/core/policy.js";

const beef = {
  ledger: { id: "L1", name: "Beef herd", type: "beef" },
  members: [{ uid: "u1", role: "owner", displayName: "Tom Riddell", email: "tom@x.test" }],
  collections: {
    groups: [{ id: "g1", name: "Shed 2 finishers" }],
    animals: [{ id: "a1", tag: "UK 9 012345 0108 7", mgmtNo: "0108", name: "", sex: "Steer", breed: "CH", dob: "2024-09-01", groupId: "g1", status: "onFarm", pedigree: { herdBookNo: "CH 21" }, createdAt: new Date("2026-10-01T09:30:00Z"), createdBy: "u1", history: [{ x: 1 }] },
      { id: "a2", tag: "UK 9 012345 0109 1", sex: "Heifer", dob: "2024-09-03", deleted: true }],
    medicines: [{ id: "m1", date: "2026-10-25", productName: "Draxxin 100 mg/ml", animalIds: ["a1"], withdrawalEndDateMeat: "2026-12-13", withdrawalMeatDays: 49, notUsed: false }],
    finance: [{ id: "f1", kind: "revenue", category: "Livestock Sales", amount: 3000, date: "2026-10-30", note: "2 cattle", lines: [{ animalId: "a1", liveKg: 520, price: 1480 }] }, { id: "p", kind: "prices", perKgDead: 6.2 }],
    tasks: [{ id: "t", title: "x" }],
  },
};

test("readable export: plain headings, names not ids, dd/mm/yyyy, £, no JSON, deleted left out", () => {
  const files = readableFiles(beef);
  const names = files.map((f) => f.name);
  assert.ok(names.includes("Beef herd/Animals.csv"), names.join());
  assert.ok(names.includes("Beef herd/Medicines.csv"));
  assert.ok(names.includes("Beef herd/Money.csv"));
  assert.ok(names.includes("Beef herd/People.csv"));
  assert.ok(!names.some((n) => /Tasks|tasks/.test(n)), "jobs are bookkeeping, not a register");
  const animals = files.find((f) => f.name.endsWith("Animals.csv"));
  const [head, ...rows] = animals.text.replace(/^\uFEFF/, "").split("\r\n");
  assert.equal(rows.length, 1, "the deleted heifer is left out");
  assert.match(head, /^Record,/);
  assert.match(head, /Date of birth/); assert.match(head, /Group/); assert.match(head, /Entered/);
  assert.doesNotMatch(head, /groupId|createdBy|history|dob\b|mgmtNo/);
  assert.match(rows[0], /Shed 2 finishers/); assert.doesNotMatch(rows[0], /\bg1\b/);
  assert.match(rows[0], /01\/09\/2024/); assert.match(rows[0], /01\/10\/2026 \d\d:\d\d/);
  assert.doesNotMatch(animals.text, /[{}]/, "no JSON blobs");
  const med = files.find((f) => f.name.endsWith("Medicines.csv")).text;
  assert.match(med, /Product/); assert.match(med, /Meat withdrawal ends/); assert.match(med, /13\/12\/2026/); assert.match(med, /0108/);
  const money = files.find((f) => f.name.endsWith("Money.csv")).text;
  assert.match(money, /Amount \(£\)/); assert.match(money, /"£3,000.00"/);
  assert.equal(money.replace(/^\uFEFF/, "").split("\r\n").length, 2, "the price settings doc is not a money line");
  assert.match(money, /Live weight \(kg\): 520/); assert.match(money, /£1,480.00/);
  assert.match(files.find((f) => f.name.endsWith("People.csv")).text, /Tom Riddell,tom@x.test,Owner/);
});

test("readable cells", () => {
  const L = makeLookup("beef", beef.collections);
  assert.equal(ukDate("2026-11-02"), "02/11/2026");
  assert.equal(readable("date", "2026-11-02T06:30", L), "02/11/2026 06:30");
  assert.equal(readable("groupId", "g1", L), "Shed 2 finishers");
  assert.equal(readable("tseDone", true, L), "Yes");
  assert.equal(readable("amount", 12.5, L), "£12.50");
  assert.equal(readable("kg", 520, L), "520");
});

test("farmer words for ledgers; old default names shown as the new ones, typed names kept", () => {
  assert.deepEqual(Object.values(SECTOR_NAMES), ["Beef herd", "Sheep flock", "Dairy herd", "Pigs", "Laying hens", "Broilers"]);
  assert.equal(friendlyName({ type: "beef", name: "Beef" }), "Beef herd");
  assert.equal(friendlyName({ type: "beef", name: "Beef 2" }), "Beef herd 2");
  assert.equal(friendlyName({ type: "layers", name: "Poultry – Layers" }), "Laying hens");
  assert.equal(friendlyName({ type: "broilers", name: "Poultry – Broilers" }), "Broilers");
  assert.equal(friendlyName({ type: "sheep", name: "Hill ewes" }), "Hill ewes");
  assert.equal(friendlyName({ type: "dairy", name: "" }), "Dairy herd");
});

test("onboarding: no head counts for beef/dairy, number fields (not 0-start steppers) for big counts", () => {
  for (const t of ["beef", "dairy"]) assert.ok(!SETUP_FIELDS[t].some((f) => /count|cowsInMilk|dryCows/i.test(f.key)), t);
  for (const t of Object.keys(SETUP_FIELDS)) for (const f of SETUP_FIELDS[t]) if (f.kind === "stepper") assert.ok((f.min ?? 0) >= 1 && f.max <= 20, `${t}.${f.key} is a small count`);
  assert.equal(SETUP_FIELDS.layers.find((f) => f.key === "birdsPerHouse").kind, "number");
  assert.equal(setupNumber("16,000"), 16000); assert.equal(setupNumber(""), null); assert.equal(setupNumber("lots"), null);
});
