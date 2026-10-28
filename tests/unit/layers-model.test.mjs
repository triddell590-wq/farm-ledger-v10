// Layers ledger model: hand-worked numbers for every calculation and rule in design/14.
import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays } from "../../app/js/core/dates.js";
import { layerSettings } from "../../app/js/sectors/layers/model/settings.js";
import { standardFor, band, layBand, vsBand, mid } from "../../app/js/sectors/layers/model/standards.js";
import { weekOfAge, aliveAt, sheetFigures, series, weekly, henHoused, predictHHE, hheStd, stageOf, timeline, mortality, feedSeries, flockIn, plannedFlock } from "../../app/js/sectors/layers/model/flock.js";
import { salmonella, classB, mite, miteAvg, eggWithheld, withdrawalDates, uniformity, eggMix, featherScore, trapIds, gradeOf } from "../../app/js/sectors/layers/model/health.js";
import { weekStart, isoWeek, collectedInWeek, reconcile, lineAmount, sizeMix, collectionGap, nextCollection, farmGateStock, flockMoney, depopDecision, storeStatus } from "../../app/js/sectors/layers/model/eggs.js";
import { spaceCheck, sunset, ukOffsetMin, lightPlan, hoursAt, darkWarning, nextLightStep, aiState, birdRegister } from "../../app/js/sectors/layers/model/house.js";
import { layerAlerts, spike, layAlert } from "../../app/js/sectors/layers/model/alerts.js";
import { todayTasks } from "../../app/js/sectors/layers/model/duties.js";
import { buildRegister, REGISTERS, weeklySheet } from "../../app/js/sectors/layers/model/registers.js";
import { evaluate, LION_ITEMS, audits } from "../../app/js/sectors/layers/model/lion.js";
import { BREED_STANDARDS, AI_STATUS } from "../../app/js/sectors/layers/model/content.js";

const T = "2026-10-15";
const COLLS = ["houses", "flocks", "days", "eggDeliveries", "packerStatements", "storeTemps", "salmSamples", "miteScores", "samples", "vaccinations", "housing", "birdMoves", "lightPlans", "medicines", "feedDeliveries", "alarmTests", "visitors", "biosecurity", "manure", "farmGate", "birdRegisterReturns", "rodentVisits", "healthPlans", "tasks"];
const empty = () => Object.fromEntries(COLLS.map((k) => [k, []]));
function snap(data, meta = {}, now = T + "T10:00") { return { s: layerSettings({ settings: {} }, meta), data, today: now.slice(0, 10), now, lid: "L", doneKeys: new Set() }; }
const H1 = { id: "h1", name: "House 1", order: 1, system: 1, usableM2: 1800, nests: 2300, perchM: 2400, rangeHa: 6.4, establishmentNo: "1UK9-0412" };
// placed 21 Mar at 17 weeks old → hatch 15 Nov 2025; Hy-Line Brown; 16,000 birds
const F1 = { id: "f1", houseId: "h1", breedStdId: "hyline-brown-2025", hatchDate: "2025-11-15", placedDate: "2026-03-14", placed: 16000, plannedDepop: "2027-01-07", rearer: "Rearer Ltd", rearerEst: "1UK9-9999" };

function daysRun(from, n, fn) { const out = []; for (let i = 0; i < n; i++) out.push({ id: "d" + i, houseId: "h1", flockId: "f1", date: addDays(from, i), ...fn(i) }); return out; }

test("standards: published anchors, straight lines between, flat outside", () => {
  const hy = standardFor("hyline-brown-2025");
  assert.deepEqual(band(hy, "lay", 25), [93.4, 98.1]);
  assert.deepEqual(band(hy, "lay", 35), [92.6, 97.7]); // halfway 30→40
  assert.deepEqual(band(hy, "lay", 90), [79.7, 86.1]);
  assert.deepEqual(layBand(hy, 17), [0, 0]);
  assert.deepEqual(vsBand(86.0, band(hy, "lay", 61)), { pos: "below", gap: 1.0 }); // std at 61: 87.0–92.9
  assert.equal(mid([90, 96]), 93);
  assert.equal(standardFor("nope").id, "hyline-brown-2025");
  for (const s of BREED_STANDARDS) assert.ok(s.edition && s.source, "every standard says its edition and source");
});

