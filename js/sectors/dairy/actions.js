// Every Dairy write goes through here (screens never call records.js directly for dairy data),
// so the linked records a treatment or calving creates stay consistent.
import { addRecord, updateRecord, softDelete, setMeta } from "../../services/records.js";
import { auth } from "../../core/auth.js";
import { addDays, todayStr } from "../../core/dates.js";
import { withdrawalFor, nowStr, datePart, timePart, quartersText, at, addHours } from "./model/milking.js";
import { caseFacts } from "./model/mastitis.js";
import { cowLabel, calvedDate, isDry, listOf, lactation } from "./model/cows.js";
import { fertilityOf } from "./model/fertility.js";

export const me = () => auth.user?.displayName || auth.user?.email || "";
const clean = (o) => { const r = {}; for (const [k, v] of Object.entries(o)) if (v !== undefined) r[k] = v; return r; };

/**
 * Treatment / mastitis (design/12 §6.1). v: { animalIds[], reason, quarters[], severity, product{...},
 * batch, expiry, dose, doses, intervalH, givenBy, marks[], date, time, wdMilkHours, wdMeatDays, note, licence }
 * Writes: medicines (+ quarters), milkWithhold per cow, mastitis case per cow, handover line.
 * Returns { medId, notes[] } — notes are follow-up messages (3rd case, treatment failure).
 */
export function saveTreatment(snap, v) {
  const { lid, s, ix } = snap; const notes = [];
  const wd = withdrawalFor(s, v);
  const meatOkFrom = +v.wdMeatDays ? addDays(datePart(wd.lastDoseAt), +v.wdMeatDays) : null;
  const tags = v.animalIds.map((id) => ix.byId.get(id)?.tag).filter(Boolean);
  const medId = addRecord(lid, "medicines", clean({
    date: v.date, time: v.time, animalIds: v.animalIds, animalTags: tags, reason: v.reason, quarters: v.quarters || [], severity: v.severity || null,
    productId: v.product?.id || null, productName: v.product?.name || v.productName || "", batch: v.batch || "", expiry: v.expiry || "", dose: v.dose || "",
    doses: +v.doses || 1, intervalH: +v.intervalH || 0, givenBy: v.givenBy || me(), marks: v.marks || [], wdMilkHours: +v.wdMilkHours || 0, wdMeatDays: +v.wdMeatDays || 0,
    milkOkFrom: wd.okFrom, lastDoseAt: wd.lastDoseAt, withdrawalEndDateMeat: meatOkFrom, meatOkFrom, note: v.note || "", licence: v.licence || null, vaccine: v.reason === "BTV-3 vaccine" || undefined,
  }));
  for (const id of v.animalIds) {
    const a = ix.byId.get(id); if (!a) continue;
    let withholdId = null;
    if (wd.okFrom) {
      const dry = !!v.forceDry || isDry(ix, a);
      withholdId = addRecord(lid, "milkWithhold", clean({ animalId: id, medId, date: v.date, time: v.time, quarters: v.quarters || [], productName: v.product?.name || "", wdMilkHours: +v.wdMilkHours, lastDoseAt: wd.lastDoseAt, firstWithheldAt: at(v.date, v.time || "12:00"), okFrom: wd.okFrom, marks: v.marks || [], dryCow: dry || undefined, afterCalvingHours: dry ? +v.afterCalvingHours || +v.wdMilkHours : undefined, byName: me() }));
    }
    if (v.reason === "Mastitis") {
      const f = caseFacts(listOf(ix.cases, a), { date: v.date, quarters: v.quarters }, calvedDate(ix, a));
      addRecord(lid, "mastitis", clean({ animalId: id, date: v.date, time: v.time, quarters: v.quarters, grade: v.severity || null, organism: v.organism || "", medId, withholdId, productName: v.product?.name || "", okFrom: wd.okFrom, recurrence: f.recurrence, failure: f.failure, caseNo: f.caseNo, lactation: lactation(ix, a), treated: true }));
      if (f.caseNo >= 3) notes.push(`${cowLabel(a)} has had ${f.caseNo} mastitis cases this lactation — consider her on the cull list.`);
      if (f.failure) notes.push(`Treatment failure: tell your vet within 1 week (Red Tractor DP.4).`);
    }
  }
  if (v.animalIds.length && wd.okFrom) {
    const who = v.animalIds.map((id) => ix.byId.get(id)).filter(Boolean).map(cowLabel).join(", ");
    const text = v.handoverText ?? `${who} treated${v.quarters?.length ? " " + quartersText(v.quarters) : ""} (${v.product?.name || v.reason})${v.marks?.length ? ", " + v.marks.join(", ").toLowerCase() : ""}`;
    if (text) addHandover(lid, text, { auto: true });
  }
  return { medId, notes, wd };
}

export const releaseWithhold = (lid, w) => updateRecord(lid, "milkWithhold", w, { releasedAt: nowStr(), releasedBy: auth.user?.uid || null, releasedByName: me() }, { history: false });
export const undoRelease = (lid, w) => updateRecord(lid, "milkWithhold", { ...w, releasedAt: "x" }, { releasedAt: null, releasedBy: null, releasedByName: null }, { history: false });

export function recordHeats(lid, ids, { date, time, sign, source = "eye" }) { return ids.map((animalId) => addRecord(lid, "heats", { animalId, date, time, sign, source, byName: me() })); }
export function recordServe(snap, v) {
  const a = snap.ix.byId.get(v.animalId); const f = fertilityOf(snap.s, snap.ix, a, snap.today);
  return addRecord(snap.lid, "services", clean({ animalId: v.animalId, date: v.date, time: v.time, strawId: v.strawId || null, sireText: v.sireText || "", sireBreed: v.sireBreed || "", sexed: !!v.sexed, technician: v.technician || "", kind: v.kind || "AI", serviceNo: f.serviceNo + 1, byName: me() }));
}
export const recordPd = (lid, v) => addRecord(lid, "pds", clean({ animalId: v.animalId, date: v.date, result: v.result, daysPregnant: v.daysPregnant || null, vet: v.vet || "", byName: me() }));
export const addStraw = (lid, v) => addRecord(lid, "straws", clean({ bull: v.bull, code: v.code || "", breed: v.breed || "", sexed: !!v.sexed, count: +v.count || 0 }));

