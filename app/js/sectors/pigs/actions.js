// Every Pigs write goes through here (screens never call records.js directly for pig data), so
// the linked records a farrowing, weaning, load or kill sheet creates stay consistent.
// Money rule (01-platform §15): £ values live ONLY in `finance` (owner, manager, accountant);
// feed deliveries, kill sheets and moves carry counts, weights and grades plus the finance id.
import { addRecord, updateRecord, softDelete, setMeta } from "../../services/records.js";
import { auth } from "../../core/auth.js";
import { addDays, daysBetween, todayStr } from "./model/dates.js";
import { canWrite } from "../../core/policy.js";
import { cycleOf, sowLabel } from "./model/sows.js";
import { weekIndex } from "./model/weeks.js";
import { batchName } from "./model/batches.js";
import { aliveNow } from "./model/litters.js";
import { WASH } from "./model/rooms.js";
import { killSheetNote } from "./model/money.js";

export const me = () => auth.user?.displayName || auth.user?.email || "";
const clean = (o) => { const r = {}; for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== "") r[k] = v; return r; };
const num = (v) => (v === "" || v == null || Number.isNaN(+v) ? undefined : +v);

// ---- breeding herd ----
export function saveSow(snap, v, old = null) {
  const data = clean({ sowNo: String(v.sowNo || "").trim(), name: v.name, tag: v.tag, type: v.type || "sow", breed: v.breed, dob: v.dob, source: v.source, entered: v.entered || (old ? undefined : snap.today), parityAtEntry: num(v.parityAtEntry) });
  if (old) { updateRecord(snap.lid, "sows", old, data); return old.id; }
  return addRecord(snap.lid, "sows", data);
}
export const markInHeat = (snap, sow) => updateRecord(snap.lid, "sows", sow, { inHeat: snap.today }, { history: false });
export const planCull = (snap, sow, reason) => updateRecord(snap.lid, "sows", sow, { cull: { planned: true, reason, on: snap.today } });
export const lostTag = (snap, sow, replaced = false) => updateRecord(snap.lid, "sows", sow, { lostTag: replaced ? { ...(sow.lostTag || {}), replaced: snap.today } : { date: snap.today } });

/** The breeding batch for a service on `date`: the batch already served in that week, or a new one. */
export function batchForService(snap, date) {
  const wi = weekIndex(date);
  const b = snap.data.batches.find((x) => x.serveDate && weekIndex(x.serveDate) === wi);
  if (b) return b.id;
  const no = Math.max(snap.c.nextNo, ...snap.data.batches.map((x) => +x.no + 1 || 0));
  return addRecord(snap.lid, "batches", { no, serveDate: date, stage: "service", source: "born on farm" });
}
/**
 * Served (design/13 §7.2). v: { sowId, date, time, inseminations:[{ time, boar, semenId, semenBatch, kind }] }.
 * A sow re-served after a return closes her earlier services (marked returned).
 */
export function recordService(snap, v) {
  const sow = snap.ix.byId.get(v.sowId); const cy = cycleOf(snap.s, snap.ix, sow, v.date);
  if (cy.first && daysBetween(cy.first.date, v.date) > 10) for (const sv of cy.services) updateRecord(snap.lid, "services", sv, { returned: true, returnedOn: v.date }, { history: false });
  const fresh = !cy.first || daysBetween(cy.first.date, v.date) > 10;
  const batchId = fresh ? batchForService(snap, v.date) : cy.first.batchId;
  let n = fresh ? 0 : cy.services.length;
  const ids = [];
  for (const ins of v.inseminations) {
    n++;
    ids.push(addRecord(snap.lid, "services", clean({ sowId: v.sowId, date: v.date, time: ins.time || v.time, boar: ins.boar, semenId: ins.semenId, semenBatch: ins.semenBatch, kind: ins.kind || "AI", serviceNo: n, batchId, byName: me() })));
    const st = ins.semenId && snap.data.semen.find((x) => x.id === ins.semenId);
    if (st) updateRecord(snap.lid, "semen", st, { doses: Math.max(0, (+st.doses || 0) - 1) }, { history: false });
  }
  if (sow.inHeat) updateRecord(snap.lid, "sows", sow, { inHeat: null }, { history: false });
  return { ids, batchId };
}
export const returnToHeat = (snap, sow) => { const cy = cycleOf(snap.s, snap.ix, sow, snap.today); for (const sv of cy.services) updateRecord(snap.lid, "services", sv, { returned: true, returnedOn: snap.today }, { history: false }); };
export const recordScan = (snap, { sowId, date, result }) => addRecord(snap.lid, "scans", { sowId, date, result, byName: me() });
export const addSemen = (snap, v) => addRecord(snap.lid, "semen", clean({ boar: v.boar, batch: v.batch, doses: num(v.doses) || 0, expiry: v.expiry, supplier: v.supplier, received: snap.today }));

