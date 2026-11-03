// One entry, one record (review B #3, A #5, drastic idea 1). An entry such as a dairy
// treatment writes several records (medicine, milk withhold, mastitis case, handover note) and
// may change others (a death takes the animal off the farm). They share an `actionId`
// (services/action-context.js); the changes to existing records are kept as `actionEffects`.
// Here: find everything that belongs with a record, and delete / bring back / edit it together.
// Records saved before actionId existed are matched by their links (medId, saleId, financeId…)
// and a few safe rules (same animal and date); anything else is only warned about.
import { store } from "../core/store.js";
import { auth } from "../core/auth.js";
import { canRead } from "../core/policy.js";
import { collectionsFor } from "../sectors/registry.js";
import { listRecords, updateRecord } from "./records.js";

const J = (v) => JSON.stringify(v === undefined ? null : v);
const path = (lid, coll, id) => `ledgers/${lid}/${coll}/${id}`;
const uid = () => auth.user?.uid || null;
const ms = (d) => { const x = d instanceof Date ? d : d?.toDate ? d.toDate() : d ? new Date(d) : null; return x && !isNaN(x) ? x.getTime() : 0; };

/** Every record of the ledger the person can read: { coll: records[] } (deleted ones included). */
export async function loadAll(ledger, colls = null) {
  const out = {};
  await Promise.all((colls || collectionsFor(ledger.type)).filter((c) => c !== "photos" && canRead(ledger.role, c)).map(async (c) => {
    try { out[c] = await listRecords(ledger.id, c, { includeDeleted: true }); } catch (e) { out[c] = []; }
  }));
  return out;
}

// Links written by the sectors before actionId (record key -> collections it points into).
const LINKS = { medId: ["medicines"], withholdId: ["milkWithhold"], saleId: ["sales"], financeId: ["finance"], moveId: ["movements", "moves"], feedDeliveryId: ["feedDeliveries"], checkId: ["roomChecks"], purchaseId: ["purchases"], thinId: ["thins"], fciId: ["fci"] };
const OFF_KEYS = ["offDate", "offTo", "offReason", "disposal", "status", "saleKind"];

function find(all, coll, id) { return (all[coll] || []).find((r) => r.id === id) || null; }
function* every(all) { for (const [coll, list] of Object.entries(all)) for (const rec of list) yield { coll, rec }; }

/** An "animal went off" change worked out for an old record (no actionEffects stored). */
function offEffect(a) {
  const set = {}, before = {}, unset = [];
  for (const k of OFF_KEYS) if (a[k] !== undefined && a[k] !== null && a[k] !== "") { set[k] = a[k]; if (k === "status") before.status = "onFarm"; else unset.push(k); }
  return { coll: "animals", id: a.id, set, before, unset, legacy: true };
}

/**
 * Records that belong with `rec` and the changes its entry made to other records.
 * -> { items: [{ coll, rec }], effects: [{ coll, id, set, before, unset }], legacy }
 * `deleted`: include records that are already deleted (false for delete, true for history views).
 */
