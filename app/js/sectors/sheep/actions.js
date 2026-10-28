// Every Sheep write goes through here (screens never build records themselves), so the record
// shapes in design/11 §12 live in one file. Writes return at once (offline-first).
import { addRecord, updateRecord } from "../../services/records.js";
import { setMeta } from "../../services/records.js";
import { auth } from "../../core/auth.js";
import { todayStr, addDays } from "../../core/dates.js";
import { WORMER_GROUPS } from "./model/health.js";

const clean = (o) => { const r = {}; for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== "" && !(typeof v === "number" && isNaN(v))) r[k] = v; return r; };
export const me = () => auth.user?.displayName || auth.user?.email || "";
const ev = (lid, kind, rec) => addRecord(lid, "events", clean({ kind, date: todayStr(), by: me(), ...rec }));

// ---- mobs
export function createMob(lid, { name, cls, species = "sheep", breed, birthYears = [], fieldName, count = 0, date = todayStr(), note }) {
  const id = addRecord(lid, "mobs", clean({ name, class: cls, species: cls === "goats" ? "goat" : species, breed, birthYears, fieldName, active: true, note }));
  ev(lid, "countCheck", { mobId: id, date, counts: { count: +count || 0 }, reason: "start" });
  return id;
}
export const updateMob = (lid, mob, ch) => updateRecord(lid, "mobs", mob, clean(ch));
export const countCheck = (lid, mob, count, reason, date = todayStr()) => ev(lid, "countCheck", { mobId: mob.id, date, counts: { count: +count }, reason });
export const splitMob = (lid, mob, n, toMobId, date = todayStr(), why) => ev(lid, "split", { mobId: mob.id, toMobId, date, counts: { n: +n }, reason: why });
export const mergeMob = (lid, mob, toMobId, date = todayStr()) => { ev(lid, "merge", { mobId: mob.id, toMobId, date }); return updateRecord(lid, "mobs", mob, { active: false, mergedInto: toMobId }); };
export const moveField = (lid, mobIds, toField, date = todayStr(), fromField) => mobIds.map((m) => ev(lid, "fieldMove", { mobId: m, toField, fromField, date }));
export const ramsIn = (lid, mobIds, date, ramMobId) => ev(lid, "ramsIn", { mobIds, mobId: ramMobId, date });
export const ramsOut = (lid, date = todayStr()) => ev(lid, "ramsOut", { date });

// ---- tallies
export const raddle = (lid, mob, colour, n, date = todayStr(), eidReads) => ev(lid, "raddle", { mobId: mob.id, date, counts: { colour, newlyMarked: +n }, eidReads });
export const scan = (lid, mob, counts, { date = todayStr(), marks, cullEmpties = true, eidReads } = {}) => ev(lid, "scan", { mobId: mob.id, date, counts, marks, cullEmpties, eidReads });
export const bcs = (lid, mob, counts, stage, date = todayStr()) => ev(lid, "bcs", { mobId: mob.id, date, counts, stage });
export const lameCheck = (lid, mob, { lame, outOf, individuals = [] }, date = todayStr()) => ev(lid, "lame", { mobId: mob.id, date, counts: { lame: +lame, outOf: +outOf, individuals } });
export const fecResult = (lid, mob, v) => ev(lid, "fec", { mobId: mob.id, date: v.date, lab: v.lab, counts: clean({ strongyle: v.strongyle === "" ? undefined : +v.strongyle, nematodirus: v.nematodirus === "" ? undefined : +v.nematodirus, coccidia: v.coccidia || undefined, fluke: v.fluke || undefined }), postDoseOf: v.postDoseOf });
export const weighSession = (lid, mob, weights, { date = todayStr(), ageDays, purpose = "draft" } = {}) => ev(lid, "weigh", { mobId: mob.id, date, counts: { weights }, ageDays, purpose });
export const wean = (lid, mob, weaned, date = todayStr()) => ev(lid, "wean", { mobId: mob.id, date, counts: { weaned: +weaned } });
export const cullCheck = (lid, mob, reasons, date = todayStr()) => ev(lid, "cullCheck", { mobId: mob?.id, date, counts: { reasons } });
export const tagLost = (lid, { tag, date = todayStr(), mobId, colour = "red" }) => ev(lid, "tagLost", { tag, mobId, date, colour });
export const tagFitted = (lid, e, newTag, date = todayStr()) => updateRecord(lid, "events", e, { fittedOn: date, newTag });

