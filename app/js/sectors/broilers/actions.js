// Every Broilers write goes through here (screens never call records.js directly), so the linked
// records a placement, thin, clear-out or turnaround creates stay consistent.
// Money rule (01-platform §15): £ values live ONLY in `finance` (owner, manager, accountant):
// settlements, the contract profile and energy unit prices. Everything else carries counts,
// weights, times and the finance id at most.
import { addRecord, updateRecord, softDelete, setMeta } from "../../services/records.js";
import { auth } from "../../core/auth.js";
import { addDays } from "./model/time.js";
import { cropResults, paymentEstimate, settlementCheck } from "./model/results.js";
import { weighStats } from "./model/growth.js";
import { withdrawalEnd } from "./model/paper.js";
import { salmWindow } from "./model/paper.js";
import { cropDay, nextCropNo, openTurnaround, currentCrop } from "./model/crop.js";

export const me = () => auth.user?.displayName || auth.user?.email || "";
const clean = (o) => { const r = {}; for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== "" && v !== null) r[k] = v; return r; };
const num = (v) => (v === "" || v == null || Number.isNaN(+v) ? undefined : +v);
export const CONTRACT_ID = "broilers-contract"; // finance doc holding the contract profile + energy prices (kind "prices")

// ---- houses and crops ----
export function saveHouse(snap, v, old = null) {
  const d = clean({ name: String(v.name || "").trim(), usableM2: num(v.usableM2), heating: v.heating, establishmentNo: v.establishmentNo, controllerImport: v.controllerImport || undefined, notes: v.notes });
  if (old) { updateRecord(snap.lid, "houses", old, d); return old.id; }
  return addRecord(snap.lid, "houses", d);
}
/** Chicks placed (day 0). Closes the house's turnaround and starts the brooding record. */
export function startCrop(snap, house, v) {
  const s = snap.s;
  const crop = clean({
    houseId: house.id, no: num(v.no) ?? nextCropNo(snap.ix, house.id), placedDate: v.placedDate, placedTime: v.placedTime, placed: num(v.placed),
    hybrid: v.hybrid || s.hybrid, breedStdId: v.breedStdId || s.breedStdId, hatchery: v.hatchery, parentFlock: v.parentFlock,
    plannedThins: v.thinDay ? [{ day: +v.thinDay, birds: num(v.thinBirds) ?? null }] : [], plannedClearDay: num(v.clearDay) ?? s.plannedClearDay,
    farmLimitKgM2: num(v.farmLimitKgM2), targetDensity: num(v.targetDensity) ?? s.targetDensity, notifiedDaera: v.notifiedDaera, approvalRef: v.approvalRef, stage: "brooding", byName: me(),
  });
  const id = addRecord(snap.lid, "crops", crop);
  addRecord(snap.lid, "brooding", clean({ cropId: id, houseId: house.id, chicksArrived: clean({ time: v.placedTime, n: num(v.placed), hatchery: v.hatchery, parentFlock: v.parentFlock, doa: num(v.doa), note: v.deliveryNote }) }), `br-${id}`);
  const ta = openTurnaround(snap.ix, house.id);
  if (ta) updateRecord(snap.lid, "turnarounds", ta, { placedDate: v.placedDate, closedAt: v.placedDate, nextCropId: id, steps: upsertStep(ta.steps, "placed", { at: v.placedDate, by: me() }) });
  return id;
}
export const cropField = (snap, crop, field, value = snap.today) => updateRecord(snap.lid, "crops", crop, { [field]: value || null }, { history: false });
export const updateCrop = (snap, crop, patch) => updateRecord(snap.lid, "crops", crop, clean(patch));

// ---- AM / PM check (Schedule 5 para 10 house record) ----
/** v: { slot, date, time, dead, culls{legs,runt,ascites,injury,other}, causeNote, tempC, rh, nh3, co2, outsideC, waterMeter, feedKg, litter{front,middle,back}, checks[], source } */
export function saveCheck(snap, crop, v) {
  const culls = {}; for (const k of ["legs", "runt", "ascites", "injury", "other"]) culls[k] = +v.culls?.[k] || 0;
  const d = clean({ cropId: crop.id, houseId: crop.houseId, date: v.date || snap.today, slot: v.slot, time: v.time, day: cropDay(crop, v.date || snap.today), dead: +v.dead || 0, culls, causeNote: v.causeNote,
    tempC: num(v.tempC), rh: num(v.rh), nh3: num(v.nh3), co2: num(v.co2), outsideC: num(v.outsideC), waterMeter: num(v.waterMeter), feedKg: num(v.feedKg),
    litter: v.litter && Object.values(v.litter).some(Boolean) ? clean(v.litter) : undefined, checks: v.checks || [], source: v.source || "manual", byName: me() });
  const old = (snap.data.checks || []).find((x) => x.cropId === crop.id && x.date === d.date && x.slot === d.slot);
  if (old) { updateRecord(snap.lid, "checks", old, d); return old.id; }
  return addRecord(snap.lid, "checks", d);
}