test("week of age and birds alive (start of day, deaths and moves)", () => {
  const d = empty(); d.houses = [H1]; d.flocks = [F1];
  d.days = [{ id: "a", flockId: "f1", houseId: "h1", date: "2026-10-13", dead: 3, culled: 1 }, { id: "b", flockId: "f1", houseId: "h1", date: "2026-10-14", dead: 5 }];
  d.birdMoves = [{ flockId: "f1", date: "2026-10-14", direction: "out", n: 100, kind: "other" }, { flockId: "f1", date: "2026-03-14", direction: "in", n: 16000, kind: "placement" }];
  const c = snap(d);
  assert.equal(weekOfAge(F1, T), 47); // 334 days / 7
  assert.equal(aliveAt(c, F1, "2026-10-14"), 16000 - 4);
  assert.equal(aliveAt(c, F1, T), 16000 - 4 - 5 - 100);
  assert.equal(aliveAt(c, F1, "2026-10-14", { end: true }), 16000 - 9 - 100);
  assert.equal(flockIn(c, "h1").id, "f1");
});

test("daily sheet maths matches the mockup (House 1, 15 Oct)", () => {
  const f = sheetFigures({ henDayBasis: "total" }, { eggsTotal: 13572, seconds: 204, floor: 38, waterMeter: 1284560, alive: 15820, prev: { waterMeter: 1283280, gap: 1 }, prevWater: [1500, 1530, 1540] });
  assert.equal(f.henDay, 85.8); assert.equal(f.secondsPct, 1.5); assert.equal(f.litres, 1280); assert.equal(f.waterPer1000, 81);
  assert.equal(f.waterChange, -16.0); // 1280 ÷ 1523.3 − 1 = −0.1597 (the old −16.3 was a slip: that is 1280 ÷ 1530)
  const sal = sheetFigures({ henDayBasis: "saleable" }, { eggsTotal: 13572, seconds: 204, alive: 15820 });
  assert.equal(sal.henDay, 84.5);
  assert.equal(sheetFigures({}, { eggsTotal: 0, alive: 100 }).henDay, null);
  assert.equal(sheetFigures({}, { eggsTotal: 10, alive: 100, waterMeter: 50, prev: { waterMeter: 100 } }).litres, null, "meter going backwards is ignored");
});

test("series, weekly KPIs, hen-housed eggs, peak, stage, timeline", () => {
  const d = empty(); d.houses = [H1]; d.flocks = [F1];
  d.days = daysRun("2026-03-14", 216, (i) => ({ eggsTotal: i < 28 ? i * 400 : 15000, seconds: 150, floor: 10, dead: 2, waterMeter: 1000000 + i * 2900 }));
  const c = snap(d);
  const s = series(c, F1);
  assert.equal(s.length, 216); assert.equal(s[1].litres, 2900);
  const w = weekly(c, F1);
  assert.equal(w[0].wk, 47); assert.ok(w.find((r) => r.wk === 30).henDay > 90);
  const total = 15000 * 188 + 400 * (27 * 28 / 2);
  assert.equal(henHoused(c, F1), Math.round((total / 16000) * 10) / 10);
  assert.equal(stageOf(c, F1), "lay");
  const tl = timeline(c, F1); assert.deepEqual(tl.map((m) => m.key).slice(0, 4), ["placed", "first", "half", "peak"]);
  assert.match(tl.find((m) => m.key === "depop").label, /Depop wk 59 · 7 Jan/);
  const p = predictHHE(c, F1, 59); assert.ok(p.hhe > henHoused(c, F1)); assert.equal(p.stdRange.length, 2);
  const st = hheStd(standardFor("hyline-brown-2025"), 80); assert.ok(st[0] > 330 && st[1] < 400, `HHE std ${st}`);
  const m = mortality(c, F1); assert.equal(m.weekDeaths, 14); assert.equal(m.cum, Math.round((2 * 216 / 16000) * 1000) / 10);
});

