// Broilers ledger model: hand-worked numbers for every calculation and rule in design/15.
import { test } from "node:test";
import assert from "node:assert/strict";
import { broilerSettings } from "../../app/js/sectors/broilers/model/settings.js";
import { indexBroilers, cropDay, legalLine, aliveStart, aliveEnd, dailyMortPct, cumMortPct, mort7Pct, avgDeaths, cropEvents, houseState, cropNo, daysEmptyBefore, waterOn, waterChangePct, outOf } from "../../app/js/sectors/broilers/model/crop.js";
import { stdWt, weighStats, performance, estWeight, vsStdPct, daysUnder } from "../../app/js/sectors/broilers/model/growth.js";
import { densityOf, farmLimit, tierOf, projection, crossDay, birdsToThin, thinPlan, densityNeeds, sevenCropRecord } from "../../app/js/sectors/broilers/model/density.js";
import { salmWindow, salmStatus, fciSendBy, feedOffDefault, feedOffLevel, withdrawalEnd, withdrawalClashes, turnaroundDays } from "../../app/js/sectors/broilers/model/paper.js";
import { epef, cropResults, paymentEstimate, settlementCheck, incomePerM2, energyUse, energyCost } from "../../app/js/sectors/broilers/model/results.js";
import { buildFci, fciGaps, fciText } from "../../app/js/sectors/broilers/model/fci.js";
import { workingDaysBefore, niBankHolidays, easter, addHours, hoursBetween, dayLabel } from "../../app/js/sectors/broilers/model/time.js";
import { antibioticFlag, regionRule, RT_HEADER } from "../../app/js/sectors/broilers/model/content.js";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);
const S = (meta = {}, on = {}) => broilerSettings({ settings: on }, meta);
const T = "2026-10-20";
const add = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** One house, one crop placed 23 days ago with 32,800 chicks; checks with deaths each day. */
function farm({ deathsPerDay = 30, today = T, placed = 32800, extra = {} } = {}) {
  const placedDate = add(today, -23);
  const data = { houses: [{ id: "h1", name: "House 1", usableM2: 1950 }], crops: [{ id: "c1", houseId: "h1", no: 41, placedDate, placed, hybrid: "Ross 308" }], checks: [], thins: [], weighs: [], salmSamples: [], fci: [], brooding: [], energy: [], feedDeliveries: [], medicines: [], turnarounds: [], ...extra };
  for (let d = 0; d < 23; d++) data.checks.push({ id: `k${d}`, cropId: "c1", houseId: "h1", date: add(placedDate, d), slot: "am", dead: deathsPerDay, culls: {} });
  return data;
}

test("settings: defaults from design/15 §15 and onboarding answers", () => {
  const s = S({}, { breed: "Cobb 500", processor: "Moy Park", birdsPerCrop: "32000", houses: 2 });
  assert.equal(s.hybrid, "Cobb 500"); assert.equal(s.breedStdId, "cobb500-2018"); assert.equal(s.processor, "Moy Park");
  assert.equal(s.farmLimitKgM2, 38); assert.equal(s.mortalitySpikePct, 0.3); assert.equal(s.mortalityMultiple, 3);
  assert.deepEqual(s.checkTimes, { am: "10:00", pm: "20:00" }); assert.equal(s.housesPlanned, 2); assert.equal(s.birdsPerCrop, 32000);
  assert.equal(S().hybrid, "Ross 308"); assert.equal(S().breedStdId, "ross308-2022");
});

test("crop day, alive, daily and cumulative mortality, legal line (§4)", () => {
  const data = farm(); const ix = indexBroilers(data); const c = ix.crops[0];
  assert.equal(cropDay(c, T), 23);
  assert.equal(aliveStart(ix, c, T), 32800 - 23 * 30);
  // today: an AM check with 27 dead + 6 legs + 4 runts + 1 ascites
  data.checks.push({ id: "t", cropId: "c1", date: T, slot: "pm", dead: 27, culls: { legs: 6, runt: 4, ascites: 1 } });
  const ix2 = indexBroilers(data); const c2 = ix2.crops[0];
  assert.equal(outOf(data.checks.at(-1)), 38);
  near(dailyMortPct(ix2, c2, T), (38 / (32800 - 690)) * 100);
  near(cumMortPct(ix2, c2, T), ((690 + 38) / 32800) * 100);
  assert.equal(aliveEnd(ix2, c2, T), 32800 - 728);
  near(legalLine(38), 3.28); near(legalLine(0), 1);
  near(mort7Pct(ix2, c2), (8 * 30 / 32800) * 100);
  assert.equal(avgDeaths(ix2, c2, T, 3), 30);
});

