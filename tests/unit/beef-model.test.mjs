// Beef ledger model: pure maths checked against hand-worked numbers (design/10).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTag, tagCheckDigit, nextTag, breedCode, breedName, sexCode, tagMatches, last5 } from "../../app/js/sectors/beef/model/tags.js";
import { beefSettings, scLimitDays, scHeiferMaxMonths, bcrsMonths, autoMode, schemeYear, gestationDays } from "../../app/js/sectors/beef/model/rules.js";
import { indexHerd, classOf, dlwg, withdrawal, ageText, ageLong, bornInNI } from "../../app/js/sectors/beef/model/animals.js";
import { dueInfo, scStatus, heiferWindow, birthsToRegister, fertilityKpis, notSeenBulling } from "../../app/js/sectors/beef/model/breeding.js";
import { bcrsDeadline, finishingFacts, maxBid, adj200 } from "../../app/js/sectors/beef/model/finishing.js";
import { pitGeom, silageStock, fodderBudget, mealToday } from "../../app/js/sectors/beef/model/feed.js";
import { mc3Row, medRow, registerGaps } from "../../app/js/sectors/beef/model/registers.js";
import { fqaScore, FQA_STANDARD } from "../../app/js/sectors/beef/model/fqa.js";
import { generatedTasks, beefAlerts, nifaisDays } from "../../app/js/sectors/beef/model/duties.js";
import { doseFor } from "../../app/js/sectors/beef/actions.js";

const T = "2026-10-15";
const empty = () => ({ animals: [], calvings: [], services: [], scans: [], heats: [], weighings: [], medicines: [], movements: [], sales: [], purchases: [], deaths: [], tbTests: [], vetOps: [], groups: [], feedGroups: [], feedAdjust: [], tasks: [], finance: [], medProducts: [], notes: [] });
const ctx = (data, settings = {}) => { const s = beefSettings({ settings: {} }, settings); const ix = indexHerd(data); return { data, s, ix, today: T, lid: "L", store: [], doneKeys: new Set(), keeper: {} }; };

test("tags: v9 check digit, formatting, next tag, search by last digits", () => {
  assert.equal(tagCheckDigit("123456", "7001"), (Number("91234567001") % 7) + 1);
  const p = parseTag("UK9 1234567001 2"); assert.equal(p.formatted, "UK 9 123456 7001 2"); assert.equal(p.valid, (Number("91234567001") % 7) + 1 === 2);
  const good = `UK 9 123456 7001 ${tagCheckDigit("123456", "7001")}`; assert.ok(parseTag(good).valid);
  assert.equal(nextTag(good), `UK 9 123456 7002 ${tagCheckDigit("123456", "7002")}`);
  assert.equal(parseTag("0412"), null);
  assert.ok(tagMatches({ tag: good }, last5(good)));
  assert.ok(tagMatches({ tag: "x", name: "Daisy" }, "dai"));
  assert.equal(breedCode("Charolais X"), "CH"); assert.equal(breedCode("LIMX"), "LIM"); assert.equal(breedName("CH"), "Charolais");
  assert.equal(sexCode("Steer"), "M"); assert.equal(sexCode("Bull"), "B"); assert.equal(sexCode("Cow"), "F");
});

test("rules: yearly tables, scheme year, modes, gestation", () => {
  assert.equal(schemeYear("2026-03-31"), 2025); assert.equal(schemeYear("2026-04-01"), 2026);
  assert.equal(scLimitDays("2026-10-15"), 405); assert.equal(scLimitDays("2027-05-01"), 395); assert.equal(scLimitDays("2030-01-01"), 385);
  assert.equal(scHeiferMaxMonths("2026-10-15"), 32);
  assert.equal(bcrsMonths(2026), 27); assert.equal(bcrsMonths(2028), 26); assert.equal(bcrsMonths(2026, { bcrsMonths: 28 }), 28);
  assert.equal(autoMode("Spring", "2026-10-15"), "sales"); assert.equal(autoMode("Spring", "2026-03-01"), "calving"); assert.equal(autoMode("Spring", "2026-12-01"), "winter");
  assert.equal(autoMode("Autumn", "2026-09-01"), "calving"); assert.equal(autoMode("Autumn", "2026-07-01"), "grazing");
  const s = beefSettings({ settings: { calvingSeason: "Autumn", beefTypes: ["Pedigree"] } }, { processor: { maxAgeMonths: 28 } });
  assert.equal(s.calvingSeason, "Autumn"); assert.equal(s.pedigree, true); assert.equal(s.processor.maxAgeMonths, 28); assert.equal(s.processor.maxCarcase, 400);
  assert.equal(gestationDays(s, "CH", "Bull"), 286); assert.equal(gestationDays(s, "XYZ", "Heifer"), 283);
});

