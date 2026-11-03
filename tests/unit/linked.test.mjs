// One entry = one record (review B #3, A #5): records an entry writes share an actionId, the
// changes it makes to other records are kept, and delete / bring back / edit follow them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { freshEnv } from "./env.mjs";
import { createLedger } from "../../app/js/services/ledgers.js";
import { addRecord, listRecords, getRecord, updateRecord, runAction } from "../../app/js/services/records.js";
import { loadAll, linkedFor, deleteEntry, restoreEntry, propagateEdit } from "../../app/js/services/linked.js";
import { makeLookup, recordTitle, recordDay, withdrawalWarnings, fieldsOf, deriveEdit, pounds, collHeading } from "../../app/js/content/record-kinds.js";
import { saveTreatment } from "../../app/js/sectors/dairy/actions.js";
import { recordDeath, recordTreatment, recordSale } from "../../app/js/sectors/beef/actions.js";
import { dairySettings } from "../../app/js/sectors/dairy/model/settings.js";
import { indexHerd } from "../../app/js/sectors/dairy/model/cows.js";
import { addDays, todayStr } from "../../app/js/core/dates.js";

const tick = () => new Promise((r) => setTimeout(r, 15));
const T = todayStr();
const DAIRY_COLLS = ["animals", "calvings", "services", "heats", "pds", "dryOffs", "milkWithhold", "mastitis", "medicines", "handover", "recordings", "freshChecks", "footTrims"];

async function dairyLedger(env) {
  await env.as("tom");
  const L = await createLedger({ type: "dairy", farmName: "Drumlin" });
  const ledger = { id: L.id ?? L, type: "dairy", role: "owner" };
  if (typeof L === "object" && L.id) ledger.id = L.id;
  const cowId = addRecord(ledger.id, "animals", { cowNo: "117", name: "Rosie", tag: "UK 9 223344 10819", sex: "Female", dob: "2020-02-01", breed: "HOL" });
  await tick();
  const data = Object.fromEntries(DAIRY_COLLS.map((k) => [k, []]));
  data.animals = await listRecords(ledger.id, "animals");
  const snap = { lid: ledger.id, s: dairySettings({ settings: {} }, {}), ix: indexHerd(data), data };
  return { ledger, cowId, snap };
}

test("dairy treatment: medicine, withhold, mastitis case and handover are one entry", async () => {
  const env = freshEnv(); const { ledger, cowId, snap } = await dairyLedger(env);
  const r = saveTreatment(snap, { animalIds: [cowId], reason: "Mastitis", quarters: ["RF"], severity: "Mild", product: { id: "p1", name: "Synulox LC" }, doses: 3, intervalH: 12, wdMilkHours: 84, wdMeatDays: 7, date: T, time: "06:00", marks: [] });
  await tick();
  let all = await loadAll(ledger);
  const med = all.medicines.find((m) => m.id === r.medId);
  assert.ok(med.actionId, "medicine has an action id");
  for (const c of ["milkWithhold", "mastitis", "handover"]) assert.equal(all[c].length, 1, c), assert.equal(all[c][0].actionId, med.actionId, `${c} shares it`);
  const { items } = linkedFor(all, "medicines", med);
  assert.deepEqual(items.map((x) => x.coll).sort(), ["handover", "mastitis", "milkWithhold"]);

  const L = makeLookup("dairy", all);
  assert.equal(recordTitle("dairy", "medicines", med, L), "Treatment · 117 Rosie · Synulox LC · RF · mastitis");
  const warn = withdrawalWarnings("dairy", [{ coll: "medicines", rec: med }, ...items], T, L);
  assert.equal(warn.length, 2, warn.join(" | "));
  assert.match(warn.join(" "), /117 Rosie will no longer show on the milk-out board/);
  assert.match(warn.join(" "), /117 Rosie will no longer show as in meat withdrawal/, "the meat withdrawal is named too");

  const del = deleteEntry(ledger, all, "medicines", med); await tick();
  assert.equal(del.deleted.length, 4);
  for (const c of ["medicines", "milkWithhold", "mastitis", "handover"]) assert.equal((await listRecords(ledger.id, c)).length, 0, `${c} gone`);
  all = await loadAll(ledger);
  const gone = all.milkWithhold[0]; assert.equal(gone.cascadeId, del.cascadeId);
  restoreEntry(ledger, all, "milkWithhold", gone); await tick();
  for (const c of ["medicines", "milkWithhold", "mastitis", "handover"]) assert.equal((await listRecords(ledger.id, c)).length, 1, `${c} back`);
});

