// Tom's v9 single document (farms/tomsfarm65748392 + its photos sub-collection) -> his v10
// farm space + Beef ledger, one document per record. DRY RUN ONLY until Tom says yes:
// planMigration() only builds the list of writes; nothing here runs on start-up.
//
//   const plan = planMigration(v9doc, photos, { ownerUid, ownerName, ownerEmail, farmName });
//   verifyRoundTrip(v9doc, photos, plan)   -> [] when nothing is lost (else a list of differences)
//   applyPlan(store, plan)                 -> writes it (to a memory store in tests; live only with Tom's yes)
//
// Lossless by design: every field of every v9 record is copied; v9 ids are kept (medicine
// records point at animals by tag, purchases/finance by id, feed groups by animal id); the few
// v9 keys that clash with v10 stamps (createdAt) are kept under `_v9`. toV9State() rebuilds the
// exact v9 shape from the records, which is how the round-trip check and board-feed work.
import { photoDoc, splitChunks, joinChunks, stripDataUrl, toDataUrl, b64Bytes } from "../services/photo-codec.js";

export const MIGRATION_VERSION = "v9.14->v10.0";
// Where each v9 array goes: [collection, ledger] — "beef" or "farm" (farm-wide space).
// Kept in one table so the Designer's farm-wide/per-ledger split can be applied in one place.
export const ROUTE = {
  herd: ["animals", "beef"],
  finance: ["finance", "beef"],
  fields: ["fields", "beef"],
  medicine: ["medicines", "beef"],
  purchases: ["purchases", "beef"],
  medProducts: ["medProducts", "beef"],
  "feed.groups": ["feedGroups", "beef"],
  "feed.adjust": ["feedAdjust", "beef"],
};
// Single objects -> meta docs on the Beef ledger.
export const META = { keeper: "keeper", fqa: "fqa", "feed.silage": "silage", places: "places" };
const KNOWN_TOP = new Set(["herd", "finance", "fields", "medicine", "purchases", "medProducts", "feed", "keeper", "fqa", "places", "boardFeedToken"]);

const validId = (id) => typeof id === "string" && id.length > 0 && id.length <= 1500 && !id.includes("/") && id !== "." && id !== ".." && !/^__.*__$/.test(id);
const isPlainObj = (v) => v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date);
const pick = (obj, dotted) => dotted.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);

// Firestore cannot hold arrays directly inside arrays (v9's in-memory polygons were [[lat,lng]]).
function fixNested(v, warn, where) {
  if (Array.isArray(v)) return v.map((x) => {
    if (Array.isArray(x) && x.length === 2 && x.every((n) => typeof n === "number")) { warn(`${where}: converted [lat,lng] pair to {lat,lng}`); return { lat: x[0], lng: x[1] }; }
    return fixNested(x, warn, where);
  });
  if (isPlainObj(v)) { const o = {}; for (const [k, x] of Object.entries(v)) if (x !== undefined) o[k] = fixNested(x, warn, where); return o; }
  return v;
}
function approxBytes(v) { try { return new TextEncoder().encode(JSON.stringify(v)).length; } catch (e) { return 0; } }

