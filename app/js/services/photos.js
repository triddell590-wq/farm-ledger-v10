// Photos on records (any ledger, any collection). Store side only — no DOM here, so node tests
// can use it; picking and shrinking pictures is in photo-image.js. See photo-codec.js for the
// storage layout and who may see what. Writes never wait for the signal: a photo saved with no
// signal shows at once (Firestore keeps it on the phone) with "Waiting to upload" until it syncs.
import { store } from "../core/store.js";
import { auth } from "../core/auth.js";
import { emit, on } from "../core/bus.js";
import { photoDoc, splitChunks, joinChunks, toDataUrl, moneyFilterFor, isMoneyColl, seesPhoto, MAX_CHUNKS } from "./photo-codec.js";

const coll = (lid) => `ledgers/${lid}/photos`;
const full = new Map(); // `${lid}/${id}` -> data URL (this session's cache of loaded images)
const local = new Set(); // ids written this session and not yet confirmed by the server

const byTime = (a, b) => String(a.takenAt || "").localeCompare(String(b.takenAt || "")) || String(a.id).localeCompare(String(b.id));

/**
 * Save one prepared photo ({ b64, w, h, bytes, thumb, takenAt, mime }) on a record.
 * parent: { coll, id, label }. Returns the photo id at once; the write carries on in the background.
 */
export function savePhoto(lid, parent, prepared, { caption = "" } = {}) {
  const u = auth.user; const id = store.newId(); const now = new Date();
  const parts = splitChunks(prepared.b64);
  if (parts.length > MAX_CHUNKS) throw new Error("Photo too big");
  const doc = {
    ...photoDoc({ parentColl: parent.coll, parentId: parent.id, parentLabel: parent.label, takenAt: prepared.takenAt, by: u.uid, byName: u.displayName || u.email || "",
      w: prepared.w, h: prepared.h, bytes: prepared.bytes, caption, chunkCount: parts.length, thumb: prepared.thumb || "", mime: prepared.mime || "image/jpeg" }),
    createdAt: now, createdBy: u.uid, updatedAt: now, updatedBy: u.uid,
  };
  const b = store.batch();
  b.set(`${coll(lid)}/${id}`, doc);
  parts.forEach((data, n) => b.set(`${coll(lid)}/${id}/chunks/${n}`, { n, data }));
  full.set(`${lid}/${id}`, toDataUrl(prepared.b64, doc.mime));
  local.add(id); emit("photos:pending", { lid, id, pending: true });
  store.bg(b.commit().then(() => { local.delete(id); emit("photos:pending", { lid, id, pending: false }); }), "save photo");
  return id;
}

/** Save several (a draft strip's photos once the record exists). Returns the ids. */
export function savePhotos(lid, parent, list) { return list.map((p) => savePhoto(lid, parent, p, { caption: p.caption || "" })); }

function queryOpts(role, where = []) {
  const m = moneyFilterFor(role);
  if (m === "none") return null;
  return { where: m === null ? where : [...where, ["money", "==", m]] };
}

/** Live photos of one record, oldest first. cb(list, pendingIds:Set). Returns unsubscribe. */
export function watchPhotos(lid, role, parent, cb, onErr = () => {}) {
  if (!seesPhoto(role, isMoneyColl(parent.coll))) { queueMicrotask(() => cb([], new Set())); return () => {}; }
  // money filter always set, so the rules can prove the query for every role
  const opts = { where: [["parentId", "==", String(parent.id)], ["money", "==", isMoneyColl(parent.coll)]] };
  return watchWithPending(lid, opts, (list) => list.filter((p) => p.parentColl === parent.coll).sort(byTime), cb, onErr);
}
/** Every photo this role may see in a ledger, newest first. */
export function watchAllPhotos(lid, role, cb, onErr = () => {}) {
  const o = queryOpts(role); if (!o) { queueMicrotask(() => cb([], new Set())); return () => {}; }
  return watchWithPending(lid, o, (list) => [...list].sort(byTime).reverse(), cb, onErr);
}
/** A live query that also re-reports when one of this session's saves reaches the server. */
function watchWithPending(lid, opts, shape, cb, onErr) {
  let last = null; let lastMeta = null;
  const report = () => { if (last) cb(last, pendingOf(last, lastMeta)); };
  const stopQ = store.watchQuery(coll(lid), opts, (list, meta) => { last = shape(list); lastMeta = meta; report(); }, onErr);
  const stopBus = on("photos:pending", (e) => { if (e.lid === lid && !e.pending && last && last.some((p) => p.id === e.id)) { if (lastMeta && lastMeta.pendingIds) lastMeta.pendingIds.delete(e.id); report(); } });
  return () => { stopQ(); stopBus(); };
}
export async function listPhotos(lid, role, parent = null) {
  if (parent) {
    if (!seesPhoto(role, isMoneyColl(parent.coll))) return [];
    return (await store.query(coll(lid), { where: [["parentId", "==", String(parent.id)], ["money", "==", isMoneyColl(parent.coll)]] })).filter((p) => p.parentColl === parent.coll).sort(byTime);
  }
  const o = queryOpts(role); if (!o) return [];
  return (await store.query(coll(lid), o)).sort(byTime);
}
function pendingOf(list, meta) {
  const s = new Set(meta && meta.pendingIds ? meta.pendingIds : []);
  for (const p of list) if (local.has(p.id)) s.add(p.id);
  return s;
}
export const isPending = (id) => local.has(id);

/** The full picture as a data: URL (reads the chunks; cached for this session). */
export async function loadImage(lid, photo) {
  const k = `${lid}/${photo.id}`;
  if (full.has(k)) return full.get(k);
  const n = photo.chunkCount || 1; const parts = [];
  for (let i = 0; i < n; i++) { const c = await store.get(`${coll(lid)}/${photo.id}/chunks/${i}`); if (c) parts.push(c); }
  const url = toDataUrl(joinChunks(parts, n), photo.mime || "image/jpeg");
  full.set(k, url);
  return url;
}
/** The picture's bytes (for the export zip and the share sheet). */
export async function imageBytes(lid, photo) {
  const url = await loadImage(lid, photo); const b64 = url.slice(url.indexOf(",") + 1);
  if (typeof atob === "function") { const s = atob(b64); const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; }
  return new Uint8Array(Buffer.from(b64, "base64"));
}

export function setCaption(lid, photo, caption) {
  return store.bg(store.update(`${coll(lid)}/${photo.id}`, { caption: String(caption || "").slice(0, 300), updatedAt: new Date(), updatedBy: auth.user.uid }), "photo caption");
}
/** Delete a photo and its image parts in one go. */
export function deletePhoto(lid, photo) {
  const b = store.batch();
  for (let i = 0; i < (photo.chunkCount || 1); i++) b.remove(`${coll(lid)}/${photo.id}/chunks/${i}`);
  b.remove(`${coll(lid)}/${photo.id}`);
  full.delete(`${lid}/${photo.id}`); local.delete(photo.id);
  return store.bg(b.commit(), "delete photo");
}
/** Delete every photo on a record (when the record itself is removed for good). */
export async function deletePhotosOf(lid, role, parent) {
  for (const p of await listPhotos(lid, role, parent)) await deletePhoto(lid, p);
}
