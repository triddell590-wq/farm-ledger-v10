// Sheep ledger model: hand-worked numbers for every calculation and rule in design/11.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sheepSettings, defaultRamsIn, swatch } from "../../app/js/sectors/sheep/model/settings.js";
import { cycleFor, cycleFrom, stageOf, raddleCycles, lambingFromMark, plannedRamsIn } from "../../app/js/sectors/sheep/model/year.js";
import { countsAt, countHistory, totals, ewesToRam, ewesPerRam, ramSummary, mobField } from "../../app/js/sectors/sheep/model/mobs.js";
import { sumLambs, tonight, nightStart, pensInUse, nextFreePen, toWatch, abortionPct, scanTotals, scanPct, barrenPct, funnel, shownFunnel } from "../../app/js/sectors/sheep/model/lambing.js";
import { doseEach, doseBands, totalDose, withdrawalUntil, mobWithdrawal, groupFromProduct, flukeStage, rotation, groupUses, fecVerdict, fecReduction, preDoseFec, drenchChecksDue, lamePct, lastLame, repeatLame, fecDue } from "../../app/js/sectors/sheep/model/health.js";
import { bucket, draftSummary, carcase, growth, draftValue, cullList, replacementsNeeded, flockPlanner, grossMargin, costPerKg, ewesPerHa } from "../../app/js/sectors/sheep/model/selling.js";
import { mealCurve, mealPlan, feedingGroups, bcsSummary } from "../../app/js/sectors/sheep/model/feeding.js";
import { cropTagging, retagsDue, importRetags, quarantines, nextSerial, standstill, restriction, movementChecks, registerLines, toNotify, cprListsDue, inventoryWindow, inventoryPrefill, validCountDate } from "../../app/js/sectors/sheep/model/paperwork.js";
import { sheepAlerts, generatedTasks, todayTasks, overnight } from "../../app/js/sectors/sheep/model/duties.js";
import { fqaStatus } from "../../app/js/sectors/sheep/model/fqa.js";
import { regionRule, useRegionRules, resetRegionRules } from "../../app/js/sectors/sheep/model/region.js";
import { seasonalFor } from "../../app/js/sectors/sheep/model/content.js";

const T = "2026-10-15";
const COLLS = ["mobs", "sheep", "events", "lambings", "lambCrops", "medicines", "movements", "sales", "inventories", "deaths", "diseaseReports", "vetOps", "feedRecords", "tasks", "finance", "notes"];
const empty = () => Object.fromEntries(COLLS.map((k) => [k, []]));
const S = (meta = {}, ob = {}) => sheepSettings({ settings: ob }, meta);
const mob = (id, name, cls, extra = {}) => ({ id, name, class: cls, active: true, ...extra });
const start = (mobId, n, date = "2026-01-01") => ({ id: `cc-${mobId}`, kind: "countCheck", mobId, date, counts: { count: n }, reason: "start" });
function flock() {
  const d = empty();
  d.mobs.push(mob("m1", "Mule ewes 2022", "ewes", { fieldName: "Far Hill" }), mob("m2", "Texel × ewes", "ewes"), mob("r", "Rams", "rams"), mob("el", "Ewe lambs 2026", "eweLambs", { birthYears: [2026] }));
  d.events.push(start("m1", 118), start("m2", 96), start("r", 6), start("el", 46));
  return d;
}
const ctx = (data, meta = { ramsIn: "10-02" }, today = T, now = new Date(`${today}T10:00:00`)) => {
  const s = S(meta); const cy = cycleFor(s, today, data.events); const stage = stageOf(cy, today);
  return { data, s, today, now, lid: "L", cy, stage, counts: countsAt(data), store: [], doneKeys: new Set(), keeper: {} };
};

// ---------- settings and the sheep year ----------
test("settings: defaults, onboarding answers, rams in from the lambing month", () => {
  const s = S(); assert.equal(s.ramsIn, "10-15"); assert.equal(s.gestation, 147); assert.equal(s.draftKg, 42); assert.equal(s.koPct, 45); assert.equal(s.maxCarcase, 21.5); assert.equal(s.fecThreshold, 500);
  assert.equal(S({}, { terrain: "Hill" }).flockType, "hill"); assert.equal(S({}, { terrain: "Hill" }).ramsIn, "11-15");
  // lambing starts 6 March → rams in 142 days earlier = 15 October
  assert.equal(defaultRamsIn("lowland", "3"), "10-15");
  assert.equal(S({ flockNo: "654321" }).flockNo, "654321");
  assert.equal(swatch("Red"), "#C8352B"); assert.equal(swatch("Mauve"), "#888");
});

