// Dairy ledger model: hand-worked numbers for every calculation and rule in design/12.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dairySettings, gestationDays } from "../../app/js/sectors/dairy/model/settings.js";
import { indexHerd, groupOf, lactation, dim, isDry, cowLabel, cowMatches, yieldToDate } from "../../app/js/sectors/dairy/model/cows.js";
import { withdrawalFor, addHours, milkingAtOrAfter, board, effectiveOk, courseTimes, currentMilking, milkingsIn, hoursBetween } from "../../app/js/sectors/dairy/model/milking.js";
import { fertilityOf, actionLists, rates21, pctPregnantAtPd, weeklyPregnancies, sixWeekInCalf, calvingInterval, ageFirstCalving, strawsLeft, conceived } from "../../app/js/sectors/dairy/model/fertility.js";
import { geoMean, rolling, qualityStatus, inhibitoryFails, tankStrip, tankDue } from "../../app/js/sectors/dairy/model/quality.js";
import { caseFacts, herdMastitis, sccLists, sdctRow, heiferTriggers, failures } from "../../app/js/sectors/dairy/model/mastitis.js";
import { chequeFigures, estimatePpl, whatIf, mopf } from "../../app/js/sectors/dairy/model/money.js";
import { mixing, targetKg, growthStatus, tapeKg, brixGood } from "../../app/js/sectors/dairy/model/calves.js";
import { slurryWeeks, cullRanking, yearlyDue } from "../../app/js/sectors/dairy/model/tools.js";
import { todayTasks, calfSteps, tbNext } from "../../app/js/sectors/dairy/model/duties.js";
import { dairyAlerts } from "../../app/js/sectors/dairy/model/alerts.js";
import { evaluate, summary, ITEMS } from "../../app/js/sectors/dairy/model/checklist.js";
import { buildRegister, collation, REGISTERS } from "../../app/js/sectors/dairy/model/registers.js";
import { parseCsv, guessMap, toRecording, normDate } from "../../app/js/sectors/dairy/model/csv.js";
import { bvdRuleState, BVD_BREEDING_FEMALE_RULE } from "../../app/js/sectors/dairy/model/content.js";

const T = "2026-10-15"; const NOW = "2026-10-15T10:00";
const COLLS = ["animals", "calvings", "services", "heats", "pds", "straws", "medicines", "medProducts", "milkWithhold", "mastitis", "dryOffs", "tankLog", "milkQuality", "recordings", "scoreSessions", "footTrims", "parlourService", "freshChecks", "calfFeeds", "handover", "imports", "movements", "deaths", "tbTests", "vetOps", "groups", "training", "abFailures", "weighings", "finance", "tasks"];
const empty = () => Object.fromEntries(COLLS.map((k) => [k, []]));
const S = (meta = {}) => dairySettings({ settings: {} }, meta);
const cow = (id, no, extra = {}) => ({ id, cowNo: no, tag: `UK9 223344 ${String(no).padStart(4, "0")}1`, sex: "Female", dob: "2020-03-01", breed: "HOL", ...extra });
const ctx = (data, meta = {}, now = NOW) => { const s = S(meta); const ix = indexHerd(data); const brd = board(s, data.milkWithhold, ix, now); return { s, ix, data, today: now.slice(0, 10), now, lid: "L", doneKeys: new Set(), brd, meta: {} }; };

test("settings: defaults, onboarding answers, tank limit by collection", () => {
  const s = dairySettings({ settings: { milkingSystem: "Robot", calvingPattern: "Spring block", milkBuyer: "Lakeland" } }, { collection: "alternate" });
  assert.equal(s.robot, true); assert.equal(s.block, true); assert.equal(s.processor, "Lakeland"); assert.equal(s.tankLimit, 6);
  assert.equal(S().tankLimit, 8); assert.equal(S().vwp, 42); assert.equal(S().dryPeriod, 60);
  assert.equal(gestationDays(S(), "HOL"), 281); assert.equal(gestationDays(S(), "LIM"), 289); assert.equal(gestationDays(S(), "XYZ"), 282);
});

