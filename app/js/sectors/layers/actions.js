// Every Layers write goes through here (screens and sheets never call records.js directly for
// layer data), so the records one entry creates stay consistent: the daily sheet is also the
// mortality-at-inspection record and the producer daily record; a feed delivery on the sheet is
// also the feed-delivery record the bin maths reads.
// Money rule (01-platform §15): £ values live ONLY in `finance` (owner, manager, accountant).
// Packer statements, collections and bird moves carry counts and grades plus the finance id.
import { addRecord, updateRecord, softDelete, setMeta } from "../../services/records.js";
import { auth } from "../../core/auth.js";
import { canWrite } from "../../core/policy.js";
import { addDays } from "../../core/dates.js";
import { aliveAt, sheetFigures, daysFor, weekOfAge } from "./model/flock.js";
import { eggWithheld, classB, withdrawalDates, miteAvg, uniformity, eggMix, featherScore } from "./model/health.js";
import { reconcile, isoWeek, weekStart, lineAmount } from "./model/eggs.js";
import { LOGS } from "./model/logs.js";
import { PRICE_PROFILE_ID } from "./data.js";

export const me = () => auth.user?.displayName || auth.user?.email || "";
const clean = (o) => { const r = {}; for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== "" && !(typeof v === "number" && Number.isNaN(v))) r[k] = v; return r; };
const num = (v) => (v === "" || v == null || Number.isNaN(+String(v).replace(/,/g, "")) ? undefined : +String(v).replace(/,/g, ""));
const money = (snap) => canWrite(snap.role, "finance");
const hhmm = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

// ---- houses and flocks ----
export function saveHouse(snap, v, old = null) {
  const data = clean({ name: String(v.name || "").trim(), order: num(v.order) ?? (old?.order ?? snap.data.houses.length + 1), system: num(v.system), producerCode: v.producerCode, establishmentNo: v.establishmentNo, usableM2: num(v.usableM2), nests: num(v.nests), nestM2: num(v.nestM2), perchM: num(v.perchM), litterM2: num(v.litterM2), rangeHa: num(v.rangeHa), rangeMaxM: num(v.rangeMaxM), sheltersPerHa: num(v.sheltersPerHa), places: num(v.places), trapRows: num(v.trapRows), trapCols: num(v.trapCols) });
  if (old) { updateRecord(snap.lid, "houses", old, data); return old.id; }
  return addRecord(snap.lid, "houses", data);
}
/**
 * Place a flock (design/14 §5.4, §14). v: { houseId, breedStdId, hatchDate, placedDate, placed, ageAtPlacement,
 * rearer, rearerEst, feedSource, plannedDepop, turnaroundWeeks, daeraNotified, pulletCost }.
 * Writes the flock, the "pullets in" movement and (money roles) the pullet bill.
 */
export function placeFlock(snap, v) {
  const id = addRecord(snap.lid, "flocks", clean({ houseId: v.houseId, breedStdId: v.breedStdId, hatchDate: v.hatchDate, placedDate: v.placedDate, placed: num(v.placed), ageAtPlacement: num(v.ageAtPlacement), rearer: v.rearer, rearerEst: v.rearerEst, feedSource: v.feedSource, plannedDepop: v.plannedDepop, turnaroundWeeks: num(v.turnaroundWeeks), daeraNotified: v.daeraNotified || undefined, byName: me() }));
  addRecord(snap.lid, "birdMoves", clean({ flockId: id, houseId: v.houseId, date: v.placedDate, direction: "in", n: num(v.placed), kind: "placement", est: v.rearerEst, byName: me() }));
  if (num(v.pulletCost) && money(snap)) addRecord(snap.lid, "finance", clean({ kind: "expense", category: "Animal Purchase", amount: num(v.pulletCost), date: v.placedDate, note: `${num(v.placed)} pullets · ${v.rearer || "rearer"}`, source: "pullets", flockId: id, houseId: v.houseId }));
  return id;
}
export const updateFlock = (snap, f, changes) => updateRecord(snap.lid, "flocks", f, clean(changes));
/** Depopulate: the flock leaves (spent hens out), the house starts its turnaround. */
export function depopFlock(snap, f, v) {
  updateRecord(snap.lid, "flocks", f, clean({ depopDate: v.date, numberOut: num(v.n), destination: v.destination, turnaroundWeeks: num(v.turnaroundWeeks), nextPlacement: v.nextPlacement, turnaround: { stages: [] } }));
  addRecord(snap.lid, "birdMoves", clean({ flockId: f.id, houseId: f.houseId, date: v.date, direction: "out", n: num(v.n), kind: "depop", est: v.est, fci: v.fci || undefined, byName: me() }));
  if (num(v.amount) && money(snap)) addRecord(snap.lid, "finance", clean({ kind: "revenue", category: "Livestock Sales", amount: num(v.amount), date: v.date, note: `${num(v.n)} spent hens · ${v.destination || ""}`.trim(), source: "spentHens", flockId: f.id, houseId: f.houseId }));
}
/** Turnaround stages for an empty house (§3.1, §7.7): Cleaned out · Washed · Disinfected · Mite treated · Rested · Ready. */
export const TURN_STAGES = ["Cleaned out", "Washed", "Disinfected", "Mite treated", "Swabbed", "Ready"];
export function turnStage(snap, f, stage, done) {
  const stages = (f.turnaround?.stages || []).filter((x) => x.stage !== stage);
  if (done) stages.push({ stage, date: snap.today, by: me() });
  updateRecord(snap.lid, "flocks", f, { turnaround: { ...(f.turnaround || {}), stages } }, { history: false });
}