test("sheep year: one rams-in date drives every stage", () => {
  const s = S({ ramsIn: "10-15" });
  assert.equal(plannedRamsIn(s, "2026-10-20"), "2026-10-15"); assert.equal(plannedRamsIn(s, "2026-09-01"), "2025-10-15");
  const cy = cycleFor(s, "2026-10-20", []);
  assert.equal(cy.ramsIn, "2026-10-15"); assert.equal(cy.ramsOut, "2026-11-20"); // + 36 days = design default 20 Nov
  assert.equal(cy.scanFrom, "2027-01-03"); assert.equal(cy.scanTo, "2027-01-23"); // + 80 / + 100
  assert.equal(cy.lambFrom, "2027-03-06"); assert.equal(cy.lambTo, "2027-04-21"); // ramsIn + 142, ramsOut + 152
  assert.equal(cy.weaning, "2027-06-14"); assert.equal(cy.crop, 2027); assert.equal(cy.nextRamsIn, "2027-10-15");
  assert.equal(stageOf(cy, "2026-10-20").stage, "tupping"); assert.equal(stageOf(cy, "2026-10-20").day, 6);
  assert.equal(stageOf(cy, "2026-12-01").stage, "scanning"); assert.equal(stageOf(cy, "2027-03-10").stage, "lambing");
  assert.equal(stageOf(cy, "2027-05-01").stage, "grazing"); assert.equal(stageOf(cy, "2027-08-01").stage, "weaning");
  // an actual rams-in event moves the year; a rams-out event ends tupping
  const ev = [{ kind: "ramsIn", date: "2026-10-02" }, { kind: "ramsOut", date: "2026-11-10" }];
  const c2 = cycleFor(s, T, ev); assert.equal(c2.ramsIn, "2026-10-02"); assert.equal(c2.actual, true); assert.equal(c2.ramsOut, "2026-11-10"); assert.equal(c2.ramsOutActual, true);
  // early rams-in up to 30 days before the planned date starts the new cycle
  const c3 = cycleFor(s, "2027-09-25", [{ kind: "ramsIn", date: "2027-09-20" }]); assert.equal(c3.ramsIn, "2027-09-20");
});

test("raddle: one colour per 17 days, lambing window = mark + 142 … + 152", () => {
  const s = S({ ramsIn: "10-02" }); const cy = cycleFrom("2026-10-02", s);
  const rc = raddleCycles(cy, s, T);
  assert.deepEqual(rc.cycles.map((c) => c.colour), ["Yellow", "Red", "Blue"]); // 36 days of tupping → 3 cycles
  assert.equal(rc.current.colour, "Yellow"); assert.equal(rc.next.colour, "Red"); assert.equal(rc.nextChange, "2026-10-19");
  assert.equal(rc.cycles[0].lambFrom, "2027-02-21"); assert.equal(rc.cycles[0].lambTo, "2027-03-19"); // 2–18 Oct: + 142 … + 152
  assert.deepEqual(lambingFromMark("2026-10-02"), { from: "2027-02-21", peak: "2027-02-26", to: "2027-03-03" });
  assert.equal(lambingFromMark("2026-10-02", 144).peak, "2027-02-23"); // prolific
  const s2 = S({ ramsIn: "10-02", raddleOrder: ["Red", "Blue"] }); assert.deepEqual(raddleCycles(cy, s2, T).cycles.map((c) => c.colour), ["Red", "Blue"]);
});

// ---------- mobs and counts ----------
test("mob counts are derived from records: births when tagged, deaths, sales, splits, merges, count checks", () => {
  const d = flock();
  d.lambCrops.push({ year: 2026, taggings: [{ date: "2026-04-10", mobId: "el", count: 4 }] });
  d.deaths.push({ id: "d1", date: "2026-05-01", mobId: "m1", number: 2 });
  d.movements.push({ id: "mv1", kind: "off", date: "2026-08-01", mobId: "m2", count: 10 }, { id: "mv2", kind: "on", date: "2026-08-20", mobId: "m2", count: 20 });
  d.events.push({ id: "sp", kind: "split", mobId: "m1", toMobId: "m2", date: "2026-09-01", counts: { n: 16 } });
  let c = countsAt(d);
  assert.equal(c.get("m1"), 100); assert.equal(c.get("m2"), 122); assert.equal(c.get("el"), 50);
  assert.equal(countsAt(d, "2026-07-31").get("m2"), 96);
  d.events.push({ id: "cc", kind: "countCheck", mobId: "m1", date: "2026-09-10", counts: { count: 99 }, reason: "strayed" });
  d.events.push({ id: "mg", kind: "merge", mobId: "el", toMobId: "m2", date: "2026-09-20" });
  c = countsAt(d); assert.equal(c.get("m1"), 99); assert.equal(c.get("el"), 0); assert.equal(c.get("m2"), 172);
  const h = countHistory(d, "m1"); assert.deepEqual(h.map((x) => x.count), [118, 116, 100, 99]);
  const t = totals({ mobs: d.mobs.filter((m) => m.id !== "el") }, c); assert.equal(t.ewes, 271); assert.equal(t.rams, 6); assert.equal(t.mobs, 3);
});