export function linkedFor(all, coll, rec, { deleted = false } = {}) {
  const items = []; const seen = new Set([`${coll}/${rec.id}`]); const effects = [];
  const push = (c, r) => { if (!r || seen.has(`${c}/${r.id}`) || (!deleted && r.deleted)) return; seen.add(`${c}/${r.id}`); items.push({ coll: c, rec: r }); };
  const addEffects = (r) => { for (const e of r.actionEffects || []) if (!effects.some((x) => x.coll === e.coll && x.id === e.id)) effects.push(e); };
  // an animal is a thing, not an entry: deleting one never takes its calving, purchase or herd-mates with it
  if (["animals", "sows", "sheep"].includes(coll)) return { items, effects, legacy: !rec.actionId };
  addEffects(rec);
  if (rec.actionId) {
    for (const { coll: c, rec: r } of every(all)) if (r.actionId === rec.actionId) { push(c, r); addEffects(r); }
    return { items, effects, legacy: false };
  }
  // ---- older records: follow their links both ways (medicine <- withhold <- mastitis, sale <-> finance…)
  const queue = [{ coll, rec }];
  while (queue.length) {
    const cur = queue.shift(); const before = items.length;
    for (const [k, colls] of Object.entries(LINKS)) if (typeof cur.rec[k] === "string") for (const c of colls) push(c, find(all, c, cur.rec[k]));
    for (const { coll: c, rec: r } of every(all)) {
      if (c === "animals" || c === "sows" || c === "sheep") continue; // an animal is never a side effect of an old record
      if (Object.keys(LINKS).some((k) => r[k] === cur.rec.id && LINKS[k].includes(cur.coll))) push(c, r);
    }
    queue.push(...items.slice(before));
  }
  if (rec.courseId) for (const r of all[coll] || []) if (r.courseId === rec.courseId) push(coll, r);
  // calving -> its calves
  if (coll === "calvings") for (const k of rec.calves || []) { const a = find(all, "animals", k.animalId); if (a && (!a.dob || a.dob === rec.date)) push("animals", a); }
  // dairy: the auto handover line written with the treatment
  if (coll === "medicines" && all.handover) for (const h of all.handover) if (h.auto && h.createdBy === rec.createdBy && Math.abs(ms(h.createdAt) - ms(rec.createdAt)) < 15000) push("handover", h);
  // a death: the "off to Dead" movement, and the animal back on the farm
  if (coll === "deaths") {
    const aid = rec.animalId;
    if (aid) {
      for (const m of all.movements || []) if (m.death && m.date === rec.date && (m.animalIds || []).length === 1 && m.animalIds[0] === aid) push("movements", m);
      const a = find(all, "animals", aid); if (a && a.offTo === "Dead" && a.offDate === rec.date) effects.push(offEffect(a));
    }
    if (rec.sowId) { const s = find(all, "sows", rec.sowId); if (s && s.died === rec.date) effects.push({ coll: "sows", id: s.id, set: { died: s.died }, before: {}, unset: ["died"], legacy: true }); }
  }
  // a sale or a move off: the animals back on the farm
  const offIds = coll === "sales" ? (rec.lines || []).map((l) => l.animalId) : (coll === "movements" && (rec.kind === "off" || rec.direction === "off") && !rec.death) ? rec.animalIds || [] : [];
  for (const id of offIds) { const a = find(all, "animals", id); if (a && a.offDate === rec.date && (coll !== "sales" || a.offReason === "sold")) effects.push(offEffect(a)); }
  if (coll === "sales") for (const it of items) if (it.coll === "movements") for (const id of it.rec.animalIds || []) { const a = find(all, "animals", id); if (a && a.offDate === rec.date && !effects.some((e) => e.id === a.id)) effects.push(offEffect(a)); }
  return { items, effects, legacy: true };
}

/** Put the records an entry changed back as they were (only where nobody has changed them since). */
function undoEffects(lid, all, effects) {
  let n = 0;
  for (const e of effects) {
    const t = find(all, e.coll, e.id); if (!t || t.deleted) continue;
    const patch = {};
    for (const [k, v] of Object.entries(e.set || {})) {
      if (J(t[k]) !== J(v)) continue; // changed again since — leave it
      if (e.before && k in e.before) patch[k] = e.before[k]; else if ((e.unset || []).includes(k)) patch[k] = store.DELETE;
    }
    if (Object.keys(patch).length) { updateRecord(lid, e.coll, t, patch); n++; }
  }
  return n;
}
function redoEffects(lid, all, effects) {
  let n = 0;
  for (const e of effects) {
    const t = find(all, e.coll, e.id); if (!t || t.deleted) continue;
    const patch = {};
    for (const [k, v] of Object.entries(e.set || {})) {
      const was = e.before && k in e.before ? e.before[k] : undefined;
      if (t[k] === undefined || t[k] === null ? was === undefined || was === null : J(t[k]) === J(was)) patch[k] = v;
    }
    if (Object.keys(patch).length) { updateRecord(lid, e.coll, t, patch); n++; }
  }
  return n;
}

/**
 * Delete a record and everything that came with it (soft delete, kept in Recently deleted).
 * Returns { cascadeId, deleted: [{coll, rec}], undone }.
 */