// ---- the daily house sheet ----
/**
 * Save the daily sheet (design/14 §4). v: { eggsTotal, seconds, floor, dead, culled, deaths[], waterMeter,
 * feedKind, feedKg, tMin, tMax, popOpen, popClose, keptIn, checks[], notes, graded{} , source }.
 * One doc per house-day; re-saving the same day updates it. Calculated figures are stored too.
 */
export function saveDay(snap, house, f, date, v, old = null) {
  const alive = aliveAt(snap.c, f, date);
  const days = daysFor(snap.c, f.id).filter((d) => d.date < date);
  const prevD = days[days.length - 1];
  const fig = sheetFigures(snap.s, { ...v, alive, prev: prevD ? { waterMeter: prevD.waterMeter, gap: Math.max(1, (new Date(date) - new Date(prevD.date)) / 86400000) } : null });
  const wd = eggWithheld(snap.c, house.id, date); const cb = classB(snap.data.salmSamples.filter((x) => x.flockId === f.id), f, date);
  const dead = num(v.dead) || 0; const culled = num(v.culled) || 0;
  const data = clean({ houseId: house.id, flockId: f.id, date, eggsTotal: num(v.eggsTotal) || 0, seconds: num(v.seconds) || 0, floor: num(v.floor) || 0, dead, culled,
    deaths: (v.deaths || []).filter((x) => +x.n > 0), waterMeter: num(v.waterMeter), waterL: num(v.waterL), feed: v.feedKind ? clean({ kind: v.feedKind, kg: num(v.feedKg) }) : undefined,
    tMin: num(v.tMin), tMax: num(v.tMax), popOpen: v.popOpen, popClose: v.popClose, keptIn: v.keptIn, checks: v.checks || [], notes: v.notes, graded: v.graded && Object.values(v.graded).some((x) => +x) ? v.graded : undefined,
    source: v.source || "manual", partial: false, withheld: wd ? true : undefined, classB: cb.on ? true : undefined,
    alive, henDay: fig.henDay ?? undefined, waterPer1000: fig.waterPer1000 ?? undefined, wk: weekOfAge(f, date), inspectedBy: me(), byName: me(), savedAt: old?.savedAt || hhmm() });
  let id = old?.id;
  if (old) updateRecord(snap.lid, "days", old, data); else id = addRecord(snap.lid, "days", data);
  // feed delivered into this house's bin today → the feed-delivery record (bin maths, UFAS register)
  if (v.feedKind === "delivery" && num(v.feedKg) && !(old?.feed?.kind === "delivery" && +old.feed.kg === num(v.feedKg))) addRecord(snap.lid, "feedDeliveries", clean({ houseId: house.id, date, kg: num(v.feedKg), ufas: true, sample: false, fromSheet: id, byName: me() }));
  return { id, alive, fig };
}
/** Deaths only (quick add): merged into the house-day's sheet. */
export function addDeaths(snap, house, f, date, deaths) {
  const old = snap.data.days.find((d) => d.houseId === house.id && d.date === date);
  const merged = [...(old?.deaths || [])];
  for (const x of deaths) { const m = merged.find((y) => y.cause === x.cause && !x.where); if (m) m.n = +m.n + +x.n; else merged.push({ ...x }); }
  const dead = merged.filter((x) => !/^Culled/.test(x.cause)).reduce((t, x) => t + +x.n, 0); const culled = merged.filter((x) => /^Culled/.test(x.cause)).reduce((t, x) => t + +x.n, 0);
  const alive = aliveAt(snap.c, f, date);
  if (old) return updateRecord(snap.lid, "days", old, { deaths: merged, dead, culled });
  return addRecord(snap.lid, "days", { houseId: house.id, flockId: f.id, date, eggsTotal: 0, deaths: merged, dead, culled, alive, partial: true, wk: weekOfAge(f, date), byName: me(), inspectedBy: me() });
}

