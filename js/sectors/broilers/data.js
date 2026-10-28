// One place that reads a Broilers ledger: every collection, the meta docs and the farm-space
// medicine store, as a snapshot the screens and the model share. Money (finance) is read only by
// roles that may see it; nothing else in this ledger carries a £ figure (integrator owns chicks
// and feed, so feed deliveries carry tonnes and batch numbers only).
//   loadBroilers(ledger) -> Promise<snap> ; liveSnap(ledger, paint) -> { first, stop }
import { listRecords, watchRecords, getMeta, watchMeta } from "../../services/records.js";
import { canRead } from "../../core/policy.js";
import { session } from "../../services/session.js";
import { collectionsFor, metaFor } from "../registry.js";
import { broilerSettings } from "./model/settings.js";
import { indexBroilers } from "./model/crop.js";
import { useRegion } from "./model/content.js";
import { nowStr } from "./model/time.js";

export const BR_COLLECTIONS = [...new Set([...collectionsFor("broilers"), "tasks"])].filter((k) => !["photos", "documents", "notes", "events"].includes(k));
export const BR_META = metaFor("broilers");
export function farmSpace(ledger) { return session.farms?.().find((f) => f.farmId === ledger.farmId)?.space || null; }

export function buildSnap(ledger, data, meta, extra = {}) {
  const now = extra.now || nowStr(); const today = now.slice(0, 10);
  for (const k of BR_COLLECTIONS) data[k] = (data[k] || []).filter((r) => !r.deleted);
  useRegion(ledger.region || "NI");
  const s = broilerSettings(ledger, meta.settings || {});
  const ix = indexBroilers(data);
  const doneKeys = new Set(data.tasks.filter((t) => t.sourceRef && t.done).map((t) => t.sourceRef));
  const money = canRead(ledger.role, "finance");
  const c = { s, ix, data, today, now, lid: ledger.id, doneKeys, meta, money, finance: money ? data.finance : [] };
  return { ledger, lid: ledger.id, role: ledger.role, today, now, data, meta, s, ix, c, money, finance: c.finance, keeper: meta.keeper || {}, store: extra.farmStore || [], contacts: extra.contacts || [] };
}

export async function loadBroilers(ledger, { now } = {}) {
  const data = {}; const meta = {};
  await Promise.all(BR_COLLECTIONS.map(async (k) => { data[k] = canRead(ledger.role, k) ? await listRecords(ledger.id, k).catch(() => []) : []; }));
  if (canRead(ledger.role, "meta")) await Promise.all(BR_META.map(async (k) => { meta[k] = await getMeta(ledger.id, k).catch(() => null); }));
  const space = farmSpace(ledger); let farmStore = [], contacts = [];
  if (space && canRead(space.role, "medProducts")) { farmStore = await listRecords(space.id, "medProducts").catch(() => []); contacts = await listRecords(space.id, "contacts").catch(() => []); }
  return buildSnap(ledger, data, meta, { farmStore, contacts, now });
}

export function watchBroilers(ledger, cb) {
  const data = {}; const meta = {}; let farmStore = [], contacts = [];
  const subs = []; let timer = null; let ready = false; const pending = new Set();
  const fire = () => { clearTimeout(timer); timer = setTimeout(() => { if (ready) cb(buildSnap(ledger, { ...data }, { ...meta }, { farmStore, contacts })); }, 30); };
  const want = BR_COLLECTIONS.filter((k) => canRead(ledger.role, k));
  for (const k of BR_COLLECTIONS) data[k] = [];
  for (const k of want) { pending.add(k); subs.push(watchRecords(ledger.id, k, {}, (list) => { data[k] = list; pending.delete(k); if (!pending.size) ready = true; fire(); }, () => { pending.delete(k); if (!pending.size) ready = true; fire(); })); }
  if (canRead(ledger.role, "meta")) for (const k of BR_META) subs.push(watchMeta(ledger.id, k, (d) => { meta[k] = d; fire(); }, () => {}));
  const space = farmSpace(ledger);
  if (space && canRead(space.role, "medProducts")) {
    subs.push(watchRecords(space.id, "medProducts", {}, (l) => { farmStore = l; fire(); }, () => {}));
    subs.push(watchRecords(space.id, "contacts", {}, (l) => { contacts = l; fire(); }, () => {}));
  }
  if (!want.length) { ready = true; fire(); }
  const tick = setInterval(fire, 60000); // AM/PM check times and "Day N" move on with the clock
  return () => { clearTimeout(timer); clearInterval(tick); subs.forEach((u) => u && u()); };
}

/** Live screen helper: paint(snap, n) on every change; `first` resolves after the first paint. */
export function liveSnap(ledger, paint) {
  let resolve; const first = new Promise((r) => (resolve = r)); let n = 0; let busy = Promise.resolve();
  const stop = watchBroilers(ledger, (snap) => { busy = busy.then(async () => { try { await paint(snap, n++); } catch (e) { console.error("broilers paint", e); } resolve(snap); }); });
  return { first, stop };
}