// ---- growth ----
export function saveWeigh(snap, crop, v) {
  const bulk = v.n && v.totalKg ? { n: +v.n, totalKg: +v.totalKg } : null;
  const st = weighStats(bulk || v.weights);
  return addRecord(snap.lid, "weighs", clean({ cropId: crop.id, houseId: crop.houseId, date: v.date || snap.today, day: cropDay(crop, v.date || snap.today), weights: bulk ? undefined : v.weights, bulk: bulk || undefined, mean: st.mean, cv: st.cv ?? undefined, uniformity: st.uniformity ?? undefined, n: st.n, source: v.source || "manual", byName: me() }));
}
export const saveFeedDelivery = (snap, crop, v) => addRecord(snap.lid, "feedDeliveries", clean({ cropId: crop?.id, houseId: crop?.houseId || v.houseId, date: v.date || snap.today, mill: v.mill, ration: v.ration, batch: v.batch, kg: num(v.kg), kind: v.kind === "return" ? "return" : "delivery", docket: v.docket, byName: me() }));

// ---- thin / clear-out ----
/** Plan a thin (§6.2 "Plan thin"): the thin event; feed-off and FCI jobs come from it. */
export function planThin(snap, crop, v) {
  const d = clean({ cropId: crop.id, houseId: crop.houseId, kind: v.kind || "thin", catchAt: v.catchAt, arrivalAt: v.arrivalAt, birds: num(v.birds), processor: v.processor || snap.s.processor, destination: v.destination, feedOffAt: v.feedOffAt, status: "planned", byName: me() });
  const id = addRecord(snap.lid, "thins", d);
  if (d.kind === "thin") updateRecord(snap.lid, "crops", crop, { plannedThins: [{ day: cropDay(crop, v.catchAt.slice(0, 10)), birds: num(v.birds) ?? null }] }, { history: false });
  return id;
}
/** Thin or clear-out done (§7). A clear-out closes the crop, stores its results and opens the turnaround. */
export function saveThin(snap, crop, v, old = null) {
  const d = clean({ cropId: crop.id, houseId: crop.houseId, kind: v.kind, catchAt: v.catchAt, arrivalAt: v.arrivalAt, birds: num(v.birds), avgKg: num(v.avgKg), processor: v.processor, destination: v.destination, feedOffAt: v.feedOffAt,
    crew: clean({ name: v.crewName, glaa: v.crewGlaa }), salmId: v.salmId, fciId: v.fciId, status: v.status || "done", diseaseText: v.diseaseText, byName: me() });
  let id;
  if (old) { updateRecord(snap.lid, "thins", old, d); id = old.id; } else id = addRecord(snap.lid, "thins", d);
  if (d.kind === "clear" && d.status === "done") closeCrop(snap, crop, { ...d, id }, old);
  return id;
}
function closeCrop(snap, crop, thin, old) {
  const date = thin.catchAt.slice(0, 10);
  const thins = [...(snap.data.thins || []).filter((t) => t.cropId === crop.id && t.id !== (old?.id || thin.id)), { ...thin }];
  const ix = { ...snap.ix, thins: new Map(snap.ix.thins), cropsByHouse: snap.ix.cropsByHouse };
  ix.thins.set(crop.id, thins);
  const r = cropResults(ix, { ...crop, clearedDate: date });
  updateRecord(snap.lid, "crops", crop, { clearedDate: date, stage: "turnaround", results: clean({ epef: r.epef, fcr: r.fcr, liveability: r.liveability, avgKg: r.avgKg, ageDays: r.ageDays, mort7: r.mort7, sold: r.sold, kg: r.kg }) });
  if (!openTurnaround(snap.ix, crop.houseId)) addRecord(snap.lid, "turnarounds", { houseId: crop.houseId, cropId: crop.id, clearedDate: date, steps: [], byName: me() });
}
export function saveDocket(snap, crop, thin, v) {
  updateRecord(snap.lid, "thins", thin, { docket: clean({ received: num(v.received), kg: num(v.kg), doa: num(v.doa), rejPct: num(v.rejPct), footpad: num(v.footpad), hockPct: num(v.hockPct), text: v.text }) });
  if (crop.clearedDate) { // refresh the stored results with the processor's figures
    const thins = (snap.data.thins || []).map((t) => (t.id === thin.id ? { ...t, docket: { received: num(v.received), kg: num(v.kg), doa: num(v.doa), rejPct: num(v.rejPct), footpad: num(v.footpad), hockPct: num(v.hockPct) } } : t)).filter((t) => t.cropId === crop.id);
    const ix = { ...snap.ix, thins: new Map(snap.ix.thins) }; ix.thins.set(crop.id, thins);
    const r = cropResults(ix, crop);
    updateRecord(snap.lid, "crops", crop, { results: clean({ epef: r.epef, fcr: r.fcr, liveability: r.liveability, avgKg: r.avgKg, ageDays: r.ageDays, mort7: r.mort7, sold: r.sold, kg: r.kg }) }, { history: false });
  }
}

