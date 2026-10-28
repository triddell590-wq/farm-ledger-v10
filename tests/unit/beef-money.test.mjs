// Beef money rule (design/01 §15, Coordinator request 2026-10-19 14:05): a sale or purchase
// writes £ ONLY into `finance`. Every other record it writes (animals, sales, purchases,
// movements) must carry no price/cost/total, because Workers and Vet/Advisers can read them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { freshEnv } from "./env.mjs";
import { createLedger } from "../../app/js/services/ledgers.js";
import { listRecords } from "../../app/js/services/records.js";
import { recordSale, recordPurchase, setMarketPrices, addAnimal } from "../../app/js/sectors/beef/actions.js";
import { beefSettings } from "../../app/js/sectors/beef/model/rules.js";
import { indexHerd } from "../../app/js/sectors/beef/model/animals.js";
import { priceBook, moneyKeysIn, isEntry } from "../../app/js/sectors/beef/model/prices.js";
import { margins, sireReport } from "../../app/js/sectors/beef/model/reports.js";
import { planMigration, verifyRoundTrip, recordsFromWrites, PRICES_ID } from "../../app/js/migrate/v9-to-v10.js";
import { boardSummary, stateFromRecords } from "../../app/board-feed.js";
import { v9Doc } from "../fixtures/v9-synthetic.mjs";

const tick = () => new Promise((r) => setTimeout(r, 10));
const COLLS = ["animals", "sales", "purchases", "movements", "finance"];
async function snapOf(lid, role = "owner") {
  const data = {}; for (const c of COLLS) data[c] = (await listRecords(lid, c)).filter((r) => !r.deleted);
  return { lid, role, data, s: beefSettings({ settings: {} }, {}), ix: indexHerd({ animals: data.animals, weighings: [], groups: [], calvings: [], movements: data.movements }), today: "2026-10-15" };
}

test("sale + purchase: £ only in finance; sale/purchase/animal/movement records have no money fields", async () => {
  const env = freshEnv(); await env.as("tom");
  const lid = await createLedger({ type: "beef", farmName: "Drumlin Farm" });
  const a1 = addAnimal(lid, { tag: "UK 9 123456 7001 2", sex: "Steer", breed: "CH", dob: "2024-08-01", bornInHerd: true });
  const a2 = addAnimal(lid, { tag: "UK 9 123456 7002 3", sex: "Heifer", breed: "CH", dob: "2024-08-03", bornInHerd: true });
  await tick();
  let snap = await snapOf(lid);
  const sale = recordSale(lid, snap, { kind: "factory", date: "2026-10-14", buyer: "Linden Foods", animalIds: [a1, a2], lines: [{ animalId: a1, deadKg: 360, grade: "U-3", pricePerKg: 6.2 }, { animalId: a2, deadKg: 340, grade: "R3", pricePerKg: 6.1 }] });
  const buy = recordPurchase(lid, snap, { date: "2026-10-10", fromName: "Ballymena Mart", lot: "42", animals: [{ tag: "UK 9 312345 0601 4", kg: 420, price: 1450 }, { tag: "UK 9 312345 0602 5", kg: 400, price: 1390 }] });
  await tick();
  snap = await snapOf(lid);
  setMarketPrices(lid, snap, { perKgDead: 6.2, enteredOn: "2026-10-14" });
  await tick();
  const leaks = [];
  for (const c of ["animals", "sales", "purchases", "movements"]) for (const r of await listRecords(lid, c)) leaks.push(...moneyKeysIn(r, `${c}/${r.id}`));
  assert.deepEqual(leaks, []);
  // the money is in finance, linked both ways, with per-animal lines
  const fin = await listRecords(lid, "finance");
  const sf = fin.find((e) => e.id === sale.financeId); assert.equal(sf.amount, Math.round((360 * 6.2 + 340 * 6.1) * 100) / 100); assert.equal(sf.saleId, sale.saleId);
  assert.equal(sf.lines.find((l) => l.animalId === a1).price, 2232);
  const pf = fin.find((e) => e.purchaseId === buy.purchaseId); assert.equal(pf.amount, 2840); assert.equal(pf.lines.length, 2);
  const book = priceBook(fin);
  assert.equal(book.sale.get(a1).price, 2232); assert.equal(book.bought.get(buy.animalIds[0]), 1450); assert.equal(book.market.perKgDead, 6.2);
  assert.equal(fin.filter(isEntry).length, 2, "the price doc is not a money entry");
});