test("milking: OK-from is the first milking after last tube + withdrawal hours", () => {
  const s = S(); // 06:00 and 16:30
  assert.equal(addHours("2026-10-13T06:00", 84), "2026-10-16T18:00");
  // 3 tubes every 12 h from Mon 12 Oct 06:00: last tube Tue 13 06:00; +84 h = Fri 16 18:00 -> Sat 17 am milking
  const w = withdrawalFor(s, { date: "2026-10-12", time: "06:00", doses: 3, intervalH: 12, wdMilkHours: 84 });
  assert.equal(w.lastDoseAt, "2026-10-13T06:00"); assert.equal(w.endsAt, "2026-10-16T18:00"); assert.equal(w.okFrom, "2026-10-17T06:00");
  assert.equal(w.label, "Sat 17 Oct · am milking");
  // ends exactly at a milking time -> that milking
  assert.equal(milkingAtOrAfter(s, "2026-10-16T16:30").at, "2026-10-16T16:30");
  // robot: exact time
  const r = withdrawalFor(S({ milkingSystem: "Robot" }), { date: "2026-10-12", time: "08:15", doses: 1, wdMilkHours: 60 });
  assert.equal(r.okFrom, "2026-10-14T20:15"); assert.equal(r.label, "Wed 14 Oct 20:15");
  assert.equal(withdrawalFor(s, { date: T, wdMilkHours: 0 }).none, true);
  assert.deepEqual(courseTimes({ date: T, time: "06:00", doses: 3, intervalH: 12 }).map((x) => x.at), ["2026-10-15T06:00", "2026-10-15T18:00", "2026-10-16T06:00"]);
  assert.equal(currentMilking(s, "2026-10-15T05:00").at, "2026-10-14T16:30");
  assert.equal(currentMilking(s, "2026-10-15T10:00").part, "am");
  assert.equal(milkingsIn(s, 96), "8 milkings");
  assert.equal(hoursBetween("2026-10-14T22:00", "2026-10-15T10:00"), 12);
});

test("withhold board: withheld until OK-from, then waits for a deliberate release; dry cows wait for calving", () => {
  const d = empty();
  d.animals.push(cow("a", 214), cow("b", 302), cow("c", 140), cow("e", 99));
  d.milkWithhold.push({ id: "w1", animalId: "a", quarters: ["RF"], okFrom: "2026-10-16T16:30", marks: ["Red leg band"] });
  d.milkWithhold.push({ id: "w2", animalId: "b", quarters: ["LH"], okFrom: "2026-10-15T06:00" });
  d.milkWithhold.push({ id: "w3", animalId: "c", okFrom: "2026-10-01T06:00", dryCow: true, afterCalvingHours: 96, lastDoseAt: "2026-08-20T12:00" });
  d.milkWithhold.push({ id: "w4", animalId: "e", okFrom: "2026-10-10T06:00", releasedAt: "2026-10-10T06:30" });
  const s = S(); let ix = indexHerd(d); let b = board(s, d.milkWithhold, ix, NOW);
  assert.deepEqual(b.withheld.map((x) => x.cow.cowNo), [214]); assert.deepEqual(b.release.map((x) => x.cow.cowNo), [302]); assert.deepEqual(b.dryPending.map((x) => x.cow.cowNo), [140]);
  assert.equal(b.withheld[0].label, "Fri 16 Oct · pm milking");
  // 140 calves Wed 14 Oct 20:00 -> +96 h = Sun 18 20:00 -> Mon 19 am milking; she is now on the board
  d.calvings.push({ id: "k", damId: "c", date: "2026-10-14", time: "20:00" }); ix = indexHerd(d); b = board(s, d.milkWithhold, ix, NOW);
  assert.equal(b.withheld.find((x) => x.cow.cowNo === 140).okFrom, "2026-10-19T06:00");
  assert.equal(effectiveOk(s, { dryCow: true, okFrom: "2026-10-30T06:00", afterCalvingHours: 0 }, { date: "2026-10-14", time: "20:00" }).okFrom, "2026-10-30T06:00");
});