test("crop events: planned thin and clear from settings, recorded thins win (§3.1)", () => {
  const data = farm(); const s = S(); let ix = indexBroilers(data); const c = ix.crops[0];
  let ev = cropEvents(ix, c, s);
  assert.deepEqual(ev.map((e) => [e.kind, e.day]), [["thin", 31], ["clear", 38]]);
  data.thins.push({ id: "t1", cropId: "c1", kind: "thin", catchAt: `${add(c.placedDate, 30)}T02:00`, birds: 6400, status: "planned" });
  ix = indexBroilers(data); ev = cropEvents(ix, ix.crops[0], s);
  assert.deepEqual(ev.map((e) => [e.kind, e.day, !!e.rec]), [["thin", 30, true], ["clear", 38, false]]);
  assert.equal(houseState(ix, ix.houses[0], s, T).stage, "growing");
  assert.equal(houseState(ix, ix.houses[0], s, add(c.placedDate, 2)).stage, "brooding");
  assert.equal(houseState(ix, ix.houses[0], s, add(c.placedDate, 30)).stage, "thinning");
  assert.equal(cropNo(ix), 41);
});

test("growth: interpolated objective, weigh stats (CV, uniformity), projection by performance ratio (§6.1)", () => {
  const std = { days: [{ d: 0, wtG: 44 }, { d: 7, wtG: 213 }, { d: 14, wtG: 533 }, { d: 21, wtG: 1012 }, { d: 28, wtG: 1616 }] };
  near(stdWt(std, 21), 1012); near(stdWt(std, 24.5), 1012 + (1616 - 1012) / 2);
  const st = weighStats([900, 1000, 1100, 1000]); near(st.mean, 1000); near(st.uniformity, 100); near(st.cv, (Math.sqrt(20000 / 3) / 1000) * 100);
  assert.deepEqual(weighStats({ n: 100, totalKg: 97.5 }).mean, 975);
  const data = farm(); const ix0 = indexBroilers(data); const c = ix0.crops[0];
  data.weighs.push({ id: "w1", cropId: "c1", date: add(c.placedDate, 14), weights: [512] }, { id: "w2", cropId: "c1", date: add(c.placedDate, 21), weights: [975] });
  const ix = indexBroilers(data); const s = S(); const R = { ...std, days: [...std.days, { d: 35, wtG: 2296 }, { d: 42, wtG: 2998 }] };
  const p = performance(ix, ix.crops[0], R, T);
  assert.equal(p.method, "gain"); near(p.ratio, (975 - 512) / (1012 - 533));
  near(estWeight(ix, ix.crops[0], R, 21, T), 975);
  near(estWeight(ix, ix.crops[0], R, 22, T), 975 + (stdWt(R, 22) - stdWt(R, 21)) * p.ratio);
  assert.ok(vsStdPct(ix, ix.crops[0], R, 21, T) < -3);
  assert.ok(daysUnder(ix, ix.crops[0], R, T, 3) >= 3, "under objective for 3 days");
  assert.ok(s.weightAlertDays === 3);
});

test("density: kg/m², tiers 33/38/39/42, birds to thin rounded to module, crossing day (§6.2)", () => {
  near(densityOf(32000, 2450, 1950), 32000 * 2.45 / 1950);
  assert.equal(tierOf(33), "none"); assert.equal(tierOf(36), "notify"); assert.equal(tierOf(40), "approval"); assert.equal(tierOf(43), "over");
  assert.equal(farmLimit(S(), {}), 38); assert.equal(farmLimit(S({ farmLimitKgM2: 45 }), {}), 42, "never above the legal maximum");
  // alive 31,000 at clear, 2.6 kg → 38 × 1950 ÷ 2.6 = 28,500 allowed → 2,500 to thin
  assert.equal(birdsToThin({ aliveAtClear: 31000, wtAtClearG: 2600, limit: 38, area: 1950, module: 100 }), 2500);
  assert.equal(birdsToThin({ aliveAtClear: 31010, wtAtClearG: 2600, limit: 38, area: 1950, module: 100 }), 2600);
  assert.equal(birdsToThin({ aliveAtClear: 20000, wtAtClearG: 2600, limit: 38, area: 1950 }), 0);
  const data = farm(); const ix = indexBroilers(data); const c = ix.crops[0]; const s = S();
  const proj = projection(ix, c, s, 1950, T, { thins: [] });
  assert.equal(proj.length, 39); assert.equal(proj[23].alive, 32800 - 690 - 30);
  const cross = crossDay(ix, c, s, 1950, T, 38);
  assert.ok(cross > 23 && cross <= 38, `crosses on day ${cross}`);
  near(proj[cross].kg > 38 ? 1 : 0, 1); assert.ok(proj[cross - 1].kg <= 38);
  const plan = thinPlan(ix, c, s, 1950, T, 31);
  assert.ok(plan.toThin > 0 && plan.toThin % 100 === 0); assert.ok(plan.atClear <= 38.0001, `at clear ${plan.atClear}`);
});

