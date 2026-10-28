// Pigs ledger model: hand-worked numbers for every calculation and rule in design/13.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pigSettings, tabSetFor } from "../../app/js/sectors/pigs/model/settings.js";
import { isoWeek, weekStart, weekDates, weekIndex, batchDates, isServeWeek, plan, serveTarget } from "../../app/js/sectors/pigs/model/weeks.js";
import { batchFacts, feedFor, withdrawalEnd, shipBlocked, feedWithdrawCheck, readyToShip, closeSummary, nextBatchNo } from "../../app/js/sectors/pigs/model/batches.js";
import { spacePerPig, breederSpace, pigsAllowed, spaceBadge, penChecks, washState, canFill, waterChange, waterAlert, tailBiteRepeat, alarmState, issuePens } from "../../app/js/sectors/pigs/model/rooms.js";
import { aliveNow, preWeanMortality, weaningCheck, procedureCheck, sucklingDeathsByDay, roomLitterTotals } from "../../app/js/sectors/pigs/model/litters.js";
import { indexHerd, cycleOf, sowPill, crateEntryCheck, lifetime, toServe } from "../../app/js/sectors/pigs/model/sows.js";
import { breedingKpis, parityProfile, farrowRateByBatch } from "../../app/js/sectors/pigs/model/kpis.js";
import { intakeAt, binStock, binForecast } from "../../app/js/sectors/pigs/model/bins.js";
import { notifyState, pm2Month, qvrState, quarterOf, embDue, embRows, inventoryDue, checkState, standstill, pm1Rows } from "../../app/js/sectors/pigs/model/paperwork.js";
import { parseLine, parsePigKillSheet } from "../../app/js/sectors/pigs/model/killsheet.js";
import { moneyFigures, killSheetResults, killSheetNote, ownMoneyRow } from "../../app/js/sectors/pigs/model/money.js";
import { mgPerPcu } from "../../app/js/sectors/pigs/model/pcu.js";
import { evaluate, summary, ITEMS, HEADER } from "../../app/js/sectors/pigs/model/checklist.js";

const S = (meta = {}, settings = {}) => pigSettings({ settings }, meta);
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test("settings: system from set-up answers, tabs per system (§2.1, §13)", () => {
  const f = S({}, { pigSystem: "Finishing only", finisherPlaces: 2200 });
  assert.equal(f.system, "finishing"); assert.equal(f.breeding, false); assert.equal(tabSetFor(f), "finishing");
  const b = S({}, { sows: 240, batchInterval: "3-weekly" });
  assert.equal(b.system, "ftf"); assert.equal(b.interval, 3); assert.equal(b.breeding, true); assert.equal(tabSetFor(b), "breeding");
  assert.equal(tabSetFor(S({}, { sows: 12 })), "small");
  const d = S(); assert.equal(d.lactation, 28); assert.equal(d.gestation, 114); assert.equal(d.killOut, 76); assert.equal(d.targets.fcr, 2.47); assert.equal(d.targets.dlwg, 885);
});

test("production weeks: ISO week numbers across year ends (§3.1)", () => {
  assert.deepEqual(isoWeek("2026-10-15"), { year: 2026, week: 42 });
  assert.deepEqual(isoWeek("2026-10-20"), { year: 2026, week: 43 });
  assert.deepEqual(isoWeek("2027-01-01"), { year: 2026, week: 53 });
  assert.deepEqual(isoWeek("2021-01-03"), { year: 2020, week: 53 });
  assert.deepEqual(isoWeek("2027-01-04"), { year: 2027, week: 1 });
  assert.equal(weekStart("2026-10-15"), "2026-10-12");
  assert.equal(weekStart("2026-10-18"), "2026-10-12");
  assert.equal(weekStart("2026-10-15", 4), "2026-10-15"); // production week starting Thursday
  assert.deepEqual(weekDates("2026-10-20").map((d) => d.slice(8)), ["19", "20", "21", "22", "23", "24", "25"]);
});

test("batch calendar: serve → return, scan, move, due 114 (112–116), nesting, wean (§4.2)", () => {
  const d = batchDates("2026-06-23", S());
  assert.equal(d.due, "2026-10-15"); assert.equal(d.dueFrom, "2026-10-13"); assert.equal(d.dueTo, "2026-10-17");
  assert.equal(d.returnFrom, "2026-07-11"); assert.equal(d.returnTo, "2026-07-17");
  assert.equal(d.scanFrom, "2026-07-21"); assert.equal(d.scanTo, "2026-07-28");
  assert.equal(d.move, "2026-10-10"); assert.equal(d.nesting, "2026-10-14"); assert.equal(d.wean, "2026-11-12");
});

