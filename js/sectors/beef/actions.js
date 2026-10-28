// Every Beef write in one place (screens call these; unit tests call them against the memory
// store under the rules model). Writes return at once (offline-first); ids come back so the
// UI can offer Undo. Records keep v9's field names where v9 had them (see model/animals.js).
import { addRecord, updateRecord, setMeta, softDelete, restore } from "../../services/records.js";
import { addDays, daysBetween, todayStr } from "../../core/dates.js";
import { store } from "../../core/store.js";
import { nextTag, normTag, parseTag, tagParts } from "./model/tags.js";
import { ageMonths } from "./model/animals.js";
import { bcrsDeadline } from "./model/finishing.js";
import { BCRS_RESIDENCY } from "./model/rules.js";
import { canWriteMeta, canWrite } from "../../core/policy.js";
import { MARKET_ID } from "./model/prices.js";

const clean = (o) => { const r = {}; for (const [k, v] of Object.entries(o)) if (v !== undefined) r[k] = v; return r; };

export function addAnimal(lid, a) { return addRecord(lid, "animals", clean({ status: "onFarm", ...a, tag: (parseTag(a.tag)?.formatted) || a.tag })); }
export const updateAnimal = (lid, old, changes) => updateRecord(lid, "animals", old, changes);

/** Record a calving: calf animals, the calving event, next tag in the tag book. */
export function recordCalving(lid, snap, { damId, date, time = "", ease = 1, sireText = "", sireBreed = "", calves }) {
  const dam = snap.ix.byId.get(damId);
  const ids = []; const out = [];
  for (const c of calves) {
    const id = store.newId(); ids.push(id);
    const alive = c.alive !== false;
    addRecord(lid, "animals", clean({
      tag: (parseTag(c.tag)?.formatted) || c.tag || "", sex: c.sex, breed: c.breed || dam?.breed || "", colour: c.colour || "", dob: date,
      damTag: dam?.tag || "", damId, sireText: sireText || c.sireText || "", bornInHerd: true, bornInNI: true, status: alive ? "onFarm" : "gone",
      ...(alive ? {} : { offDate: date, offTo: "Dead", disposal: c.disposal || "", offReason: "died" }),
      birthKg: +c.birthKg || null, colostrum: c.colostrum || null, calvingEase: ease,
      reg: { tagged: c.tagged ? date : null, bvdSample: c.bvdSample ? date : null, nifais: null, society: null, dna: null },
      bvd: { status: "", sampleDate: c.bvdSample ? date : null },
    }), id);
    out.push({ animalId: id, alive, sex: c.sex, birthKg: +c.birthKg || null, colostrum: c.colostrum || null });
  }
  const calvingId = addRecord(lid, "calvings", clean({ damId, damTag: dam?.tag || "", date, time, ease, sireText, sireBreed, calves: out }));
  const lastTag = [...calves].reverse().find((c) => parseTag(c.tag))?.tag;
  if (lastTag && canWriteMeta(snap.role, "settings") && (!snap.s.nextTag || normTag(nextTag(lastTag)) !== normTag(snap.s.nextTag))) setMeta(lid, "settings", { nextTag: nextTag(lastTag) });
  return { calvingId, calfIds: ids };
}

/**
 * Treatment: one medicines record per animal (DAERA "use" layout, v9 field names) so the
 * register prints line by line; all share courseId. doses: [{ animalId, dose, weightKg }].
 */
