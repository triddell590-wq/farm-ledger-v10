// Broilers ledger rules: alerts (§13), To do today and Coming up (§3.3), the Red Tractor checklist
// (§11), registers and the Schedule 5 house record, the Bird Register count (§21), FCI only up to
// today, quick add by stage (§2.2) and the density projection's default thin share.
import { test } from "node:test";
import assert from "node:assert/strict";
import { broilerSettings } from "../../app/js/sectors/broilers/model/settings.js";
import { indexBroilers, aliveEnd } from "../../app/js/sectors/broilers/model/crop.js";
import { broilerAlerts, checkState, mortalityAlarm } from "../../app/js/sectors/broilers/model/alerts.js";
import { todayTasks, comingUp } from "../../app/js/sectors/broilers/model/duties.js";
import { evaluate, summary } from "../../app/js/sectors/broilers/model/checklist.js";
import { registerDoc, houseRecord, birdsOn, DOCS } from "../../app/js/sectors/broilers/model/registers.js";
import { buildFci } from "../../app/js/sectors/broilers/model/fci.js";
import { projection, plannedMax } from "../../app/js/sectors/broilers/model/density.js";
import { quickAddIds, dueSlot } from "../../app/js/sectors/broilers/quick-add.js";
import { birdRegYear, byEstablishment } from "../../app/js/sectors/broilers/screens/birdreg.js";

const T = "2026-10-20";
const add = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** Two houses; crop placed 23 days ago in each; AM checks done every day incl. today (House 2: 41 dead today). */
function world({ now = `${T}T15:00`, extra = {}, settings = {}, money = true } = {}) {
  const placedDate = add(T, -23);
  const data = { houses: [{ id: "h1", name: "House 1", usableM2: 1950, establishmentNo: "UK1" }, { id: "h2", name: "House 2", usableM2: 1950, establishmentNo: "UK1" }],
    crops: [{ id: "c1", houseId: "h1", no: 41, placedDate, placed: 32900, plannedThins: [{ day: 31, birds: 6400 }], plannedClearDay: 38, targetDensity: 38, notifiedDaera: add(placedDate, -25), darkSetAt: add(T, -16) },
      { id: "c2", houseId: "h2", no: 41, placedDate, placed: 32800, plannedThins: [{ day: 31, birds: 6400 }], plannedClearDay: 38, targetDensity: 38, notifiedDaera: add(placedDate, -25), darkSetAt: add(T, -16) }],
    checks: [], thins: [], weighs: [], salmSamples: [], fci: [], brooding: [], energy: [], feedDeliveries: [], medicines: [], turnarounds: [], alarmTests: [{ id: "a1", date: add(T, -2), kind: "both" }], visitors: [], waterTests: [], training: [], birdRegisterReturns: [], finance: [], tasks: [], ...extra };
  for (const c of data.crops) for (let d = 0; d <= 23; d++) data.checks.push({ id: `${c.id}-${d}`, cropId: c.id, houseId: c.houseId, date: add(placedDate, d), slot: "am", time: "06:30", dead: d === 23 ? (c.id === "c2" ? 41 : 12) : 12, culls: {}, tempC: 24, rh: 60, nh3: 8, co2: 2000 });
  const s = broilerSettings({ settings: {} }, settings);
  const ix = indexBroilers(data);
  return { s, ix, data, today: T, now, lid: "L", doneKeys: new Set(), meta: {}, money, finance: money ? data.finance : [] };
}

test("AM/PM checks: due after the set time, late 2 h later; the PM row joins both houses (§3.3, §13)", () => {
  const c = world({ now: `${T}T20:30` });
  const st = checkState(c, c.ix.houses[0], c.ix.crops[0]);
  assert.equal(st.am.level, "ok"); assert.equal(st.pm.level, "due");
  assert.equal(checkState(world({ now: `${T}T22:05` }), c.ix.houses[0], c.ix.crops[0]).pm.level, "late");
  const t = todayTasks(c).filter((x) => x.kind === "check");
  assert.equal(t.length, 1); assert.equal(t[0].title, "PM check — both houses"); assert.equal(t[0].legal, true);
});

test("mortality alarm: due at 3× the 3-day average, late over 0.3% in 24 h (§3.2, §13)", () => {
  const c = world();
  assert.equal(mortalityAlarm(c, c.ix.crops[0]), null);
  const m = mortalityAlarm(c, c.ix.crops[1]); assert.equal(m.level, "due"); assert.equal(m.dead, 41); assert.ok(m.multiple > 3);
  const a = broilerAlerts(c).find((x) => x.kind === "mortality"); assert.equal(a.title, "House 2: 41 dead since this morning");
  c.data.checks.push({ id: "x", cropId: "c2", houseId: "h2", date: T, slot: "pm", dead: 70, culls: {} }); const c2 = { ...c, ix: indexBroilers(c.data) };
  assert.equal(mortalityAlarm(c2, c2.ix.crops[1]).level, "late");
});

test("legal alerts: density notice missing, medicine withdrawal past the thin, generator weekly, FCI 24 h before (§13)", () => {
  const thinAt = `${add(T, 1)}T14:00`;
  const c = world({ now: `${T}T09:00`, extra: { medicines: [{ id: "m1", cropId: "c1", houseId: "h1", date: add(T, -1), days: 3, product: "Tylan", wdDays: 1 }], alarmTests: [{ id: "a", date: add(T, -9), kind: "generator" }, { id: "b", date: add(T, -1), kind: "alarm" }],
    thins: [{ id: "t1", cropId: "c1", houseId: "h1", kind: "thin", catchAt: thinAt, birds: 6400, status: "planned" }] } });
  c.data.crops[1].notifiedDaera = null; c.ix = indexBroilers(c.data);
  const al = broilerAlerts(c); const keys = al.map((a) => a.key);
  assert.ok(keys.includes("notify:c2")); assert.ok(!keys.includes("notify:c1"));
  assert.ok(al.some((a) => a.key.startsWith("wd:c1") && a.level === "late"));
  assert.ok(al.some((a) => a.key.startsWith("generator:") && a.level === "late")); assert.ok(!al.some((a) => a.key.startsWith("alarm:")));
  const fci = al.find((a) => a.key === "fci:t1"); assert.equal(fci.level, "due"); assert.match(fci.title, /Send FCI for the thin by/);
  assert.equal(al[0].level, "late");
});