test("service target and batch planner (§4.3, §9)", () => {
  assert.equal(serveTarget(24, 86), 28);
  assert.equal(serveTarget(24, 80), 30);
  const a = weekIndex("2026-10-12");
  assert.ok(isServeWeek("2026-11-02", 3, a)); assert.ok(isServeWeek("2026-09-21", 3, a)); assert.ok(!isServeWeek("2026-10-19", 3, a));
  assert.ok(isServeWeek("2026-10-19", 1, a));
  const s = S({ interval: 3, farrowingPlaces: 24 });
  const p = plan({ fromIso: "2026-10-12", weeks: 26, s, anchorIdx: a, nextNo: 43, known: [] });
  assert.equal(p.target, 28);
  assert.equal(p.rows[0].serve, 43); assert.equal(p.rows[0].week, 42);
  assert.equal(p.rows[16].farrow, 43); assert.equal(p.rows[16].due, 24); assert.equal(p.rows[16].over, false);
  assert.equal(p.rows[20].wean, 43); // farrow + 28 days = 4 weeks
  assert.equal(p.rows[3].serve, 44);
  // a batch already served with 32 sows overfills 24 crates 16 weeks later
  const q = plan({ fromIso: "2026-10-12", weeks: 26, s, anchorIdx: weekIndex("2026-09-21"), nextNo: 42, known: [{ no: 41, serveDate: "2026-09-21", served: 32 }] });
  assert.equal(q.rows[13].farrow, 41); assert.equal(q.rows[13].due, 28); assert.equal(q.rows[13].over, true);
  assert.equal(q.rows[0].serve, 42);
});

test("batch card: live FCR, growth, feed cost/kg gain, mortality, ship date (§6.2)", () => {
  const s = S();
  const b = { id: "b1", no: 35, stage: "finisher", roomId: "r1", numberIn: 100, avgKgIn: 30, inDate: "2026-09-01", sampleWeighs: [{ date: "2026-09-21", n: 20, avgKg: 48 }] };
  const deliveries = [{ id: "d1", date: "2026-09-01", kg: 6000, batchIds: ["b1"] }, { id: "d2", date: "2026-09-20", kg: 2000, batchIds: ["b1", "b2"] }];
  const finance = [{ feedDeliveryId: "d1", amount: 1800 }, { feedDeliveryId: "d2", amount: 600 }];
  const deaths = [{ batchId: "b1", date: "2026-09-10", n: 2, stage: "Finisher", estKg: 40 }];
  const readings = [{ roomId: "r1", date: "2026-09-25", binDipKg: 1000 }];
  assert.deepEqual(feedFor(b, deliveries, finance), { kg: 7000, pounds: 2100, loads: 2, last: "2026-09-20" });
  const f = batchFacts(b, { deaths, deliveries, finance, readings }, s, "2026-10-01");
  assert.equal(f.days, 30); assert.equal(f.onFarm, 98); assert.equal(f.died, 2);
  near(f.dlwg, 900); near(f.est, 57); assert.equal(f.fromTarget, false);
  near(f.kgGain, 98 * 57 + 80 - 3000); // 2666
  assert.equal(f.binKg, 1000); assert.equal(f.feedUsed, 6000);
  near(f.fcr, 6000 / 2666); near(f.costPerKgGain, 2100 / 2666); near(f.mortPct, 0.02);
  assert.equal(f.shipDate, "2026-12-05"); // ceil((115 − 57) ÷ 0.9) = 65 days
  assert.equal(f.final, false);
  // before any weigh: target DLWG, labelled "(target)"
  const g = batchFacts({ ...b, sampleWeighs: [] }, {}, s, "2026-10-01");
  assert.equal(g.fromTarget, true); near(g.dlwg, 885); near(g.est, 30 + 0.885 * 30);
  assert.equal(g.fcr, null); // no feed recorded
  // too early (first week) → no FCR
  assert.equal(batchFacts(b, { deliveries }, s, "2026-09-05").fcr, null);
  // weaner batch uses rearing targets
  const w = batchFacts({ ...b, stage: "weaner", sampleWeighs: [] }, {}, s, "2026-10-01");
  assert.equal(w.targetFcr, 1.6); near(w.dlwg, 550);
});