export function planMigration(v9, photos = {}, opts) {
  const { ownerUid, ownerName = "", ownerEmail = "", farmName = "My farm", region = "NI", now = new Date(), farmId = "farm-" + ownerUid.slice(0, 8), beefId = "beef-" + ownerUid.slice(0, 8) } = opts;
  const warnings = []; const warn = (w) => warnings.push(w);
  const counts = {}; const writes = [];
  const lid = { beef: beefId, farm: farmId };
  const member = { uid: ownerUid, role: "owner", addedAt: now, addedBy: ownerUid, displayName: ownerName, email: ownerEmail };

  const farm = { name: farmName, farmName, farmId, type: "farm", region, ownerUid, createdAt: now, updatedAt: now, settings: {}, migratedFrom: MIGRATION_VERSION };
  const beef = { name: "Beef", farmName, farmId, type: "beef", region, ownerUid, createdAt: now, updatedAt: now, settings: {}, migratedFrom: MIGRATION_VERSION };
  // First batch: the two ledgers and Tom's owner member docs (the rules need them together).
  const setup = [
    { path: `ledgers/${farmId}`, data: farm }, { path: `ledgers/${farmId}/members/${ownerUid}`, data: member },
    { path: `ledgers/${beefId}`, data: beef }, { path: `ledgers/${beefId}/members/${ownerUid}`, data: member },
  ];

  for (const k of Object.keys(v9 || {})) if (!KNOWN_TOP.has(k)) warn(`Unknown v9 field "${k}" copied to meta/v9extra`);

  for (const [src, [coll, where]] of Object.entries(ROUTE)) {
    const list = pick(v9, src);
    if (list == null) { counts[coll] = 0; continue; }
    if (!Array.isArray(list)) { warn(`${src} is not a list; skipped`); continue; }
    const seen = new Set();
    list.forEach((r, i) => {
      if (!isPlainObj(r)) { warn(`${src}[${i}] is not a record; skipped`); return; }
      let id = r.id;
      if (!validId(String(id || ""))) { id = `v9-${coll}-${i}`; warn(`${src}[${i}] had no usable id; given ${id}`); }
      id = String(id);
      if (seen.has(id)) { const nid = `${id}-dup${i}`; warn(`${src}: duplicate id ${id}; second copy saved as ${nid}`); id = nid; }
      seen.add(id);
      const data = fixNested({ ...r }, warn, `${src}[${i}]`);
      delete data.id;
      const _v9 = { index: i };
      if (!("id" in r)) _v9.noId = true;
      else if (String(r.id) !== id || typeof r.id !== "string") _v9.id = r.id === undefined ? null : r.id;
      if ("createdAt" in r) _v9.createdAt = r.createdAt;
      const created = typeof r.createdAt === "string" && !isNaN(Date.parse(r.createdAt)) ? new Date(r.createdAt) : typeof r.createdAt === "number" ? new Date(r.createdAt) : now;
      Object.assign(data, { createdAt: created, createdBy: ownerUid, updatedAt: now, updatedBy: ownerUid, migratedFrom: MIGRATION_VERSION, _v9 });
      if (approxBytes(data) > 900000) warn(`${coll}/${id} is close to Firestore's 1 MB limit`);
      writes.push({ path: `ledgers/${lid[where]}/${coll}/${id}`, data });
    });
    counts[coll] = list.length;
  }

  // £ values never stay in records a Worker or Vet can read (design/01 §15): v9 animal prices
  // and purchase costs move into one finance-only doc; toV9State() puts them back.
  const pricesDoc = extractPrices(writes, lid.beef, { createdAt: now, createdBy: ownerUid, updatedAt: now, updatedBy: ownerUid, migratedFrom: MIGRATION_VERSION });
  if (pricesDoc) { writes.push(pricesDoc); counts["finance/" + PRICES_ID] = 1; }

  for (const [src, name] of Object.entries(META)) {
    const v = pick(v9, src);
    if (v == null) continue;
    const data = Array.isArray(v) ? { list: fixNested(v, warn, src) } : fixNested({ ...v }, warn, src);
    writes.push({ path: `ledgers/${beefId}/meta/${name}`, data: { ...data, _v9src: src, _v9isList: Array.isArray(v), updatedAt: now, updatedBy: ownerUid } });
    counts["meta/" + name] = 1;
  }
  const extra = {}; for (const k of Object.keys(v9 || {})) if (!KNOWN_TOP.has(k)) extra[k] = v9[k];
  if (Object.keys(extra).length) writes.push({ path: `ledgers/${beefId}/meta/v9extra`, data: { ...fixNested(extra, warn, "extra"), updatedAt: now, updatedBy: ownerUid } });

  let nPhotos = 0;
  for (const [id, p] of Object.entries(photos || {})) {
    if (!validId(id)) { warn(`photo id ${id} not usable; skipped`); continue; }
    // v10 photo shape (services/photo-codec.js): metadata doc + base64 chunks. The v9 record that
    // pointed at it keeps its photoId, so the photo is filed under "v9photos/<id>".
    const mime = (/^data:([^;,]+)/.exec(p.dataUrl || "") || [])[1] || "image/jpeg";
    const parts = splitChunks(stripDataUrl(p.dataUrl || ""));
    if (parts.length > 8) { warn(`photo ${id} is too big to keep (over 8 parts); skipped`); continue; }
    const data = { ...photoDoc({ parentColl: "v9photos", parentId: id, parentLabel: "From Farm Ledger 9", takenAt: p.createdAt || now.toISOString(), chunkCount: parts.length, mime, w: null, h: null, bytes: b64Bytes(p.dataUrl || "") }),
      createdAt: p.createdAt ? new Date(p.createdAt) : now, createdBy: ownerUid, updatedAt: now, updatedBy: ownerUid, migratedFrom: MIGRATION_VERSION, v9CreatedAt: p.createdAt ?? null };
    writes.push({ path: `ledgers/${beefId}/photos/${id}`, data });
    parts.forEach((part, n) => writes.push({ path: `ledgers/${beefId}/photos/${id}/chunks/${n}`, data: { n, data: part } }));
    nPhotos++;
  }
  counts.photos = nPhotos;

  if (v9 && v9.boardFeedToken) writes.push({ path: `ledgers/${beefId}/private/boardFeed`, data: { token: v9.boardFeedToken, updatedAt: now } });
  else warn("No Morning Board token in the v9 document; a new one will be made on first save");

  return { version: MIGRATION_VERSION, farmId, beefId, setup, writes, counts, warnings, total: setup.length + writes.length };
}