test("feed g/bird/day from bin readings and deliveries", () => {
  const d = empty(); d.houses = [H1]; d.flocks = [{ ...F1, placed: 10000 }];
  d.days = daysRun("2026-10-01", 8, (i) => ({ feed: i === 0 ? { kind: "bin", kg: 8000 } : i === 7 ? { kind: "bin", kg: 6000 } : { kind: "skip" } }));
  d.feedDeliveries = [{ houseId: "h1", date: "2026-10-04", kg: 6400 }];
  const c = snap(d); const fs = feedSeries(c, d.flocks[0]);
  assert.equal(fs.get("2026-10-05").g, Math.round((8400 * 1000) / 70000)); // 120 g
});

test("salmonella: first at 22–26 weeks, then every 15 weeks; positive locks Class B until a negative confirmatory", () => {
  const d = empty(); d.houses = [H1]; d.flocks = [F1];
  let c = snap(d, {}, "2026-04-20T09:00"); // wk 22
  let s = salmonella(c, F1); assert.equal(s.due, "2026-05-16"); assert.equal(s.level, "due");
  c = snap(d, {}, "2026-05-20T09:00"); assert.equal(salmonella(c, F1).level, "late");
  d.salmSamples = [{ flockId: "f1", date: "2026-05-01", sampler: "operator", result: "Negative" }, { flockId: "f1", date: "2026-08-14", sampler: "operator", result: "Negative" }, { flockId: "f1", date: "2026-02-12", sampler: "official", result: "Negative" }];
  c = snap(d); s = salmonella(c, F1); assert.equal(s.due, "2026-11-27"); assert.equal(s.level, "ok"); assert.equal(s.lastOfficial.date, "2026-02-12");
  assert.ok(s.plan.some((p) => p.state === "depop"));
  d.salmSamples.push({ flockId: "f1", date: "2026-10-01", sampler: "operator", result: "S. Enteritidis", resultDate: "2026-10-05" });
  c = snap(d); s = salmonella(c, F1); assert.equal(s.classB, true);
  const lock = classB(d.salmSamples, F1, T); assert.equal(lock.confirmBy, "2026-11-02");
  d.salmSamples.push({ flockId: "f1", date: "2026-10-12", sampler: "official", confirmatory: true, result: "Negative" });
  assert.equal(salmonella(snap(d), F1).classB, false);
  assert.equal(salmonella(snap(d, { smallFlock: true }), F1).exempt, true);
});

test("red mite average, action level, trap grid; egg withdrawal; uniformity; egg mix; feather", () => {
  const d = empty(); d.houses = [H1];
  d.miteScores = [{ houseId: "h1", date: "2026-10-14", traps: [0, 1, 0, 2, 1, 0, 0, 1, 3, 2, 0, 0].map((score, i) => ({ id: "t" + (i + 1), score })) }];
  assert.equal(miteAvg(d.miteScores[0].traps), 0.8);
  assert.equal(mite(snap(d), "h1").over, false); assert.equal(mite(snap(d, { miteAction: 0.5 }), "h1").over, true);
  assert.equal(trapIds({}).ids.length, 12);
  d.medicines = [{ houseId: "h1", date: "2026-10-13", productName: "Flubenvet", eggsOkFrom: "2026-10-23" }];
  assert.equal(eggWithheld(snap(d), "h1").until, "2026-10-23"); assert.equal(eggWithheld(snap(d), "h1", "2026-10-23"), null);
  assert.deepEqual(withdrawalDates("2026-10-13", { doses: 7, intervalDays: 1, eggDays: 0, meatDays: 2 }), { lastDose: "2026-10-19", eggsOkFrom: null, meatOkFrom: "2026-10-21" });
  const u = uniformity([1800, 1900, 2000, 2100, 2200, 1500, 2500]);
  assert.equal(u.mean, 2000); assert.equal(u.uniformity, 71.4); assert.equal(u.cv, 15.8);
  assert.deepEqual(eggMix([50, 55, 60, 65, 75]).mix, { S: 20, M: 40, L: 20, XL: 20 });
  assert.equal(gradeOf(63), "L"); assert.equal(gradeOf(52.9), "S");
  assert.deepEqual(featherScore({ 0: 40, 1: 8, 2: 2 }), { n: 50, good: 80 });
});