export function recordTreatment(lid, snap, t) {
  const courseDays = Math.max(1, +t.courseDays || 1);
  const lastDate = addDays(t.date, courseDays - 1);
  const wdMeat = t.wdMeatDays === "" || t.wdMeatDays == null ? null : +t.wdMeatDays;
  const wdMilk = t.wdMilkDays === "" || t.wdMilkDays == null ? null : +t.wdMilkDays;
  const courseId = store.newId(); const ids = [];
  for (const d of t.doses) {
    const a = snap.ix.byId.get(d.animalId); if (!a) continue;
    const per = +d.dose || 0;
    ids.push(addRecord(lid, "medicines", clean({
      date: t.date, lastDate, productName: t.productName, productId: t.productId || null, batchNumber: t.batch || "", source: t.source || "",
      quantity: per ? String(Math.round(per * courseDays * 10) / 10) : "", quantityUnit: t.unit || "ml", administeredBy: t.givenBy || "", vet: t.vet || "",
      animalTags: [a.tag], animalIds: [a.id], reason: t.reason || "", route: t.route || "", courseDays, courseId, groupLabel: t.groupLabel || "",
      withdrawalMeatDays: wdMeat, withdrawalMilkDays: wdMilk, withdrawalEndDateMeat: wdMeat != null ? addDays(lastDate, wdMeat) : null,
      withdrawalEndDateMilk: wdMilk ? addDays(lastDate, wdMilk) : null, withdrawalOther: t.wdOther || "", brokenNeedle: !!t.brokenNeedle, injectionSite: t.injectionSite || "",
      notUsed: false, doses: [{ tag: a.tag, dose: per, weightKg: d.weightKg || null, est: !!d.est }],
    })));
  }
  return { ids, courseId, withdrawalEnd: wdMeat != null ? addDays(lastDate, wdMeat) : null };
}
/** Dose by weight (design/10 §6.2): round weight up to the band, times the label rate. */
export function doseFor(weightKg, { ratePerKg, band = 10 }) { if (!(weightKg > 0) || !(ratePerKg > 0)) return null; return Math.round(Math.ceil(weightKg / band) * band * ratePerKg * 10) / 10; }

export function recordWeights(lid, entries, { date = todayStr(), sessionId = store.newId(), method = "scale" } = {}) {
  return entries.filter((e) => +e.kg > 0).map((e) => addRecord(lid, "weighings", { animalId: e.animalId, date: e.date || date, kg: +e.kg, sessionId, method }));
}

/** Animals leaving by sale (design/10 §6.4): animal off, movement off, sale record, finance line.
 * £ goes ONLY into the finance entry (design/01 §15): the sale record keeps weights, grade, lot,
 * buyer and BCRS checks, and points at the finance entry (financeId). */
export function recordSale(lid, snap, { kind, date, buyer = "", buyerAddress = "", animalIds, lines = [], haulage = "", fci = false, note = "" }) {
  const offTo = [buyer, buyerAddress].filter(Boolean).join(", ") || { mart: "Mart", factory: "Factory", private: "Private sale", export: "Export" }[kind];
  const saleLines = []; const moneyLines = []; let total = 0;
  for (const id of animalIds) {
    const a = snap.ix.byId.get(id); if (!a) continue;
    const l = lines.find((x) => x.animalId === id) || {};
    const price = +l.price || (+l.deadKg && +l.pricePerKg ? +l.deadKg * +l.pricePerKg : 0);
    total += price;
    const age = ageMonths(a, date);
    const bc = kind === "factory" ? bcrsDeadline(a, snap.s) : null;
    const resid = a.onDate ? daysBetween(a.onDate, date) >= BCRS_RESIDENCY.days : true;
    const desc = `${a.breed || ""} ${a.sex || ""}`.trim();
    saleLines.push(clean({ animalId: id, tag: a.tag, desc, dob: a.dob || "", liveKg: +l.liveKg || null, deadKg: +l.deadKg || null, grade: l.grade || "", lot: l.lot || "",
      bcrs: bc ? { ageMonths: Math.round(age * 10) / 10, eligible: date <= bc.date && resid, residencyOk: resid } : undefined }));
    moneyLines.push(clean({ animalId: id, tag: a.tag, desc, liveKg: +l.liveKg || null, deadKg: +l.deadKg || null, grade: l.grade || "", pricePerKg: +l.pricePerKg || null, price: price ? Math.round(price * 100) / 100 : null }));
    updateRecord(lid, "animals", a, { offDate: date, offTo, offReason: "sold", status: "gone", saleKind: kind });
  }
  const saleId = store.newId();
  const moveId = addRecord(lid, "movements", { kind: "off", date, animalIds, to: offTo, nifaisNotified: kind === "factory" ? date : null, haulage, fci });
  let financeId = null;
  if (total > 0 && canWrite(snap.role, "finance")) financeId = addRecord(lid, "finance", { kind: "revenue", category: "Livestock Sales", amount: Math.round(total * 100) / 100, date, note: `${saleLines.length} cattle · ${offTo}${note ? " · " + note : ""}`, lines: moneyLines, source: "sale", saleId });
  addRecord(lid, "sales", clean({ kind, date, buyer, buyerAddress, lines: saleLines, financeId, moveId, haulage, fci }), saleId);
  return { saleId, moveId, financeId, total };
}