// ---- eggs ----
/** Packer collection (design/14 §6.1). Class B is set automatically when a house is locked. */
export function saveCollection(snap, v) {
  const houseIds = v.houseIds?.length ? v.houseIds : snap.data.houses.map((h) => h.id);
  const locked = houseIds.some((hid) => { const f = snap.data.flocks.find((x) => x.houseId === hid && x.placedDate <= v.date && (!x.depopDate || x.depopDate >= v.date)); return f && classB(snap.data.salmSamples.filter((x) => x.flockId === f.id), f, v.date).on; });
  const eggs = num(v.eggs) ?? (num(v.trays) || 0) * 30;
  return addRecord(snap.lid, "eggDeliveries", clean({ date: v.date, packer: v.packer, eggs, trays: num(v.trays), grades: (v.grades || []).filter((g) => +g.eggs), docketNo: v.docketNo, storeTemp: num(v.storeTemp), bestBefore: v.bestBefore || addDays(v.layDate || v.date, 28), buyer: v.buyer, houseIds: v.houseIds?.length ? v.houseIds : undefined, classB: locked || undefined, byName: me() }));
}
/**
 * Weekly packer statement (§6.2). v: { weekStart, packer, lines[{grade, eggs, ppd}], deductions[{label, amount}], paid? }.
 * Counts go in packerStatements; every £ (grade prices, deductions, paid) only in finance.
 */
export function saveStatement(snap, v) {
  const grades = v.lines.filter((l) => +l.eggs).map((l) => ({ grade: l.grade, eggs: +l.eggs }));
  const counted = grades.reduce((t, g) => t + g.eggs, 0);
  const st = { weekStart: v.weekStart, week: isoWeek(v.weekStart), packer: v.packer, grades, counted };
  const r = reconcile(snap.c, st);
  const id = addRecord(snap.lid, "packerStatements", clean({ ...st, collected: Math.round(r.collected), docketRef: v.ref, byName: me() }));
  if (money(snap) && v.lines.some((l) => +l.ppd)) {
    const m = reconcile(snap.c, st, { lines: v.lines.filter((l) => +l.eggs).map((l) => ({ grade: l.grade, eggs: +l.eggs, ppd: +l.ppd || 0 })), deductions: (v.deductions || []).filter((d) => +d.amount).map((d) => ({ label: d.label, amount: +d.amount })), amount: num(v.paid) }).money;
    const financeId = addRecord(snap.lid, "finance", clean({ kind: "revenue", category: "Eggs", amount: m.paid, date: addDays(v.weekStart, 6), note: `Eggs wk ${st.week} · ${counted.toLocaleString("en-GB")} · avg ${m.avgPpd}p/doz`, source: "packerStatement", statementId: id, weekStart: v.weekStart, eggs: counted, lines: m.lines.map((l) => ({ grade: l.grade, eggs: l.eggs, ppd: l.ppd, amount: l.amount })), deductions: m.deductions, avgPpd: m.avgPpd }));
    updateRecord(snap.lid, "packerStatements", { id, ...st }, { financeId }, { history: false });
  }
  return id;
}
export const saveStoreTemp = (snap, v) => { const old = snap.data.storeTemps.find((x) => x.date === v.date); const data = clean({ date: v.date, min: num(v.min), max: num(v.max), byName: me() }); return old ? updateRecord(snap.lid, "storeTemps", old, data) : addRecord(snap.lid, "storeTemps", data); };
/** Farm-gate (ungraded, small flocks): stock in by lay date, or a sale (+ £ in finance). */
export function saveFarmGate(snap, v) {
  const id = addRecord(snap.lid, "farmGate", clean({ kind: v.kind, date: v.date, layDate: v.kind === "stock" ? v.layDate || v.date : undefined, eggs: num(v.eggs), byName: me() }));
  if (v.kind === "sale" && num(v.amount) && money(snap)) addRecord(snap.lid, "finance", clean({ kind: "revenue", category: "Eggs", amount: num(v.amount), date: v.date, note: `${num(v.eggs)} farm-gate eggs`, source: "farmGate", farmGateId: id }));
  return id;
}