/** Calving (design/12 §6.6): the calving record, each calf as an animal, the cow's new lactation. */
export function recordCalving(snap, v) {
  const { lid } = snap; const calves = [];
  for (const k of v.calves) {
    if (k.alive === false) { calves.push({ sex: k.sex, alive: false }); continue; }
    const id = addRecord(lid, "animals", clean({ tag: k.tag || "", sex: k.sex, breed: k.breed || "", dob: v.date, birthTime: v.time, damId: v.damId, damTag: snap.ix.byId.get(v.damId)?.tag || "", sireText: v.sireText || "", bornInHerd: true, bornInNI: true, reg: k.tag ? { tagged: v.date } : {}, calf: { colostrum: v.colostrum || null, destination: k.destination || "Rear as replacement", pen: k.pen || "" }, cowNo: k.cowNo || "" }));
    calves.push({ animalId: id, sex: k.sex, alive: true, destination: k.destination });
  }
  const dam = snap.ix.byId.get(v.damId);
  return addRecord(lid, "calvings", clean({ damId: v.damId, date: v.date, time: v.time, ease: v.ease || "Unassisted", calves, sireText: v.sireText || "", colostrum: v.colostrum || null, lactation: dam ? lactation(snap.ix, dam) + 1 : null, byName: me() }));
}

/** Dry off (design/12 §6.4). Antibiotic DCT needs the vet's reason (EU 2019/6 Art. 107). */
export function recordDryOff(snap, v) {
  const { lid } = snap;
  let medId = null;
  if (v.treatment !== "None" && (v.product || v.productName)) {
    const r = saveTreatment(snap, { animalIds: [v.animalId], reason: v.treatment === "Antibiotic DCT + sealant" ? "Dry cow therapy" : "Teat sealant", quarters: ["LF", "RF", "LH", "RH"], product: v.product, batch: v.batch, date: v.date, time: v.time || "17:00", doses: 1, wdMilkHours: v.wdMilkHours || 0, wdMeatDays: v.wdMeatDays || 0, afterCalvingHours: v.afterCalvingHours, marks: v.marks || [], givenBy: v.givenBy, handoverText: "", forceDry: true });
    medId = r.medId;
  }
  return addRecord(lid, "dryOffs", clean({ animalId: v.animalId, date: v.date, lastScc: v.lastScc ?? null, cmt: v.cmt || "", treatment: v.treatment, vetReason: v.vetReason || "", vet: v.vet || "", productName: v.product?.name || "", batch: v.batch || "", medId, expectedCalving: v.expectedCalving || null, byName: me() }));
}

export function logTank(lid, v) {
  return addRecord(lid, "tankLog", clean({ date: v.date || todayStr(), milking: v.milking, time: v.time || timePart(nowStr()), tempC: +v.tempC, collected: !!v.collected, receiptTemp: v.receiptTemp === "" ? null : v.receiptTemp ?? null, litres: v.litres ? +v.litres : null, action: v.action || "", byName: me() }));
}
export function addHandover(lid, text, { auto = false } = {}) { return addRecord(lid, "handover", { text, by: auth.user?.uid || null, byName: me(), at: nowStr(), auto, replies: [] }); }
export function replyHandover(lid, h, text) { return updateRecord(lid, "handover", h, { replies: [...(h.replies || []), { text, byName: me(), at: nowStr() }] }, { history: false }); }

export const setVetList = (lid, a, reason) => updateRecord(lid, "animals", a, { vetCheck: reason ? { reason, added: todayStr(), byName: me() } : null }, { history: false });
export const updateCow = (lid, a, ch) => updateRecord(lid, "animals", a, ch);
export const addCow = (lid, v) => addRecord(lid, "animals", clean(v));

/** Tick a generated job: real record where there is one, else a task with sourceRef. */
export function tickGenerated(lid, snap, t, done) {
  const a = t.action || {}; const today = todayStr();
  if (a.type === "reg") { const an = snap.ix.byId.get(a.animalId); return updateRecord(lid, "animals", an, { reg: { ...(an.reg || {}), [a.step]: done ? today : null } }); }
  if (a.type === "rec") { const rec = snap.data[a.coll].find((r) => r.id === a.id); return rec && updateRecord(lid, a.coll, rec, { [a.field]: done ? today : null }, { history: false }); }
  if (a.type === "release") { const w = snap.data.milkWithhold.find((x) => x.id === a.id); return w && (done ? releaseWithhold(lid, w) : undoRelease(lid, w)); }
  const existing = snap.data.tasks.find((x) => x.sourceRef === t.key);
  const u = auth.user; const stamp = done ? { done: true, doneAt: new Date(), doneBy: u?.uid || null, doneByName: me() } : { done: false, doneAt: null, doneBy: null, doneByName: null };
  if (existing) return updateRecord(lid, "tasks", existing, stamp, { history: false });
  return addRecord(lid, "tasks", { title: t.title, due: t.due, sourceRef: t.key, note: "", money: false, ...stamp });
}
export const add = (lid, coll, v) => addRecord(lid, coll, clean({ ...v, byName: v.byName || me() }));
export const update = (lid, coll, old, ch) => updateRecord(lid, coll, old, ch);
export { softDelete, setMeta, addHours };