test("To do today and Coming up: Salmonella do-by, FCI, thin merged across houses, weigh days, Bird Register (§3.3)", () => {
  const c = world({ now: `${T}T09:00` });
  const up = comingUp(c, 3);
  assert.equal(up[0].title, "Salmonella boot swabs — both houses");
  assert.ok(up.some((x) => /^Thin both houses/.test(x.title)));
  const c2 = world({ now: `${T}T09:00` }); c2.today = add(c2.data.crops[0].placedDate, 21); c2.now = `${c2.today}T09:00`;
  assert.ok(todayTasks(c2).some((t) => t.title === "Sample weigh House 1 (day 21)"));
  const c3 = world(); c3.today = "2027-05-28"; c3.now = "2027-05-28T09:00";
  assert.ok(todayTasks(c3).some((t) => t.title === "Count birds on 1 June for the NI Bird Register"));
});

test("Red Tractor checklist: evidenced from records, manual items ticked by owner/manager (§11)", () => {
  const c = world({ extra: { training: [{ id: "t", person: "Tom", course: "Meat chicken welfare certificate" }] } });
  const l = evaluate(c, { healthPlan: { ok: true, at: T, by: "Tom" } });
  const by = (id) => l.find((x) => x.id === id);
  assert.equal(by("areas").state, "ok"); assert.equal(by("training").state, "ok"); assert.equal(by("healthPlan").state, "ok");
  assert.equal(by("inspect2x").state, "gap"); // only AM checks recorded
  assert.equal(by("generator").state, "ok"); assert.equal(by("biosecurity").state, "open");
  const sm = summary(l); assert.ok(sm.total > 30 && sm.ok < sm.total && sm.gaps >= 1);
});

test("registers: Schedule 5 house record per day with remaining birds; every register builds (§11)", () => {
  const c = world();
  const r = houseRecord(c, c.ix.crops[1]);
  assert.equal(r.rows.length, 24); assert.equal(r.rows[0][0], T); assert.equal(r.rows[0][4], 41); assert.equal(r.rows[0][9], 32800 - 23 * 12 - 41);
  for (const [k] of DOCS) { const d = registerDoc(c, k); assert.ok(d && Array.isArray(d.headers) && Array.isArray(d.rows), k); }
});

test("Bird Register: alive in placed crops on 1 June, 0 once the crop's planned clear-out has passed; one entry per establishment (§21)", () => {
  const c = world();
  assert.equal(birdsOn(c.ix, T).total, aliveEnd(c.ix, c.ix.crops[0], T) + aliveEnd(c.ix, c.ix.crops[1], T));
  assert.equal(birdsOn(c.ix, "2027-06-01").total, 0);
  const snap = { ix: c.ix, s: c.s, today: T, data: c.data };
  assert.equal(birdRegYear(snap), 2026); // 2026 not recorded yet: still shown
  assert.equal(birdRegYear({ ...snap, data: { birdRegisterReturns: [{ year: 2026 }] } }), 2027);
  assert.equal(birdRegYear({ ...snap, today: "2027-05-30" }), 2027);
  assert.equal(birdRegYear({ ...snap, today: "2027-06-10", data: { birdRegisterReturns: [{ year: 2027 }] } }), 2028);
  const e = byEstablishment(snap, T); assert.equal(e.length, 1); assert.equal(e[0].est, "UK1"); assert.equal(e[0].houses.length, 2);
});

test("FCI built before the catch lists mortality only up to today (§8)", () => {
  const c = world(); const crop = c.ix.crops[0];
  const thin = { id: "t1", kind: "thin", catchAt: `${add(T, 8)}T02:00`, birds: 6400 };
  const doc = buildFci({ ix: c.ix, s: c.s, crop, thin, house: c.ix.houses[0], today: T });
  assert.equal(doc.flock.ageAtSlaughter, 31); assert.equal(doc.mortality.asOfDay, 23); assert.equal(doc.mortality.days.length, 24);
  assert.equal(buildFci({ ix: c.ix, s: c.s, crop, thin, house: c.ix.houses[0] }).mortality.days.length, 32);
});

test("density: a planned thin with no bird number takes the usual share; quick add follows the stage (§2.2, §6.2)", () => {
  const c = world(); const crop = { ...c.ix.crops[0], plannedThins: [{ day: 31, birds: null }] };
  const p = projection(c.ix, crop, c.s, 1950, T);
  assert.ok(p[31].alive < p[30].alive - 6000); // 20% of 32,900 taken at the thin
  assert.ok(plannedMax(c.ix, crop, c.s, 1950, T) < 42);
  const snap = { ix: c.ix, today: T };
  assert.equal(dueSlot(snap), "pm"); assert.deepEqual(quickAddIds(snap), ["pm", "am", "weigh", "feed", "medicine", "note"]);
  const empty = world(); empty.data.crops = []; empty.data.turnarounds = [{ id: "ta", houseId: "h1", clearedDate: add(T, -2), steps: [] }];
  assert.deepEqual(quickAddIds({ ix: indexBroilers(empty.data), today: T }), ["litterOut", "washed", "disinfected", "swab", "rebedded", "note"]);
});