test("cows: groups, lactation, DIM, dry, cow number leads, search", () => {
  const d = empty();
  d.animals.push(cow("a", 214, { lactationBase: 2, calvedDateBase: "2026-05-26" }), cow("h", 900, { dob: "2025-06-01" }), cow("k", "", { dob: "2026-09-01", tag: "UK9 223344 0950 3" }), cow("d", 140, { lactationBase: 4, calvedDateBase: "2025-12-01" }));
  d.dryOffs.push({ id: "x", animalId: "d", date: "2026-10-01" });
  const ix = indexHerd(d);
  assert.equal(groupOf(ix, d.animals[0], T), "milking"); assert.equal(lactation(ix, d.animals[0]), 2); assert.equal(dim(ix, d.animals[0], T), 142);
  assert.equal(groupOf(ix, d.animals[1], T), "heifer"); assert.equal(groupOf(ix, d.animals[2], T), "calf");
  assert.equal(isDry(ix, d.animals[3]), true); assert.equal(groupOf(ix, d.animals[3], T), "dry"); assert.equal(dim(ix, d.animals[3], T), null);
  d.calvings.push({ id: "c1", damId: "a", date: "2026-10-10" }); const ix2 = indexHerd(d);
  assert.equal(lactation(ix2, d.animals[0]), 3); assert.equal(dim(ix2, d.animals[0], T), 5);
  assert.equal(cowLabel(d.animals[0]), "214"); assert.equal(cowLabel(d.animals[2]), "0950 3");
  assert.ok(cowMatches(d.animals[0], "214")); assert.ok(cowMatches(d.animals[0], "02141")); assert.ok(!cowMatches(d.animals[0], "999"));
});

test("yield to date and 305-day projection from test days", () => {
  const d = empty(); d.animals.push(cow("a", 1, { lactationBase: 1, calvedDateBase: "2026-08-01" }));
  d.recordings.push({ id: "r1", date: "2026-08-31", cows: [{ animalId: "a", litres: 30 }] }, { id: "r2", date: "2026-09-30", cows: [{ animalId: "a", litres: 28 }] });
  const y = yieldToDate(indexHerd(d), d.animals[0], "2026-10-10");
  // 30 days × 15 (0→30 trapezoid uses first test as start) = 900? start litres = first test: 30 d × 30 = 900; 30 d × 29 = 870; 10 d × 28 = 280
  assert.equal(y.litres, 2050); assert.equal(y.days, 70); assert.ok(y.p305 > 2050);
});

test("fertility: heats due, to serve, not seen bulling, PD due, dry off, calving dates", () => {
  const s = S(); const d = empty();
  d.animals.push(
    cow("a", 256, { lactationBase: 1, calvedDateBase: "2026-08-15" }), // heat 23 Sep -> repeat 11–17 Oct
    cow("b", 201, { lactationBase: 1, calvedDateBase: "2026-08-21" }), // 55 DIM, no heat yet -> first heat after VWP
    cow("c", 118, { lactationBase: 2, calvedDateBase: "2026-06-01" }), // served 10 Sep -> PD due (35 d)
    cow("e", 145, { lactationBase: 2, calvedDateBase: "2026-06-20" }), // 117 DIM, no heat -> not seen bulling
    cow("f", 140, { lactationBase: 4, calvedDateBase: "2025-12-01" }), // PD+ to serve 23 Jan -> due 31 Oct; dry off 1 Sep (overdue)
    cow("g", 77, { lactationBase: 1, calvedDateBase: "2026-08-01" }), // seen bulling today -> to serve
  );
  d.heats.push({ id: "h1", animalId: "a", date: "2026-09-23" }, { id: "h2", animalId: "g", date: T });
  d.services.push({ id: "s1", animalId: "c", date: "2026-09-10", sireBreed: "CH" }, { id: "s2", animalId: "f", date: "2026-01-23", sireBreed: "HOL" });
  d.pds.push({ id: "p1", animalId: "f", date: "2026-02-28", result: "+" });
  const ix = indexHerd(d); const g = actionLists(s, ix, d, T, 0);
  assert.deepEqual(g.heats.map((x) => x.a.cowNo).sort(), [201, 256]);
  assert.deepEqual(g.serve.map((x) => x.a.cowNo), [77]);
  assert.deepEqual(g.notSeen.map((x) => x.a.cowNo), [145]);
  assert.deepEqual(g.pd.map((x) => x.a.cowNo), [118]);
  const f = fertilityOf(s, ix, d.animals[4], T); assert.equal(f.due, "2026-10-31"); assert.equal(f.dryOffDue, "2026-09-01"); assert.equal(f.pregnant, true);
  assert.deepEqual(g.dryOff.map((x) => x.a.cowNo), [140]); assert.deepEqual(g.calving.map((x) => x.a.cowNo), []); // 16 days out
  assert.deepEqual(actionLists(s, ix, d, T, 7).calving.map((x) => x.a.cowNo), [140]);
  assert.equal(fertilityOf(s, ix, d.animals[2], T).due, "2027-06-24"); // 10 Sep + 287 (CH)
  // do not breed goes to its own list and nowhere else
  d.animals[3].doNotBreed = true; const g2 = actionLists(s, indexHerd(d), d, T, 0);
  assert.deepEqual(g2.doNotBreed.map((x) => x.a.cowNo), [145]); assert.equal(g2.notSeen.length, 0);
});