// Money fields per collection: [field] on the record, or [list, field] on each item of a list.
export const MONEY_FIELDS = { animals: [["price"]], purchases: [["cost"], ["animals", "price"]] };
export const PRICES_ID = "v9-prices";
function extractPrices(writes, beefId, stamps) {
  const out = {}; let any = false;
  for (const w of writes) {
    const [, l, coll, id] = w.path.split("/"); const spec = MONEY_FIELDS[coll]; if (l !== beefId || !spec) continue;
    const keep = {};
    for (const [a, b] of spec) {
      if (!b) { if (a in w.data) { keep[a] = w.data[a] ?? null; delete w.data[a]; } continue; }
      const list = w.data[a]; if (!Array.isArray(list)) continue;
      const items = {}; list.forEach((x, i) => { if (isPlainObj(x) && b in x) { items[i] = x[b] ?? null; list[i] = { ...x }; delete list[i][b]; } });
      if (Object.keys(items).length) keep[`${a}[].${b}`] = items;
    }
    if (Object.keys(keep).length) { ((out[coll] = out[coll] || {})[id] = keep); any = true; }
  }
  if (!any) return null;
  return { path: `ledgers/${beefId}/finance/${PRICES_ID}`, data: { kind: "prices", source: "v9", note: "Prices from Farm Ledger v9 (kept here so only money roles can read them)", ...out, ...stamps } };
}
/** Put v9 prices back on the records (for the round trip and the Morning Board). */
export function restorePrices(recs) {
  const doc = (recs.finance || []).find((r) => r.id === PRICES_ID); if (!doc) return recs;
  const res = { ...recs, finance: recs.finance.filter((r) => r.id !== PRICES_ID) };
  for (const coll of Object.keys(MONEY_FIELDS)) {
    if (!doc[coll] || !res[coll]) continue;
    res[coll] = res[coll].map((r) => {
      const keep = doc[coll][r.id]; if (!keep) return r;
      const o = { ...r };
      for (const [k, v] of Object.entries(keep)) {
        if (!k.includes("[]")) { o[k] = v; continue; }
        const [a, b] = k.split("[]."); o[a] = (o[a] || []).map((x, i) => (String(i) in v ? { ...x, [b]: v[i] } : x));
      }
      return o;
    });
  }
  return res;
}

const strip = (r) => { const o = { ...r }; for (const k of ["createdAt", "createdBy", "updatedAt", "updatedBy", "migratedFrom", "_v9"]) delete o[k]; return o; };

/**
 * Rebuild a v9-shaped state from v10 records. recs = { animals:[...], finance, fields, medicines,
 * purchases, medProducts, feedGroups, feedAdjust } (records with .id), meta = { keeper, fqa, silage, places }.
 * Records added in v10 (no _v9.index) come after the migrated ones, newest last.
 */