// ---- health ----
export function saveSalmSample(snap, f, v, old = null) {
  const data = clean({ flockId: f.id, houseId: f.houseId, date: v.date, time: v.time, sampler: v.sampler || "operator", sampleType: v.sampleType, lab: v.lab, result: v.result || "Awaiting result", resultDate: v.resultDate, confirmatory: v.confirmatory || undefined, byName: me() });
  if (old) { updateRecord(snap.lid, "salmSamples", old, data); return old.id; }
  return addRecord(snap.lid, "salmSamples", data);
}
export function saveMite(snap, houseId, traps, date = snap.today) {
  return addRecord(snap.lid, "miteScores", { houseId, date, traps, avg: miteAvg(traps), byName: me() });
}
/** Weigh / egg-weight / feather session (§5.5). */
export function saveSample(snap, f, kind, v) {
  const base = { houseId: f.houseId, flockId: f.id, kind, date: v.date || snap.today, wk: weekOfAge(f, v.date || snap.today), byName: me() };
  if (kind === "weights") { const u = uniformity(v.values); return addRecord(snap.lid, "samples", clean({ ...base, values: v.values, mean: u.mean, cv: u.cv, uniformity: u.uniformity, n: u.n })); }
  if (kind === "eggs") { const m = eggMix(v.values); return addRecord(snap.lid, "samples", clean({ ...base, values: v.values, mean: m.mean, mix: m.mix, n: m.n })); }
  const fs = featherScore(v.tally); return addRecord(snap.lid, "samples", clean({ ...base, tally: v.tally, good: fs.good, n: fs.n, enrichment: v.enrichment }));
}
export function saveVaccination(snap, v, old = null) {
  const data = clean({ flockId: v.flockId, disease: v.disease, product: v.product, date: v.date, batch: v.batch, source: v.source || "farm", plannedWk: num(v.plannedWk), dose: v.dose, byName: me() });
  if (old) { updateRecord(snap.lid, "vaccinations", old, data); return old.id; }
  return addRecord(snap.lid, "vaccinations", data);
}
/** Whole-house treatment (§7.4): egg withdrawal first, meat (spent hens) second. */
export function saveTreatment(snap, v) {
  const wd = withdrawalDates(v.date, { doses: num(v.doses) || 1, intervalDays: num(v.intervalDays) || 1, eggDays: num(v.eggDays) || 0, meatDays: num(v.meatDays) || 0 });
  const ids = [];
  for (const houseId of [].concat(v.houseIds || v.houseId)) {
    const f = snap.data.flocks.find((x) => x.houseId === houseId && x.placedDate <= v.date && (!x.depopDate || x.depopDate >= v.date));
    ids.push(addRecord(snap.lid, "medicines", clean({ houseId, flockId: f?.id, date: v.date, productName: v.productName, productId: v.productId, batch: v.batch, dose: v.dose, route: v.route, reason: v.reason, method: v.method, contractor: v.contractor, doses: num(v.doses), intervalDays: num(v.intervalDays), eggDays: num(v.eggDays) || 0, meatDays: num(v.meatDays) || 0, lastDose: wd.lastDose, eggsOkFrom: wd.eggsOkFrom, meatOkFrom: wd.meatOkFrom, givenBy: v.givenBy || me(), vet: v.vet, byName: me() })));
  }
  return { ids, ...wd };
}

// ---- simple logs (alarm, visitors, rodent, feed, moves, health plan, manure, housing, biosecurity) ----
export function addLog(snap, kind, v) {
  const L = LOGS[kind]; const data = {};
  for (const [k, , type] of L.fields) data[k] = type === "number" ? num(v[k]) : type === "check" ? !!v[k] : v[k];
  if (data.houseId === "all") delete data.houseId;
  if (kind === "moves" && data.houseId) { const f = snap.data.flocks.find((x) => x.houseId === data.houseId && x.placedDate <= data.date && (!x.depopDate || x.depopDate >= data.date)); if (f) data.flockId = f.id; }
  const id = addRecord(snap.lid, L.coll, clean({ ...data, byName: me() }));
  if (kind === "feed" && num(v.pricePerT) && money(snap)) addRecord(snap.lid, "finance", clean({ kind: "expense", category: "Feed", amount: Math.round(num(v.pricePerT) * (num(v.kg) / 1000) * 100) / 100, date: data.date, note: `${data.ration || "Layer feed"} ${(num(v.kg) / 1000).toFixed(1)} t${data.mill ? " · " + data.mill : ""}`, source: "feed", feedDeliveryId: id, houseId: data.houseId }));
  return id;
}
export const endHousing = (snap, h, date) => updateRecord(snap.lid, "housing", h, { to: date });