test("withdrawal blocks shipping; feed withdrawal ≤ 8 h before loading, ≤ 12 h before arrival (§7.6, §7.7)", () => {
  const b = { id: "b1" }; const meds = [{ batchId: "b1", withdrawalEndDateMeat: "2026-11-03" }, { batchId: "b1", withdrawalEndDateMeat: "2026-10-28" }, { batchId: "b2", withdrawalEndDateMeat: "2026-12-01" }];
  assert.equal(withdrawalEnd(b, meds), "2026-11-03");
  assert.deepEqual(shipBlocked(b, meds, "2026-10-30"), { blocked: true, until: "2026-11-03" });
  assert.deepEqual(shipBlocked(b, meds, "2026-11-03"), { blocked: false });
  assert.equal(feedWithdrawCheck("2026-10-22T22:00", "2026-10-23T06:00", "2026-10-23T08:00").ok, true);
  assert.match(feedWithdrawCheck("2026-10-22T20:00", "2026-10-23T06:00", "2026-10-23T08:00").text, /limit is 8 h/);
  assert.match(feedWithdrawCheck("2026-10-22T21:00", "2026-10-23T05:00", "2026-10-23T10:00").text, /limit is 12 h/);
  assert.match(feedWithdrawCheck("2026-10-23T07:00", "2026-10-23T06:00").text, /after loading/);
});

test("ready to ship: pens ranked against the deadweight band (§6.3)", () => {
  const r = readyToShip([{ no: 1, avgKg: 100 }, { no: 2, avgKg: 140 }, { no: 3 }], 110, S());
  assert.deepEqual(r.map((p) => p.no), [2, 3, 1]);
  assert.deepEqual(r.map((p) => p.status), ["over", "in", "light"]);
  near(r[2].dw, 76); near(r[2].gap, 4); near(r[1].dw, 83.6);
});

test("close batch summary and batch numbers (§6.5)", () => {
  const c = closeSummary({ fcr: 2.5, dlwg: 850, mortPct: 0.03, days: 99, feedPerPig: 80 }, [{ totals: { pigs: 100, inSpec: 90 } }], 15000);
  assert.equal(c.marginPerPig, 70); assert.equal(c.inSpecPct, 0.9);
  assert.equal(closeSummary({}, [], 0).marginPerPig, null);
  assert.equal(nextBatchNo([{ no: 41 }, { no: 43 }]), 44); assert.equal(nextBatchNo([]), 1);
});

test("space per pen: Schedule 8 bands, breeders, badge, pen checks (§9.1)", () => {
  assert.equal(spacePerPig(10), 0.15); assert.equal(spacePerPig(10.1), 0.2); assert.equal(spacePerPig(110), 0.65); assert.equal(spacePerPig(111), 1.0);
  assert.equal(pigsAllowed(33.8, 95), 52); assert.equal(pigsAllowed(10, 25), 33);
  near(breederSpace("sow", 5), 2.475); near(breederSpace("gilt", 40), 1.476); near(breederSpace("sow", 10), 2.25);
  assert.equal(spaceBadge(40, [{ areaM2: 33.8 }], 95).word, "✓");
  assert.equal(spaceBadge(52, [{ areaM2: 33.8 }], 95).word, "Tight");
  assert.equal(spaceBadge(53, [{ areaM2: 33.8 }], 95).level, "late");
  assert.equal(spaceBadge(50, [], 95), null);
  assert.equal(penChecks({ side: 2.5, group: 10 }).length, 1); assert.equal(penChecks({ side: 2.5, group: 5 }).length, 0);
  assert.match(penChecks({ solidM2PerPig: 1.2, type: "sow" })[0], /1.3 m²/);
  assert.match(penChecks({ boarPenM2: 8, service: true })[0], /10 m²/); assert.equal(penChecks({ boarPenM2: 8 }).length, 0);
});

test("wash cycle: a room fills only when Ready (§5.5)", () => {
  const w = washState({ wash: { stage: "dried", at: { emptied: "2026-10-17T08:00" } } }, "2026-10-20");
  assert.equal(w.next, "ready"); assert.equal(w.emptyDays, 3); assert.equal(w.ready, false);
  assert.equal(canFill({ wash: { stage: "dried" } }, "2026-10-20"), false);
  assert.equal(canFill({}, "2026-10-20"), true);
  assert.equal(canFill({ batchId: "b1" }, "2026-10-20"), false);
  assert.equal(washState({ batchId: "b1" }, "2026-10-20").inUse, true);
});