test("edit carries to the linked records (date, product)", async () => {
  const env = freshEnv(); const { ledger, cowId, snap } = await dairyLedger(env);
  const r = saveTreatment(snap, { animalIds: [cowId], reason: "Lame", product: { id: "p1", name: "Metacam" }, doses: 1, intervalH: 12, wdMilkHours: 120, wdMeatDays: 15, date: T, time: "07:00", marks: [] });
  await tick();
  const all = await loadAll(ledger); const med = all.medicines.find((m) => m.id === r.medId);
  const ch = { date: addDays(T, -1), productName: "Metacam 20" };
  updateRecord(ledger.id, "medicines", med, ch);
  const n = propagateEdit(ledger, all, "medicines", med, ch); await tick();
  assert.equal(n, 1);
  const w = (await listRecords(ledger.id, "milkWithhold"))[0];
  assert.equal(w.date, addDays(T, -1)); assert.equal(w.productName, "Metacam 20");
  assert.equal(w.history.length, 1, "the change is in the withhold's history (audit trail)");
});

async function beefLedger(env) {
  await env.as("tom");
  const L = await createLedger({ type: "beef", farmName: "Drumlin" });
  const ledger = { id: L.id || L, type: "beef", role: "owner" };
  const aid = addRecord(ledger.id, "animals", { tag: "UK 9 012345 0403 1", mgmtNo: "0105", name: "Peggy", sex: "Cow", dob: "2015-03-05", status: "onFarm" });
  await tick();
  const animals = await listRecords(ledger.id, "animals");
  const snap = { lid: ledger.id, role: "owner", s: {}, ix: { byId: new Map(animals.map((a) => [a.id, a])) } };
  return { ledger, aid, snap };
}

test("beef death: delete puts the animal back on the farm; bring back takes it off again", async () => {
  const env = freshEnv(); const { ledger, aid, snap } = await beefLedger(env);
  const deathId = recordDeath(ledger.id, snap, { animalId: aid, date: T, cause: "Old age", disposal: "Knackery" });
  await tick();
  let all = await loadAll(ledger);
  const death = all.deaths.find((d) => d.id === deathId);
  assert.equal(death.actionEffects.length, 1, "the animal change is kept on the death");
  assert.equal(all.animals[0].offTo, "Dead");
  assert.equal(recordTitle("beef", "deaths", death, makeLookup("beef", all)), "Death · 0105 Peggy · old age");
  const { items } = linkedFor(all, "deaths", death);
  assert.deepEqual(items.map((x) => x.coll), ["movements"]);
  deleteEntry(ledger, all, "deaths", death); await tick();
  let a = await getRecord(ledger.id, "animals", aid);
  assert.equal(a.status, "onFarm"); assert.equal(a.offTo, undefined); assert.equal(a.offDate, undefined);
  all = await loadAll(ledger);
  restoreEntry(ledger, all, "deaths", all.deaths[0]); await tick();
  a = await getRecord(ledger.id, "animals", aid);
  assert.equal(a.offTo, "Dead"); assert.equal(a.status, "gone"); assert.equal(a.offDate, T);
  // editing the death's date moves the animal's off date with it
  all = await loadAll(ledger); const d2 = all.deaths[0];
  const ch = { date: addDays(T, -2) }; updateRecord(ledger.id, "deaths", d2, ch); propagateEdit(ledger, all, "deaths", d2, ch); await tick();
  a = await getRecord(ledger.id, "animals", aid); assert.equal(a.offDate, addDays(T, -2));
  assert.equal((await listRecords(ledger.id, "movements"))[0].date, addDays(T, -2));
});