/** Animals arriving (design/10 §6.5). animals: [{ tag, dob, sex, breed, colour, kg, price, bvd }]
 * Prices go only into the finance entry (lines per animal); never on the animal or purchase. */
export function recordPurchase(lid, snap, { date, fromName = "", fromAddress = "", herdNo = "", lot = "", statementNo = "", animals, prevMoves = 0, notified = false, total = null }) {
  const pid = store.newId(); const fromText = [fromName, fromAddress].filter(Boolean).join(", "); const ids = [];
  for (const x of animals) {
    ids.push(addRecord(lid, "animals", clean({ tag: (parseTag(x.tag)?.formatted) || x.tag, dob: x.dob || "", sex: x.sex || "", breed: x.breed || "", colour: x.colour || "", onDate: date, fromText, fromHerdNo: herdNo, lot: x.lot || lot,
      purchaseId: pid, weightKg: +x.kg || null, prevMoves: +x.prevMoves || +prevMoves || 0, bornInHerd: false, status: "onFarm", bvd: { status: x.bvd || "" },
      ...(+x.kg ? { lastWeightKg: +x.kg, lastWeightDate: date, lastWeightEst: false } : {}) })));
  }
  const cost = total != null && total !== "" ? +total : animals.reduce((s, x) => s + (+x.price || 0), 0);
  const untested = animals.filter((x) => !x.bvd || /BVDU|untested/i.test(x.bvd)).length;
  addRecord(lid, "purchases", clean({ kind: "livestock", date, supplier: fromName, fromText, statementNo, productName: `${animals.length} cattle`, animalTags: animals.map((x) => x.tag), animals: animals.map((x) => ({ tag: x.tag, lot: x.lot || lot, weight: x.kg || "" })),
    notified: !!notified, notifiedAt: notified ? new Date().toISOString() : null, isolationUntil: addDays(date, 28), untestedBvd: untested }), pid);
  addRecord(lid, "movements", { kind: "on", date, animalIds: ids, from: fromText, lot, nifaisNotified: notified ? date : null });
  let financeId = null;
  if (cost > 0 && canWrite(snap.role, "finance")) financeId = addRecord(lid, "finance", { kind: "expense", category: "Animal Purchase", amount: cost, date, note: `${fromName}${statementNo ? " statement " + statementNo : ""}: ${animals.length} cattle`, purchaseId: pid,
    lines: animals.map((x, i) => clean({ animalId: ids[i], tag: x.tag, kg: +x.kg || null, price: +x.price || null })) });
  return { purchaseId: pid, animalIds: ids, financeId };
}

/** Today's prices (£/kg dead for the finishing value, meal £/t): finance-only doc. */
export function setMarketPrices(lid, snap, changes) {
  const old = snap.data.finance.find((e) => e.id === MARKET_ID);
  if (old) return updateRecord(lid, "finance", old, changes, { history: false });
  return addRecord(lid, "finance", { kind: "prices", source: "beef", ...changes }, MARKET_ID);
}

export function recordDeath(lid, snap, { animalId, date, cause, causeText = "", foundAtInspection = false, disposal, docketNo = "" }) {
  const a = snap.ix.byId.get(animalId);
  const tse = (ageMonths(a, date) ?? 0) >= 48;
  updateRecord(lid, "animals", a, { offDate: date, offTo: "Dead", disposal, offReason: "died", status: "gone" });
  addRecord(lid, "movements", { kind: "off", date, animalIds: [animalId], to: "Dead", death: true, nifaisNotified: "n/a" });
  return addRecord(lid, "deaths", { animalId, tag: a.tag, tagLabel: tagParts(a.tag).tail, date, cause, causeText, foundAtInspection, disposal, docketNo, tseRequired: tse, tseDone: false, nifaisNotified: null });
}