/** Move sows into farrowing crates. moves: [{ sowId, roomId, crate }]. */
export function moveToFarrowing(snap, moves, date) {
  for (const m of moves) { const sow = snap.ix.byId.get(m.sowId); updateRecord(snap.lid, "sows", sow, { location: { roomId: m.roomId, crate: m.crate ? +m.crate : null, since: date } }); }
  const room = snap.ix.rooms.get(moves[0]?.roomId);
  if (room && room.wash && room.wash.stage !== "ready" && room.wash.at?.emptied) updateRecord(snap.lid, "rooms", room, { wash: { ...room.wash, exception: { date, by: me() } } });
}
export const nestingDone = (snap, litter) => updateRecord(snap.lid, "litters", litter, { nesting: true }, { history: false });

/**
 * Crate card save (design/13 §5.4). v: { sowId, roomId, crate, farrowedAt, bornAlive, stillborn, mummified,
 * fosterOn:[{n, fromLitterId?}], fosterOff:[{n, toLitterId?}], deaths:[{date,n,cause}], tasks{}, nesting }.
 * Fostering writes the matching entry on the other crate's litter.
 */
export function saveLitter(snap, v, old = null) {
  const sow = snap.ix.byId.get(v.sowId); const cy = sow ? cycleOf(snap.s, snap.ix, sow, snap.today) : null;
  const batchId = old?.batchId || cy?.first?.batchId || v.batchId || null;
  const data = clean({ sowId: v.sowId, roomId: v.roomId, crate: num(v.crate), farrowedAt: v.farrowedAt, bornAlive: +v.bornAlive || 0, stillborn: +v.stillborn || 0, mummified: +v.mummified || 0,
    fosterOn: v.fosterOn || [], fosterOff: v.fosterOff || [], deaths: v.deaths || [], tasks: v.tasks || {}, nesting: !!v.nesting, batchId, crateEntry: old?.crateEntry || sow?.location?.since || undefined, gestation: cy?.first ? daysBetween(cy.first.date, v.farrowedAt.slice(0, 10)) : undefined, byName: me() });
  let id = old?.id;
  if (old) updateRecord(snap.lid, "litters", old, data); else id = addRecord(snap.lid, "litters", data);
  // mirror new foster-offs onto the receiving litter
  (v.fosterOff || []).filter((f) => f.toLitterId && !f.linked).forEach((f) => {
    const other = snap.data.litters.find((l) => l.id === f.toLitterId); if (!other) return;
    updateRecord(snap.lid, "litters", other, { fosterOn: [...(other.fosterOn || []), { n: f.n, fromLitterId: id, linked: true, date: f.date || snap.today }] }, { history: false });
    f.linked = true;
  });
  // and new foster-ons onto the litter they came from
  (v.fosterOn || []).filter((f) => f.fromLitterId && !f.linked).forEach((f) => {
    const other = snap.data.litters.find((l) => l.id === f.fromLitterId); if (!other) return;
    updateRecord(snap.lid, "litters", other, { fosterOff: [...(other.fosterOff || []), { n: f.n, toLitterId: id, linked: true, date: f.date || snap.today }] }, { history: false });
    f.linked = true;
  });
  const linked = {};
  if ((v.fosterOff || []).some((f) => f.linked)) linked.fosterOff = v.fosterOff;
  if ((v.fosterOn || []).some((f) => f.linked)) linked.fosterOn = v.fosterOn;
  if (Object.keys(linked).length) updateRecord(snap.lid, "litters", { ...data, id }, linked, { history: false });
  return id;
}
export const addPigletDeath = (snap, litter, d) => updateRecord(snap.lid, "litters", litter, { deaths: [...(litter.deaths || []), { date: d.date || snap.today, n: +d.n || 1, cause: d.cause }] });