test("density law: notify DAERA 15 working days before >33; approval and 7-crop record >39 (§6.2)", () => {
  // placement Mon 2 Nov 2026: 15 working days before = Mon 12 Oct 2026 (no bank holidays between)
  assert.equal(workingDaysBefore("2026-11-02", 15), "2026-10-12");
  assert.equal(workingDaysBefore("2026-07-15", 3), "2026-07-09", "Mon 13 July 2026 (the Twelfth, substitute day) skipped");
  assert.ok(niBankHolidays(2026).has("2026-03-17")); assert.ok(niBankHolidays(2026).has("2026-07-13"), "12 July 2026 is a Sunday → Mon 13");
  assert.equal(easter(2026), "2026-04-05"); assert.ok(niBankHolidays(2026).has("2026-04-06"));
  const crop = { id: "c", houseId: "h", placedDate: "2026-11-02", notifiedDaera: "2026-10-12" };
  const ix = indexBroilers({ houses: [{ id: "h", name: "H" }], crops: [crop] });
  const n = densityNeeds(ix, crop, S(), 36); assert.equal(n.tier, "notify"); assert.equal(n.notifyBy, "2026-10-12"); assert.equal(n.notifyOk, true);
  assert.equal(densityNeeds(ix, { ...crop, notifiedDaera: "2026-10-13" }, S(), 36).notifyOk, false);
  assert.equal(densityNeeds(ix, crop, S(), 30).notifyOk, true);
  const a = densityNeeds(ix, crop, S(), 40); assert.equal(a.needsApproval, true); assert.equal(a.sevenCrops.ok, false, "fewer than 7 earlier crops");
  // seven earlier crops all under 1% + 0.06% × age
  const crops = []; const checks = [];
  for (let i = 0; i < 7; i++) { const pd = add("2025-01-01", i * 45); crops.push({ id: `p${i}`, houseId: "h", placedDate: pd, placed: 10000, clearedDate: add(pd, 38) }); checks.push({ id: `x${i}`, cropId: `p${i}`, date: add(pd, 5), slot: "am", dead: i === 3 ? 340 : 200, culls: {} }); }
  crops.push(crop); const ix7 = indexBroilers({ houses: [{ id: "h", name: "H" }], crops, checks });
  const r = sevenCropRecord(ix7, crop, S()); assert.equal(r.count, 7); assert.equal(r.ok, false, "crop 4 at 3.4% is over 3.28%");
  near(r.rows[3].line, 3.28); near(r.rows[3].cum, 3.4);
});

test("Salmonella window (21 d, 42 d if ≥82 d or organic) and status (§11)", () => {
  const w = salmWindow("2026-10-23", S(), 31);
  assert.deepEqual([w.from, w.to, w.doBy, w.days, w.noLitterFrom], ["2026-10-02", "2026-10-23", "2026-10-20", 21, "2026-10-18"]);
  assert.equal(salmWindow("2026-10-23", S({ organic: true }), 31).days, 42);
  assert.equal(salmWindow("2026-12-23", S(), 82).days, 42);
  const data = farm(); let ix = indexBroilers(data); const c = ix.crops[0]; const s = S();
  let st = salmStatus(ix, c, s, T); // thin day 31 = 28 Oct; window 7–28 Oct; doBy 25 Oct
  assert.equal(st[0].state, "open"); assert.equal(st[0].window.doBy, "2026-10-25");
  assert.equal(salmStatus(ix, c, s, "2026-10-23")[0].state, "due");
  assert.equal(salmStatus(ix, c, s, "2026-10-26")[0].state, "late");
  data.salmSamples.push({ id: "s1", cropId: "c1", date: "2026-10-19", swabPairs: 2, result: "negative" }); ix = indexBroilers(data);
  st = salmStatus(ix, ix.crops[0], s, T); assert.equal(st[0].state, "ok"); assert.equal(st[1].state, "ok", "the same sample covers the clear-out 7 days later");
  data.salmSamples[0].result = "SE"; ix = indexBroilers(data); assert.equal(salmStatus(ix, ix.crops[0], s, T)[0].state, "positive");
});