// ---- plans, settings, checklists, returns ----
export function saveLightPlan(snap, f, weeks) {
  const old = snap.data.lightPlans.find((p) => p.flockId === f.id);
  const data = { flockId: f.id, weeks: weeks.filter((w) => w.wk !== "" && w.hours !== "").map((w) => clean({ wk: +w.wk, hours: +w.hours, on: w.on, off: w.off })).sort((a, b) => a.wk - b.wk) };
  return old ? updateRecord(snap.lid, "lightPlans", old, data) : addRecord(snap.lid, "lightPlans", data);
}
export const saveSettings = (snap, patch) => setMeta(snap.lid, "settings", { ...(snap.meta.settings || {}), ...patch });
/** Packer price profile (grade p/dozen, deductions, reference price, feed £/t): finance only, money roles. */
export function savePriceProfile(snap, profile) {
  if (!money(snap)) return null;
  const doc = { kind: "prices", category: "Egg price profile", date: snap.today, note: "Egg price profile (not a money entry)", ...profile };
  const old = snap.data.finance.find((r) => r.id === PRICE_PROFILE_ID);
  if (old) return updateRecord(snap.lid, "finance", old, doc, { history: false });
  return addRecord(snap.lid, "finance", doc, PRICE_PROFILE_ID);
}
export function saveLionItem(snap, id, ok, noteText) {
  const cur = snap.meta.lion || {}; const items = { ...(cur.items || {}) };
  items[id] = ok == null ? undefined : clean({ ok, note: noteText, byName: me(), at: snap.today });
  if (!items[id]) delete items[id];
  return setMeta(snap.lid, "lion", { ...cur, items });
}
export const saveAudit = (snap, patch) => setMeta(snap.lid, "lion", { ...(snap.meta.lion || {}), ...patch });
export function saveBirdReturn(snap, v) {
  const old = snap.data.birdRegisterReturns.find((x) => String(x.year) === String(v.year) && x.establishmentNo === v.establishmentNo);
  const data = clean({ year: +v.year, establishmentNo: v.establishmentNo, countDate: `${v.year}-06-01`, birds: v.birds, total: v.total, submittedOn: v.submittedOn, byName: me() });
  return old ? updateRecord(snap.lid, "birdRegisterReturns", old, data) : addRecord(snap.lid, "birdRegisterReturns", data);
}
export const saveNote = (snap, v) => addRecord(snap.lid, "notes", clean({ text: v.text, houseId: v.houseId, date: snap.today, byName: me() }));
/** Controller CSV import: the saved column map + one import record (prefills the sheet). */
export function saveImport(snap, v) { return addRecord(snap.lid, "imports", clean({ date: snap.today, source: v.source, houseId: v.houseId, rows: v.rows, map: v.map, headers: v.headers, byName: me() })); }

// ---- To do today ticks ----
export function tickGenerated(lid, snap, t, done) {
  const existing = snap.data.tasks.find((x) => x.sourceRef === t.key);
  const u = auth.user; const stamp = done ? { done: true, doneAt: new Date(), doneBy: u?.uid || null, doneByName: me() } : { done: false, doneAt: null, doneBy: null, doneByName: null };
  if (t.key.startsWith("notice:") && done) { const f = snap.data.flocks.find((x) => x.id === t.key.split(":")[1]); if (f) updateRecord(lid, "flocks", f, { daeraNotified: snap.today }, { history: false }); }
  if (t.key.startsWith("depop:") && done) { const f = snap.data.flocks.find((x) => x.id === t.key.split(":")[1]); if (f) updateRecord(lid, "flocks", f, { depopBooked: snap.today }, { history: false }); }
  if (existing) return updateRecord(lid, "tasks", existing, stamp, { history: false });
  return addRecord(lid, "tasks", { title: t.title, due: t.due, sourceRef: t.key, note: "", money: false, ...stamp });
}
export const undoAdd = (lid, coll, id) => softDelete(lid, coll, id);
export { lineAmount, weekStart };