test("ewes to the ram, ewes per ram against 1:40 / 1:25, ram summary, mob field", () => {
  const d = flock(); const s = S({ ramsIn: "10-02" }); const cy = cycleFrom("2026-10-02", s);
  assert.equal(ewesToRam(d, cy), 214); // every ewe mob when nothing recorded
  d.events.push({ id: "rd", kind: "raddle", mobId: "m1", date: "2026-10-10", counts: { colour: "Yellow", newlyMarked: 40 } });
  assert.equal(ewesToRam(d, cy), 118); // only mobs with a raddle record in the cycle
  assert.deepEqual(ewesPerRam(240, { mature: 6, ramLambs: 0 }, s), { ratio: 40, ok: true, capacity: 240 });
  assert.equal(ewesPerRam(260, { mature: 4, ramLambs: 2 }, s).ok, false); // 4×40 + 2×25 = 210
  assert.equal(ewesPerRam(100, { mature: 0, ramLambs: 0 }, s).ratio, null);
  d.sheep.push({ id: "x1", class: "ram", resting: true, mot: [{ date: "2026-09-14", ok: true }] }, { id: "x2", class: "ram", ramLamb: true, mot: [{ date: "2026-09-10", ok: true }] });
  const r = ramSummary(d); assert.equal(r.total, 6); assert.equal(r.resting, 1); assert.equal(r.working, 5); assert.equal(r.ramLambs, 1); assert.equal(r.lastMot, "2026-09-14"); assert.equal(r.allMotOk, true);
  assert.deepEqual(mobField(d, d.mobs[0]), { name: "Far Hill", since: null });
  d.events.push({ kind: "fieldMove", mobId: "m1", toField: "Low field", date: "2026-10-12" }); assert.deepEqual(mobField(d, d.mobs[0]), { name: "Low field", since: "2026-10-12" });
});

// ---------- lambing shed, pens, the funnel ----------
const lb = (dt, lambs, extra = {}) => ({ id: dt, datetime: dt, lambs: lambs.map((a) => (typeof a === "object" ? a : { alive: a, sex: "F" })), help: "none", ...extra });
test("lambing: season sums, tonight's running total from 18:00, pens ready at 24 h and turn out at 48 h", () => {
  const list = [lb("2027-03-10T02:00:00", [true, true]), lb("2027-03-10T03:12:00", [true, false], { help: "assisted", problems: ["No milk"] }), lb("2027-03-09T15:00:00", [true]), { id: "ab", datetime: "2027-03-10T04:00:00", aborted: true }];
  const sm = sumLambs(list); assert.deepEqual([sm.ewes, sm.born, sm.alive, sm.dead, sm.aborted, sm.assisted, sm.perEwe, sm.deadPct], [3, 5, 4, 1, 1, 1, 1.67, 20]);
  // fostered-on lambs count once, with their own mother
  assert.equal(sumLambs([lb("x", [true, { alive: true, fosteredFrom: "y" }])]).born, 1);
  const now = new Date("2027-03-10T05:00:00");
  assert.equal(nightStart(now).toISOString(), new Date("2027-03-09T18:00:00").toISOString());
  const t = tonight({ lambings: list }, now); assert.equal(t.ewes, 2); assert.equal(t.born, 4); assert.equal(t.dead, 1);
  const pens = { lambings: [lb("2027-03-08T04:00:00", [true], { pen: 1, penIn: "2027-03-08T04:00:00" }), lb("2027-03-09T04:00:00", [true], { pen: 3, penIn: "2027-03-09T04:00:00" }), lb("2027-03-10T04:00:00", [true], { pen: 2, penIn: "2027-03-10T04:00:00", penOut: "2027-03-10T05:00:00" })] };
  const p = pensInUse(pens, now); assert.deepEqual(p.map((x) => [x.pen, x.hours, x.ready, x.turnOut]), [[1, 49, true, true], [3, 25, true, false]]);
  assert.equal(nextFreePen(pens, now, 12), 2); assert.equal(toWatch({ lambings: list }).length, 1);
});

