// Generic per-ledger records: one document per record at ledgers/{lid}/{coll}/{id}.
// Every write is stamped (createdAt/By, updatedAt/By). Edits keep the earlier version in
// `history` (last 10, as v9's editStamp did) so an inspector can see what changed.
// "Delete" for most people is a soft delete (deleted: true) so compliance history survives;
// owners/managers can hard-delete. Writes do not wait for the server (offline-first): they
// return at once and any failure is announced on the bus as "store:error".
import { store } from "../core/store.js";
import { auth } from "../core/auth.js";

const HISTORY_MAX = 10;
const cpath = (lid, coll) => `ledgers/${lid}/${coll}`;
const uid = () => auth.user.uid;
const STAMP_KEYS = ["id", "history", "createdAt", "createdBy", "updatedAt", "updatedBy"];

/** Add a record. Returns its id immediately; the save carries on in the background. */
export function addRecord(lid, coll, data, id) {
  const now = new Date();
  const rec = { ...data, createdAt: now, createdBy: uid(), updatedAt: now, updatedBy: uid() };
  delete rec.id;
  id = id || store.newId();
  store.bg(store.set(`${cpath(lid, coll)}/${id}`, rec), `add ${coll}`);
  return id;
}

/** Edit a record. `old` is the record as currently shown (needed for history). */
export function updateRecord(lid, coll, old, changes, { history = true } = {}) {
  const patch = { ...changes, updatedAt: new Date(), updatedBy: uid() };
  for (const k of ["id", "createdAt", "createdBy", "history"]) delete patch[k];
  if (history) {
    const before = {}; for (const [k, v] of Object.entries(old)) if (!STAMP_KEYS.includes(k)) before[k] = v;
    patch.history = [...(old.history || []), { at: new Date().toISOString(), by: old.updatedBy || null, before }].slice(-HISTORY_MAX);
  }
  return store.bg(store.update(`${cpath(lid, coll)}/${old.id}`, patch), `update ${coll}`);
}

export const softDelete = (lid, coll, id) =>
  store.bg(store.update(`${cpath(lid, coll)}/${id}`, { deleted: true, deletedAt: new Date(), deletedBy: uid(), updatedAt: new Date(), updatedBy: uid() }), `delete ${coll}`);
export const restore = (lid, coll, id) =>
  store.bg(store.update(`${cpath(lid, coll)}/${id}`, { deleted: false, deletedAt: store.DELETE, deletedBy: store.DELETE, updatedAt: new Date(), updatedBy: uid() }), `restore ${coll}`);
export const hardDelete = (lid, coll, id) => {
  // the record's photos go with it (owner / manager only reach here; best effort, offline-safe)
  if (coll !== "photos") import("./photos.js").then((m) => m.deletePhotosOf(lid, "manager", { coll, id })).catch(() => {});
  return store.bg(store.remove(`${cpath(lid, coll)}/${id}`), `remove ${coll}`);
};

export const getRecord = (lid, coll, id) => store.get(`${cpath(lid, coll)}/${id}`);
export async function listRecords(lid, coll, opts = {}) {
  const all = await store.query(cpath(lid, coll), opts);
  return opts.includeDeleted ? all : all.filter((r) => !r.deleted);
}
/** Live list. cb(records, meta). Deleted records hidden unless opts.includeDeleted. */
export function watchRecords(lid, coll, opts, cb, onErr) {
  return store.watchQuery(cpath(lid, coll), opts || {}, (list, meta) => cb(opts?.includeDeleted ? list : list.filter((r) => !r.deleted), meta), onErr);
}

// Single settings documents (keeper details, checklist ticks, silage pit…): ledgers/{lid}/meta/{name}
export const getMeta = (lid, name) => store.get(`ledgers/${lid}/meta/${name}`);
export const watchMeta = (lid, name, cb, onErr) => store.watchDoc(`ledgers/${lid}/meta/${name}`, cb, onErr);
export const setMeta = (lid, name, data) =>
  store.bg(store.set(`ledgers/${lid}/meta/${name}`, { ...data, updatedAt: new Date(), updatedBy: uid() }, { merge: true }), `save ${name}`);