test("readings: water drop alert, tail biting twice in 7 days, alarm every 7 days (§7.9, §5.3, §7.10)", () => {
  const rd = [{ roomId: "r1", date: "2026-10-18", waterM3: 100 }, { roomId: "r1", date: "2026-10-19", waterM3: 110 }, { roomId: "r1", date: "2026-10-20", waterM3: 117.8 }];
  const wc = waterChange(rd, "r1", "2026-10-20"); near(wc.change, -0.22);
  assert.equal(waterAlert(wc, 15), true); assert.equal(waterAlert(wc, 25), false);
  assert.equal(waterChange(rd.slice(1), "r1", "2026-10-20"), null);
  assert.equal(tailBiteRepeat([{ roomId: "r1", date: "2026-10-15" }, { roomId: "r1", date: "2026-10-19" }], "r1", "2026-10-20"), true);
  assert.equal(tailBiteRepeat([{ roomId: "r1", date: "2026-10-10" }, { roomId: "r1", date: "2026-10-19" }], "r1", "2026-10-20"), false);
  const late = alarmState([{ house: "Fin", date: "2026-10-11" }], "Fin", "2026-10-20"); assert.equal(late.level, "late"); assert.equal(late.days, 9);
  const due = alarmState([{ house: "Fin", date: "2026-10-13" }], "Fin", "2026-10-20"); assert.equal(due.level, "due"); assert.equal(due.next, "2026-10-20");
  assert.equal(alarmState([], "Fin", "2026-10-20").level, "late");
  assert.equal(alarmState([{ house: "Fin", date: "2026-10-19", sounded: false }], "Fin", "2026-10-20").failed, true);
  assert.deepEqual([...issuePens({ pens: [{ no: 1, status: ["OK"] }, { no: 3, status: ["Tail bite"] }] })], [3]);
});

test("crate card maths: alive now, pre-wean mortality, suckling deaths by day (§5.4, §4.4)", () => {
  const l = { bornAlive: 15, deaths: [{ date: "2026-10-16", n: 1, cause: "Overlaid" }], fosterOn: [{ n: 1 }], fosterOff: [{ n: 2 }, { n: 1 }] };
  assert.equal(aliveNow(l), 12);
  assert.equal(aliveNow({ bornAlive: 2, deaths: [{ n: 3 }] }), 0);
  const m = preWeanMortality([{ bornAlive: 10, deaths: [{ n: 2, date: "2026-10-16", cause: "Scour" }] }, { bornAlive: 12, fosterOff: [{ n: 2 }], deaths: [{ n: 1, date: "2026-10-16", cause: "Overlaid" }] }]);
  near(m, 3 / 20);
  assert.equal(preWeanMortality([]), null);
  const byDay = sucklingDeathsByDay([l, { deaths: [{ date: "2026-10-16", n: 2, cause: "Scour" }, { date: "2026-10-17", n: 1, cause: "Overlaid" }] }]);
  assert.deepEqual(byDay[0], { date: "2026-10-17", n: 1, causes: { Overlaid: 1 } });
  assert.deepEqual(byDay[1], { date: "2026-10-16", n: 3, causes: { Overlaid: 1, Scour: 2 } });
  assert.deepEqual(roomLitterTotals([{ bornAlive: 10 }, { bornAlive: 12, weaned: { n: 11 } }]), { litters: 1, alive: 10, pwm: 0 });
});

test("weaning age and teeth/tail rules — Schedule 8, never routine (§4.2, §5.4)", () => {
  assert.equal(weaningCheck(20).ok, false);
  assert.equal(weaningCheck(25).ok, false);
  assert.equal(weaningCheck(25, { cleanedHousing: true }).ok, false); // reason required too
  const ok = weaningCheck(25, { cleanedHousing: true, reason: "Sow lost condition" }); assert.equal(ok.ok, true); assert.equal(ok.level, "due");
  assert.equal(weaningCheck(28).ok, true);
  assert.equal(procedureCheck("teeth", 3).ok, false);
  assert.equal(procedureCheck("teeth", 3, { evidence: true }).ok, true);
  assert.equal(procedureCheck("teeth", 8, { evidence: true }).ok, false);
  assert.equal(procedureCheck("tail", 3).ok, false);
  assert.equal(procedureCheck("tail", 9, { evidence: true }).ok, false);
  assert.equal(procedureCheck("tail", 9, { evidence: true, vet: true }).ok, true);
  assert.equal(procedureCheck("iron", 2).ok, true);
});