test("funnel: ewes → scanned → born alive → 48 h → turned out → weaned → sold; losses are (previous − this) ÷ previous", () => {
  const d = flock(); const s = S({ ramsIn: "10-02" }); const cy = cycleFrom("2026-10-02", s);
  d.events.push({ kind: "ramsIn", mobIds: ["m1", "m2"], mobId: "r", date: "2026-10-02" });
  d.events.push({ kind: "scan", mobId: "m1", date: "2027-01-05", counts: { empty: 3, single: 22, twin: 84, triplet: 9 } });
  d.events.push({ kind: "scan", mobId: "m2", date: "2027-01-05", counts: { empty: 6, single: 30, twin: 56, triplet: 4 } });
  const t = scanTotals(d, cy); assert.equal(t.scanned, 214); assert.equal(t.lambs, 52 + 280 + 39); // 371
  assert.equal(scanPct(t.lambs, 214), 173); assert.equal(barrenPct(9, 214), 4.2);
  // 200 ewes lambed: 360 born alive, 10 dead at birth
  for (let i = 0; i < 160; i++) d.lambings.push(lb(`2027-03-${String(1 + (i % 20)).padStart(2, "0")}T0${i % 9}:00:00`, [true, true]));
  for (let i = 0; i < 40; i++) d.lambings.push(lb(`2027-03-${String(1 + (i % 20)).padStart(2, "0")}T1${i % 9}:00:00`, i < 10 ? [true, false] : [true]));
  d.deaths.push({ date: "2027-03-05", lamb: true, ageBand: "<48h", number: 8 }, { date: "2027-03-12", lamb: true, ageBand: "2-7d", number: 4 }, { date: "2027-05-01", lamb: true, ageBand: "older", number: 6 });
  d.events.push({ kind: "wean", date: "2027-06-20", counts: { weaned: 335 } });
  d.mobs.push(mob("k", "Ewe lambs 2027", "eweLambs", { birthYears: [2027] })); d.events.push(start("k", 40, "2027-07-01"));
  d.movements.push({ kind: "off", lambs: true, crop: 2027, date: "2027-06-25", count: 30 });
  const f = funnel(d, cy, "2027-07-01");
  assert.deepEqual(f.steps.map((x) => x.n), [214, 371, 360, 352, 348, 335, 70]); // sold 30 + kept 40
  assert.equal(f.steps[1].pct, 173); assert.equal(f.steps[2].pct, 168); assert.equal(f.steps[5].pct, 157);
  assert.deepEqual(f.steps[2].loss, { n: 11, pct: 3, label: "lost scan → birth" });
  assert.equal(f.steps[5].loss.n, 13); assert.equal(f.totalLoss, 9.7); // (371 − 335) ÷ 371
  assert.equal(abortionPct(d, cy).pct, 0);
});

// ---------- health ----------
test("doses: to the heaviest, bands, totals, withdrawal, wormer group from product, rotation", () => {
  assert.equal(doseEach(42, 1, 5), 8.4); assert.equal(doseEach(43, 1, 5), 8.6); assert.equal(doseEach(41, 2.5, 10), 10.3); assert.equal(doseEach(0, 1, 5), 0);
  assert.equal(totalDose(46, 8.4), 386.4);
  assert.deepEqual(doseBands([{ from: 20, to: 30, n: 10 }, { from: 30, to: 40, n: 0 }, { from: 40, to: 50, n: 5 }], 1, 5), [{ from: 20, to: 30, n: 10, each: 6, total: 60 }, { from: 40, to: 50, n: 5, each: 10, total: 50 }]);
  assert.equal(withdrawalUntil({ date: "2026-10-14", wdMeatDays: 14 }), "2026-10-28");
  assert.equal(groupFromProduct("Cydectin 0.1% oral"), "3-ML"); assert.equal(groupFromProduct("Levacide"), "2-LV"); assert.equal(groupFromProduct("Zolvix"), "4-AD"); assert.equal(groupFromProduct("Startect"), "5-SI"); assert.equal(groupFromProduct("Albenzole"), "1-BZ"); assert.equal(groupFromProduct("Heptavac P Plus"), null);
  assert.match(flukeStage("Fasinex 240"), /early immature/); assert.match(flukeStage("Zanil"), /adult fluke only/);
  const d = { medicines: [{ id: "a", mobId: "el", date: "2026-10-14", wdMeatDays: 14, wormerGroup: "3-ML" }, { id: "b", mobId: "el", date: "2026-06-01", wdMeatDays: 28, wormerGroup: "3-ML" }, { id: "c", mobId: "m1", date: "2026-05-01", wormerGroup: "1-BZ" }] };
  assert.equal(mobWithdrawal(d, "el", T).until, "2026-10-28"); assert.equal(mobWithdrawal(d, "m1", T), null);
  assert.equal(groupUses(d, "el", "3-ML", 2026), 2); assert.deepEqual(rotation(d, 2026), { "1-BZ": 1, "2-LV": 0, "3-ML": 2, "4-AD": 0, "5-SI": 0 });
});

test("FEC: threshold verdict, reduction test (95%), drench check due 7–14 days after a wormer", () => {
  assert.equal(fecVerdict(650, 500).dose, true); assert.equal(fecVerdict(400, 500).text, "Not yet — test again in 3–4 weeks"); assert.equal(fecVerdict("", 500), null);
  assert.deepEqual(fecReduction(800, 144), { pct: 82, ok: false }); assert.deepEqual(fecReduction(800, 0), { pct: 100, ok: true }); assert.equal(fecReduction(0, 10), null);
  const d = { medicines: [{ id: "w", mobId: "el", date: "2026-10-01", reason: "Worms", wormerGroup: "3-ML" }], events: [{ id: "f0", kind: "fec", mobId: "el", date: "2026-09-25", counts: { strongyle: 800 } }] };
  assert.equal(preDoseFec(d, d.medicines[0]).id, "f0");
  assert.deepEqual(drenchChecksDue(d, S(), T).map((x) => x.due), ["2026-10-11"]);
  d.events.push({ kind: "fec", mobId: "el", date: "2026-10-11", counts: { strongyle: 144 }, postDoseOf: "w" });
  assert.equal(drenchChecksDue(d, S(), T).length, 0);
  assert.equal(fecDue({ events: [] }, "el", "2026-06-01"), true); assert.equal(fecDue({ events: [] }, "el", "2026-12-01"), false);
});