// ---- paperwork chain ----
export function saveFci(snap, crop, thin, doc, { sentTo, method } = {}) {
  const old = (snap.data.fci || []).find((f) => f.thinId === thin.id);
  const d = clean({ cropId: crop.id, houseId: crop.houseId, thinId: thin.id, kind: thin.kind, sendBy: doc.sendBy, sentAt: `${snap.today}T${new Date().toTimeString().slice(0, 5)}`, sentTo: sentTo || snap.s.fciEmail, method, doc, byName: me() });
  if (old) { updateRecord(snap.lid, "fci", old, d); return old.id; }
  const id = addRecord(snap.lid, "fci", d);
  updateRecord(snap.lid, "thins", thin, { fciId: id }, { history: false });
  return id;
}
export function saveSalm(snap, crop, v, ev) {
  const w = ev ? salmWindow(ev.date, snap.s, ev.day) : null;
  return addRecord(snap.lid, "salmSamples", clean({ cropId: crop.id, houseId: crop.houseId, date: v.date, time: v.time, swabPairs: num(v.swabPairs), sampler: v.sampler || me(), lab: v.lab, sentToLabAt: v.sentToLabAt, result: v.result || "pending", windowFrom: w?.from, windowTo: w?.to, forEvent: ev ? `${ev.kind}:${ev.day}` : undefined, byName: me() }));
}
export const salmResult = (snap, smp, result, date = snap.today) => updateRecord(snap.lid, "salmSamples", smp, { result, resultDate: date });
export function saveMedicine(snap, crop, v) {
  const m = clean({ cropId: crop?.id, houseId: crop?.houseId || v.houseId, date: v.date || snap.today, days: num(v.days) ?? 1, product: v.product, active: v.active, batch: v.batch, reason: v.reason, dose: v.dose, route: "in water", wdDays: num(v.wdDays) ?? 0, vet: v.vet, vetReason: v.vetReason, productId: v.productId, byName: me() });
  m.withdrawalEnd = withdrawalEnd(m);
  return addRecord(snap.lid, "medicines", m);
}
export const saveAlarmTest = (snap, v) => addRecord(snap.lid, "alarmTests", clean({ date: v.date || snap.today, time: v.time, kind: v.kind, houseIds: v.houseIds, ok: v.ok !== false, onLoadMinutes: num(v.onLoadMinutes), action: v.action, by: v.by || me() }));
export const addVisitor = (snap, v) => addRecord(snap.lid, "visitors", clean({ date: v.date || snap.today, time: v.time, name: v.name, company: v.company, reason: v.reason, lastPoultryContact: v.lastPoultryContact, vehicle: v.vehicle, readRules: !!v.readRules, bootsChanged: !!v.bootsChanged, byName: me() }));
export const saveWaterTest = (snap, v) => addRecord(snap.lid, "waterTests", clean({ date: v.date || snap.today, lab: v.lab, result: v.result, note: v.note, byName: me() }));
export const saveTraining = (snap, v) => addRecord(snap.lid, "training", clean({ person: v.person, course: v.course, date: v.date, expires: v.expires, ref: v.ref, byName: me() }));
export const saveBirdReturn = (snap, v) => addRecord(snap.lid, "birdRegisterReturns", clean({ year: +v.year, establishmentNo: v.establishmentNo, countDate: v.countDate, birds: +v.birds || 0, byHouse: v.byHouse, submittedOn: v.submittedOn, byName: me() }));

// ---- brooding (days 0–3, day 7) ----
export function saveBrooding(snap, crop, patch) {
  const old = (snap.data.brooding || []).find((b) => b.cropId === crop.id);
  if (old) return updateRecord(snap.lid, "brooding", old, patch);
  return addRecord(snap.lid, "brooding", { cropId: crop.id, houseId: crop.houseId, ...patch }, `br-${crop.id}`);
}