/**
 * Weaning (design/13 §7.3). v: { litters:[{ id, n, kg }], toRoomId, date, reason?, cleanedHousing? }.
 * Litters close, sows leave the crate, the farrowing batch becomes the growing batch in the weaner room.
 */
export function weanLitters(snap, v) {
  const ls = v.litters.map((x) => ({ ...x, l: snap.data.litters.find((l) => l.id === x.id) })).filter((x) => x.l);
  for (const x of ls) {
    updateRecord(snap.lid, "litters", x.l, { weaned: clean({ date: v.date, n: +x.n, kg: num(x.kg), ageDays: daysBetween(x.l.farrowedAt.slice(0, 10), v.date), reason: v.reason, cleanedHousing: v.cleanedHousing || undefined }) });
    const sow = snap.ix.byId.get(x.l.sowId); if (sow) updateRecord(snap.lid, "sows", sow, { location: null });
  }
  const n = ls.reduce((t, x) => t + (+x.n || 0), 0); const kg = ls.reduce((t, x) => t + (+x.kg || 0), 0);
  const bid = ls[0]?.l.batchId; let batch = bid && snap.ix.batches.get(bid);
  let batchId = batch?.id;
  if (batch && (batch.numberIn != null || batch.inDate)) {
    const nIn = (+batch.numberIn || 0) + n; const avg = kg && batch.avgKgIn ? (batch.avgKgIn * batch.numberIn + kg) / nIn : batch.avgKgIn || (n ? kg / n : 0);
    updateRecord(snap.lid, "batches", batch, { numberIn: nIn, avgKgIn: +avg.toFixed(2) });
  } else {
    const data = { numberIn: n, avgKgIn: n && kg ? +(kg / n).toFixed(2) : null, inDate: v.date, roomId: v.toRoomId, stage: "weaner", source: "born on farm" };
    if (batch) updateRecord(snap.lid, "batches", batch, data); else batchId = addRecord(snap.lid, "batches", { no: snap.c.nextNo, ...data });
  }
  const to = snap.ix.rooms.get(v.toRoomId);
  if (to && to.batchId !== batchId) updateRecord(snap.lid, "rooms", to, { batchId, wash: { stage: "ready", at: {} }, ...(to.wash?.stage && to.wash.stage !== "ready" ? { washException: { date: v.date, by: me() } } : {}) });
  // farrowing room empties when its last litter is weaned
  const fr = ls[0] && snap.ix.rooms.get(ls[0].l.roomId);
  if (fr && !snap.data.litters.some((l) => l.roomId === fr.id && !l.weaned && !ls.some((x) => x.id === l.id))) updateRecord(snap.lid, "rooms", fr, { wash: { stage: "emptied", at: { emptied: `${v.date}T${new Date().toTimeString().slice(0, 5)}` }, by: { emptied: me() } } });
  return { batchId, n };
}

// ---- growing pigs ----
/**
 * Pigs in (design/13 §7.5). v: { date, n, category, fromCode, fromName, fromMarket, avgKg, mark, haulier, batchId?, contractRef, roomId, fillAnyway }
 * Writes the "on" movement and opens (or tops up) the batch.
 */
export function pigsIn(snap, v) {
  let batchId = v.batchId;
  if (!batchId) batchId = addRecord(snap.lid, "batches", clean({ no: snap.c.nextNo, numberIn: +v.n, avgKgIn: num(v.avgKg), inDate: v.date, roomId: v.roomId, stage: v.category === "weaners" ? "weaner" : v.category === "growers" ? "grower" : "finisher", source: "bought in", contractRef: v.contractRef, contract: snap.s.contract.on ? { integrator: snap.s.contract.integrator, basis: snap.s.contract.basis } : undefined }));
  else { const b = snap.ix.batches.get(batchId); const nIn = (+b.numberIn || 0) + +v.n; updateRecord(snap.lid, "batches", b, { numberIn: nIn, avgKgIn: v.avgKg && b.avgKgIn ? +(((b.avgKgIn * b.numberIn) + v.avgKg * v.n) / nIn).toFixed(2) : b.avgKgIn || num(v.avgKg) }); }
  const room = snap.ix.rooms.get(v.roomId);
  if (room) updateRecord(snap.lid, "rooms", room, clean({ batchId, wash: { stage: "ready", at: {} }, washException: v.fillAnyway ? { date: v.date, by: me(), stage: room.wash?.stage } : undefined }));
  const moveId = addRecord(snap.lid, "moves", clean({ direction: "on", date: v.date, n: +v.n, category: v.category, fromCode: v.fromCode, fromName: v.fromName, fromMarket: v.fromMarket || undefined, avgKg: num(v.avgKg), markType: v.markType, mark: v.mark, haulier: v.haulier, haulierAuth: v.haulierAuth, vehicle: v.vehicle, batchId, roomId: v.roomId, byName: me() }));
  return { batchId, moveId };
}
/**
 * Pigs out / ship (design/13 §7.6). v: { batchId, roomId, n, category, date, time, toSlaughter, toCode, toName,
 * markType, mark, haulier, haulierAuth, vehicle, fci{withdrawals, disease}, feedWithdrawnAt, liveKg?, pens[] }.
 */