test("animals: class, gain (14-day rule), withdrawal, age text", () => {
  const d = empty();
  d.animals = [{ id: "c", tag: "C", sex: "Cow", dob: "2018-01-01" }, { id: "s", tag: "UK9 123456 700045", sex: "Steer", dob: "2024-08-22", lastWeightKg: 500, lastWeightDate: "2026-06-01" },
    { id: "k", tag: "K", sex: "Heifer", dob: "2026-09-20", damTag: "C" }, { id: "b", tag: "B", sex: "Bull", dob: "2020-01-01" }];
  d.weighings = [{ animalId: "s", date: "2026-09-01", kg: 600 }, { animalId: "s", date: "2026-10-01", kg: 636 }, { animalId: "s", date: "2026-10-10", kg: 700 }];
  d.medicines = [{ id: "m", animalTags: ["UK9 123456 700045"], withdrawalEndDateMeat: "2026-10-21", productName: "Draxxin" }];
  const ix = indexHerd(d);
  assert.equal(classOf(ix, d.animals[0], T), "cow"); assert.equal(classOf(ix, d.animals[1], T), "store"); assert.equal(classOf(ix, d.animals[2], T), "calf"); assert.equal(classOf(ix, d.animals[3], T), "bull");
  const g = dlwg(ix, d.animals[1]); assert.equal(g.from.date, "2026-09-01"); assert.equal(Math.round(g.value * 100) / 100, Math.round((100 / 39) * 100) / 100);
  assert.equal(withdrawal(ix, d.animals[1], T).until, "2026-10-21"); assert.equal(withdrawal(ix, d.animals[1], "2026-10-22"), null);
  assert.equal(ageText(d.animals[2], T), "3 wk"); assert.equal(ageText(d.animals[0], T), "8 yr"); assert.equal(ageLong(d.animals[1], T), "25 mo 23 d");
  assert.equal((ix.calvings.get("c") || []).length, 1, "calving derived from calf's damTag");
  assert.equal(bornInNI({ tag: "UK 1 234567 0001 1" }), false); assert.equal(bornInNI({ tag: "UK 9 123456 7001 2" }), true);
});

test("breeding: due dates from AI / bull / scan; SC Scheme board status", () => {
  const d = empty();
  d.animals = [{ id: "c1", tag: "C1", sex: "Cow", dob: "2018-01-01" }, { id: "c2", tag: "C2", sex: "Cow", dob: "2018-01-01" }, { id: "c3", tag: "C3", sex: "Cow", dob: "2018-01-01" }, { id: "c4", tag: "C4", sex: "Cow", dob: "2018-01-01" }];
  d.calvings = [{ damId: "c1", date: "2026-03-14" }, { damId: "c2", date: "2026-06-02" }, { damId: "c3", date: "2025-09-01" }, { damId: "c4", date: "2026-03-01" }];
  d.services = [{ kind: "AI", femaleIds: ["c1"], date: "2026-06-12", sireBreed: "CH" }, { kind: "natural", femaleIds: ["c4"], bullIn: "2026-06-01", bullOut: "2026-08-03" }];
  d.scans = [{ femaleId: "c4", date: "2026-09-05", result: "empty" }];
  const c = ctx(d); const { s, ix } = c;
  const due1 = dueInfo(d, s, ix, d.animals[0]); assert.equal(due1.basis, "ai"); assert.equal(due1.date, "2027-03-24"); // 12 Jun + 285
  const st1 = scStatus(d, s, ix, d.animals[0], T); assert.equal(st1.deadline, "2027-04-23"); assert.equal(st1.status, "ok");
  const st2 = scStatus(d, s, ix, d.animals[1], T); assert.equal(st2.status, "cant"); // 2 Jun 2026 + 405 = 12 Jul 2027 < today + 279 (21 Jul 2027)
  assert.equal(scStatus(d, s, ix, d.animals[2], T).status, "cant"); // 1 Sep 2025 + 405 = 11 Oct 2026, already past
  assert.equal(scStatus(d, s, ix, d.animals[3], T).status, "empty");
  assert.ok(notSeenBulling(d, ix, d.animals[1], T));
  // bull window
  d.scans = []; const due4 = dueInfo(d, s, ix, d.animals[3]); assert.equal(due4.basis, "bull"); assert.equal(due4.from, "2027-03-07"); assert.equal(due4.to, "2027-05-17");
});