test("beef treatment course: one action; withdrawal warning names the animal", async () => {
  const env = freshEnv(); const { ledger, aid, snap } = await beefLedger(env);
  const r = recordTreatment(ledger.id, snap, { date: T, productName: "Draxxin", wdMeatDays: 49, doses: [{ animalId: aid, dose: 8 }] });
  await tick();
  const all = await loadAll(ledger); const m = all.medicines[0];
  assert.ok(m.actionId);
  const w = withdrawalWarnings("beef", [{ coll: "medicines", rec: m }], T, makeLookup("beef", all));
  assert.deepEqual(w, [`0105 Peggy will no longer show as in withdrawal (until ${addDays(T, 49).slice(8).replace(/^0/, "")} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+addDays(T, 49).slice(5, 7) - 1]})`]);
  assert.equal(r.ids.length, 1);
  // derive: course and withdrawal recomputed after an edit
  const d = deriveEdit("beef", "medicines", { ...m, date: addDays(T, -10), withdrawalMeatDays: 28 });
  assert.equal(d.withdrawalEndDateMeat, addDays(T, 18));
});

test("beef sale: finance line and movement go with it; animals come back", async () => {
  const env = freshEnv(); const { ledger, aid, snap } = await beefLedger(env);
  const r = recordSale(ledger.id, snap, { kind: "mart", date: T, buyer: "Ballymena Mart", animalIds: [aid], lines: [{ animalId: aid, price: 1250 }] });
  await tick();
  let all = await loadAll(ledger);
  const sale = all.sales[0]; const { items } = linkedFor(all, "sales", sale);
  assert.deepEqual(items.map((x) => x.coll).sort(), ["finance", "movements"]);
  assert.match(recordTitle("beef", "finance", all.finance[0]), /^Money in · Livestock Sales · £1,250\.00 · 1 (cattle|animal) · Ballymena Mart$/);
  deleteEntry(ledger, all, "sales", sale); await tick();
  assert.equal((await getRecord(ledger.id, "animals", aid)).status, "onFarm");
  assert.equal((await listRecords(ledger.id, "finance")).length, 0);
  assert.equal(r.total, 1250);
});

test("older records without an action id: linked by medId / same animal and date", async () => {
  const env = freshEnv(); const { ledger, aid } = await beefLedger(env);
  const medId = addRecord(ledger.id, "medicines", { date: T, productName: "Synulox LC", animalIds: [aid] });
  addRecord(ledger.id, "milkWithhold", { animalId: aid, medId, date: T, okFrom: addDays(T, 3) + "T06:00" });
  const wid = addRecord(ledger.id, "mastitis", { animalId: aid, medId, date: T });
  addRecord(ledger.id, "medicines", { date: T, productName: "Other cow" });
  await tick();
  const all = await loadAll({ ...ledger, type: "dairy" }, ["medicines", "milkWithhold", "mastitis", "animals"]);
  const w = all.mastitis.find((x) => x.id === wid);
  const { items, legacy } = linkedFor(all, "mastitis", w);
  assert.equal(legacy, true);
  assert.deepEqual(items.map((x) => x.coll).sort(), ["medicines", "milkWithhold"], "mastitis -> medicine -> withhold");
  // an old death: the animal comes back only when it is clearly the same death
  updateRecord(ledger.id, "animals", all.animals[0], { offDate: T, offTo: "Dead", status: "gone", offReason: "died" }); await tick();
  const did = addRecord(ledger.id, "deaths", { animalId: aid, date: T, cause: "Unknown" }); await tick();
  const all2 = await loadAll(ledger, ["deaths", "animals", "movements"]);
  const res = linkedFor(all2, "deaths", all2.deaths.find((d) => d.id === did));
  assert.equal(res.effects.length, 1); assert.equal(res.effects[0].before.status, "onFarm");
  deleteEntry(ledger, all2, "deaths", all2.deaths[0]); await tick();
  assert.equal((await getRecord(ledger.id, "animals", aid)).status, "onFarm");
});