test("packer reconciler: mockup week 41 figures and the 0.5% flag", () => {
  assert.equal(lineAmount(11400, 158), 1501); assert.equal(lineAmount(98520, 147), 12068.7);
  const d = empty(); d.days = daysRun("2026-10-05", 7, () => ({ eggsTotal: 191240 / 7 }));
  const c = snap(d);
  assert.equal(weekStart("2026-10-08"), "2026-10-05"); assert.equal(isoWeek("2026-10-08"), 41);
  assert.equal(Math.round(collectedInWeek(c, "2026-10-05")), 191240);
  const lines = [["XL", 11400, 158], ["L", 98520, 147], ["M", 71640, 132], ["S", 4800, 90], ["Seconds", 3600, 40]].map(([grade, eggs, ppd]) => ({ grade, eggs, ppd }));
  const st = { weekStart: "2026-10-05", counted: 189960, grades: lines.map(({ grade, eggs }) => ({ grade, eggs })) };
  const r = reconcile(c, st, { lines, deductions: [{ label: "Levy and transport", amount: 310 }] });
  assert.equal(r.diff, -1280); assert.equal(r.pct, -0.7); assert.equal(r.flag, true);
  assert.equal(r.money.paid, 21620.1); assert.equal(r.money.avgPpd, 136.6);
  d.farmGate = [{ kind: "sale", date: "2026-10-06", eggs: 240 }];
  assert.equal(Math.round(collectedInWeek(snap(d), "2026-10-05")), 191000);
  const mix = sizeMix([st, { weekStart: "2026-09-28", grades: [{ grade: "L", eggs: 50 }, { grade: "M", eggs: 50 }] }]);
  assert.equal(mix.delta.L, Math.round(98520 / 186360 * 100 - 50));
});

test("collections, egg store, farm-gate 28-day stock", () => {
  const d = empty(); d.eggDeliveries = [{ date: "2026-10-10", eggs: 1 }];
  const c = snap(d); assert.deepEqual([collectionGap(c).gap, collectionGap(c).flag], [5, true]);
  assert.equal(nextCollection({ collectionDays: [1, 4] }, T), "2026-10-15"); // Thu
  assert.equal(nextCollection({ collectionDays: [1] }, T), "2026-10-19");
  d.storeTemps = [{ date: T, min: 14, max: 21 }]; assert.equal(storeStatus(snap(d)).over.length, 1);
  d.farmGate = [{ kind: "stock", layDate: "2026-09-10", eggs: 60 }, { kind: "stock", layDate: "2026-10-10", eggs: 90 }, { kind: "sale", date: "2026-10-01", eggs: 30 }];
  const fg = farmGateStock(snap(d)); assert.equal(fg.left, 120); assert.equal(fg.old, 30);
});

test("money per dozen, FCR, margin per bird housed, depop decision", () => {
  const d = empty(); d.houses = [H1]; const f = { ...F1, placed: 1000, placedDate: "2026-10-01" }; d.flocks = [f];
  d.days = daysRun("2026-10-01", 14, () => ({ eggsTotal: 900 }));
  d.feedDeliveries = [{ houseId: "h1", date: "2026-10-02", kg: 1600 }];
  d.samples = [{ flockId: "f1", kind: "eggs", mean: 62.5 }];
  const fin = [{ kind: "revenue", source: "packerStatement", amount: 1400, flockId: "f1" }, { kind: "expense", source: "feed", amount: 480, flockId: "f1" }, { kind: "expense", source: "pullets", amount: 4500, flockId: "f1" }];
  const m = flockMoney(snap(d), f, fin);
  assert.equal(m.dozens, 1050); assert.equal(m.feedPerDozen, 45.7); assert.equal(m.kgPerDozen, 1.52); assert.equal(m.fcr, 2.03);
  assert.equal(m.marginPerBirdHoused, Math.round(((1400 - 4500 - 480) / 1000) * 100) / 100);
  const dd = depopDecision(snap(d), F1, { ppd: 130, feedPerTonne: 320, feedG: 120, fromWk: 76, birds: 15000, ratio: 1 });
  assert.equal(dd[0].margin, 0); assert.ok(dd[1].margin > 0);
});