// ---- doses (one record per mob event: Research B batch layout)
export function dose(lid, v) {
  const rec = clean({
    kind: "use", date: v.date || todayStr(), mobId: v.mobId, mobName: v.mobName, reason: v.reason, productId: v.productId, productName: v.productName, batch: v.batch,
    wormerGroup: v.wormerGroup || undefined, wormerColour: v.wormerGroup ? WORMER_GROUPS[v.wormerGroup]?.colour : undefined,
    numberTreated: +v.numberTreated, avgWeight: v.avgWeight ? +v.avgWeight : undefined, heaviest: v.heaviest ? +v.heaviest : undefined,
    doseMethod: v.doseMethod, doseEach: v.doseEach, totalDose: v.totalDose, unit: v.unit || "ml", rateMl: v.rateMl, ratePerKg: v.ratePerKg, bands: v.bands,
    wdMeatDays: v.wdMeatDays === "" || v.wdMeatDays == null ? undefined : +v.wdMeatDays, withdrawalUntil: v.wdMeatDays > 0 ? addDays(v.date || todayStr(), +v.wdMeatDays) : undefined,
    givenBy: v.givenBy || me(), tags: v.tags, dipType: v.dipType, operatorCert: v.operatorCert, disposalMethod: v.disposalMethod, niea: v.niea, licenceNote: v.licenceNote, note: v.note,
  });
  const id = addRecord(lid, "medicines", rec);
  if (v.moveTo) moveField(lid, [v.mobId], v.moveTo, rec.date, v.moveFrom);
  return id;
}
// ---- lambing
export function lambing(lid, v) {
  const rec = clean({ eweId: v.eweId, eweTag: v.eweTag, mobId: v.mobId, mobName: v.mobName, raddle: v.raddle, datetime: v.datetime || new Date().toISOString(), lambs: v.lambs, help: v.help || "none", pen: v.pen, penIn: v.pen ? v.datetime || new Date().toISOString() : undefined, problems: v.problems?.length ? v.problems : undefined, aborted: v.aborted || undefined, fostered: v.fostered, voiceNoteId: v.voiceNoteId, by: me() });
  return addRecord(lid, "lambings", rec);
}
export const penOut = (lid, l, when = new Date().toISOString()) => updateRecord(lid, "lambings", l, { penOut: when }, { history: false });
export const clearWatch = (lid, l) => updateRecord(lid, "lambings", l, { watchCleared: todayStr() }, { history: false });
export const editLambing = (lid, l, ch) => updateRecord(lid, "lambings", l, clean(ch));
// ---- tagging (register birth lines are written when lambs are tagged)
export function tagLambs(lid, crop, doc, g) {
  const t = clean({ date: g.date, mobId: g.mobId, count: +g.count, tagFrom: g.tagFrom, tagTo: g.tagTo, tagType: g.tagType, tags: g.tags, enteredOn: todayStr(), by: me() });
  if (doc) return updateRecord(lid, "lambCrops", doc, { taggings: [...(doc.taggings || []), t], taggedCount: (doc.taggedCount || 0) + t.count });
  return addRecord(lid, "lambCrops", { year: crop, taggings: [t], taggedCount: t.count }, `crop-${crop}`);
}
// ---- deaths
export const death = (lid, v) => addRecord(lid, "deaths", clean({ date: v.date || todayStr(), mobId: v.mobId, mobName: v.mobName, number: +v.number || 1, tag: v.tag, sheepId: v.sheepId, cause: v.cause, foundAtInspection: v.found, ageBand: v.ageBand, over18m: !!v.over18m, lamb: !!v.lamb, tagged: !!v.tagged, disposal: v.disposal, docket: v.docket, photoId: v.photoId, by: me() }));
// ---- movements (and sales with a finance copy for the accountant, 01 §15.2)
export function movement(lid, v) {
  // No £ here: movements are readable by workers and vets. Prices live only in `finance` (01 §15).
  return addRecord(lid, "movements", clean({ kind: v.kind, date: v.date, mobId: v.mobId, mobName: v.mobName, count: +v.count, lambs: v.lambs || undefined, crop: v.crop, dest: v.dest, otherFlock: v.otherFlock, otherName: v.otherName, otherAddress: v.otherAddress, haulier: v.haulier, transporterNo: v.transporterNo, km: v.km ? +v.km : undefined, tags: v.tags?.length ? v.tags : undefined, tagFrom: v.tagFrom, tagTo: v.tagTo, cprList: v.cprList || undefined, docSerial: v.docSerial, standstillChecked: true, fromMarket: v.fromMarket || undefined, fromGB: v.fromGB || undefined, quarantine: v.quarantine, quarantineDays: v.quarantineDays, description: v.description, by: me() }));
}
const MONEY_KEYS = ["price", "pricePerKg", "total", "gross", "net", "cost", "amount", "deductions"];
/** Strip every £ field from a sale line (sales/movements are readable by workers and vets). */
export const noMoney = (o) => Object.fromEntries(Object.entries(o || {}).filter(([k]) => !MONEY_KEYS.includes(k)));
/**
 * A sale: movement off + `sales` record (weights, grade, outlet — no £) + a `finance` copy that
 * holds every price (lines, gross, deductions, net) for owner/manager/accountant (01 §15.2).
 * v.total or v.lines[].price give the gross; money=false (worker) writes no finance record.
 */