export function pigsOut(snap, v) {
  const moveId = addRecord(snap.lid, "moves", clean({ direction: "off", date: v.date, time: v.time, n: +v.n, category: v.category, toSlaughter: !!v.toSlaughter, toCode: v.toCode, toName: v.toName, markType: v.markType, mark: v.mark, haulier: v.haulier, haulierAuth: v.haulierAuth, vehicle: v.vehicle, fci: v.toSlaughter ? v.fci : undefined, feedWithdrawnAt: v.feedWithdrawnAt, liveKg: num(v.liveKg), pens: v.pens, batchId: v.batchId, roomId: v.roomId, byName: me() }));
  if (v.toSlaughter) addRecord(snap.lid, "tasks", { title: `Add the kill sheet for ${batchName(snap.ix.batches.get(v.batchId))} (${v.n} pigs, ${v.date})`, due: addDays(v.date, 3), note: "", money: false, done: false, pig: { kind: "killsheet", batchId: v.batchId, moveId } });
  const t = snap.data.tasks.find((x) => x.pig?.kind === "ship" && !x.done && x.pig.batchId === v.batchId && x.due <= addDays(v.date, 1));
  if (t) updateRecord(snap.lid, "tasks", t, { done: true, doneAt: new Date(), doneBy: auth.user?.uid || null, doneByName: me() }, { history: false });
  return moveId;
}
export const notifyMove = (snap, m, date = todayStr()) => updateRecord(snap.lid, "moves", m, { notified: date, notifiedBy: me() }, { history: false });
/** Plan a load (design/13 §6.3): ship task + the feed withdrawal time in its title. */
export function planLoad(snap, v) {
  const room = snap.ix.rooms.get(v.roomId); const b = snap.ix.batches.get(v.batchId);
  const loadAt = `${v.date}T${v.time || "06:00"}`; const w = new Date(new Date(loadAt) - (snap.s.feedWithdrawH || 8) * 3600000);
  const withdrawAt = `${todayStr(w)}T${String(w.getHours()).padStart(2, "0")}:${String(w.getMinutes()).padStart(2, "0")}`;
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const title = `Ship ${v.n} from ${room?.name || batchName(b)} ${DOW[new Date(v.date + "T12:00").getDay()]} ${v.time || ""} — withdraw feed from ${withdrawAt.slice(11, 16)} ${DOW[w.getDay()]}`.replace(/\s+/g, " ");
  return addRecord(snap.lid, "tasks", { title, due: v.date, note: v.pens?.length ? `Pens ${v.pens.join(", ")}` : "", money: false, done: false, pig: { kind: "ship", batchId: v.batchId, roomId: v.roomId, n: +v.n, loadAt, withdrawAt, pens: v.pens || [] } });
}
/**
 * Move a batch to another room (e.g. weaner → finisher). The finished phase is kept in `phases`
 * with its figures; the new phase starts with the pigs on farm at the weighed (or estimated) weight.
 */