export function deleteEntry(ledger, all, coll, rec) {
  const { items, effects, legacy } = linkedFor(all, coll, rec);
  const cascadeId = store.newId(); const now = new Date();
  const group = [{ coll, rec }, ...items];
  for (const { coll: c, rec: r } of group) {
    const patch = { deleted: true, deletedAt: now, deletedBy: uid(), updatedAt: now, updatedBy: uid(), cascadeId };
    if (r === rec && legacy && effects.length) patch.cascadeEffects = effects.map(({ coll: ec, id, set, before, unset }) => ({ coll: ec, id, set, before, unset }));
    store.bg(store.update(path(ledger.id, c, r.id), patch), `delete ${c}`);
  }
  const undone = undoEffects(ledger.id, all, effects);
  return { cascadeId, deleted: group, undone };
}

/** Bring back a deleted record and everything deleted with it, and redo its changes. */
export function restoreEntry(ledger, all, coll, rec) {
  const group = rec.cascadeId ? [...every(all)].filter((x) => x.rec.deleted && x.rec.cascadeId === rec.cascadeId) : [{ coll, rec }];
  if (!group.some((x) => x.rec.id === rec.id)) group.push({ coll, rec });
  const effects = [];
  for (const { coll: c, rec: r } of group) {
    store.bg(store.update(path(ledger.id, c, r.id), { deleted: false, deletedAt: store.DELETE, deletedBy: store.DELETE, cascadeId: store.DELETE, cascadeEffects: store.DELETE, updatedAt: new Date(), updatedBy: uid() }), `restore ${c}`);
    for (const e of [...(r.actionEffects || []), ...(r.cascadeEffects || [])]) if (!effects.some((x) => x.coll === e.coll && x.id === e.id)) effects.push(e);
  }
  // the records the effects touch are live (not in this group), so redo against them
  const redone = redoEffects(ledger.id, all, effects);
  return { restored: group, redone };
}

/**
 * An edit to one record carried to the records that came with it: any linked record holding
 * the same old value for a changed field gets the new value (date, product, batch, cow…), and
 * a changed date carries to what the entry changed (a death's date is the animal's off date).
 * Returns the number of other records changed.
 */
export function propagateEdit(ledger, all, coll, old, changes) {
  const { items, effects } = linkedFor(all, coll, old);
  const SKIP = new Set(["updatedAt", "updatedBy", "history", "createdAt", "createdBy", "actionId", "actionEffects", "id"]);
  const changed = Object.keys(changes).filter((k) => !SKIP.has(k) && J(old[k]) !== J(changes[k]) && old[k] !== undefined && old[k] !== null && old[k] !== "");
  if (!changed.length) return 0;
  let n = 0;
  for (const { coll: c, rec: r } of items) {
    const patch = {};
    for (const k of changed) if (k in r && J(r[k]) === J(old[k])) patch[k] = changes[k];
    // a cow / animal swapped on a one-animal entry
    if (changes.animalIds && Array.isArray(old.animalIds) && old.animalIds.length === 1 && r.animalId === old.animalIds[0] && J(changes.animalIds) !== J(old.animalIds) && changes.animalIds.length === 1) patch.animalId = changes.animalIds[0];
    if (Object.keys(patch).length) { updateRecord(ledger.id, c, r, patch); n++; }
  }
  let effectsChanged = false;
  for (const e of effects) {
    const t = find(all, e.coll, e.id); if (!t) continue;
    const patch = {};
    for (const k of changed) {
      const ov = old[k]; const isDayVal = typeof ov === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ov);
      for (const [k2, v2] of Object.entries(e.set || {})) {
        if (J(v2) !== J(ov) || !(k2 === k || isDayVal)) continue;
        if (J(t[k2]) === J(ov)) patch[k2] = changes[k];
        e.set[k2] = changes[k]; effectsChanged = true;
      }
    }
    if (Object.keys(patch).length) { updateRecord(ledger.id, e.coll, t, patch); n++; }
  }
  if (effectsChanged) {
    for (const holder of [{ coll, rec: old }, ...items]) if (holder.rec.actionEffects?.length) {
      const next = holder.rec.actionEffects.map((x) => effects.find((e) => e.coll === x.coll && e.id === x.id) || x).map(({ coll: ec, id, set, before, unset }) => ({ coll: ec, id, set, before, unset }));
      store.bg(store.update(path(ledger.id, holder.coll, holder.rec.id), { actionEffects: next }), `link ${holder.coll}`);
    }
  }
  return n;
}