export function sale(lid, v, { money = false } = {}) {
  const mvId = movement(lid, { ...v, kind: "off" });
  const lines = v.lines || [];
  const gross = Math.round((lines.reduce((n, l) => n + (+l.price || 0), 0) || +v.total || 0) * 100) / 100;
  const ded = v.deductions || {}; const net = Math.round((gross - (+ded.levy || 0) - (+ded.haulage || 0) - (+ded.commission || 0)) * 100) / 100;
  const deadKg = Math.round(lines.reduce((n, l) => n + (+l.deadKg || 0), 0) * 10) / 10;
  const desc = `${v.count} ${v.lambs ? "lambs" : "sheep"}${deadKg ? ` · ${Math.round(deadKg)} kg dead` : ""}`;
  let financeId;
  if (money && gross > 0) financeId = addRecord(lid, "finance", clean({ kind: "revenue", category: "Livestock Sales", amount: net, gross, deductions: ded, date: v.date, note: `${v.lambs ? "" : "Cull ewes: "}${desc} · ${v.otherName || v.outlet || ""}`.replace(/ · $/, ""), source: "sheep-sale", lambs: !!v.lambs, count: +v.count, deadKg: deadKg || undefined, outlet: v.outlet || v.otherName, outletType: v.outletType, lines: lines.map((l) => clean({ deadKg: l.deadKg, liveKg: l.liveKg, grade: l.grade, price: l.price ?? (lines.length === 1 ? gross : undefined) })), movementId: mvId }));
  const saleId = addRecord(lid, "sales", clean({ date: v.date, outlet: v.outlet, outletType: v.outletType, count: +v.count, lambs: !!v.lambs, crop: v.crop, mobId: v.mobId, lines: lines.map((l) => clean(noMoney(l))), deadKg: deadKg || undefined, movementId: mvId, financeId, killSheetPhotoId: v.killSheetPhotoId, description: desc }));
  return { mvId, saleId, financeId };
}
export const purchaseFinance = (lid, { amount, date, note }) => addRecord(lid, "finance", { kind: "expense", category: "Animal Purchase", amount: Math.round(amount * 100) / 100, date, note, source: "sheep-buy" });
export const markMovement = (lid, m, ch) => updateRecord(lid, "movements", m, clean(ch), { history: false });
// ---- inventory, disease, rams, individuals, registers
export const saveInventory = (lid, year, existing, v) => (existing ? updateRecord(lid, "inventories", existing, clean(v)) : addRecord(lid, "inventories", clean({ year, ...v }), `inv-${year}`));
export const reportDisease = (lid, v) => addRecord(lid, "diseaseReports", clean({ disease: v.disease, date: v.date || todayStr(), reportedTo: "DAERA", ref: v.ref, note: v.note, by: me() }));
export const clearDisease = (lid, r, v) => updateRecord(lid, "diseaseReports", r, clean({ clearedOn: v.date || todayStr(), vetLetterDate: v.letterDate, letterPhotoId: v.photoId, letterPhotos: v.letterPhotos || undefined, vetName: v.vet }));
export const addSheep = (lid, v) => addRecord(lid, "sheep", clean({ tag: v.tag, eid: v.eid, species: v.species || "sheep", tagType: v.tagType, dateTagged: v.dateTagged, birthYear: v.birthYear, dob: v.dob, sex: v.sex, breed: v.breed, damTag: v.damTag, sireTag: v.sireTag, bornInFlock: v.bornInFlock, status: "on", mobId: v.mobId, class: v.class, ramLamb: v.ramLamb || undefined, cullFlags: [], replacementTags: [] }));
export const updateSheep = (lid, sh, ch) => updateRecord(lid, "sheep", sh, clean(ch));
export const flagCull = (lid, sh, reason) => updateRecord(lid, "sheep", sh, { cullFlags: [...(sh.cullFlags || []), { reason, date: todayStr(), by: me() }] });
export const ramMot = (lid, ram, m) => updateRecord(lid, "sheep", ram, { mot: [...(ram.mot || []), { ...m, date: m.date || todayStr(), by: me() }] });
export const vetOp = (lid, v) => addRecord(lid, "vetOps", clean({ date: v.date, mobId: v.mobId, mobName: v.mobName, operation: v.operation, method: v.method, number: +v.number, ageDays: v.ageDays, anaesthetic: v.anaesthetic, by: v.by || me() }));
export const feedRecord = (lid, v) => addRecord(lid, "feedRecords", clean({ date: v.date, feed: v.feed, supplier: v.supplier, batch: v.batch, tonnes: v.tonnes ? +v.tonnes : undefined, mobName: v.mobName }));
export const saveSettings = (lid, patch) => setMeta(lid, "settings", patch);
export const saveFqa = (lid, items) => setMeta(lid, "fqa", { items });

/** Tick a generated job: do its record action, or save a done task with the job's key. */
export function tickGenerated(lid, snap, t, done, by = {}) {
  const a = t.action || {}; const today = todayStr();
  if (a.type === "set") { const rec = snap.data[a.coll].find((r) => r.id === a.id); if (rec) return updateRecord(lid, a.coll, rec, { [a.field]: done ? today : null }, { history: false }); }
  if (a.type === "penOut") { const l = snap.data.lambings.find((r) => r.id === a.id); if (l) return updateRecord(lid, "lambings", l, { penOut: done ? new Date().toISOString() : null }, { history: false }); }
  if (a.type === "ramsOut" && done) ramsOut(lid, today);
  const existing = snap.data.tasks.find((x) => x.sourceRef === t.key);
  const stamp = done ? { done: true, doneAt: new Date(), doneBy: by.uid || null, doneByName: by.name || null } : { done: false, doneAt: null, doneBy: null, doneByName: null };
  if (existing) return updateRecord(lid, "tasks", existing, stamp, { history: false });
  return addRecord(lid, "tasks", { title: t.title, due: t.due, sourceRef: t.key, note: "", money: false, ...stamp });
}