test("lameness: % against 2%, repeat lame twice in a season → cull flag", () => {
  assert.equal(lamePct(2, 118), 1.7); assert.equal(lamePct(4, 118), 3.4); assert.equal(lamePct(1, 0), 0);
  const d = { events: [{ kind: "lame", mobId: "m1", date: "2026-05-01", counts: { lame: 2, outOf: 118, individuals: [{ tag: "XI 0654321 01234" }] } }, { kind: "lame", mobId: "m1", date: "2026-08-01", counts: { lame: 4, outOf: 118, individuals: [{ tag: "XI 0654321 01234" }] } }], medicines: [] };
  assert.equal(lastLame(d, "m1").pct, 3.4); assert.deepEqual(repeatLame(d, T), [{ tag: "XI 0654321 01234", times: 2 }]);
  assert.deepEqual(repeatLame(d, "2027-07-01"), []); // the May check has dropped out of the 12 months
});

// ---------- selling, culls, money ----------
test("drafting: buckets (≥ 42 kg sell now, within 3 kg 1–2 weeks), carcase at KO%, over-weight risk, growth, value", () => {
  const s = S();
  assert.equal(bucket(42, s), "now"); assert.equal(bucket(43, s, false), "soon"); assert.equal(bucket(39, s), "soon"); assert.equal(bucket(38.9, s), "keep");
  assert.equal(carcase(42, 45), 18.9);
  const sm = draftSummary([{ kg: 44 }, { kg: 50 }, { kg: 40 }, { kg: 30 }, { kg: 0 }], s);
  assert.deepEqual([sm.now, sm.soon, sm.keep, sm.n, sm.avg, sm.avgCarcase, sm.overMax], [2, 1, 1, 4, 41, 18.5, 1]); // 50 kg → 22.5 kg > 21.5
  assert.equal(growth(19.2, 56, 4.5), 263); assert.equal(growth(10, 0), null);
  assert.deepEqual(draftValue(42, 45, 680), { carcase: 18.9, value: 128.52 });
});

test("cull list, replacements, flock planner, gross margin per ewe, cost per kg, ewes per ha", () => {
  const cy = cycleFrom("2026-10-02", S());
  const d = { sheep: [{ id: "e1", tag: "A", cullFlags: [{ reason: "Mastitis", date: "2027-03-12" }] }], events: [{ kind: "cullCheck", date: "2027-07-20", counts: { reasons: { Teeth: 6, Teats: 4 } } }, { kind: "scan", date: "2027-01-05", cullEmpties: true, counts: { empty: 3 } }], lambings: [{ datetime: "2027-03-10T02:00", problems: ["Prolapse"] }] };
  const cl = cullList(d, cy, [{ tag: "B", times: 2 }]);
  assert.equal(cl.total, 16); assert.deepEqual(cl.byReason, { Mastitis: 1, "Repeat lame": 1, Teeth: 6, Teats: 4, Prolapse: 1, Empty: 3 });
  assert.equal(replacementsNeeded({ ewes: 240, culls: 14, deaths: 6, target: 250, eweLambsKept: 12 }), 18);
  assert.deepEqual(flockPlanner(250, 240, 20, 4), { culls: 48, deaths: 10, replacements: 68 });
  const gm = grossMargin([{ kind: "revenue", category: "Livestock Sales", amount: 20000, note: "100 lambs" }, { kind: "revenue", category: "Livestock Sales", amount: 3000, note: "Cull ewes: 30 sheep" }, { kind: "revenue", category: "Other Income", amount: 500, note: "Wool cheque" }, { kind: "revenue", category: "Subsidy", amount: 1500 }, { kind: "expense", category: "Feed", amount: 5000 }], 200);
  assert.deepEqual(gm.lines, { lambs: 20000, culls: 3000, wool: 500, schemes: 1500, other: 0 }); assert.equal(gm.perEwe, 100);
  assert.equal(costPerKg(5000, 1900), 2.63); assert.equal(costPerKg(5000, 0), null); assert.equal(ewesPerHa(240, 29), 8.3);
});