test("fertility KPIs: 21-day pregnancy & submission rates, % pregnant at PD, calving interval, AFC", () => {
  const s = S(); const d = empty();
  // 4 eligible cows calved 1 Jun; period under test starts 2026-08-14 (today − 21 − 35 ... ) — use rates21 with 1 period
  for (let i = 0; i < 4; i++) d.animals.push(cow("c" + i, i + 1, { calvedDateBase: "2026-06-01", lactationBase: 1 }));
  const r0 = rates21(s, indexHerd(d), d, T, 1)[0]; // start = T − 21 − 35 = 2026-08-20
  assert.equal(r0.start, "2026-08-20"); assert.equal(r0.eligible, 4);
  d.services.push({ id: "s0", animalId: "c0", date: "2026-08-20" }, { id: "s1", animalId: "c1", date: "2026-08-25" }, { id: "s2", animalId: "c2", date: "2026-08-30" });
  d.pds.push({ id: "p0", animalId: "c0", date: "2026-09-24", result: "+" }, { id: "p1", animalId: "c1", date: "2026-09-29", result: "-" }, { id: "p2", animalId: "c2", date: "2026-10-04", result: "+" });
  const r = rates21(s, indexHerd(d), d, T, 1)[0];
  assert.equal(r.served, 3); assert.equal(r.preg, 2); assert.equal(r.subRate, 0.75); assert.equal(r.prRate, 0.5);
  const ix = indexHerd(d); assert.equal(conceived(ix, d.animals[0], d.services[0]), true); assert.equal(conceived(ix, d.animals[1], d.services[1]), false);
  const p = pctPregnantAtPd(ix, d, T); assert.equal(p.n, 3); assert.equal(Math.round(p.rate * 100), 67); // 35 d after each
  const w = weeklyPregnancies(s, ix, d, T); assert.equal(w.cows, 4); assert.equal(w.preg, 2); assert.equal(w.rate, 12.5);
  const d2 = empty(); d2.animals.push(cow("x", 1, { dob: "2023-10-15" })); d2.calvings.push({ id: "k1", damId: "x", date: "2025-10-01" }, { id: "k2", damId: "x", date: "2026-10-01" });
  const ix2 = indexHerd(d2); assert.equal(calvingInterval(ix2, d2, T).days, 365);
  d2.animals.push(cow("y", 2, { dob: "2024-08-15" })); d2.calvings.push({ id: "k3", damId: "y", date: "2026-08-15" });
  assert.equal(ageFirstCalving(indexHerd(d2), d2, T).months, 24); // only y's first calving in the last 12 months (x's was 2025-10-01: 23.5 mo, 12+ months ago)
  assert.deepEqual(strawsLeft([{ id: "st", count: 10 }], [{ strawId: "st" }, { strawId: "st" }]).map((x) => x.left), [8]);
});

test("block herds: 6-week in-calf rate", () => {
  const s = S({ calvingPattern: "Spring block", breedingStart: "2026-05-01" }); const d = empty();
  for (let i = 0; i < 4; i++) d.animals.push(cow("c" + i, i, { calvedDateBase: "2026-02-15", lactationBase: 2 }));
  d.services.push({ id: "s0", animalId: "c0", date: "2026-05-05" }, { id: "s1", animalId: "c1", date: "2026-06-20" }, { id: "s2", animalId: "c2", date: "2026-05-20" });
  d.pds.push({ id: "p0", animalId: "c0", date: "2026-06-10", result: "+" }, { id: "p1", animalId: "c1", date: "2026-07-25", result: "+" }, { id: "p2", animalId: "c2", date: "2026-06-25", result: "+" });
  const r = sixWeekInCalf(s, indexHerd(d), d, "2026-08-01"); assert.equal(r.cows, 4); assert.equal(r.inCalf, 2); assert.equal(r.rate, 0.5); assert.equal(r.week, 12);
});