function herd(extra = {}) {
  const data = { sows: [], services: [], scans: [], litters: [], rooms: [{ id: "f3", name: "Farrowing 3", kind: "farrowing", crates: 24 }], batches: [{ id: "b41", no: 41 }], ...extra };
  return { data, ix: indexHerd(data) };
}

test("sow cycle: status, parity, dates and the one pill (§4.1, §4.2)", () => {
  const s = S();
  const sow = { id: "s1", sowNo: "1187", type: "sow" };
  let h = herd({ sows: [sow], services: [{ sowId: "s1", date: "2026-06-23", batchId: "b41" }], scans: [{ sowId: "s1", date: "2026-07-22", result: "+" }] });
  let c = cycleOf(s, h.ix, sow, "2026-10-14");
  assert.equal(c.status, "inpig"); assert.equal(c.days, 113); assert.equal(c.parity, 1); assert.equal(c.dates.due, "2026-10-15"); assert.equal(c.batchId, "b41");
  assert.deepEqual(sowPill(s, c, sow, "2026-10-14", "2026-10-18"), ["due", "Due Thu"]);
  assert.deepEqual(sowPill(s, cycleOf(s, h.ix, sow, "2026-10-18"), sow, "2026-10-18", "2026-10-18")[0], "late"); // 117 d = overdue
  // in the crate → "farrowing"
  const inCrate = { ...sow, location: { roomId: "f3", crate: 12, since: "2026-10-10" } };
  h = herd({ sows: [inCrate], services: [{ sowId: "s1", date: "2026-06-23", batchId: "b41" }] });
  assert.equal(cycleOf(s, h.ix, inCrate, "2026-10-14").status, "farrowing");
  // served 20 days ago → Return?
  h = herd({ sows: [sow], services: [{ sowId: "s1", date: "2026-09-30", batchId: "b41" }] });
  c = cycleOf(s, h.ix, sow, "2026-10-20"); assert.equal(c.status, "served"); assert.deepEqual(sowPill(s, c, sow, "2026-10-20", "2026-10-25"), ["late", "Return?"]);
  // scanned empty
  h = herd({ sows: [sow], services: [{ sowId: "s1", date: "2026-09-01" }], scans: [{ sowId: "s1", date: "2026-10-01", result: "-" }] });
  assert.equal(cycleOf(s, h.ix, sow, "2026-10-20").status, "empty");
  // suckling, then weaned → serve
  h = herd({ sows: [sow], litters: [{ sowId: "s1", farrowedAt: "2026-10-01T06:20", bornAlive: 14 }] });
  c = cycleOf(s, h.ix, sow, "2026-10-20"); assert.equal(c.status, "suckling"); assert.equal(c.parity, 1);
  h = herd({ sows: [sow], litters: [{ sowId: "s1", farrowedAt: "2026-09-01T06:20", bornAlive: 14, weaned: { date: "2026-09-29", n: 12 } }] });
  c = cycleOf(s, h.ix, sow, "2026-10-08"); assert.equal(c.status, "weaned"); assert.deepEqual(sowPill(s, c, sow, "2026-10-08", "2026-10-11"), ["due", "Serve"]);
  assert.equal(toServe(s, h.ix, [sow], "2026-10-08").length, 1);
  assert.equal(cycleOf(s, h.ix, { ...sow, cull: { date: "2026-10-01" } }, "2026-10-08").status, "gone");
  assert.deepEqual(lifetime([{ bornAlive: 15, weaned: { n: 13 } }, { bornAlive: 14 }]), { bornAlive: 29, weaned: 13, litters: 2 });
});

test("crate entry no more than 7 days before due — Red Tractor HF.9.2.a", () => {
  const r = crateEntryCheck("2026-10-06", "2026-10-15"); assert.equal(r.ok, false); assert.equal(r.days, 9); assert.match(r.text, /9 days before/);
  assert.equal(crateEntryCheck("2026-10-08", "2026-10-15").ok, true);
});