test("space check, range, dusk, lighting, AI state, bird register", () => {
  let sc = spaceCheck(H1, 15820); assert.equal(sc.ok, true);
  sc = spaceCheck({ ...H1, usableM2: 1700, nests: 2000 }, 15820);
  assert.match(sc.rows.find((r) => r.label === "Stocking").text, /520 hens over 9 per m²/);
  assert.match(sc.rows.find((r) => r.label === "Nests").text, /260 nests short/);
  assert.equal(spaceCheck({ system: 3, usableM2: 1000 }, 15000).ok, false);
  assert.match(spaceCheck({ ...H1, rangeHa: 6 }, 15820).rows.find((r) => r.label === "Range").text, /820 hens over/);
  assert.equal(ukOffsetMin("2026-10-15"), 60); assert.equal(ukOffsetMin("2026-10-26"), 0);
  const ss = sunset("2026-10-15", 54.79, -6.62); assert.ok(ss >= "18:15" && ss <= "18:35", ss);
  const d = empty(); d.houses = [H1]; d.flocks = [F1];
  const c = snap(d);
  const lp = lightPlan(c, F1); assert.equal(lp.template, true); assert.equal(hoursAt(lp, 21), 14);
  assert.deepEqual(darkWarning({ weeks: [{ wk: 30, hours: 17 }] }), [30]);
  const young = { ...F1, hatchDate: "2026-06-04" }; // wk 19 on 15 Oct; wk 20 starts 22 Oct
  assert.equal(nextLightStep(snap(d, {}, "2026-10-20T09:00"), young).hours, 13);
  assert.equal(aiState(c).on, false);
  d.housing = [{ from: "2026-10-10", reason: "AI housing order" }];
  const ai = aiState(snap(d)); assert.equal(ai.on, true); assert.equal(ai.daysHoused, 6);
  assert.deepEqual(birdRegister(snap(d, {}, "2026-06-02T09:00"), 2026), [{ establishmentNo: "1UK9-0412", birds: { h1: 16000 }, total: 16000 }]);
});

test("alerts: spike, lay below band, drop, water, Salmonella, alarm, store, gap, Class B, notice", () => {
  const s = layerSettings({}, {});
  const list = [2, 3, 2, 3, 2, 3, 2, 46].map((dead) => ({ dead }));
  assert.deepEqual(spike(s, list, 7), { n: 46, avg: 2.4, times: 19 });
  assert.equal(spike(s, [1, 1, 1, 1, 1, 1, 1, 9].map((dead) => ({ dead })), 7), null, "under 10 birds is not a spike");
  const below = [0, 1, 2].map((i) => ({ wk: 61, henDay: 86, vs: { pos: "below", gap: 1.0 }, date: "x" + i }));
  assert.equal(layAlert(s, below).level, "due");
  assert.equal(layAlert(s, [{ wk: 40, henDay: 94, vs: { pos: "in" } }, { wk: 40, henDay: 88, vs: { pos: "below", gap: 3.9 } }]).level, "late");
  const d = empty(); d.houses = [H1, { ...H1, id: "h2", name: "House 2" }]; d.flocks = [F1, { ...F1, id: "f2", houseId: "h2", placedDate: "2026-10-25", hatchDate: "2026-06-25" }];
  d.days = daysRun("2026-10-07", 9, (i) => ({ dead: i === 8 ? 40 : 2, eggsTotal: 14000, waterMeter: 1000 * i * (i === 8 ? 0.5 : 1) }));
  d.salmSamples = [{ flockId: "f1", date: "2026-07-03", sampler: "operator", result: "Negative" }];
  d.storeTemps = [{ date: T, min: 15, max: 21 }]; d.eggDeliveries = [{ date: "2026-10-09", eggs: 5 }];
  const keys = layerAlerts(snap(d, {}, T + "T12:00")).map((a) => a.key.split(":")[0]);
  for (const k of ["spike", "salm", "alarm", "store", "gap", "notice"]) assert.ok(keys.includes(k), `alert ${k} in ${keys}`);
  assert.equal(layerAlerts(snap(d, {}, T + "T12:00"))[0].level, "late");
  d.salmSamples.push({ flockId: "f1", date: "2026-10-01", sampler: "operator", result: "S. Typhimurium" });
  const cb = layerAlerts(snap(d)).find((a) => a.key.startsWith("classb")); assert.ok(cb.unsnooze); assert.match(cb.title, /Class B/);
});