test("SC risk rule: today+283 past deadline−21 → at risk", () => {
  const d = empty(); d.animals = [{ id: "c", tag: "C", sex: "Cow", dob: "2018-01-01" }]; d.calvings = [{ damId: "c", date: "2026-02-01" }];
  const c = ctx(d); // deadline 2026-02-01 + 405 = 2027-03-13; today+283 = 2027-07-25 > deadline → can't (today+279 > deadline)
  assert.equal(scStatus(d, c.s, c.ix, d.animals[0], T).status, "cant");
  d.calvings = [{ damId: "c", date: "2026-07-20" }]; const c2 = ctx(d); // deadline 2027-08-29; today+283=2027-07-25 > 2027-08-08? no → open
  assert.equal(scStatus(d, c2.s, c2.ix, d.animals[0], T).status, "open");
  d.calvings = [{ damId: "c", date: "2026-07-01" }]; const c3 = ctx(d); // deadline 2027-08-10; −21 = 2027-07-20 < 2027-07-25 → risk
  assert.equal(scStatus(d, c3.s, c3.ix, d.animals[0], T).status, "risk");
});

test("heifer window: 21 months to the scheme limit, minus 283 days", () => {
  const d = empty(); const h = { id: "h", tag: "H", sex: "Heifer", dob: "2025-06-01" }; d.animals = [h];
  const c = ctx(d); const w = heiferWindow(d, c.s, c.ix, h, T);
  assert.equal(w.earliest, "2027-03-01"); assert.equal(w.serveFrom, "2026-05-22"); assert.equal(w.maxM, 30); assert.equal(w.latest, "2027-12-01"); // she would calve in 2027/28 (limit 30) assert.equal(w.status, "open");
});

test("births to register: steps, deadlines, NIFAIS-register mode", () => {
  const d = empty(); d.animals = [{ id: "k", tag: "K", sex: "Bull", dob: "2026-09-10", reg: { tagged: "2026-09-10", bvdSample: null, nifais: null } }];
  const b = birthsToRegister(d, beefSettings({}, {}), T)[0];
  assert.equal(b.steps.find((x) => x.key === "nifais").by, "2026-10-07"); assert.ok(b.late);
  const b2 = birthsToRegister(d, beefSettings({}, { registerMode: "nifais" }), T)[0];
  assert.equal(b2.steps.find((x) => x.key === "nifais").by, "2026-10-03");
  assert.deepEqual(nifaisDays({ registerMode: "nifais" }), { birth: 23, moveOff: 0, moveOn: 3, death: 3, retag: 3 });
  d.animals[0].reg = { tagged: "x", bvdSample: "x", nifais: "x" }; assert.equal(birthsToRegister(d, beefSettings({}, {}), T).length, 0);
});

test("finishing: BCRS deadline uses the year it falls in; ready-by and max bid", () => {
  const s = beefSettings({}, {});
  assert.deepEqual(bcrsDeadline({ dob: "2024-08-22" }, s), { date: "2026-11-22", months: 27 });
  assert.deepEqual(bcrsDeadline({ dob: "2025-03-01" }, s), { date: "2027-05-01", months: 26 });
  const d = empty(); const a = { id: "s", tag: "UK9 123456 700045", sex: "Steer", dob: "2024-08-22" }; d.animals = [a];
  d.weighings = [{ animalId: "s", date: "2026-09-01", kg: 600 }, { animalId: "s", date: "2026-10-01", kg: 630 }];
  const c = ctx(d); const f = finishingFacts(d, c.s, c.ix, a, T);
  assert.equal(f.estNow, 630 + 1 * 14); assert.equal(Math.round(f.estCarcase), Math.round(644 * 0.55));
  assert.equal(f.nearest.kind, "bcrs");
  const bid = maxBid({ weightIn: 400, saleWeight: 650, koPct: 55, salePricePerKg: 6, days: 200, dailyCost: 2, targetMargin: 100 });
  assert.equal(Math.round(bid.maxBid), Math.round(650 * 0.55 * 6 - 400 - 100));
  assert.equal(Math.round(adj200({ weanKg: 290, birthKg: 45, ageDays: 210, damKg: 650 }).adj200), Math.round((245 / 210) * 200 + 45));
});