test("breeding KPIs over 12 months (§4.4)", () => {
  const sows = [{ id: "s1", type: "sow", entered: "2024-01-01" }, { id: "g1", type: "gilt", entered: "2026-09-01" }, { id: "b1", type: "boar" }];
  const services = [{ sowId: "s1", date: "2025-08-09", batchId: "x1" }, { sowId: "s1", date: "2026-01-01", batchId: "x2" }, { sowId: "s1", date: "2026-05-20", batchId: "x3" }];
  const litters = [{ sowId: "s1", farrowedAt: "2025-12-01T05:00", bornAlive: 14, deaths: [{ n: 1 }], weaned: { date: "2025-12-29", n: 13 } },
    { sowId: "s1", farrowedAt: "2026-04-25T06:00", bornAlive: 16, deaths: [{ n: 2 }], fosterOff: [{ n: 2 }], weaned: { date: "2026-05-23", n: 12 } }];
  const k = breedingKpis({ sows, services, litters }, "2026-10-15");
  near(k.avgSows, 1); near(k.pwsy, 25); near(k.bornAlive, 15); near(k.lsy, 2);
  near(k.pwm, 3 / 28); near(k.farrowRate, 2 / 3); near(k.replacement, 1); // 1 gilt entered ÷ 1 average sow (the unserved gilt isn't in the average)
  assert.equal(k.litters, 2);
  assert.deepEqual(parityProfile([0, 1, 1, 4, 9]), [1, 2, 0, 0, 1, 0, 0, 0, 1]);
  const fr = farrowRateByBatch([{ id: "x1", no: 30 }, { id: "x2", no: 33 }, { id: "x3", no: 36 }], services, litters, "2026-10-15");
  assert.deepEqual(fr.map((r) => [r.no, r.rate]), [[30, 1], [33, 1], [36, 0]]);
});

test("feed bins: intake, stock since the last dip, order-by date (§9)", () => {
  assert.equal(intakeAt(60), 2.2); assert.equal(intakeAt(200), 3.0); assert.equal(intakeAt(60, [{ upToKg: 999, kgDay: 2.5 }]), 2.5);
  const bin = { id: "bin3" };
  assert.equal(binStock(bin, [{ binId: "bin3", date: "2026-10-17", kg: 6000 }, { binId: "bin3", date: "2026-10-10", kg: 9000 }], [{ binId: "bin3", date: "2026-10-15", kg: 5000 }], 1000, "2026-10-20"), 6000);
  assert.equal(binStock(bin, [], [], 1000, "2026-10-20"), 0);
  const ok = binForecast(4000, 1000, 3, "2026-10-20"); assert.equal(ok.daysLeft, 4); assert.equal(ok.emptyOn, "2026-10-24"); assert.equal(ok.orderBy, "2026-10-21"); assert.equal(ok.level, "ok");
  const due = binForecast(3500, 1000, 3, "2026-10-20"); assert.equal(due.level, "due"); assert.equal(due.orderBy, "2026-10-20");
  assert.equal(binForecast(3500, 0, 3, "2026-10-20").daysLeft, null);
});

test("movements: 7-day notification, market standstill, PM1 rows (§7.6, §8.3, §20)", () => {
  const m = { direction: "off", date: "2026-10-15", n: 180, category: "finishers" };
  assert.deepEqual(notifyState(m, "2026-10-20"), { by: "2026-10-22", level: "due", days: 5 });
  assert.equal(notifyState(m, "2026-10-23").level, "late");
  assert.equal(notifyState(m, "2026-10-17").level, "info");
  assert.equal(notifyState({ ...m, notified: "2026-10-16" }, "2026-10-23").level, "ok");
  assert.equal(notifyState({ ...m, direction: "on" }, "2026-10-23").level, "ok");
  const st = standstill([{ batchId: "b1", direction: "on", fromMarket: true, fromName: "Ballymena Mart", date: "2026-10-17" }], "b1", "2026-10-20");
  assert.deepEqual(st, { market: "Ballymena Mart", date: "2026-10-17", until: "2026-10-23", days: 6 });
  assert.equal(standstill([{ batchId: "b1", direction: "on", fromMarket: true, date: "2026-10-10" }], "b1", "2026-10-20"), null);
  const rows = pm1Rows([{ ...m, toSlaughter: true, fci: { withdrawals: true }, toCode: "AB1", toName: "Karro", markType: "Slap", mark: "1234", haulier: "J Bell", feedWithdrawnAt: "2026-10-14T22:00" }]);
  assert.deepEqual(rows[0].slice(0, 4), ["2026-10-15", "Off", 180, "Finishers"]);
  assert.equal(rows[0][6], "Slap: 1234"); assert.equal(rows[0][8], "Withdrawals observed"); assert.equal(rows[0][9], "2026-10-14 22:00");
});