test("To do today: sheet, pop-holes, mite day, swabs, packer, store, alarm, depop booking, bird register", () => {
  const d = empty(); d.houses = [H1]; d.flocks = [{ ...F1, plannedDepop: "2026-11-20" }];
  const c = snap(d, { miteDay: 3 }, T + "T08:00"); // Thursday
  const t = todayTasks(c).map((x) => x.key.split(":")[0]);
  for (const k of ["sheet", "pop-open", "mite", "collect", "store", "alarm", "depop", "feather", "weigh"]) assert.ok(t.includes(k), `${k} in ${t}`);
  const later = todayTasks(snap(d, {}, T + "T15:00")).find((x) => x.key.startsWith("pop-close")); assert.match(later.title, /Close pop-holes at dusk \(18:\d\d\)/);
  d.days = [{ houseId: "h1", flockId: "f1", date: T, eggsTotal: 1, popOpen: "08:10" }];
  assert.ok(!todayTasks(snap(d)).some((x) => x.key.startsWith("sheet")));
  assert.ok(todayTasks(snap(d, {}, "2026-05-28T09:00")).some((x) => x.key.startsWith("birdreg")));
  const cc = snap(d); cc.doneKeys = new Set(["alarm:h1:" + T]); assert.ok(!todayTasks(cc).some((x) => x.key.startsWith("alarm")));
});

test("registers print the producer daily record columns; Lion checklist auto-evidence", () => {
  const d = empty(); d.houses = [H1]; d.flocks = [F1];
  d.days = daysRun("2026-10-13", 3, () => ({ eggsTotal: 14000, seconds: 200, floor: 20, dead: 2 }));
  d.eggDeliveries = [{ date: "2026-10-14", eggs: 28000, packer: "Packer", bestBefore: "2026-11-11", grades: [{ grade: "L", eggs: 28000 }] }];
  const c = snap(d);
  const r = buildRegister(c, "production");
  assert.equal(r.rows.length, 3); assert.match(r.top.find((x) => x[0] === "Flocks")[1], /placed 2026-03-14, 16,000 hens, 17 weeks old/);
  assert.match(r.rows.find((x) => x[0] === "2026-10-14")[8], /28000 L · BB 2026-11-11 · Packer/);
  for (const [k] of REGISTERS) assert.ok(buildRegister(c, k).headers.length > 0, `register ${k}`);
  assert.equal(weeklySheet(c, F1).rows.length, 1);
  const ev = evaluate(c, LION_ITEMS); assert.equal(ev.find((x) => x.id === "passport").ok, true); assert.equal(ev.find((x) => x.id === "seVacc").ok, false);
  const ev2 = evaluate(c, LION_ITEMS, { items: { seVacc: { ok: true, note: "seen cert" } } }); assert.equal(ev2.find((x) => x.id === "seVacc").ok, true);
  assert.equal(audits({ internalAudit: "2026-01-10", independentAudit: "2025-01-10" }, T).internalLate, true);
  assert.equal(audits({ independentAudit: "2025-01-10" }, T).independentDue, "2026-07-10");
});

// ---- added 2026-10-26 (resume): controller import, shared farm money, delivery-based feed, passport/inspector packs ----
import { parseCsv, guessMap, toRows, isoDate } from "../../app/js/sectors/layers/model/controller.js";
import { eggShare, birdShare } from "../../app/js/sectors/layers/model/eggs.js";
import { passportDoc, inspectorPack, INSPECTORS } from "../../app/js/sectors/layers/model/registers.js";