test("feed: v9 pit geometry, stock after blocks used, fodder budget run-out", () => {
  const g = pitGeom({ lenFt: 110, widFt: 23, htFt: 12 });
  assert.ok(Math.abs(g.tonnes - 110 * 23 * 12 * 0.0283168 * 0.7) < 0.01);
  const st = silageStock({ pits: [{ name: "P", lenFt: 110, widFt: 24, htFt: 12.5, usedBlocks: 10 }] });
  assert.ok(st.usedT > 0 && st.leftT < st.fullT);
  const b = fodderBudget({ leftT: 100, heads: { cow: 30.4 }, rates: { cow: 1 }, today: T, turnout: "2027-04-01" });
  assert.equal(b.daysLeft, 100); assert.equal(b.runOut, "2027-01-23"); assert.equal(b.short, 68);
  const d = empty(); d.animals = [{ id: "a" }, { id: "b" }];
  const m = mealToday([{ id: "g", animalIds: ["a", "b"], rations: [{ from: "2026-10-01", meal: 3 }] }], [], d, T); assert.equal(m.kg, 6);
});

test("registers: MC3 row and medicine row in DAERA column order; gaps", () => {
  const a = { tag: "UK 9 123456 7001 2", colour: "White", breed: "Charolais", sex: "Steer", dob: "2024-08-22", damTag: "UK9 1", replacementTags: [{ tag: "Same no.", date: "2026-01-02" }] };
  const r = mc3Row(a); assert.equal(r.length, 12); assert.equal(r[2], "W"); assert.equal(r[3], "CH"); assert.equal(r[4], "M"); assert.equal(r[5], "22/08/24"); assert.match(r[1], /Same no\. 02\/01\/26/);
  assert.deepEqual(registerGaps({ ...a, tag: "UK 9 123456 7001 " + tagCheckDigit("123456", "7001") }), []);
  const m = medRow({ productName: "Draxxin", animalTags: ["T1"], administeredBy: "Seán", date: "2026-09-18", withdrawalMeatDays: 44, withdrawalEndDateMeat: "2026-11-01", quantity: "12", quantityUnit: "ml", batchNumber: "B1", source: "Vet" });
  assert.equal(m[5], "44 d, ends 01/11/26"); assert.equal(m[6], "Nil"); assert.equal(m[8], "12ml");
});

test("FQA: header names the standard and says not approved; score counts auto items", () => {
  assert.match(FQA_STANDARD.header, /2022/); assert.match(FQA_STANDARD.header, /Not approved by LMC/);
  const d = empty(); const c = ctx(d); const sc = fqaScore(c, { stock: { done: true, date: "2026-09-01" } });
  assert.ok(sc.total > 20); assert.ok(sc.ok >= 1);
});

test("duties: tasks and legal alerts from records", () => {
  const d = empty();
  d.animals = [{ id: "k", tag: "K", sex: "Bull", dob: "2026-09-12", damTag: "C", reg: { tagged: null, bvdSample: null, nifais: null } }, { id: "s", tag: "UK9 123456 700045", sex: "Steer", dob: "2024-09-01" }];
  d.medicines = [{ id: "m", date: "2026-10-14", courseDays: 3, productName: "Pen", animalTags: ["UK9 123456 700045"], withdrawalEndDateMeat: "2026-11-30" }];
  d.movements = [{ id: "mv", kind: "off", date: "2026-10-01", animalIds: ["x"], to: "Dungannon Mart" }];
  d.tbTests = [{ id: "tb", date: "2025-11-01" }];
  const c = ctx(d); const tasks = generatedTasks(c);
  assert.ok(tasks.some((t) => t.key === "reg:k:tagged")); assert.ok(tasks.some((t) => t.key === "dose:m:1" && t.show === "2026-10-15"));
  assert.ok(tasks.some((t) => t.key === "move:mv")); assert.ok(tasks.some((t) => t.key.startsWith("tb30:")));
  const al = beefAlerts(c);
  assert.equal(al[0].level, "late");
  assert.ok(al.some((x) => x.key === "wd" && x.legal)); assert.ok(al.some((x) => x.key === "tag:k")); assert.ok(al.some((x) => x.key === "nif:k" && x.level === "late"));
  assert.ok(al.some((x) => x.key === "move:mv" && x.level === "late"));
  assert.ok(al.some((x) => x.key === "tb" && x.level === "info"));
  assert.ok(al.some((x) => x.key.startsWith("dl:s:bcrs") || x.key === "dl"));
  assert.ok(beefAlerts(c, { money: false }).every((x) => !/£/.test(x.title)));
});