test("quality: geometric means over 2 / 3 months and traffic lights", () => {
  assert.equal(Math.round(geoMean([100, 400])), 200); assert.equal(geoMean([]), null);
  const q = [{ date: "2026-07-10", scc: 500, tbc: 10 }, { date: "2026-08-10", scc: 150, tbc: 40 }, { date: "2026-09-10", scc: 200, tbc: 10 }, { date: "2026-10-10", scc: 180, tbc: 20 }];
  const scc = rolling(q, "scc"); assert.equal(scc.n, 3); assert.equal(scc.value, Math.round(Math.cbrt(150 * 200 * 180)));
  const tbc = rolling(q, "tbc"); assert.equal(tbc.n, 2); assert.equal(tbc.value, Math.round(Math.sqrt(10 * 20)));
  const s = S();
  assert.equal(qualityStatus("scc", 410, s).level, "late"); assert.equal(qualityStatus("scc", 380, s).text, "Close to the 400k legal limit");
  assert.equal(qualityStatus("scc", 210, s).level, "due"); assert.equal(qualityStatus("tbc", 14, s).level, "ok");
  assert.equal(inhibitoryFails([{ date: "2026-01-01", inhibitory: "fail" }, { date: "2025-01-01", inhibitory: "fail" }], T).length, 1);
});

test("tank log: strip of milkings, over-limit and missing reading", () => {
  const s = S(); const log = [{ date: "2026-10-15", milking: "am", tempC: 3.6 }, { date: "2026-10-14", milking: "pm", tempC: 9.2 }, { date: "2026-10-14", milking: "am", tempC: 3.9 }];
  const st = tankStrip(s, log, NOW, 2);
  assert.deepEqual(st.map((x) => x.state), ["ok", "over", "ok", "future"]);
  assert.equal(tankDue(s, log, NOW), null); assert.equal(tankDue(s, log, "2026-10-15T17:00").part, "pm");
});

test("mastitis: recurrence (30 d), failure (21 d), case count, herd rates, SCC lists, selective DCT", () => {
  const earlier = [{ date: "2026-10-01", quarters: ["RF"] }, { date: "2026-08-01", quarters: ["LH"] }];
  assert.deepEqual(caseFacts(earlier, { date: "2026-10-15", quarters: ["RF"] }, "2026-06-01"), { recurrence: true, failure: true, caseNo: 3 });
  assert.deepEqual(caseFacts(earlier, { date: "2026-10-25", quarters: ["RF"] }, "2026-06-01"), { recurrence: true, failure: false, caseNo: 3 });
  assert.equal(caseFacts(earlier, { date: "2026-10-15", quarters: ["LF"] }, "2026-09-01").recurrence, false);
  const d = empty(); for (let i = 0; i < 10; i++) d.animals.push(cow("c" + i, i, { lactationBase: 2, calvedDateBase: "2026-05-01" }));
  d.mastitis.push({ id: "m1", animalId: "c0", date: "2026-09-01", quarters: ["RF"] }, { id: "m2", animalId: "c0", date: "2026-09-20", quarters: ["RF"], recurrence: true, failure: true }, { id: "m3", animalId: "c1", date: "2026-03-01", quarters: ["LF"] });
  const h = herdMastitis(indexHerd(d), d, T); assert.equal(h.ratePer100, 30); assert.equal(h.pctAffected, 0.2); assert.equal(Math.round(h.recurrencePct * 100), 33);
  d.recordings.push({ id: "r1", date: "2026-08-01", cows: [{ animalId: "c2", scc: 250 }, { animalId: "c3", scc: 90 }] }, { id: "r2", date: "2026-09-01", cows: [{ animalId: "c2", scc: 300 }, { animalId: "c3", scc: 120 }] }, { id: "r3", date: "2026-10-01", cows: [{ animalId: "c2", scc: 410 }, { animalId: "c3", scc: 230 }, { animalId: "c4", scc: 60 }] });
  const ix = indexHerd(d); const l = sccLists(ix, d, T);
  assert.deepEqual(l.high.map((x) => x.a.cowNo), [2, 3]); assert.deepEqual(l.chronic.map((x) => x.a.cowNo), [2]); assert.deepEqual(l.newInf.map((x) => x.a.cowNo), [3]);
  d.recordings.push({ id: "r0", date: "2026-07-01", cows: [{ animalId: "c4", scc: 50 }, { animalId: "c4b", scc: 1 }] }, { id: "r00", date: "2026-06-01", cows: [{ animalId: "c4", scc: 70 }] });
  const ix2 = indexHerd(d); assert.equal(sdctRow(ix2, d.animals[4]).low, true); assert.equal(sdctRow(ix2, d.animals[2]).low, false); assert.equal(sdctRow(ix2, d.animals[0]).cases, 2);
  assert.equal(failures(d, T).length, 1);
  const ht = heiferTriggers(ix2, d, T); assert.equal(ht.heifers, 0);
});