test("FCI send-by = arrival − 24 h; feed off ≤ 9 h (RT) / ≤ 12 h (law); withdrawal vs catch (§7, §8)", () => {
  const s = S();
  assert.equal(fciSendBy("2026-10-23T02:00", s), "2026-10-22T02:00");
  assert.equal(fciSendBy("2026-10-23T02:00", s, "2026-10-23T12:00"), "2026-10-22T12:00");
  assert.equal(fciSendBy("2026-10-23T02:00", S({ arrivalHoursAfterCatch: 3 })), "2026-10-22T05:00");
  assert.equal(feedOffDefault("2026-10-23T02:00", s), "2026-10-22T17:00");
  assert.equal(feedOffLevel("2026-10-22T17:00", "2026-10-23T02:00").level, "ok");
  assert.equal(feedOffLevel("2026-10-22T16:00", "2026-10-23T02:00").level, "due");
  assert.equal(feedOffLevel("2026-10-22T13:30", "2026-10-23T02:00").level, "late");
  near(hoursBetween("2026-10-22T17:00", "2026-10-23T02:00"), 9); assert.equal(addHours("2026-12-31T23:30", 1), "2027-01-01T00:30");
  assert.equal(withdrawalEnd({ date: "2026-10-10", days: 5, wdDays: 7 }), "2026-10-21");
  const data = farm({ extra: { medicines: [{ id: "m1", cropId: "c1", date: "2026-10-18", days: 3, wdDays: 7, product: "Amoxycillin" }] } });
  const ix = indexBroilers(data); assert.equal(withdrawalClashes(ix, ix.crops[0], "2026-10-23").length, 1);
  assert.equal(withdrawalClashes(ix, ix.crops[0], "2026-10-27").length, 0);
});

test("FCI document pre-filled from records; gaps listed (§8)", () => {
  const data = farm({ extra: { salmSamples: [{ id: "s", cropId: "c1", date: "2026-10-19", result: "negative", lab: "AFBI Stormont" }] } });
  const ix = indexBroilers(data); const c = ix.crops[0]; const s = S({ vetName: "Dr Kerr", vetAddress: "Ballymena" });
  const thin = { id: "t", kind: "thin", catchAt: "2026-10-23T02:00", birds: 6400, processor: "Moy Park" };
  const doc = buildFci({ ix, s, crop: c, thin, house: { name: "House 1", establishmentNo: "UK1234" } });
  assert.equal(doc.flock.ageAtSlaughter, 26); assert.equal(doc.sendBy, "2026-10-22T02:00");
  assert.equal(doc.mortality.days.length, 27); near(doc.mortality.cumPct, (23 * 30 / 32800) * 100);
  assert.equal(doc.salmonella.result, "Negative"); assert.deepEqual(fciGaps(doc), []);
  assert.match(fciText(doc), /FOOD CHAIN INFORMATION/); assert.match(fciText(doc), /Dr Kerr/);
  const g = fciGaps(buildFci({ ix: indexBroilers(farm()), s: S(), crop: c, thin, house: {} }));
  assert.ok(g.some((x) => /Salmonella/.test(x)) && g.some((x) => /vet/.test(x)));
});

test("crop results: liveability, avg weight, FCR, EPEF; 7-day mortality; days empty (§9.1)", () => {
  near(epef({ liveability: 96.8, avgKg: 2.58, ageDays: 38.4, fcr: 1.52 }), (96.8 * 2.58) / (38.4 * 1.52) * 100);
  assert.equal(epef({ liveability: 96, avgKg: 2.5, ageDays: 0, fcr: 1.5 }), null);
  const pd = "2026-08-01";
  const data = { houses: [{ id: "h", name: "H" }], crops: [{ id: "a", houseId: "h", placedDate: "2026-06-10", placed: 100, clearedDate: "2026-07-18" }, { id: "c", houseId: "h", placedDate: pd, placed: 10000, clearedDate: add(pd, 38) }],
    checks: [{ id: "k", cropId: "c", date: add(pd, 3), slot: "am", dead: 80, culls: {} }],
    thins: [{ id: "t1", cropId: "c", kind: "thin", catchAt: `${add(pd, 31)}T02:00`, birds: 2000, avgKg: 1.8, status: "done" }, { id: "t2", cropId: "c", kind: "clear", catchAt: `${add(pd, 38)}T02:00`, birds: 7600, status: "done", docket: { received: 7600, kg: 19760, doa: 8, rejPct: 0.9, footpad: 12, hockPct: 3 } }],
    feedDeliveries: [{ id: "f1", cropId: "c", kg: 30000 }, { id: "f2", cropId: "c", kg: 5000, kind: "return" }] };
  const ix = indexBroilers(data); const r = cropResults(ix, ix.cropById.get("c"));
  assert.equal(r.sold, 9600); near(r.kg, 3600 + 19760); near(r.liveability, 96); near(r.avgKg, 23360 / 9600);
  near(r.ageDays, (2000 * 31 + 7600 * 38) / 9600); near(r.fcr, 25000 / 23360);
  near(r.epef, (96 * (23360 / 9600)) / (r.ageDays * r.fcr) * 100);
  near(r.mort7, 0.8); assert.equal(r.daysEmpty, 14); near(r.doaPct, 8 / 9600 * 100); assert.equal(r.footpad, 12);
});