test("dose by weight rounds up to the band", () => {
  assert.equal(doseFor(412, { ratePerKg: 0.025, band: 10 }), 10.5);
  assert.equal(doseFor(0, { ratePerKg: 0.025 }), null);
});

test("resume pass: out-of-spec move flag, too-soon interval, slurry closed-period alert", () => {
  const d = empty();
  d.animals.push({ id: "x", tag: "UK 9 312345 0601 4", sex: "Steer", dob: "2024-09-01", onDate: "2026-03-01", prevMoves: 3, status: "onFarm" });
  const c = ctx(d);
  assert.ok(finishingFacts(d, c.s, c.ix, d.animals[0], T).flags.some((f) => f.text === "4th move — out of spec"));
  const a1 = beefAlerts({ ...ctx(empty()), today: "2026-10-05" }); assert.ok(a1.some((x) => x.title === "Slurry closed period starts 15/10/26" || /Slurry closed period starts/.test(x.title)));
  assert.ok(!beefAlerts({ ...ctx(empty()), today: "2026-10-16" }).some((x) => /Slurry/.test(x.title)));
});

test("kill sheet reader: matches by last 5 digits, reads dead kg, EUROP grade and £/kg or p/kg", async () => {
  const { parseKillSheet } = await import("../../app/js/sectors/beef/model/docket.js");
  const t = `LINDEN FOODS KILL SHEET 20/10/2026
1 UK 9 012345 7010 8  STEER  352.4  R3  6.20  2184.88
2 UK9012345 70115 HFR 318.0 U-4L 485p 1542.30`;
  const r = parseKillSheet(t, [{ id: "a", tag: "UK 9 012345 7010 8" }, { id: "b", tag: "UK 9 012345 7011 5" }, { id: "c", tag: "UK 9 012345 9999 1" }]);
  assert.deepEqual(r.a, { grade: "R3", pricePerKg: 6.2, deadKg: 352.4 });
  assert.deepEqual(r.b, { grade: "U-4L", pricePerKg: 4.85, deadKg: 318 });
  assert.equal(r.c, undefined);
});

test("prints: TB list for the vet in crush order by group with blank readings; margin report", async () => {
  const { tbVetList, marginDoc, margins } = await import("../../app/js/sectors/beef/model/reports.js");
  const d = empty();
  d.groups.push({ id: "g2", name: "Shed B" }, { id: "g1", name: "Shed A" });
  d.animals.push({ id: "x", tag: "UK 9 123456 7003 4", sex: "Cow", dob: "2020-03-01", groupId: "g2" }, { id: "y", tag: "UK 9 123456 7002 3", sex: "Steer", dob: "2025-01-01", groupId: "g1" }, { id: "z", tag: "UK 9 123456 7001 2", sex: "Heifer", dob: "2025-02-01", groupId: "g2" }, { id: "gone", tag: "UK 9 123456 7009 1", sex: "Steer", dob: "2024-01-01", offDate: "2026-01-02" });
  const c = ctx(d); const doc = tbVetList(c, { date: "2026-11-10", testType: "Herd test", vet: "J Bell" });
  assert.deepEqual(doc.rows.map((r) => r[2]), ["UK 9 123456 7002 3", "UK 9 123456 7001 2", "UK 9 123456 7003 4"]);
  assert.deepEqual(doc.rows.map((r) => r[1]), ["Shed A", "Shed B", "Shed B"]);
  assert.ok(doc.rows.every((r) => r.slice(5).every((v) => v === "")));
  assert.equal(doc.headers.length, doc.rows[0].length);
  const m = margins(c, 2026); const md = marginDoc(c, m);
  assert.match(md.title, /Margin report 2026/); assert.ok(md.rows.some((r) => r[0] === "Cost per cow"));
});