export function moveBatch(snap, batch, v) {
  const f = snap.c.bf.get(batch.id); const from = snap.ix.rooms.get(batch.roomId); const to = snap.ix.rooms.get(v.toRoomId);
  const stage = to?.kind === "farrowing" || to?.kind === "service" || to?.kind === "dry" ? batch.stage : to?.kind || batch.stage;
  const phase = clean({ stage: batch.stage, roomId: batch.roomId, inDate: batch.inDate, numberIn: batch.numberIn, avgKgIn: batch.avgKgIn, outDate: v.date, numberOut: f?.onFarm, avgKgOut: num(v.avgKg) ?? (f ? +f.est.toFixed(1) : undefined), fcr: f?.fcr ? +f.fcr.toFixed(2) : undefined, dlwg: f ? Math.round(f.dlwg) : undefined, died: f?.died, sampleWeighs: batch.sampleWeighs });
  updateRecord(snap.lid, "batches", batch, { phases: [...(batch.phases || []), phase], stage, roomId: v.toRoomId, inDate: v.date, numberIn: f?.onFarm ?? batch.numberIn, avgKgIn: num(v.avgKg) ?? (f ? +f.est.toFixed(1) : batch.avgKgIn), sampleWeighs: num(v.avgKg) ? [{ date: v.date, n: +v.weighed || 0, avgKg: +v.avgKg, by: me() }] : [] });
  if (from && from.batchId === batch.id) updateRecord(snap.lid, "rooms", from, { batchId: null, wash: { stage: "emptied", at: { emptied: `${v.date}T${new Date().toTimeString().slice(0, 5)}` }, by: { emptied: me() } } });
  if (to) updateRecord(snap.lid, "rooms", to, clean({ batchId: batch.id, wash: { stage: "ready", at: {} }, washException: v.fillAnyway ? { date: v.date, by: me(), stage: to.wash?.stage } : undefined }));
}
export function weighSample(snap, batch, v) { return updateRecord(snap.lid, "batches", batch, { sampleWeighs: [...(batch.sampleWeighs || []), { date: v.date, n: +v.n, avgKg: +v.avgKg, pen: v.pen || null, by: me() }] }); }
export function closeBatch(snap, batch, summary) {
  updateRecord(snap.lid, "batches", batch, { closed: { date: snap.today, ...summary }, stage: "closed" });
  const room = snap.ix.rooms.get(batch.roomId);
  if (room && room.batchId === batch.id) updateRecord(snap.lid, "rooms", room, { batchId: null, wash: { stage: "emptied", at: { emptied: `${snap.today}T${new Date().toTimeString().slice(0, 5)}` }, by: { emptied: me() } } });
}
/** Kill sheet (design/13 §6.4): non-money facts in killSheets; £ in one finance record. */
export function saveKillSheet(snap, v, results) {
  const b = snap.ix.batches.get(v.batchId);
  const id = addRecord(snap.lid, "killSheets", clean({ date: v.date, abattoir: v.abattoir, batchId: v.batchId, pigs: (v.pigs || []).map((p) => clean({ slap: p.slap, dwKg: num(p.dwKg), p2: num(p.p2), lean: num(p.lean), grade: p.grade })), doa: +v.doa || 0, condemned: +v.condemned || 0, tailDamage: +v.tailDamage || 0, totals: { pigs: results.pigs, dwKg: +results.dwKg.toFixed(1), inSpec: results.inSpec, avgDw: results.avgDw }, moveId: v.moveId, byName: me() }));
  let financeId = null;
  if (results.pounds != null && canWrite(snap.role, "finance")) {
    financeId = addRecord(snap.lid, "finance", clean({ kind: "revenue", category: "Livestock Sales", amount: +results.pounds.toFixed(2), date: v.date, note: killSheetNote(batchName(b), results), source: "killSheet", killSheetId: id, batchId: v.batchId, pigs: results.pigs, dwKg: +results.dwKg.toFixed(1), ppk: results.ppk ? +results.ppk.toFixed(1) : undefined, lines: (v.pigs || []).filter((p) => p.ppk).map((p) => clean({ slap: p.slap, dwKg: num(p.dwKg), ppk: num(p.ppk), deductions: num(p.deductions) })) }));
    updateRecord(snap.lid, "killSheets", { id }, { financeId }, { history: false });
  }
  const t = snap.data.tasks.find((x) => x.pig?.kind === "killsheet" && !x.done && x.pig.batchId === v.batchId);
  if (t) updateRecord(snap.lid, "tasks", t, { done: true, doneAt: new Date(), doneBy: auth.user?.uid || null, doneByName: me() }, { history: false });
  return id;
}

