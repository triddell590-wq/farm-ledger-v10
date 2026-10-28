// One place that reads a Pigs ledger: every collection, the meta docs and the farm-space
// medicine store, as a snapshot the screens and the model share. Money (finance) is read only
// by roles that may see it; nothing else in this ledger carries a £ figure.
//   loadPigs(ledger) -> Promise<snap> ; liveSnap(ledger, paint) -> { first, stop }
import { listRecords, watchRecords, getMeta, watchMeta } from "../../services/records.js";
import { canRead } from "../../core/policy.js";
import { session } from "../../services/session.js";
import { collectionsFor, metaFor } from "../registry.js";
import { todayStr } from "./model/dates.js";
import { pigSettings, tabSetFor } from "./model/settings.js";
import { indexHerd } from "./model/sows.js";
import { weekIndex } from "./model/weeks.js";
import { nextBatchNo } from "./model/batches.js";
import { batchFactsAll } from "./model/facts.js";

export const PIG_COLLECTIONS = [...new Set([...collectionsFor("pigs"), "tasks"])].filter((k) => !["photos", "documents", "notes", "events"].includes(k));
export const PIG_META = metaFor("pigs");
const pad = (n) => String(n).padStart(2, "0");
export function nowStr(d = new Date()) { return `${todayStr(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function farmSpace(ledger) { return session.farms?.().find((f) => f.farmId === ledger.farmId)?.space || null; }

export function buildSnap(ledger, data, meta, extra = {}) {
  const now = extra.now || nowStr(); const today = now.slice(0, 10);
  for (const k of PIG_COLLECTIONS) data[k] = (data[k] || []).filter((r) => !r.deleted);
  const s = pigSettings(ledger, meta.settings || {});
  rememberTabs(ledger.id, tabSetFor(s));
  const ix = indexHerd(data);
  const served = data.batches.filter((b) => b.serveDate).sort((a, b) => a.serveDate.localeCompare(b.serveDate));
  const lastServe = served[served.length - 1];
  const anchorIdx = lastServe ? weekIndex(lastServe.serveDate) : weekIndex(today);
  const knownBatches = served.map((b) => ({ no: +b.no, serveDate: b.serveDate, served: new Set(data.services.filter((x) => x.batchId === b.id).map((x) => x.sowId)).size }));
  const doneKeys = new Set(data.tasks.filter((t) => t.sourceRef && t.done).map((t) => t.sourceRef));
  const store = [...(extra.farmStore || [])];
  const money = canRead(ledger.role, "finance");
  const c = { s, ix, data, today, now, lid: ledger.id, doneKeys, meta, anchorIdx, nextNo: nextBatchNo(data.batches), knownBatches, finance: money ? data.finance : [], money };
  c.bf = batchFactsAll(c);
  return { ledger, lid: ledger.id, role: ledger.role, today, now, data, meta, s, ix, c, store, contacts: extra.contacts || [], money, people: extra.people || {} };
}

export async function loadPigs(ledger, { now } = {}) {
  const data = {}; const meta = {};
  await Promise.all(PIG_COLLECTIONS.map(async (k) => { data[k] = canRead(ledger.role, k) ? await listRecords(ledger.id, k).catch(() => []) : []; }));
  if (canRead(ledger.role, "meta")) await Promise.all(PIG_META.map(async (k) => { meta[k] = await getMeta(ledger.id, k).catch(() => null); }));
  const space = farmSpace(ledger); let farmStore = [], contacts = [];
  if (space && canRead(space.role, "medProducts")) { farmStore = await listRecords(space.id, "medProducts").catch(() => []); contacts = await listRecords(space.id, "contacts").catch(() => []); }
  return buildSnap(ledger, data, meta, { farmStore, contacts, now });
}

export function watchPigs(ledger, cb) {
  const data = {}; const meta = {}; let farmStore = [], contacts = [];
  const subs = []; let timer = null; let ready = false; const pending = new Set();
  const fire = () => { clearTimeout(timer); timer = setTimeout(() => { if (ready) cb(buildSnap(ledger, { ...data }, { ...meta }, { farmStore, contacts })); }, 30); };
  const want = PIG_COLLECTIONS.filter((k) => canRead(ledger.role, k));
  for (const k of PIG_COLLECTIONS) data[k] = [];
  for (const k of want) { pending.add(k); subs.push(watchRecords(ledger.id, k, {}, (list) => { data[k] = list; pending.delete(k); if (!pending.size) ready = true; fire(); }, () => { pending.delete(k); if (!pending.size) ready = true; fire(); })); }
  if (canRead(ledger.role, "meta")) for (const k of PIG_META) subs.push(watchMeta(ledger.id, k, (d) => { meta[k] = d; fire(); }, () => {}));
  const space = farmSpace(ledger);
  if (space && canRead(space.role, "medProducts")) {
    subs.push(watchRecords(space.id, "medProducts", {}, (l) => { farmStore = l; fire(); }, () => {}));
    subs.push(watchRecords(space.id, "contacts", {}, (l) => { contacts = l; fire(); }, () => {}));
  }
  if (!want.length) { ready = true; fire(); }
  const tick = setInterval(fire, 60000); // room-check reminder time and "day N" move on with the clock
  return () => { clearTimeout(timer); clearInterval(tick); subs.forEach((u) => u && u()); };
}

/** Live screen helper: paint(snap, n) on every change; `first` resolves after the first paint. */
export function liveSnap(ledger, paint) {
  let resolve; const first = new Promise((r) => (resolve = r)); let n = 0; let busy = Promise.resolve();
  const stop = watchPigs(ledger, (snap) => { busy = busy.then(async () => { try { await paint(snap, n++); } catch (e) { console.error("pigs paint", e); } resolve(snap); }); });
  return { first, stop };
}
export { farmSpace };

// The tab set depends on the system (design/13 §2.1). The shell reads tabs synchronously, so the
// last known set per ledger is kept here (and in localStorage for a warm start).
const TABSETS = new Map();
export function rememberTabs(lid, set) {
  if (TABSETS.get(lid) === set) return;
  const before = TABSETS.get(lid) ?? knownTabs(lid); TABSETS.set(lid, set);
  try { localStorage.setItem(`fl10-pigs-tabs-${lid}`, set); } catch (e) { /* private mode */ }
  if (before && before !== set && typeof window !== "undefined") window.dispatchEvent(new CustomEvent("pigs:tabs", { detail: { lid, set } }));
}
export function knownTabs(lid) {
  if (TABSETS.has(lid)) return TABSETS.get(lid);
  try { return localStorage.getItem(`fl10-pigs-tabs-${lid}`) || null; } catch (e) { return null; }
}