test("labels read like a farmer says them", () => {
  const all = { rooms: [{ id: "r1", name: "Finisher 2" }], sows: [{ id: "s1", sowNo: "0931", type: "sow" }], animals: [{ id: "c1", mgmtNo: "0412", name: "Daisy", tag: "UK 9 012345 0400 3" }] };
  const P = makeLookup("pigs", all), B = makeLookup("beef", all);
  assert.equal(recordTitle("pigs", "deaths", { roomId: "r1", where: { roomId: "r1", pen: 3 }, n: 1, stage: "Finisher", cause: "Tail bite" }, P), "Death · Finisher 2 pen 3 · 1 finisher · tail bite");
  assert.equal(recordTitle("pigs", "services", { sowId: "s1", kind: "AI", date: T }, P), "Served · sow 0931 · AI");
  assert.equal(recordTitle("beef", "calvings", { damId: "c1", date: T, calves: [{ sex: "Bull", alive: true }] }, B), "Calving · 0412 Daisy · bull calf");
  assert.equal(recordTitle("beef", "services", { kind: "natural", bullIn: "2026-06-11", femaleIds: ["c1"], sireText: "Gulladuff Ruler" }, B), "Bull in · 0412 Daisy · Gulladuff Ruler");
  assert.equal(recordDay({ kind: "natural", bullIn: "2026-06-11", createdAt: new Date() }), "2026-06-11", "natural service: bull-in date, not today");
  assert.equal(pounds(38805), "£38,805.00");
  assert.equal(collHeading("medicines"), "Medicines"); assert.equal(collHeading("tbTests"), "TB tests"); assert.equal(collHeading("finance"), "Money");
  const f = fieldsOf("beef", "deaths", { date: T, animalId: "c1", cause: "Old age", foundAtInspection: true, actionId: "x", createdBy: "u" }, B);
  assert.deepEqual(f.map((x) => x.label), ["Date", "Animal", "Cause", "Found dead at inspection"]);
  assert.equal(f[1].text, "0412 Daisy"); assert.equal(f[1].input, "ref"); assert.equal(f[0].input, "date"); assert.equal(f[2].input, "select"); assert.equal(f[3].input, "check");
});

test("runAction: nested writes join one action; effects only for records it didn't add", async () => {
  const env = freshEnv(); const { ledger, aid } = await beefLedger(env);
  const a = await getRecord(ledger.id, "animals", aid);
  let ids;
  runAction(() => { const x = addRecord(ledger.id, "notes", { text: "a" }); runAction(() => { ids = [x, addRecord(ledger.id, "notes", { text: "b" })]; }); updateRecord(ledger.id, "animals", a, { groupId: "g2" }); });
  await tick();
  const n = await listRecords(ledger.id, "notes");
  assert.equal(new Set(n.map((r) => r.actionId)).size, 1);
  const last = n.find((r) => r.id === ids[1]);
  assert.deepEqual(last.actionEffects, [{ coll: "animals", id: aid, set: { groupId: "g2" }, before: {}, unset: ["groupId"] }]);
});

test("an animal is never a side effect: deleting a calf leaves the calving and its twin", () => {
  const all = { animals: [{ id: "c1", actionId: "A" }, { id: "c2", actionId: "A" }], calvings: [{ id: "k", actionId: "A", calves: [{ animalId: "c1" }, { animalId: "c2" }] }] };
  assert.deepEqual(linkedFor(all, "animals", all.animals[0]).items, []);
  assert.deepEqual(linkedFor(all, "calvings", all.calvings[0]).items.map((x) => x.rec.id).sort(), ["c1", "c2"], "deleting the calving takes its calves");
});