test("PM2 holding register balances month by month (§8.3)", () => {
  const data = { litters: [{ farrowedAt: "2026-10-03T06:00", bornAlive: 14, deaths: [{ date: "2026-10-04", n: 1 }, { date: "2026-09-30", n: 5 }] }],
    moves: [{ direction: "on", date: "2026-10-05", n: 20 }, { direction: "off", date: "2026-10-09", n: 30 }, { direction: "off", date: "2026-11-01", n: 99 }],
    deaths: [{ date: "2026-10-09", n: 2 }] };
  const m = pm2Month("2026-10", data, 100, 99);
  assert.equal(m.born, 14); assert.equal(m.on, 20); assert.equal(m.off, 30); assert.equal(m.died, 3); assert.equal(m.closing, 101);
  assert.equal(m.diff, -2); assert.equal(m.balanced, false);
  assert.equal(pm2Month("2026-10", data, 100, 99, "Found dead in slurry channel").balanced, true);
  assert.equal(pm2Month("2026-10", data, 100, 101).balanced, true);
  assert.equal(pm2Month("2026-10", data, 100).diff, null);
});

test("QVR 20-week countdown, eMB quarter + 6 weeks, 1 June inventory, site checks (§8.4, §8.5, §19)", () => {
  const q = qvrState([{ date: "2026-06-23", type: "qvr" }], "2026-10-20");
  assert.equal(q.weeks, 17); assert.equal(q.level, "due"); assert.equal(q.nextBy, "2026-11-10");
  assert.equal(qvrState([{ date: "2026-06-23" }], "2026-11-10").level, "late");
  assert.equal(qvrState([{ date: "2026-09-01" }], "2026-10-20").level, "ok");
  assert.equal(qvrState([], "2026-10-20").level, "late");
  const qo = quarterOf("2026-10-20"); assert.equal(qo.label, "Q4 2026"); assert.equal(qo.start, "2026-10-01"); assert.equal(qo.end, "2026-12-31");
  assert.equal(quarterOf("2026-02-10").end, "2026-03-31");
  const e = embDue("2026-10-20"); assert.equal(e.label, "Q3 2026"); assert.equal(e.due, "2026-11-11"); assert.equal(e.level, "info");
  assert.equal(embDue("2026-10-29").level, "due"); assert.equal(embDue("2026-11-12").level, "late");
  const up = embDue("2026-10-29", [{ quarter: "Q3 2026" }]); assert.equal(up.label, "Q4 2026"); assert.equal(up.level, "ok");
  const rows = embRows([{ antibiotic: true, date: "2026-08-01", productName: "Pulmotil", activeIngredient: "tilmicosin", quantity: 2, quantityUnit: "kg", pigs: 400, batchName: "B35", route: "In feed", activeMgPerUnit: 200000 },
    { antibiotic: true, date: "2026-09-10", productName: "Pulmotil", quantity: 1, pigs: 300, batchName: "B36", route: "In feed", activeMgPerUnit: 200000 },
    { antibiotic: false, date: "2026-08-01", productName: "Iron" }, { antibiotic: true, date: "2026-10-01", productName: "Late" }], quarterOf("2026-08-01"));
  assert.equal(rows.length, 1); assert.equal(rows[0].qty, 3); assert.equal(rows[0].pigs, 700); assert.equal(rows[0].batches, "B35 B36"); assert.equal(rows[0].mg, 600000);
  near(mgPerPcu(650000, { finishers: 100 }), 100); assert.equal(mgPerPcu(1, {}), null);
  const inv = inventoryDue("2026-05-26"); assert.equal(inv.date, "2026-06-01"); assert.equal(inv.remind, "2026-05-25"); assert.equal(inv.level, "due");
  assert.equal(inventoryDue("2026-10-20").date, "2027-06-01"); assert.equal(inventoryDue("2026-10-20").level, "info");
  assert.equal(checkState([{ kind: "vermin", date: "2026-07-01" }], "vermin", "2026-10-20").level, "late");
  assert.equal(checkState([{ kind: "vermin", date: "2026-07-25" }], "vermin", "2026-10-20").level, "due");
  assert.equal(checkState([], "water", "2026-10-20").level, "due");
});

