// One place that reads a Layers ledger: every collection, the meta docs (settings, lion) and the
// farm-space medicine store, as a snapshot the screens and the model share. Money (finance) is
// read only by roles that may see it; nothing else in this ledger carries a £ figure.
//   loadLayers(ledger) -> Promise<snap> ; liveSnap(ledger, paint) -> { first, stop }
// snap.c is the model's snapshot: { s, data, today, now, lid, doneKeys, region, ledger, money }.
import { listRecords, watchRecords, getMeta, watchMeta } from "../../services/records.js";
import { canRead } from "../../core/policy.js";
import { session } from "../../services/session.js";
import { todayStr } from "../../core/dates.js";
import { collectionsFor, metaFor } from "../registry.js";
import { layerSettings } from "./model/settings.js";

export const LAYER_COLLECTIONS = [...new Set([...collectionsFor("layers"), "tasks", "notes"])].filter((k) => !["photos", "documents", "events"].includes(k));
export const LAYER_META = metaFor("layers");
export const PRICE_PROFILE_ID = "layers-price-profile";
const pad = (n) => String(n).padStart(2, "0");
export function nowStr(d = new Date()) { return `${todayStr(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }
export function farmSpace(ledger) { return session.farms?.().find((f) => f.farmId === ledger.farmId)?.space || null; }

export function buildSnap(ledger, data, meta, extra = {}) {
  const now = extra.now || nowStr(); const today = now.slice(0, 10);
  for (const k of LAYER_COLLECTIONS) data[k] = (data[k] || []).filter((r) => !r.deleted);
  const s = layerSettings(ledger, meta.settings || {});
  s.keeperName = meta.keeper?.name || "";
  const doneKeys = new Set(data.tasks.filter((t) => t.sourceRef && t.done).map((t) => t.sourceRef));
  const money = canRead(ledger.role, "finance");
  // Price profile (grade prices, deductions, reference price, feed £/t): a finance doc, so only
  // money roles ever read it — never meta, which workers and vets can read (01-platform §15).
  const pp = money ? data.finance.find((r) => r.id === PRICE_PROFILE_ID) : null;
  s.prices = pp?.prices || {}; s.deductions = pp?.deductions ?? null; s.refPrice = pp?.refPrice ?? null; s.feedPerTonne = pp?.feedPerTonne ?? null;
  const c = { s, data, today, now, lid: ledger.id, doneKeys, region: ledger.region || "NI", ledger, money, meta };
  return { ledger, lid: ledger.id, role: ledger.role, today, now, data, meta, s, c, money, store: extra.farmStore || [], contacts: extra.contacts || [] };
}

export async function loadLayers(ledger, { now } = {}) {
  const data = {}; const meta = {};
  await Promise.all(LAYER_COLLECTIONS.map(async (k) => { data[k] = canRead(ledger.role, k) ? await listRecords(ledger.id, k).catch(() => []) : []; }));
  if (canRead(ledger.role, "meta")) await Promise.all(LAYER_META.map(async (k) => { meta[k] = await getMeta(ledger.id, k).catch(() => null); }));
  const space = farmSpace(ledger); let farmStore = [], contacts = [];
  if (space && canRead(space.role, "medProducts")) { farmStore = await listRecords(space.id, "medProducts").catch(() => []); contacts = await listRecords(space.id, "contacts").catch(() => []); }
  return buildSnap(ledger, data, meta, { farmStore, contacts, now });
}

export function watchLayers(ledger, cb) {
  const data = {}; const meta = {}; let farmStore = [], contacts = [];
  const subs = []; let timer = null; let ready = false; const pending = new Set();
  const fire = () => { clearTimeout(timer); timer = setTimeout(() => { if (ready) cb(buildSnap(ledger, { ...data }, { ...meta }, { farmStore, contacts })); }, 30); };
  const want = LAYER_COLLECTIONS.filter((k) => canRead(ledger.role, k));
  for (const k of LAYER_COLLECTIONS) data[k] = [];
  for (const k of want) { pending.add(k); subs.push(watchRecords(ledger.id, k, {}, (list) => { data[k] = list; pending.delete(k); if (!pending.size) ready = true; fire(); }, () => { pending.delete(k); if (!pending.size) ready = true; fire(); })); }
  if (canRead(ledger.role, "meta")) for (const k of LAYER_META) subs.push(watchMeta(ledger.id, k, (d) => { meta[k] = d; fire(); }, () => {}));
  const space = farmSpace(ledger);
  if (space && canRead(space.role, "medProducts")) {
    subs.push(watchRecords(space.id, "medProducts", {}, (l) => { farmStore = l; fire(); }, () => {}));
    subs.push(watchRecords(space.id, "contacts", {}, (l) => { contacts = l; fire(); }, () => {}));
  }
  if (!want.length) { ready = true; fire(); }
  const tick = setInterval(fire, 60000); // "sheet not done by 11:00" and pop-hole jobs move on with the clock
  return () => { clearTimeout(timer); clearInterval(tick); subs.forEach((u) => u && u()); };
}

/** Live screen helper: paint(snap, n) on every change; `first` resolves after the first paint. */
export function liveSnap(ledger, paint) {
  let resolve; const first = new Promise((r) => (resolve = r)); let n = 0; let busy = Promise.resolve();
  const stop = watchLayers(ledger, (snap) => { busy = busy.then(async () => { try { await paint(snap, n++); } catch (e) { console.error("layers paint", e); } resolve(snap); }); });
  return { first, stop };
}