export function toV9State(recs, meta = {}) {
  recs = restorePrices(recs);
  const out = {};
  const back = (list = []) => list.filter((r) => !r.deleted)
    .map((r, n) => ({ r, n }))
    .sort((a, b) => (a.r._v9?.index ?? 1e9 + a.n) - (b.r._v9?.index ?? 1e9 + b.n))
    .map(({ r }) => {
      const o = { ...strip(r), id: r._v9 && "id" in r._v9 ? r._v9.id : r.id };
      if (r._v9 && r._v9.noId) delete o.id;
      delete o.history;
      if (r.history !== undefined) o.history = r.history;
      if (r._v9 && "createdAt" in r._v9) o.createdAt = r._v9.createdAt;
      return o;
    });
  for (const [src, [coll]] of Object.entries(ROUTE)) {
    const list = back(recs[coll]);
    if (src.startsWith("feed.")) { out.feed = out.feed || {}; out.feed[src.slice(5)] = list; }
    else out[src] = list;
  }
  for (const [src, name] of Object.entries(META)) {
    const m = meta[name]; if (!m) continue;
    const { _v9src, _v9isList, updatedAt, updatedBy, id, ...rest } = m;
    const v = _v9isList ? rest.list : rest;
    if (src === "feed.silage") { out.feed = out.feed || {}; out.feed.silage = v; } else out[src] = v;
  }
  return out;
}

function deepDiff(a, b, path, out) {
  if (a instanceof Date) a = a.toISOString(); if (b instanceof Date) b = b.toISOString();
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) out.push(`${path}: length ${a.length} -> ${b.length}`);
    for (let i = 0; i < Math.min(a.length, b.length); i++) deepDiff(a[i], b[i], `${path}[${i}]`, out);
    return out;
  }
  if (isPlainObj(a) && isPlainObj(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (a[k] === undefined && b[k] === undefined) continue;
      if (!(k in b)) out.push(`${path}.${k}: missing after migration`);
      else if (!(k in a)) out.push(`${path}.${k}: added by migration`);
      else deepDiff(a[k], b[k], `${path}.${k}`, out);
    }
    return out;
  }
  if (a !== b) out.push(`${path}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
  return out;
}

/** Group a plan's writes back into records/meta for the Beef and farm ledgers. */
export function recordsFromWrites(plan) {
  const recs = {}; const meta = {}; const photos = {}; let token = null;
  for (const { path, data } of plan.writes) {
    const s = path.split("/"); // ledgers/{lid}/{coll}/{id}
    const coll = s[2]; const id = s[3];
    if (coll === "meta") meta[id] = { ...data, id };
    else if (coll === "photos" && s.length === 6) { const p = (photos[id] = photos[id] || {}); (p._parts = p._parts || []).push(data); }
    else if (coll === "photos") { const p = (photos[id] = photos[id] || {}); p._mime = data.mime; p._count = data.chunkCount; p.createdAt = data.v9CreatedAt; }
    else if (coll === "private") token = data.token;
    else (recs[coll] = recs[coll] || []).push({ ...data, id });
  }
  for (const p of Object.values(photos)) { p.dataUrl = toDataUrl(joinChunks(p._parts || [], p._count), p._mime); delete p._parts; delete p._mime; delete p._count; }
  return { recs, meta, photos, token };
}

/** [] if the migration loses nothing; otherwise human-readable differences. */
export function verifyRoundTrip(v9, photos, plan) {
  const { recs, meta, photos: ph, token } = recordsFromWrites(plan);
  const rebuilt = toV9State(recs, meta);
  const extra = meta.v9extra ? (({ updatedAt, updatedBy, id, ...r }) => r)(meta.v9extra) : {};
  Object.assign(rebuilt, extra);
  if (token) rebuilt.boardFeedToken = token;
  // Expected = input with polygons in object form (the only intended change).
  const expected = JSON.parse(JSON.stringify(v9 || {}));
  const diffs = deepDiff(expected, JSON.parse(JSON.stringify(rebuilt)), "v9", []);
  return diffs.concat(deepDiff(JSON.parse(JSON.stringify(photos || {})), JSON.parse(JSON.stringify(ph)), "photos", []));
}

/** Write a plan. Setup batch first (ledgers + owner member docs), then records in batches of 400. */
export async function applyPlan(store, plan, onProgress = () => {}) {
  const b0 = store.batch(); plan.setup.forEach((w) => b0.set(w.path, w.data)); await b0.commit();
  for (let i = 0; i < plan.writes.length; i += 400) {
    const b = store.batch(); plan.writes.slice(i, i + 400).forEach((w) => b.set(w.path, w.data));
    await b.commit(); onProgress(Math.min(i + 400, plan.writes.length), plan.writes.length);
  }
}