test("money: cheque pence per litre, solids, estimate from processor profile, what-if, MOPF", () => {
  const f = chequeFigures({ litres: 100000, fat: 4.2, protein: 3.4, basePpl: 38, adjustments: [{ label: "Constituents", ppl: 1.5 }], deductions: [{ label: "Levy", amount: 200 }] });
  assert.equal(Math.round(f.total), 39300); assert.equal(Math.round(f.ppl * 100) / 100, 39.3); assert.equal(Math.round(f.solidsKg), 7828);
  const p = { basePpl: 38, baseFat: 4.0, baseProtein: 3.3, fatPer01: 0.3, proteinPer01: 0.5, sccBands: [{ over: 250, ppl: -0.5 }, { over: 400, ppl: -2 }], tbcBands: [], deductPpl: 0.2 };
  assert.equal(estimatePpl(p, { fat: 4.2, protein: 3.4, scc: 260, tbc: 20 }), 38 + 0.6 + 0.5 - 0.5 - 0.2);
  assert.equal(estimatePpl({ ...p, basePpl: "" }, {}), null);
  const ch = [{ date: "2026-09-30", cheque: { month: "2026-09", litres: 100000 } }, { date: "2026-08-31", cheque: { month: "2026-08", litres: 110000 } }];
  const wi = whatIf(ch, 1, T); assert.equal(wi.litres, 1260000); assert.equal(wi.effect, 12600);
  const fin = [{ date: "2026-09-30", kind: "revenue", category: "Milk", amount: 39000, cheque: { litres: 100000 } }, { date: "2026-09-12", kind: "expense", category: "Feed", amount: 12000, kg: 30000 }];
  const m = mopf(fin, "2026-09", 100); assert.equal(m.cowDays, 3000); assert.equal(m.perCowDay, 9); assert.equal(m.ppl, 27); assert.equal(m.concPerLitre, 0.3);
});

test("calves: mixing sheet, growth targets, weigh tape, Brix", () => {
  assert.deepEqual(mixing({ calves: 6, lPerFeed: 3, feedsPerDay: 2, gPerL: 150 }), { litresDay: 36, kgDay: 5.4, litresFeed: 18, kgFeed: 2.7 });
  assert.equal(targetKg(56, 650, 40), 80); assert.equal(Math.round(targetKg(182, 650)), 176); assert.equal(targetKg(365, 650), 325); assert.equal(Math.round(targetKg(700, 650)), 569);
  const g = growthStatus("2026-01-01", { date: "2026-07-02", kg: 150 }, 650, 40); assert.equal(g.behind, true);
  assert.equal(tapeKg(150), 276); assert.equal(tapeKg(50), null); assert.equal(brixGood(24), true); assert.equal(brixGood(18), false);
});

test("tools: slurry weeks, cull ranking with reasons, yearly due dates", () => {
  const r = slurryWeeks({ capacityM3: 1000, cows: 100, perCowWk: 0.37, youngstock: 40, perYoungWk: 0.19, calves: 0, extraWk: 5 }); // 37 + 7.6 + 5 = 49.6/wk
  assert.equal(Math.round(r.weeks * 10) / 10, 20.2); assert.equal(r.ok, false); assert.equal(r.shortM3, Math.round((22 - 1000 / 49.6) * 49.6));
  const d = empty(); d.animals.push(cow("a", 1, { lactationBase: 7, calvedDateBase: "2026-01-01" }), cow("b", 2, { lactationBase: 1, calvedDateBase: "2026-09-01" }));
  d.mastitis.push({ id: "m", animalId: "a", date: "2026-03-01", quarters: ["LF"] });
  const rk = cullRanking(S(), indexHerd(d), d, T); assert.equal(rk[0].a.cowNo, 1); assert.ok(rk[0].reasons.includes("7th lactation"));
  assert.deepEqual(yearlyDue("2025-11-30", T), { due: "2026-11-30", left: 46 });
});