// ---- deaths, checks, readings ----
/**
 * Death (design/13 §7.4). v: { roomId, pen, crate, litterId, sowId, n, stage, cause, estKg, euthanasia{method,checked}, collection, photo, date }.
 * Suckling deaths in a crate are kept on the litter (so pre-weaning mortality counts them once).
 */
export function recordDeath(snap, v) {
  if (v.stage === "Suckling" && v.litterId) { const l = snap.data.litters.find((x) => x.id === v.litterId); if (l) return addPigletDeath(snap, l, { date: v.date, n: v.n, cause: v.cause }); }
  const room = snap.ix.rooms.get(v.roomId);
  const id = addRecord(snap.lid, "deaths", clean({ date: v.date || snap.today, time: v.time, roomId: v.roomId, where: clean({ roomId: v.roomId, pen: num(v.pen), crate: num(v.crate) }), batchId: v.batchId || room?.batchId || undefined, sowId: v.sowId, n: +v.n || 1, stage: v.stage, cause: v.cause, estKg: num(v.estKg), euthanasia: v.cause === "Put down" ? v.euthanasia : undefined, collection: v.collection, photoNote: v.photo, byName: me() }));
  if (v.sowId && (v.stage === "Sow" || v.stage === "Boar")) { const s = snap.ix.byId.get(v.sowId); if (s) updateRecord(snap.lid, "sows", s, { died: v.date || snap.today, location: null }); }
  return id;
}
/** Room check (design/13 §5.3). Tail-bite pens also write the injurious behaviour record. */
export function saveRoomCheck(snap, roomId, v) {
  const room = snap.ix.rooms.get(roomId);
  const id = addRecord(snap.lid, "roomChecks", clean({ roomId, date: v.date || snap.today, time: v.time, by: me(), pens: v.pens, enrichmentOk: !!v.enrichmentOk, waterOk: !!v.waterOk, feedersOk: !!v.feedersOk, batchId: room?.batchId || undefined, note: v.note }));
  for (const p of v.pens.filter((x) => (x.status || []).includes("Tail bite"))) addRecord(snap.lid, "tailBites", clean({ roomId, pen: p.no, date: v.date || snap.today, pigs: +p.pigs || 1, severity: p.severity || "Ear/tail marks", actions: p.action || [], batchId: room?.batchId || undefined, checkId: id, byName: me() }));
  return id;
}
export const saveReadings = (snap, roomId, v) => addRecord(snap.lid, "readings", clean({ roomId, date: v.date || snap.today, waterM3: num(v.waterM3), tMin: num(v.tMin), tMax: num(v.tMax), binId: v.binId, binDipKg: num(v.binDipKg), byName: me() }));
export const saveAlarmTest = (snap, house, v) => addRecord(snap.lid, "alarmTests", clean({ house, date: v.date || snap.today, time: v.time, sounded: v.sounded, backupChecked: !!v.backupChecked, action: v.action, by: me() }));
export const addEnrichment = (snap, roomId, v) => addRecord(snap.lid, "enrichment", clean({ roomId, material: v.material, date: v.date || snap.today, byName: me() }));

// ---- medicines (shared store; pig fields: route, MFS number, pigs, batch) ----
export function saveTreatment(snap, v) {
  const b = snap.ix.batches.get(v.batchId);
  const wdEnd = +v.wdMeatDays ? addDays(v.date, Math.max(0, (+v.days || 1) - 1) + +v.wdMeatDays) : null;
  return addRecord(snap.lid, "medicines", clean({ kind: "use", date: v.date, batchId: v.batchId, batchName: batchName(b), roomId: v.roomId || b?.roomId, pens: v.pens, sowId: v.sowId, route: v.route, productId: v.product?.id, productName: v.product?.name || v.productName, activeIngredient: v.product?.active || v.activeIngredient, antibiotic: !!v.antibiotic, prophylaxis: v.prophylaxis || undefined, vet: v.vet, mfsNo: v.mfsNo, dose: v.dose, quantity: num(v.quantity), quantityUnit: v.quantityUnit, pigs: num(v.pigs), days: +v.days || 1, reason: v.reason, batch: v.medBatch, expiry: v.expiry, wdMeatDays: num(v.wdMeatDays), withdrawalEndDateMeat: wdEnd, givenBy: v.givenBy || me(), vaccine: v.reason === "BTV-3 vaccine" || undefined }));
}