// ---- turnaround ----
function upsertStep(steps = [], key, v) { const out = (steps || []).filter((x) => x.key !== key); if (v) out.push({ key, ...v }); return out; }
export function turnaroundStep(snap, ta, key, v) {
  const step = v ? clean({ at: v.at || snap.today, by: v.by || me(), product: v.product, dilution: v.dilution, who: v.who, result: v.result, litterType: v.litterType, tonnes: num(v.tonnes), note: v.note }) : null;
  const patch = { steps: upsertStep(ta.steps, key, step) };
  if (key === "litterOut" && v) patch.litterOut = clean({ t: num(v.tonnes), haulier: v.haulier, dest: v.dest, docket: v.docket, date: v.at || snap.today });
  return updateRecord(snap.lid, "turnarounds", ta, patch);
}
export const updateTurnaround = (snap, ta, patch) => updateRecord(snap.lid, "turnarounds", ta, clean(patch));

// ---- money (finance only) ----
export function contractDoc(snap) { return (snap.data.finance || []).find((f) => f.id === CONTRACT_ID) || null; }
export function saveContractProfile(snap, profile, prices) {
  const old = contractDoc(snap);
  const d = { kind: "prices", category: "Broiler contract profile", date: snap.today, note: "Contract profile and energy prices (not a money entry)", profile: profile ?? old?.profile ?? null, energyPrices: prices ?? old?.energyPrices ?? null };
  if (old) return updateRecord(snap.lid, "finance", old, d);
  return addRecord(snap.lid, "finance", d, CONTRACT_ID);
}
/** One finance record per settlement (01-platform §15.2 copy: "Crop 40 House 1 · 31,240 birds · 80,600 kg · £3,405"). */
export function saveSettlement(snap, crop, house, v) {
  const r = cropResults(snap.ix, crop); const prof = contractDoc(snap)?.profile;
  const est = paymentEstimate(prof, { ...r, cumMort: r.cumMort }, +house?.usableM2 || 0);
  const chk = est ? settlementCheck(est.total, +v.amount) : null;
  const note = `Crop ${crop.no || ""} ${house?.name || ""} · ${(r.sold || 0).toLocaleString("en-GB")} birds · ${Math.round(r.kg || 0).toLocaleString("en-GB")} kg · £${(+v.amount).toLocaleString("en-GB", { maximumFractionDigits: 0 })}`.replace(/\s+/g, " ");
  return addRecord(snap.lid, "finance", clean({ kind: "revenue", category: "Crop payment", amount: +v.amount, date: v.date || snap.today, note, cropId: crop.id, houseId: crop.houseId, settlement: clean({ cropId: crop.id, estimate: est?.total, diff: chk?.diff, pct: chk?.pct, flag: chk?.flag, lines: v.lines, ref: v.ref }), source: "settlement" }));
}

// ---- energy (readings; prices live in finance) ----
export function saveEnergy(snap, crop, patch) {
  const old = (snap.data.energy || []).find((e) => e.cropId === crop.id);
  if (old) return updateRecord(snap.lid, "energy", old, patch);
  return addRecord(snap.lid, "energy", { cropId: crop.id, houseId: crop.houseId, readings: [], deliveries: [], ...patch }, `en-${crop.id}`);
}

// ---- settings, checklist, generated jobs ----
export const saveSettings = (snap, patch) => setMeta(snap.lid, "settings", { ...(snap.meta.settings || {}), ...patch });
export const tickChecklist = (snap, id, ok) => setMeta(snap.lid, "checklist", { ...(snap.meta.checklist || {}), [id]: ok ? { ok: true, at: snap.today, by: me() } : null });
export function tickGenerated(lid, snap, t, done) {
  const a = t.action || {};
  if (a.type === "cropField") { const c = snap.ix.cropById.get(a.id); if (c) return updateRecord(lid, "crops", c, { [a.field]: done ? snap.today : null }, { history: false }); }
  if (a.type === "taField") { const ta = (snap.data.turnarounds || []).find((x) => x.id === a.id); if (ta) return updateRecord(lid, "turnarounds", ta, { [a.field]: done ? snap.today : null }, { history: false }); }
  if (a.type === "alarm" && done) return addRecord(lid, "alarmTests", { date: snap.today, kind: a.kind, ok: true, houseIds: snap.ix.houses.map((h) => h.id), by: me(), from: "todo" });
  const existing = snap.data.tasks.find((x) => x.sourceRef === t.key);
  const u = auth.user; const stamp = done ? { done: true, doneAt: new Date(), doneBy: u?.uid || null, doneByName: me() } : { done: false, doneAt: null, doneBy: null, doneByName: null };
  if (existing) return updateRecord(lid, "tasks", existing, stamp, { history: false });
  return addRecord(lid, "tasks", { title: t.title, due: t.due, sourceRef: t.key, note: "", money: false, ...stamp });
}
export const undoAdd = (lid, coll, id) => softDelete(lid, coll, id);
export { currentCrop, addDays };