test("kill sheet reader and results: % in spec, price per pig, margin (§6.4)", () => {
  assert.deepEqual(parseLine("1234 88.4 12 S 182.0"), { slap: "1234", dwKg: 88.4, p2: 12, lean: null, grade: "S", ppk: 182, deductions: null });
  assert.equal(parseLine("Total 4 361.2"), null);
  assert.equal(parseLine("Karro Cookstown 15/10/26"), null);
  assert.equal(parseLine("AB12 95,5 14 E 1.78").ppk, 178);
  const ks = parsePigKillSheet("Karro Cookstown 15/10/26\n1234 88.4 12 S 182.0\n1234 91.2 11 S 182.0\n1234 79.0 14 E 176.5\n1234 102.6 16 U 170.0\nTotal 4 361.2\nDOA 1");
  assert.equal(ks.pigs.length, 4); assert.equal(ks.header.date, "2026-10-15"); assert.equal(ks.header.count, 4); near(ks.header.totalDwKg, 361.2); assert.equal(ks.header.doa, 1);
  assert.match(ks.header.abattoir, /Karro/);
  const r = killSheetResults(ks.pigs, S());
  assert.equal(r.pigs, 4); near(r.dwKg, 361.2); near(r.avgDw, 90.3); assert.equal(r.inSpec, 2); assert.equal(r.inSpecPct, 0.5);
  near(r.pounds, 88.4 * 1.82 + 91.2 * 1.82 + 79 * 1.765 + 102.6 * 1.7, 1e-6); near(r.perPig, r.pounds / 4);
  assert.equal(killSheetNote("B35", { pigs: 180, dwKg: 16020, avgDw: 89, ppk: 179 }), "180 finishers B35 · 16,020 kg dw · avg 89.0 kg · £1.79/kg");
});

test("money per pig and per kg deadweight; contract income (§10)", () => {
  const rows = [{ kind: "revenue", source: "killSheet", amount: 18000, pigs: 100, dwKg: 9000 }, { kind: "expense", category: "Feed", amount: 8000 },
    { kind: "expense", category: "Vet & medicine", amount: 500 }, { kind: "expense", category: "Power", amount: 1000 },
    { kind: "revenue", source: "weanerSale", amount: 1200, pigs: 20, weightBand: "30 kg" }, { kind: "revenue", source: "contract", amount: 4000 }];
  const m = moneyFigures(rows);
  near(m.pricePpk, 200); near(m.pricePerPig, 180); near(m.feedPerPig, 80); near(m.marginOverFeed, 100); near(m.marginPerPig, 95); near(m.copPpk, 9500 / 9000 * 100);
  assert.equal(m.weanerHead, 20); assert.deepEqual(m.weanerBands, [{ band: "30 kg", head: 20, pounds: 1200, perHead: 60 }]);
  assert.equal(m.contractIncome, 4000); assert.equal(m.totalIn, 23200);
  assert.equal(m.ownCosts, 1500); // contract mode: feed (integrator's) left out, vet + power are the farmer's
  assert.deepEqual(rows.filter(ownMoneyRow).map((r) => r.amount), [500, 1000, 4000]);
  assert.equal(moneyFigures([]).pricePpk, null);
});

test("Red Tractor Pigs v5.2 checklist: exact header, statuses and summary (§8.7)", () => {
  assert.equal(HEADER, "Based on Red Tractor Pigs Standards version 5.2, February 2026. Not endorsed by Red Tractor. Audited in Northern Ireland by NIFCC.");
  assert.ok(ITEMS.length >= 20);
  assert.ok(ITEMS.some((i) => i.key));
  const rows = ITEMS.map((i, n) => ({ ...i, status: n % 2 ? "ok" : "gap" }));
  const sm = summary(rows); assert.equal(sm.done + rows.filter((r) => r.status !== "ok").length, rows.length);
  assert.equal(typeof evaluate, "function");
});

test("feed docket reader: tonnes, £/t, date, docket no, ration, supplier (§7.8)", async () => {
  const { parseFeedDocket } = await import("../../app/js/sectors/pigs/model/docket.js");
  const d = parseFeedDocket("Thompsons Feeds Ltd\nDelivery Note No: T261014\nDate 14/10/2026\nFinisher Pellets 3mm 16.4 t\nPrice £312.50/t\nBin 3");
  assert.deepEqual(d, { date: "2026-10-14", supplier: "Thompsons Feeds", ration: "Finisher Pellets 3mm", tonnes: 16.4, pricePerT: 312.5, docketNo: "T261014" });
  const k = parseFeedDocket("John Thompson & Sons\nTicket 88812\nWeaner crumb\n12,480 kg");
  assert.equal(k.tonnes, 12.48); assert.equal(k.docketNo, "88812"); assert.equal(k.ration, "Weaner crumb");
  assert.deepEqual(parseFeedDocket(""), { date: null, supplier: null, ration: null, tonnes: null, pricePerT: null, docketNo: null });
});