// ---------- feeding ----------
test("late-pregnancy meal planner and BCS summary", () => {
  assert.deepEqual(mealCurve({ weeks: 6, peak: 0.7 }), [0.2, 0.3, 0.4, 0.5, 0.6, 0.7]); assert.deepEqual(mealCurve({ weeks: 1, peak: 0.5 }), [0.5]);
  const p = mealPlan({ single: 52, twin: 158, triplet: 21 }, "2027-03-06", S());
  assert.equal(p.rows.length, 8); assert.equal(p.start, "2027-01-09"); // triplets fed 8 weeks
  // singles 4 wk (0.2,0.3,0.4,0.5)=1.4 kg/day-weeks ×52 ×7; twins 6 wk sum 2.7 ×158 ×7; triplets 8 wk sum 4.4 ×21 ×7
  assert.equal(p.totalKg, 4143); assert.equal(p.tonnes, 4.1); assert.equal(p.cost, 1450); // (1.4×52 + 2.7×158 + 4.4×21) × 7 = 4142.6 kg at £350/t
  assert.deepEqual(feedingGroups({ empty: 9, single: 52, twin: 158, triplet: 0 }).map((g) => g.name), ["Singles", "Twins", "Empty"]);
  assert.deepEqual(bcsSummary({ 2: 4, 2.5: 20, 3: 60, 3.5: 30, 4: 4 }, [3, 3.5]), { n: 118, avg: 3, onPct: 76, thin: 24 });
});

// ---------- paperwork ----------
test("tagging: tag by earliest birth + 9 months (6 if housed/milked), untagged count, replacement and GB re-tag deadlines", () => {
  const d = flock(); const cy = cycleFrom("2026-10-02", S());
  d.lambings.push(lb("2027-02-20T03:00:00", [true, true]), lb("2027-03-01T03:00:00", [true, false]));
  d.deaths.push({ date: "2027-03-02", lamb: true, ageBand: "<48h", number: 1 });
  d.lambCrops.push({ year: 2027, taggings: [{ date: "2027-05-01", count: 1, mobId: "el" }] });
  const t = cropTagging(d, cy, S()); assert.deepEqual([t.born, t.died, t.tagged, t.untagged, t.earliest, t.tagBy], [3, 1, 1, 1, "2027-02-20", "2027-11-20"]);
  assert.equal(cropTagging(d, cy, S({ housedOrMilked: true })).tagBy, "2027-08-20");
  assert.equal(retagsDue({ events: [{ kind: "tagLost", date: "2026-10-07", tag: "X" }] })[0].due, "2026-11-04");
  assert.equal(importRetags({ movements: [{ kind: "on", fromGB: true, date: "2026-10-14", count: 20 }] })[0].due, "2026-11-03");
  assert.equal(quarantines({ movements: [{ kind: "on", date: "2026-10-01" }] }, S(), T)[0].until, "2026-10-29");
});