test("duties: calf tagging 36 h, register 7 d / NIFAIS 27 d, NIFAIS-online mode 23 d; course doses; release; tank", () => {
  const d = empty(); d.animals.push(cow("m", 214, { lactationBase: 3, calvedDateBase: "2026-10-14" }), { id: "k", bornInHerd: true, dob: "2026-10-14", birthTime: "20:00", damId: "m", sex: "Heifer" });
  let c = ctx(d); let steps = calfSteps(c)[0].steps;
  assert.deepEqual(steps.map((x) => [x.key, x.due]), [["tagged", "2026-10-16"], ["register", "2026-10-21"], ["nifais", "2026-11-10"]]);
  let t = todayTasks(c); assert.ok(t.some((x) => x.title === "Tag calf of 214 (within 36 hours)"));
  c = ctx(d, { registerMode: "nifais" }); steps = calfSteps(c)[0].steps; assert.deepEqual(steps.map((x) => [x.key, x.due]), [["tagged", "2026-10-16"], ["nifais", "2026-11-06"]]);
  // alerts: untagged at 24 h -> due; at 36 h -> late
  assert.equal(dairyAlerts(ctx(d, {}, "2026-10-15T21:00")).find((a) => a.key === "tag:k").level, "due");
  assert.equal(dairyAlerts(ctx(d, {}, "2026-10-16T09:00")).find((a) => a.key === "tag:k").level, "late");
  // course: 3 tubes every 12 h from yesterday 18:00 -> 2nd today 06:00, 3rd today 18:00
  d.medicines.push({ id: "md", date: "2026-10-14", time: "18:00", doses: 3, intervalH: 12, animalIds: ["m"], quarters: ["RF"], reason: "Mastitis", productName: "Synulox LC" });
  d.milkWithhold.push({ id: "w", animalId: "m", quarters: ["RF"], okFrom: "2026-10-15T16:30" });
  t = todayTasks(ctx(d)); const titles = t.map((x) => x.title);
  assert.ok(titles.includes("Mastitis tube: 214 RF, 2nd tube")); assert.ok(titles.includes("Mastitis tube: 214 RF, 3rd tube"));
  assert.ok(titles.includes("Release 214 RF at tonight's milking"));
  assert.ok(titles.includes("Log tank temperature after morning milking"));
  d.tankLog.push({ id: "tk", date: T, milking: "am", tempC: 3.5 }); assert.ok(!todayTasks(ctx(d)).some((x) => x.key.startsWith("tank:")));
  // TB: next test from the last test + 12 months
  d.tbTests.push({ id: "tb", date: "2025-11-01" }); assert.equal(tbNext(ctx(d)), "2026-11-01"); assert.ok(todayTasks(ctx(d)).some((x) => x.key === "tb:2026-11-01"));
});

test("alerts: withheld cows, tank over limit, inhibitory fail, rolling SCC near legal, DP.4 failure", () => {
  const d = empty(); d.animals.push(cow("a", 214), cow("b", 302));
  d.milkWithhold.push({ id: "w1", animalId: "a", quarters: ["RF"], okFrom: "2026-10-16T16:30" }, { id: "w2", animalId: "b", okFrom: "2026-10-15T06:00" });
  d.tankLog.push({ id: "t", date: T, milking: "am", tempC: 9.2 });
  d.milkQuality.push({ id: "q1", date: "2026-10-13", scc: 380, tbc: 20, inhibitory: "fail" });
  d.mastitis.push({ id: "m", animalId: "a", date: "2026-10-12", quarters: ["RF"], failure: true });
  const al = dairyAlerts(ctx(d)); const by = (k) => al.find((x) => x.key === k);
  assert.equal(by("withheld").title, "Milk out of the tank — 1 cow"); assert.equal(by("withheld").level, "late");
  assert.match(by("release:w2").title, /^302 can go back in the tank/);
  assert.equal(by("tank:t").title, "Tank 9.2 °C after morning milking — above 8 °C");
  assert.equal(by("inhib:q1").title, "Milk failed the antibiotic test (13/10).");
  assert.equal(by("q:scc").title, "SCC 3-month average 380k — close to the 400k legal limit");
  assert.equal(by("dp4:m").level, "due");
  assert.equal(al[0].level, "late");
});

test("checklist: header version, auto evidence and key gaps", () => {
  const d = empty(); d.animals.push(cow("a", 1)); const c = ctx(d);
  const rows = evaluate(c, { "DP.1": { done: true } });
  assert.equal(rows.find((r) => r.id === "DP.1").status, "ok"); assert.equal(rows.find((r) => r.id === "MP.16").status, "gap");
  assert.equal(rows.find((r) => r.id === "EC.1.1").ev.text, "Fill in the slurry calculator");
  const sm = summary(rows); assert.equal(sm.n, ITEMS.length); assert.ok(sm.keyGaps > 0);
});