/** Internal move to a group / shed / field (no NIFAIS). housing=true sets the housed date. */
export function recordMove(lid, snap, { animalIds, groupId, date, housing = false, note = "" }) {
  const g = snap.ix.groups.get(groupId);
  for (const id of animalIds) { const a = snap.ix.byId.get(id); if (a && a.groupId !== groupId) updateRecord(lid, "animals", a, { groupId, ...(housing ? { housedOn: date } : {}) }); }
  return addRecord(lid, "movements", { kind: housing ? "housing" : "internal", date, animalIds, to: g ? g.name : "", groupId, note });
}
export const addGroup = (lid, { name, cls = "", shed = "", fieldId = "" }) => addRecord(lid, "groups", clean({ name, class: cls || null, shed, fieldId }));

/** Lost tag: fitted now (same number, or new number = IDQ) or a job to fit within the limit. */
export function recordRetag(lid, a, { date, which = "one", newTag = "", fitted = true }) {
  if (!fitted) return updateRecord(lid, "animals", a, { retagPending: date, retagWhich: which, retagNew: newTag || "" });
  const rep = [...(a.replacementTags || [])];
  if (newTag && normTag(newTag) !== normTag(a.tag)) { rep.push({ tag: a.tag, date, note: "old number" }); return updateRecord(lid, "animals", a, { tag: (parseTag(newTag)?.formatted) || newTag, replacementTags: rep, flags: [...new Set([...(a.flags || []), "IDQ"])], retagPending: null }); }
  rep.push({ tag: "Same no.", date, note: which === "both" ? "both tags" : "one tag" });
  return updateRecord(lid, "animals", a, { replacementTags: rep, retagPending: null });
}
export const recordVetOp = (lid, op) => addRecord(lid, "vetOps", clean(op));
export const recordService = (lid, s) => addRecord(lid, "services", clean(s));
export const recordScan = (lid, s) => addRecord(lid, "scans", clean(s));
export const recordHeat = (lid, h) => addRecord(lid, "heats", clean(h));

/** Medicine purchase / disposal (DAERA layouts, v9 shapes). */
export const recordMedPurchase = (lid, p) => addRecord(lid, "purchases", clean({ kind: "medicine", ...p }));
export const recordDisposal = (lid, d) => addRecord(lid, "medicines", clean({ ...d, notUsed: true, animalTags: [], date: d.disposalDate }));

/** Tick (or un-tick) a generated Today job. */
export function tickGenerated(lid, snap, t, done, by = {}) {
  const today = todayStr(); const a = t.action || {};
  if (a.type === "reg") { const an = snap.ix.byId.get(a.animalId); return updateRecord(lid, "animals", an, { reg: { ...(an.reg || {}), [a.step]: done ? (t.when || today) : null } }); }
  if (a.type === "notified") { const rec = snap.data[a.coll].find((r) => r.id === a.id); return rec && updateRecord(lid, a.coll, rec, { nifaisNotified: done ? today : null }); }
  if (a.type === "tse") { const rec = snap.data.deaths.find((r) => r.id === a.id); return rec && updateRecord(lid, "deaths", rec, { tseDone: done ? today : false }); }
  if (a.type === "retagDone") { const an = snap.ix.byId.get(a.animalId); return done ? recordRetag(lid, an, { date: today, which: an.retagWhich, newTag: an.retagNew, fitted: true }) : null; }
  const existing = snap.data.tasks.find((x) => x.sourceRef === t.key);
  const stamp = done ? { done: true, doneAt: new Date(), doneBy: by.uid || null, doneByName: by.name || null } : { done: false, doneAt: null, doneBy: null, doneByName: null };
  if (existing) return updateRecord(lid, "tasks", existing, stamp, { history: false });
  return addRecord(lid, "tasks", { title: t.title, due: t.due, sourceRef: t.key, note: "", money: false, ...stamp });
}

/** TB test: create, mark presented, read. */
export const createTbTest = (lid, t) => addRecord(lid, "tbTests", clean({ stage: "planned", presented: {}, results: {}, ...t }));
export const updateTbTest = (lid, old, ch) => updateRecord(lid, "tbTests", old, ch, { history: false });
export { softDelete, restore, setMeta };