test("movements: serials, 6-day standstill, restriction, untagged lambs, withdrawal, 65 km", () => {
  const d = flock();
  assert.equal(nextSerial(d, "654321", "2026-10-15"), "FL-654321-2026-0001");
  d.movements.push({ id: "on1", kind: "on", mobId: "m2", date: "2026-10-10", count: 20, fromMarket: true, docSerial: "X" });
  assert.equal(nextSerial(d, "654321", "2026-10-15"), "FL-654321-2026-0002");
  assert.deepEqual(standstill(d, "m2", T), { since: "2026-10-10", until: "2026-10-17", fromMarket: true, days: 6 });
  assert.equal(standstill(d, "m2", "2026-10-16"), null);
  const cy = cycleFrom("2026-10-02", S()); const s = S();
  let ch = movementChecks(d, cy, s, { mob: d.mobs[1], count: 10, date: T, dest: "market" }, 0);
  assert.deepEqual(ch.map((c) => [c.level, c.key]), [["block", "standstill"]]);
  assert.match(ch[0].text, /were at a market on 2026-10-10\. They can't go to a market until 2026-10-17/);
  assert.equal(movementChecks(d, cy, s, { mob: d.mobs[1], date: T, dest: "abattoir" }, 0).length, 0); // direct to slaughter
  ch = movementChecks(d, cy, s, { mob: { id: "x", class: "ewesWithLambs" }, date: T, dest: "farm", km: 80 }, 46);
  assert.deepEqual(ch.map((c) => c.key), ["untagged", "km"]); assert.match(ch[0].text, /46 lambs aren't tagged yet/);
  d.medicines.push({ mobId: "m1", date: "2026-10-14", wdMeatDays: 14 });
  assert.equal(movementChecks(d, cy, s, { mob: d.mobs[0], date: T, dest: "abattoir" }, 0)[0].key, "withdrawal");
  d.diseaseReports.push({ id: "dr", disease: "scab", date: "2026-10-14" });
  assert.equal(restriction(d).id, "dr"); assert.equal(movementChecks(d, cy, s, { mob: d.mobs[0], date: T, dest: "farm" }, 0)[0].key, "restricted");
  d.diseaseReports[0].clearedOn = T; assert.equal(restriction(d), null);
});

test("flock register: lines in date order, CPR moves keep a list, late entries flagged; notify and CPR photo deadlines", () => {
  const d = empty();
  d.lambCrops.push({ year: 2026, taggings: [{ date: "2026-05-01", count: 46, tagFrom: "XI 0654321 00101", tagTo: "XI 0654321 00146", enteredOn: "2026-05-12" }] });
  d.movements.push({ id: "o", kind: "off", date: "2026-09-02", count: 32, dest: "abattoir", otherName: "Linden Foods", docSerial: "FL-654321-2026-0001", cprList: true, createdAt: "2026-09-02T10:00:00Z" });
  d.deaths.push({ id: "x", date: "2026-06-01", number: 1, tag: "XI 1", createdAt: "2026-06-20T10:00:00Z" }, { id: "y", date: "2026-04-01", lamb: true, number: 1 });
  d.inventories.push({ countDate: "2025-12-03", total: 292 });
  const L = registerLines(d);
  assert.deepEqual(L.map((l) => [l.date, l.event, l.number, l.late]), [["2025-12-03", "inventory", 292, undefined], ["2026-05-01", "born", 46, true], ["2026-06-01", "died", 1, true], ["2026-09-02", "off", 32, false]]);
  assert.equal(L[3].tags, "CPR list kept"); assert.equal(L[3].serial, "FL-654321-2026-0001");
  assert.equal(toNotify(d)[0].due, "2026-09-09"); assert.equal(cprListsDue(d)[0].due, "2026-09-04");
});

test("annual inventory: count 1–5 December, info from 15 Nov, return deadline from the yearly setting", () => {
  const w = inventoryWindow("2026-11-20", S({ inventoryDeadline: "2026-12-30" }));
  assert.deepEqual(w, { year: 2026, infoFrom: "2026-11-15", from: "2026-12-01", to: "2026-12-05", deadline: "2026-12-30" });
  assert.equal(inventoryWindow("2027-01-10", S()).year, 2026); // January belongs to last December's count
  assert.equal(inventoryWindow("2026-11-20", S({ inventoryDeadline: "2025-12-30" })).deadline, null); // last year's date ignored
  assert.equal(validCountDate("2026-12-03", T, S()), true); assert.equal(validCountDate("2026-12-06", T, S()), false);
  const d = flock(); assert.deepEqual(inventoryPrefill(d.mobs, countsAt(d)), { ewes: 214, rams: 6, otherAdults: 0, lambs: 46, goats: 0 });
});

test("region rules are read from content records (NI), replaceable by the content bundle", () => {
  assert.equal(regionRule("marketStandstill").days, 6); assert.equal(regionRule("sheepTagging").tagByMonths, 9); assert.equal(regionRule("sheepTagging", "GB"), null);
  useRegionRules([{ region: "NI", key: "marketStandstill", status: "in force", values: { days: 13 } }]);
  assert.equal(regionRule("marketStandstill").days, 13); assert.equal(regionRule("sheepTagging").tagByMonths, 9); // one record replaced, the rest kept
  useRegionRules([{ region: "NI", key: "sheepTagging", status: "withdrawn", values: {} }]); assert.equal(regionRule("sheepTagging"), null);
  resetRegionRules(); assert.equal(regionRule("marketStandstill").days, 6); assert.equal(regionRule("sheepTagging").tagByMonths, 9);
  assert.equal(seasonalFor("2026-04-10").map((x) => x.key).join(), "nematodirus"); assert.deepEqual(seasonalFor("2026-10-10").map((x) => x.key), ["fluke"]);
});

// ---------- alerts and jobs ----------
test("alerts: withdrawal, standstill-free, first cycle < 60% at day 17, lame > 2%, FEC, scab restriction, TSE, inventory", () => {
  const d = flock();
  d.events.push({ kind: "ramsIn", mobIds: ["m1", "m2"], date: "2026-10-02" }, { kind: "raddle", mobId: "m1", date: "2026-10-10", counts: { colour: "Yellow", newlyMarked: 100 } });
  d.events.push({ id: "lc", kind: "lame", mobId: "m1", date: "2026-10-14", counts: { lame: 4, outOf: 118, individuals: [] } });
  d.events.push({ id: "fe", kind: "fec", mobId: "el", date: "2026-10-12", counts: { strongyle: 900 } });
  d.medicines.push({ mobId: "m2", date: "2026-10-10", wdMeatDays: 14, productName: "X" });
  d.deaths.push({ id: "dd", date: "2026-10-18", over18m: true, mobName: "Mule ewes 2022" });
  d.diseaseReports.push({ id: "sc", disease: "scab", date: "2026-10-14" });
  const c = ctx(d, { ramsIn: "10-02" }, "2026-10-19"); // day 18 of tupping
  const a = sheepAlerts(c); const keys = a.map((x) => x.key);
  for (const k of ["restricted", "wd:m2", "tse:dd", "firstcycle", "lame:m1", "fec:fe", "disease"]) assert.ok(keys.includes(k), k);
  assert.match(a.find((x) => x.key === "firstcycle").title, /Only 47% of ewes marked/); // 100 of 214
  assert.equal(a[0].level, "late"); assert.ok(a.find((x) => x.key === "lame:m1").title.includes("3.4% lame"));
  const inv = sheepAlerts(ctx(flock(), { ramsIn: "10-02", inventoryDeadline: "2026-12-30" }, "2026-12-02")).find((x) => x.key === "inv");
  assert.equal(inv.level, "due"); assert.match(inv.title, /between 1 and 5 December/);
});

test("today's jobs: raddle change, rams out, tag-by, notify, quarantine, drench check, pens to turn out; ticked jobs drop", () => {
  const d = flock();
  d.events.push({ kind: "ramsIn", mobIds: ["m1"], date: "2026-10-02" });
  d.movements.push({ id: "q", kind: "on", date: "2026-10-14", count: 20, mobId: "m2", mobName: "Texel shearlings" });
  d.medicines.push({ id: "w", mobId: "el", date: "2026-10-05", reason: "Worms", wormerGroup: "3-ML" });
  const c = ctx(d, { ramsIn: "10-02" }, "2026-10-18");
  const all = generatedTasks(c); const keys = all.map((t) => t.key);
  assert.ok(keys.includes("raddle:2026-10-19")); assert.equal(all.find((t) => t.key === "raddle:2026-10-19").title, "Change raddle: Yellow → Red");
  const today = todayTasks(c, new Set()); const tk = today.map((t) => t.key);
  for (const k of ["raddle:2026-10-19", "notify:q", "qdose:q", "qscab:q", "qfoot:q", "drench:w"]) assert.ok(tk.includes(k), k);
  assert.ok(!todayTasks(c, new Set(["notify:q"])).some((t) => t.key === "notify:q"));
  const pens = flock(); pens.lambings.push(lb("2027-03-08T04:00:00", [true, true], { pen: 4, penIn: "2027-03-08T04:00:00", mobName: "Mule ewe" }));
  const pc = ctx(pens, { ramsIn: "10-02" }, "2027-03-10", new Date("2027-03-10T06:00:00"));
  assert.equal(todayTasks(pc, new Set()).find((t) => t.key.startsWith("pen:")).title, "Pen 4: Mule ewe + 2 ready to turn out (48 h)");
  assert.equal(overnight({ ...pc, data: { lambings: [lb("2027-03-10T02:00:00", [true, false], { problems: ["No milk"] })] } }), "Overnight: 1 ewe lambed, 2 lambs, 1 dead, 0 fostered, 1 to watch.");
});

test("FQAS self-check: auto items from the records, dated items go stale after 12 months", () => {
  const d = flock(); const c = ctx(d, { ramsIn: "10-02" });
  let st = fqaStatus(c, {}); const reg = st.items.find((i) => i.id === "register"); assert.equal(reg.res.status, "ok");
  assert.equal(st.items.find((i) => i.id === "vmrusage").res.status, "warn");
  d.medicines.push({ kind: "use", date: "2026-10-01", productName: "Cydectin", numberTreated: 46, wdMeatDays: 14, givenBy: "Seán" }, { kind: "use", date: "2026-10-02", productName: "Y" });
  st = fqaStatus(ctx(d), {}); assert.equal(st.items.find((i) => i.id === "vmrusage").res.status, "fail");
  st = fqaStatus(ctx(d), { ahp: { date: "2025-09-01" }, medstore: { done: true } });
  assert.equal(st.items.find((i) => i.id === "ahp").res.status, "warn"); assert.equal(st.items.find((i) => i.id === "medstore").res.status, "ok");
  assert.ok(st.pct > 0 && st.pct < 100);
});

test("funnel shown in tupping: last year's crop, compared with the crop before it (not the new one)", () => {
  const s = { ramsIn: "10-15", gestation: 147, weaningDays: 100 };
  const mobs = [{ id: "e", class: "ewes", name: "Ewes" }];
  const data = { mobs, events: [{ kind: "countCheck", mobId: "e", date: "2023-09-01", counts: { count: 100 } },
    { kind: "scan", mobId: "e", date: "2025-01-10", counts: { single: 20, twin: 70, triplet: 5, empty: 5 } },
    { kind: "scan", mobId: "e", date: "2026-01-10", counts: { single: 25, twin: 65, triplet: 4, empty: 6 } }],
    lambings: [], deaths: [], movements: [], lambCrops: [] };
  const today = "2026-10-25";
  const cy = cycleFor(s, today, data.events); const prev = cycleFor(s, "2026-10-14", data.events); const older = cycleFor(s, "2025-10-14", data.events);
  const sf = shownFunnel(data, cy, prev, today, older);
  assert.equal(sf.main.crop, 2026); assert.equal(sf.other.crop, 2025);
  assert.equal(sf.other.steps[1].n, 20 + 140 + 15);
  assert.equal(shownFunnel(data, cy, prev, today).other.crop, 2027);
  assert.equal(funnel(data, cycleFor(s, "2024-10-14", data.events), today).enough, false); // a year with only ewes is not a funnel (no weaning guessed without lambings) // old call shape still works
});
