// Wave 2A beef sale: a factory sale with no kill sheet waits for it (review A #3); breeding stock
// gets a warning (A #4); odd numbers are questioned (A #2).
import { test } from "node:test";
import assert from "node:assert/strict";
import { freshEnv } from "./env.mjs";
import { createLedger } from "../../app/js/services/ledgers.js";
import { addRecord, listRecords } from "../../app/js/services/records.js";
import { recordSale, addKillSheet } from "../../app/js/sectors/beef/actions.js";
import { buildSnap, BEEF_COLLECTIONS } from "../../app/js/sectors/beef/data.js";
import { generatedTasks } from "../../app/js/sectors/beef/model/duties.js";
import { addDays, todayStr } from "../../app/js/core/dates.js";

const tick = () => new Promise((r) => setTimeout(r, 15));
const T = todayStr();

async function beef(env) {
  await env.as("tom");
  const L = await createLedger({ type: "beef", farmName: "Drumlin" });
  const ledger = { id: L.id || L, type: "beef", role: "owner", region: "NI" };
  const ids = {
    steer: addRecord(ledger.id, "animals", { tag: "UK 9 012345 0112 4", mgmtNo: "0112", name: "Holly", sex: "Steer", dob: "2024-10-01", status: "onFarm" }),
    bull: addRecord(ledger.id, "animals", { tag: "UK 9 012345 0011 1", mgmtNo: "0011", name: "Ruler", sex: "Bull", dob: "2021-05-01", status: "onFarm", stockBull: true }),
    cow: addRecord(ledger.id, "animals", { tag: "UK 9 012345 0412 2", mgmtNo: "0412", name: "Daisy", sex: "Cow", dob: "2018-04-01", status: "onFarm", pedigree: { herdBookNo: "CH12345" } }),
  };
  addRecord(ledger.id, "scans", { femaleId: ids.cow, date: addDays(T, -40), result: "in calf", dueDate: addDays(T, 120) });
  await tick();
  return { ledger, ids, snap: await snapOf(ledger) };
}
async function snapOf(ledger) {
  const data = {}; for (const k of BEEF_COLLECTIONS) data[k] = await listRecords(ledger.id, k).catch(() => []);
  return buildSnap(ledger, data, {}, {});
}

test("factory sale with nothing in the kill-sheet columns: saved, waiting, a job names the animal, then the kill sheet fills it in", async () => {
  const env = freshEnv(); const { ledger, ids, snap } = await beef(env);
  const r = recordSale(ledger.id, snap, { kind: "factory", date: T, buyer: "Linden Foods", animalIds: [ids.steer], lines: [{ animalId: ids.steer }] });
  await tick();
  assert.equal(r.awaitingKillSheet, true); assert.equal(r.financeId, null);
  let s2 = await snapOf(ledger);
  const sale = s2.data.sales[0]; assert.equal(sale.awaitingKillSheet, true);
  const job = generatedTasks(s2.c).find((t) => t.key === `kill:${sale.id}`);
  assert.equal(job.title, "Add the kill sheet for 0112 Holly"); assert.equal(job.href, `#/l/${ledger.id}/sale/${sale.id}`);
  const k = addKillSheet(ledger.id, s2, sale, [{ animalId: ids.steer, deadKg: 372, grade: "U-3", pricePerKg: 4.9 }]);
  await tick();
  assert.equal(k.total, 1822.8); assert.equal(k.still, false);
  s2 = await snapOf(ledger);
  const after = s2.data.sales[0]; assert.equal(after.awaitingKillSheet, false); assert.equal(after.lines[0].deadKg, 372); assert.equal(after.lines[0].grade, "U-3");
  const fin = s2.data.finance.find((f) => f.id === after.financeId); assert.equal(fin.amount, 1822.8); assert.equal(fin.saleId, sale.id); assert.equal(fin.actionId, sale.actionId, "the money joins the sale's entry");
  assert.ok(!generatedTasks(s2.c).some((t) => t.key.startsWith("kill:")), "job gone");
});

test("a factory sale with the kill sheet is not waiting; a mart sale never is", async () => {
  const env = freshEnv(); const { ledger, ids, snap } = await beef(env);
  assert.equal(recordSale(ledger.id, snap, { kind: "factory", date: T, buyer: "ABP", animalIds: [ids.steer], lines: [{ animalId: ids.steer, deadKg: 360, pricePerKg: 5 }] }).awaitingKillSheet, false);
  assert.equal(recordSale(ledger.id, snap, { kind: "mart", date: T, buyer: "Ballymena", animalIds: [ids.bull], lines: [{ animalId: ids.bull }] }).awaitingKillSheet, false);
});

test("sale warnings: stock bull, pedigree female, cow in calf; odd £/kg", async () => {
  const env = freshEnv(); const { ids, snap } = await beef(env);
  const { keeperWarnings, saleChecks } = await import("../../app/js/sectors/beef/flows/sale.js");
  const w = keeperWarnings(snap, [ids.bull, ids.cow, ids.steer]);
  assert.ok(w.some((t) => /0011 Ruler.* is your stock bull/.test(t)), w.join("|"));
  assert.ok(w.some((t) => /0412 Daisy.* is a pedigree registered female/.test(t)));
  assert.ok(w.some((t) => /0412 Daisy.* is in calf \(due /.test(t)));
  assert.ok(!w.some((t) => /0112/.test(t)));
  const c = saleChecks(snap, { date: T }, [ids.steer], { [ids.steer]: { deadKg: 372, pricePerKg: 372 } });
  assert.ok(c.some((t) => /£372\/kg is high/.test(t)));
});

test("jobs name animals by management number and name, tag digits second when they differ (A #16)", async () => {
  const { jobName } = await import("../../app/js/sectors/beef/model/duties.js");
  assert.equal(jobName({ mgmtNo: "0105", name: "Peggy", tag: "UK 9 012345 0403 1" }), "0105 Peggy (0403 1)");
  assert.equal(jobName({ mgmtNo: "0112", name: "Holly", tag: "UK 9 012345 0112 4" }), "0112 Holly");
  assert.equal(jobName({ tag: "UK 9 012345 0403 1" }), "0403 1");
});
test("calf breed and colour default from sire and dam (A #45)", async () => {
  const { calfDefaults } = await import("../../app/js/sectors/beef/flows/calving.js");
  const bull = { id: "b", sex: "Bull", name: "Ruler", breed: "CH" };
  const snap = { ix: { byId: new Map([["b", bull]]) }, data: { animals: [bull] } };
  assert.deepEqual(calfDefaults(snap, { breed: "CH" }, { sireText: "Gulladuff Ruler" }), { breed: "CH", colour: "W" });
  assert.deepEqual(calfDefaults(snap, { breed: "LIM" }, { sireId: "b" }), { breed: "CH", colour: "" });
  assert.deepEqual(calfDefaults(snap, { breed: "AA" }, null), { breed: "AA", colour: "B" });
});