// ---- feed ----
/** Feed delivery (design/13 §7.8): bin stock + batch feed; £ in one finance record. */
export function saveFeedDelivery(snap, v) {
  const kg = Math.round((+v.tonnes || 0) * 1000);
  const id = addRecord(snap.lid, "feedDeliveries", clean({ date: v.date, supplier: v.supplier, ration: v.ration, kg, binId: v.binId, batchIds: v.batchIds || [], docketNo: v.docketNo, sampleKept: !!v.sampleKept, sampleKeptUntil: v.sampleKept ? addDays(v.date, 183) : undefined, byName: me() }));
  if (+v.pricePerT && canWrite(snap.role, "finance")) {
    const financeId = addRecord(snap.lid, "finance", clean({ kind: "expense", category: "Feed", amount: +((+v.pricePerT) * (+v.tonnes)).toFixed(2), date: v.date, note: `${v.ration || "Feed"} ${(+v.tonnes).toFixed(1)} t · ${v.supplier || ""}`.trim(), feedDeliveryId: id, pricePerT: +v.pricePerT, tonnes: +v.tonnes, source: "feedDelivery" }));
    updateRecord(snap.lid, "feedDeliveries", { id }, { financeId }, { history: false });
  }
  if (!v.sampleKept) addRecord(snap.lid, "tasks", { title: `Keep a sample of the ${v.ration || "feed"} delivered ${v.date} for 6 months`, due: v.date, note: "Red Tractor FW.8", money: false, done: false, pig: { kind: "sample", deliveryId: id } });
  return id;
}
export const saveBin = (snap, v, old) => { const d = clean({ name: v.name, capacityT: num(v.capacityT), ration: v.ration, roomIds: v.roomIds || [], leadDays: num(v.leadDays) }); if (old) { updateRecord(snap.lid, "bins", old, d); return old.id; } return addRecord(snap.lid, "bins", d); };

// ---- rooms ----
export function saveRoom(snap, v, old) {
  const pens = Array.from({ length: +v.pens || 0 }, (_, i) => ({ no: i + 1, areaM2: num(v.penArea) ?? (old?.pens?.[i]?.areaM2 ?? null) }));
  const d = clean({ house: v.house, name: v.name, kind: v.kind, places: num(v.places), crates: v.kind === "farrowing" ? num(v.crates) : undefined, pens: v.kind === "farrowing" ? [] : pens, mechVent: v.mechVent !== false, binIds: v.binIds || old?.binIds || [] });
  if (old) { updateRecord(snap.lid, "rooms", old, d); return old.id; }
  return addRecord(snap.lid, "rooms", { ...d, wash: { stage: "ready", at: {} } });
}
/** Wash cycle stage tap (design/13 §5.5). extra: { product, dilution } for Disinfected. */
export function washStage(snap, room, stage, extra = {}) {
  const at = { ...(room.wash?.at || {}), [stage]: `${snap.today}T${new Date().toTimeString().slice(0, 5)}` };
  const by = { ...(room.wash?.by || {}), [stage]: me() };
  const i = WASH.indexOf(stage); for (const s of WASH.slice(i + 1)) { delete at[s]; delete by[s]; }
  return updateRecord(snap.lid, "rooms", room, { wash: clean({ ...(room.wash || {}), stage, at, by, product: extra.product ?? room.wash?.product, dilution: extra.dilution ?? room.wash?.dilution }) });
}