test("payment estimate from the farmer's contract profile; settlement check; income per m² (§9.2)", () => {
  const prof = { basis: "bird", rate: 0.1, bonusRows: [{ metric: "fcr", op: "<", value: 1.55, amount: 0.005, per: "bird", label: "FCR bonus" }, { metric: "rejects", op: ">", value: 1.5, amount: -0.003, per: "bird" }] };
  const e = paymentEstimate(prof, { sold: 30000, kg: 78000, fcr: 1.52, rejPct: 0.9 });
  near(e.total, 3000 + 150); near(e.perBird, 0.105); assert.equal(e.lines.length, 2);
  near(paymentEstimate({ basis: "kg", rate: 0.04 }, { sold: 1, kg: 80000 }).total, 3200);
  assert.equal(paymentEstimate({ basis: "bird" }, { sold: 1 }), null);
  const chk = settlementCheck(3150, 3080); near(chk.diff, -70); assert.equal(chk.flag, true); assert.equal(settlementCheck(3150, 3140).flag, false);
  near(incomePerM2([{ date: "2026-09-01", amount: 3900 }, { date: "2025-09-01", amount: 9999 }], 3900, T), 1);
});

test("energy per crop: meters, stores with deliveries, LPG % of tank; £ per bird and pence per kg (§9.3)", () => {
  const use = energyUse({ readings: [{ kind: "lpgPct", start: 80, end: 30 }, { kind: "elec", start: 1000, end: 4000 }], deliveries: [{ kind: "lpgPct", qty: 40 }] }, { lpgTankLitres: 10000 });
  near(use.lpg, 9000); near(use.elec, 3000);
  const cost = energyCost(use, { lpg: 0.5, elec: 0.25 }, 30000, 78000);
  near(cost.total, 5250); near(cost.perBird, 0.175); near(cost.perKgPence, 5250 / 78000 * 100);
  assert.equal(energyCost(use, {}, 1, 1), null);
});

test("turnaround: days empty and the ≥ 5 day Red Tractor rule (§10)", () => {
  assert.deepEqual(turnaroundDays({ clearedDate: "2026-09-14", nextPlacement: "2026-09-22" }, "2026-09-17"), { days: 3, planned: 8, short: false, shortActual: false });
  assert.equal(turnaroundDays({ clearedDate: "2026-09-14", nextPlacement: "2026-09-18" }, "2026-09-15").short, true);
  assert.equal(turnaroundDays({ clearedDate: "2026-09-14", placedDate: "2026-09-17" }, T).shortActual, true);
});

test("water: litres per day from the meter and change vs the 3-day average (§13)", () => {
  const data = farm(); data.checks = [];
  const pd = indexBroilers(data).crops[0].placedDate; const meter = [1000, 6000, 11000, 16000, 20400];
  meter.forEach((v, i) => data.checks.push({ id: `w${i}`, cropId: "c1", date: add(pd, 10 + i), slot: "am", waterMeter: v, dead: 0, culls: {} }));
  const ix = indexBroilers(data); const c = ix.crops[0];
  assert.equal(waterOn(ix, c, add(pd, 14)), 4400); near(waterChangePct(ix, c, add(pd, 14)), -12);
});

test("content: region values via the shared loader with broiler fallbacks; antibiotic classes; RT header", () => {
  assert.equal(regionRule("broilerDensity").notifyWorkingDays, 15);
  assert.equal(regionRule("inventories").birdsCountMonthDay, "06-01");
  assert.equal(regionRule("fci").hoursBefore, 24);
  assert.equal(antibioticFlag("Colistin sulphate")?.level, "late"); assert.equal(antibioticFlag("Enrofloxacin 10%")?.level, "due"); assert.equal(antibioticFlag("Amoxycillin"), null);
  assert.match(RT_HEADER, /^Based on Red Tractor Chicken Standards version 5\.1 \(modified\), effective 1 February 2025\. Not endorsed by Red Tractor\./);
  assert.equal(dayLabel("2026-10-20"), "Tue 20 Oct");
});