test("registers: every register builds, MC3 notes NIFAIS mode, collation", () => {
  const d = empty(); d.animals.push(cow("a", 1)); d.medicines.push({ id: "m", date: T, animalIds: ["a"], productName: "X", reason: "Mastitis" });
  const c = ctx(d, { registerMode: "nifais" });
  for (const k of Object.keys(REGISTERS)) { const r = buildRegister(k, c); assert.ok(r.headers.length && Array.isArray(r.rows), k); }
  assert.match(buildRegister("register", c).note, /NIFAIS Online — this is a working copy/);
  assert.equal(buildRegister("medicine", c).rows[0][1], "1");
  assert.equal(collation(c).rows.length, 8);
});

test("csv import: parse, guess columns, map to a recording, UK dates, SCC in cells/ml", () => {
  const p = parseCsv('Cow No;Test Date;Yield;Fat %;Protein %;SCC\n214;12/10/2026;31,5;4.1;3.3;410000\n"999";12/10/2026;20;;;\n');
  assert.deepEqual(p.headers, ["Cow No", "Test Date", "Yield", "Fat %", "Protein %", "SCC"]);
  const map = guessMap(p.headers); assert.deepEqual(map, { cowNo: 0, date: 1, litres: 2, fat: 3, protein: 4, scc: 5 });
  const rec = toRecording(p, map, (no) => (no === "214" ? { id: "a", cowNo: 214 } : null), T);
  assert.equal(rec.date, "2026-10-12"); assert.equal(rec.cows[0].litres, 31.5); assert.equal(rec.cows[0].scc, 410); assert.equal(rec.unmatched.length, 1);
  assert.equal(normDate("2026-1-5"), "2026-01-05"); assert.equal(normDate("05.01.26"), "2026-01-05");
});

test("BVD breeding-female rule is content: blocks only when in force", () => {
  assert.equal(bvdRuleState({ ...BVD_BREEDING_FEMALE_RULE, status: "announced", from: "2026-03-01" }, "2026-02-01").inForce, false);
  assert.equal(bvdRuleState({ ...BVD_BREEDING_FEMALE_RULE, status: "announced", from: "2026-03-01" }, "2026-03-02").inForce, true);
  assert.equal(bvdRuleState({ ...BVD_BREEDING_FEMALE_RULE, status: "delayed" }, "2027-01-01").inForce, false);
});

test("scores: % lame (2–3), BCS mean and spread, mobility trend, trimmer list from latest session", async () => {
  const { sessionSummary, mobilityTrend, trimmerList } = await import("../../app/js/sectors/dairy/model/scores.js");
  const m = sessionSummary("mobility", [0, 1, 2, 3, 1, 0, 2, 1]);
  assert.equal(m.n, 8); assert.equal(m.lame, 3); assert.equal(m.severe, 1); assert.equal(m.pct, 38);
  const b = sessionSummary("bcs", [2.25, 3, 3.75, 3]);
  assert.equal(b.mean, 3); assert.equal(b.thin, 1); assert.equal(b.fat, 1);
  assert.equal(sessionSummary("mobility", []).n, 0);
  const ses = [
    { date: "2026-09-01", method: "mobility", scores: [{ id: "a", score: 3 }, { id: "b", score: 0 }] },
    { date: "2026-10-01", method: "mobility", scores: [{ id: "a", score: 2 }, { id: "b", score: 3 }, { id: "c", score: 1 }, { id: "d", score: 0 }] },
    { date: "2026-10-05", method: "bcs", scores: [{ id: "a", score: 3 }] },
    { date: "2026-10-10", method: "mobility", deleted: true, scores: [{ id: "a", score: 3 }] },
  ];
  assert.deepEqual(mobilityTrend(ses), [{ date: "2026-09-01", pct: 50, n: 2 }, { date: "2026-10-01", pct: 50, n: 4 }]);
  const t = trimmerList(ses); assert.equal(t.date, "2026-10-01"); assert.deepEqual(t.cows.map((r) => r.id), ["b", "a"]);
  assert.deepEqual(trimmerList([]), { date: null, cows: [] });
});