test("a Worker's sale saves the movement and sale with no £ anywhere (they can't write finance)", async () => {
  const env = freshEnv(); await env.as("tom");
  const lid = await createLedger({ type: "beef", farmName: "Drumlin Farm" });
  const a = addAnimal(lid, { tag: "UK 9 123456 7001 2", sex: "Steer", dob: "2024-08-01" }); await tick();
  const snap = await snapOf(lid, "worker");
  const r = recordSale(lid, snap, { kind: "mart", date: "2026-10-14", buyer: "Dungannon Mart", animalIds: [a], lines: [{ animalId: a, liveKg: 600, price: 1700 }], fci: true });
  await tick();
  assert.equal(r.financeId, null);
  const s = (await listRecords(lid, "sales"))[0]; assert.deepEqual(moneyKeysIn(s), []); assert.equal(s.lines[0].liveKg, 600);
});

test("margins and the sire report read sale and purchase prices from finance", () => {
  const animals = [{ id: "c1", tag: "UK 9 123456 7001 2", sex: "Steer", dob: "2025-01-10", bornInHerd: true, sireText: "Ruler", offDate: "2026-06-01", status: "gone" },
    { id: "b1", tag: "UK 9 312345 0601 4", sex: "Steer", dob: "2024-10-01", onDate: "2026-01-05", offDate: "2026-06-01", status: "gone" }];
  const data = { animals, weighings: [], groups: [], calvings: [], movements: [], services: [], scans: [], heats: [], medicines: [], deaths: [],
    sales: [{ id: "s1", date: "2026-06-01", kind: "mart", lines: [{ animalId: "c1", tag: animals[0].tag }, { animalId: "b1", tag: animals[1].tag }] }],
    finance: [{ id: "f1", kind: "revenue", category: "Livestock Sales", amount: 3300, date: "2026-06-01", source: "sale", lines: [{ animalId: "c1", price: 1500 }, { animalId: "b1", price: 1800 }] },
      { id: "f2", kind: "expense", category: "Animal Purchase", amount: 1200, date: "2026-01-05", purchaseId: "p1", lines: [{ animalId: "b1", price: 1200 }] },
      { id: "beef-prices", kind: "prices", source: "beef", perKgDead: 6 }] };
  const s = beefSettings({ settings: {} }, {}); const ix = indexHerd(data);
  const m = margins({ data, s, ix, today: "2026-10-15" }, 2026);
  const b1 = m.perHead.find((x) => x.tag === animals[1].tag); assert.equal(b1.sale, 1800); assert.equal(b1.bought, 1200);
  assert.equal(m.salesIn, 3300); assert.equal(m.purchases, 1200);
  const sr = sireReport(data, ix, 1).find((x) => x.sire === "Ruler"); assert.equal(sr.sale, 1500);
});

test("v9 migration: animal prices and purchase costs move to a finance-only doc; round trip and Morning Board unchanged", () => {
  const v9 = v9Doc();
  const plan = planMigration(v9, {}, { ownerUid: "Nul4LGSWD4Zclv0lLGYjynVq2QZ2", farmName: "Tom's farm" });
  const leaks = plan.writes.filter((w) => !w.path.includes("/finance/") && !w.path.includes("/meta/")).flatMap((w) => moneyKeysIn(w.data, w.path));
  assert.deepEqual(leaks, []);
  const doc = plan.writes.find((w) => w.path.endsWith(`/finance/${PRICES_ID}`)); assert.ok(doc && doc.data.kind === "prices");
  assert.deepEqual(verifyRoundTrip(v9, {}, plan), []);
  const { recs } = recordsFromWrites(plan);
  assert.deepEqual(boardSummary(stateFromRecords(recs), "b"), boardSummary({ herd: v9.herd, medicine: v9.medicine, finance: v9.finance, purchases: v9.purchases }, "b"));
  const book = priceBook(recs.finance); assert.ok(book.bought.size >= 1);
});