// ---- paperwork ----
export const addVisitor = (snap, v, source = "self") => addRecord(snap.lid, "visitors", clean({ date: v.date || snap.today, time: v.time, name: v.name, company: v.company, reason: v.reason, lastPigContact: v.lastPigContact, vehicle: v.vehicle, readRules: !!v.readRules, bootsChanged: !!v.bootsChanged, source, byName: source === "self" ? me() : undefined }));
export function saveVetVisit(snap, v) {
  return addRecord(snap.lid, "vetVisits", clean({ date: v.date, vet: v.vet, type: v.type || "QVR", reportNote: v.reportNote, actions: (v.actions || []).filter((a) => a.text).map((a) => clean({ text: a.text, due: a.due, done: a.done || null })), tailDockingApproved: !!v.tailDockingApproved, prophylaxisReviewed: !!v.prophylaxisReviewed, byName: me() }));
}
export const doneVetAction = (snap, visit, i, done) => updateRecord(snap.lid, "vetVisits", visit, { actions: visit.actions.map((a, j) => (j === i ? { ...a, done: done ? snap.today : null } : a)) });
export const saveSiteCheck = (snap, kind, v) => addRecord(snap.lid, "siteChecks", clean({ kind, date: v.date, result: v.result, by: v.by || me(), note: v.note }));
export const savePlan = (snap, kind, v) => addRecord(snap.lid, "plans", clean({ kind, signedOn: v.signedOn, by: v.by, note: v.note }));
export const markEmb = (snap, quarter) => addRecord(snap.lid, "embUploads", { quarter, date: snap.today, byName: me() });
export const saveInventory = (snap, v) => addRecord(snap.lid, "inventories", clean({ date: v.date, establishment: v.establishment, counts: v.counts, total: v.total, submittedOn: v.submittedOn, ref: v.ref, excludedContract: v.excludedContract || undefined, byName: me() }));
export const closePm2 = (snap, m, v) => addRecord(snap.lid, "pm2Months", clean({ month: m.month, opening: m.opening, born: m.born, on: m.on, off: m.off, died: m.died, closing: m.closing, counted: num(v.counted), note: v.note, byName: me() }), `pm2-${m.month}`);
export const saveSettings = (snap, patch) => setMeta(snap.lid, "settings", { ...(snap.meta.settings || {}), ...patch });
export const signChecklist = (snap, id, done, note = "") => setMeta(snap.lid, "rtChecklist", { ...(snap.meta.rtChecklist || {}), [id]: done ? { done: true, date: snap.today, by: me(), note } : null });

// ---- small herd + money ----
export function smallSale(snap, v) {
  const moveId = addRecord(snap.lid, "moves", clean({ direction: "off", date: v.date, n: +v.n, category: v.category || "finishers", toSlaughter: v.toSlaughter !== false, toName: v.toName, toCode: v.toCode, fci: v.toSlaughter !== false ? { withdrawals: true } : undefined, liveKg: num(v.liveKg), batchId: v.batchId, byName: me() }));
  if (+v.amount && canWrite(snap.role, "finance")) addRecord(snap.lid, "finance", clean({ kind: "revenue", category: "Livestock Sales", amount: +v.amount, date: v.date, note: `${v.n} pigs sold · ${v.toName || ""}`.trim(), source: v.category === "weaners" ? "weanerSale" : "pigSale", pigs: +v.n, weightBand: v.weightBand, moveId }));
  return moveId;
}
export function feedBought(snap, v) {
  const id = addRecord(snap.lid, "feedDeliveries", clean({ date: v.date, supplier: v.supplier, ration: v.ration, kg: Math.round((+v.bags || 0) * (+v.bagKg || 25)), bags: num(v.bags), byName: me() }));
  if (+v.amount && canWrite(snap.role, "finance")) addRecord(snap.lid, "finance", clean({ kind: "expense", category: "Feed", amount: +v.amount, date: v.date, note: `${v.bags} bags ${v.ration || "feed"}`, feedDeliveryId: id, source: "feedDelivery" }));
  return id;
}

/** Tick a generated job (To do today). */
export function tickGenerated(lid, snap, t, done) {
  const a = t.action || {};
  if (a.type === "notify") { const m = snap.data.moves.find((x) => x.id === a.id); if (m) return updateRecord(lid, "moves", m, { notified: done ? snap.today : null, notifiedBy: done ? me() : null }, { history: false }); }
  if (a.type === "emb" && done) return addRecord(lid, "embUploads", { quarter: a.quarter, date: snap.today, byName: me() });
  const existing = snap.data.tasks.find((x) => x.sourceRef === t.key);
  const u = auth.user; const stamp = done ? { done: true, doneAt: new Date(), doneBy: u?.uid || null, doneByName: me() } : { done: false, doneAt: null, doneBy: null, doneByName: null };
  if (existing) return updateRecord(lid, "tasks", existing, stamp, { history: false });
  return addRecord(lid, "tasks", { title: t.title, due: t.due, sourceRef: t.key, note: "", money: false, ...stamp });
}
export const undoAdd = (lid, coll, id) => softDelete(lid, coll, id);
export { sowLabel, aliveNow };
