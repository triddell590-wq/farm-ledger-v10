// Sheep: every collection / meta doc the sector writes is in the registry (export and
// delete-ledger walk only listed collections), and no £ is ever stored outside `finance`
// (workers and vets can read sales and movements; design/01 §15). Also the pure helpers behind
// the Targets, Money and FQAS screens.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { freshEnv } from "./env.mjs";
import { createLedger } from "../../app/js/services/ledgers.js";
import { listRecords } from "../../app/js/services/records.js";
import { collectionsFor, metaFor } from "../../app/js/sectors/registry.js";
import { SHEEP_COLLECTIONS, SHEEP_META } from "../../app/js/sectors/sheep/data.js";
import * as A from "../../app/js/sectors/sheep/actions.js";
import { settingsPatch } from "../../app/js/sectors/sheep/targets.js";
import { sheepMoney } from "../../app/js/sectors/sheep/money.js";
import { mergeTicks } from "../../app/js/sectors/sheep/fqa.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../app/js/sectors/sheep");
const files = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? files(join(d, f)) : f.endsWith(".js") ? [join(d, f)] : []));
const tick = () => new Promise((r) => setTimeout(r, 10));

test("registry lists every collection and meta doc the Sheep code writes or reads", () => {
  const colls = new Set(SHEEP_COLLECTIONS); const metas = new Set(SHEEP_META);
  for (const f of files(ROOT)) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/\b(?:addRecord|updateRecord)\(\s*(?:lid|snap\.lid)\s*,\s*"([A-Za-z]+)"/g)) colls.add(m[1]);
    for (const m of src.matchAll(/\bsetMeta\(\s*(?:lid|snap\.lid)\s*,\s*"([A-Za-z]+)"/g)) metas.add(m[1]);
  }
  const have = new Set(collectionsFor("sheep")); const haveMeta = new Set(metaFor("sheep"));
  assert.deepEqual([...colls].filter((c) => !have.has(c)), []);
  assert.deepEqual([...metas].filter((c) => !haveMeta.has(c)), []);
});

test("money rule: a sale or a buy-in writes no price into sales or movements; every £ is in finance", async () => {
  const env = freshEnv(); await env.as("tom");
  const lid = await createLedger({ type: "sheep", farmName: "Drumlin Farm" });
  const mob = A.createMob(lid, { name: "Lambs 2026", cls: "lambs", count: 60 });
  const r = A.sale(lid, { date: "2026-09-02", mobId: mob, count: 32, lambs: true, crop: 2026, dest: "abattoir", outlet: "Linden Foods", otherName: "Linden Foods", outletType: "abattoir",
    lines: [{ deadKg: 682, grade: "U3L", price: 4912, pricePerKg: 7.2, liveKg: 1380 }], total: 4912, deductions: { levy: 20, haulage: 60, commission: 0 } }, { money: true });
  A.movement(lid, { kind: "on", date: "2026-09-10", mobId: mob, count: 20, otherName: "Mart", price: 2400, quarantine: true });
  A.purchaseFinance(lid, { amount: 2400, date: "2026-09-10", note: "20 sheep" });
  await tick();
  const MONEY = /price|cost|total|gross|net|amount|deduction/i;
  const scan = (o, path = "") => Object.entries(o || {}).flatMap(([k, v]) => (MONEY.test(k) ? [path + k] : v && typeof v === "object" ? scan(v, `${path}${k}.`) : []));
  for (const coll of ["sales", "movements", "events", "mobs"]) for (const rec of await listRecords(lid, coll)) assert.deepEqual(scan(rec), [], `${coll} ${rec.id}`);
  const fin = await listRecords(lid, "finance"); const sale = fin.find((f) => f.id === r.financeId);
  assert.equal(sale.amount, 4832); assert.equal(sale.gross, 4912); assert.deepEqual(sale.deductions, { levy: 20, haulage: 60, commission: 0 }); assert.equal(sale.lines[0].price, 4912); assert.equal(sale.deadKg, 682);
  assert.equal((await listRecords(lid, "sales"))[0].lines[0].grade, "U3L");
  assert.ok(fin.some((f) => f.kind === "expense" && f.amount === 2400));
  // a worker's sale (money = false) makes no finance record at all
  const w = A.sale(lid, { date: "2026-09-03", mobId: mob, count: 2, lambs: true, lines: [{ deadKg: 40 }] }, { money: false }); await tick();
  assert.equal(w.financeId, undefined);
});

test("Targets: form values → settings patch (rams out as days after rams in, colours checked)", () => {
  const p = settingsPatch({ ramsIn: "2026-10-15", ramsOut: "2026-11-20", raddleOrder: "red, blue → green, mauve", gestation: "144", flockType: "hill", drenchCheckDays: "21", fecThreshold: "", shedNightFrom: "7pm", housedOrMilked: true });
  assert.equal(p.ramsIn, "10-15"); assert.equal(p.ramsOutDays, 36); assert.deepEqual(p.raddleOrder, ["Red", "Blue", "Green"]); assert.equal(p.gestation, 144);
  assert.equal(p.flockType, "hill"); assert.equal(p.drenchCheckDays, 14); assert.equal(p.fecThreshold, 500); assert.equal(p.shedNightFrom, "18:00"); assert.equal(p.housedOrMilked, true);
  assert.equal(settingsPatch({ ramsIn: "2026-12-20", ramsOut: "2027-01-25" }).ramsOutDays, 36); // over the new year
  assert.equal(settingsPatch({ ramsIn: "" }).ramsIn, null);
});

test("Money per ewe from finance only: per lamb, cost per kg, outlets, deductions", () => {
  const fin = [
    { kind: "revenue", category: "Livestock Sales", source: "sheep-sale", lambs: true, count: 32, gross: 4912, amount: 4832, deadKg: 682, outletType: "abattoir", deductions: { levy: 20, haulage: 60, commission: 0 }, date: "2026-09-02", note: "32 lambs" },
    { kind: "revenue", category: "Livestock Sales", source: "sheep-sale", lambs: true, count: 10, gross: 1200, amount: 1150, deadKg: 0, outletType: "market", deductions: { commission: 50 }, date: "2026-09-20", note: "10 lambs" },
    { kind: "expense", category: "Feed", amount: 3000, date: "2026-03-01" }, { kind: "expense", category: "Feed", amount: 999, date: "2025-03-01" },
  ];
  const m = sheepMoney(fin, 2026, 50);
  assert.equal(m.lambs, 42); assert.equal(m.perLamb, 145.52); // (4912 + 1200) ÷ 42
  assert.equal(m.income, 5982); assert.equal(m.costs, 3000); assert.equal(m.perEwe, 60); assert.equal(m.costPerKg, 4.4);
  assert.deepEqual(m.outlets, { Processor: 32, Mart: 10 }); assert.deepEqual(m.deductions, { levy: 20, haulage: 60, commission: 50 });
  assert.equal(m.points.length, 2); assert.equal(m.points[0].y, 153.5);
});

test("FQAS: one membership per farm — Beef ticks fill gaps, Sheep's own ticks win", () => {
  const t = mergeTicks({ medstore: { done: true, date: "2026-09-01" }, ahp: { done: false } }, { medstore: { done: true, date: "2025-01-01" }, ahp: { done: true, date: "2026-05-01" }, training: { done: true, date: "2026-02-01" } });
  assert.equal(t.medstore.date, "2026-09-01"); assert.equal(t.ahp.fromBeef, true); assert.equal(t.training.fromBeef, true);
});