test("controller CSV: separators, day-first dates, decimal commas, column guesses", () => {
  const p = parseCsv("Date;Water meter;Temp min;Temp max;Feed kg\n15/10/2026;1284560;18,5;23,9;1880\n16.10.26;1287620;18;24;1900\nTotal;;;;");
  assert.deepEqual(p.headers, ["Date", "Water meter", "Temp min", "Temp max", "Feed kg"]);
  const map = guessMap(p.headers); assert.deepEqual(map, { date: 0, waterMeter: 1, tMin: 2, tMax: 3, feedKg: 4 });
  const rows = toRows(p, map);
  assert.equal(rows.length, 2); // the "Total" line has no date
  assert.deepEqual(rows[0], { date: "2026-10-15", waterMeter: 1284560, tMin: 18.5, tMax: 23.9, feedKg: 1880 });
  assert.equal(rows[1].date, "2026-10-16");
  assert.equal(isoDate("2026-1-5"), "2026-01-05"); assert.equal(isoDate("nonsense"), null);
  assert.deepEqual(parseCsv('a,b\n"1,5",2').rows[0], ["1,5", "2"]);
});

test("feed from deliveries only: each load spread to the next, 7-day average (no lump swings)", () => {
  const d = empty(); d.houses = [H1]; const f = { ...F1, placed: 10000, placedDate: "2026-10-01" }; d.flocks = [f];
  d.days = daysRun("2026-10-01", 21, () => ({}));
  d.feedDeliveries = [0, 5, 10, 15, 20].map((k) => ({ houseId: "h1", date: addDays("2026-10-01", k), kg: 6000 }));
  const fs = feedSeries(snap(d), f);
  const gs = [...fs.values()].map((x) => x.g);
  assert.ok(gs.length >= 10);
  assert.ok(gs.every((g) => g === 120), `steady 1,200 kg/day for 10,000 hens = 120 g, got ${gs.join(",")}`);
});

test("farm-wide statement and bills are shared between flocks; price per dozen from the eggs paid for", () => {
  const d = empty(); d.houses = [H1, { ...H1, id: "h2", name: "House 2" }];
  const fa = { ...F1, id: "fa", placed: 1000, placedDate: "2026-10-01" }, fb = { ...F1, id: "fb", houseId: "h2", placed: 3000, placedDate: "2026-10-01" }; d.flocks = [fa, fb];
  d.days = [...daysRun("2026-10-05", 7, () => ({ flockId: "fa", eggsTotal: 900 })), ...daysRun("2026-10-05", 7, () => ({ flockId: "fb", houseId: "h2", eggsTotal: 2700 }))];
  const c = snap(d);
  assert.equal(eggShare(c, fa, "2026-10-05", "2026-10-11"), 0.25);
  assert.equal(birdShare(c, fb, "2026-10-08"), 0.75);
  const fin = [{ kind: "revenue", source: "packerStatement", amount: 3150, eggs: 25200, weekStart: "2026-10-05", date: "2026-10-11" }, { kind: "expense", source: "energy", amount: 400, date: "2026-10-08" }];
  const m = flockMoney(c, fa, fin);
  assert.equal(m.eggsIncome, 787.5); assert.equal(m.energy, 100);
  assert.equal(m.avgPpd, 150); // £3,150 for 25,200 eggs = 150p a dozen, whatever the flock laid in other weeks
});

test("flock passport pack and inspector packs (Egg Marketing Inspector: production register first)", () => {
  const d = empty(); d.houses = [H1]; d.flocks = [F1];
  d.vaccinations = [{ flockId: "f1", disease: "S. Enteritidis", product: "AviPro", date: "2025-11-22" }, { flockId: "f1", disease: "IB booster", plannedWk: 62 }];
  d.birdMoves = [{ flockId: "f1", date: "2026-03-14", direction: "in", n: 16000, kind: "placement" }];
  const c = snap(d); c.ledger = { farmName: "Drumlin" };
  const p = passportDoc(c, F1);
  assert.deepEqual(p.sections.map((x) => x.title.split(" —")[0]), ["Flock passport", "Vaccinations", "Medicines", "Movements", "Salmonella results"]);
  assert.equal(p.sections[1].rows.length, 1); // planned doses are not on the passport
  assert.equal(p.sections[0].rows[0][0], "Rearer Ltd");
  assert.equal(INSPECTORS.emi.keys[0], "production");
  const pack = inspectorPack(c, "emi"); assert.equal(pack.sections[0].title, "Egg production register");
  assert.ok(inspectorPack(c, "vet").sections.some((x) => x.title === "Mortality at inspection"));
});
