// One place that reads a Beef ledger: every collection, the meta docs and the farm-space
// medicine store / contacts, turned into a snapshot the screens and the model use.
//   loadBeef(ledger)        -> Promise<snap>   (one-off)
//   watchBeef(ledger, cb)   -> unsubscribe     (live; cb(snap) after any change, batched)
// snap = { ledger, lid, role, today, data{coll:[]}, meta{}, s (settings), ix (herd index),
//          store (medicine products), contacts, doneKeys, silage (budget), c (model context) }
import { listRecords, watchRecords, getMeta, watchMeta } from "../../services/records.js";
import { canRead } from "../../core/policy.js";
import { todayStr } from "../../core/dates.js";
import { session } from "../../services/session.js";
import { beefSettings } from "./model/rules.js";
import { indexHerd } from "./model/animals.js";
import { priceBook } from "./model/prices.js";
import { silageStock, headByClass, fodderBudget } from "./model/feed.js";

export const BEEF_COLLECTIONS = ["animals", "calvings", "services", "scans", "heats", "weighings", "medicines", "movements", "sales", "purchases", "deaths", "tbTests", "vetOps", "groups", "feedGroups", "feedAdjust", "tasks", "finance", "medProducts", "notes"];
export const BEEF_META = ["keeper", "fqa", "silage", "settings", "places", "tbDay", "calfChecks"];

function farmSpace(ledger) { return session.farms().find((f) => f.farmId === ledger.farmId)?.space || null; }

export function buildSnap(ledger, data, meta, extra = {}) {
  const today = extra.today || todayStr();
  for (const k of BEEF_COLLECTIONS) data[k] = (data[k] || []).filter((r) => !r.deleted);
  const s = beefSettings(ledger, meta.settings || {});
  s.region = ledger.region || "NI";
  // £ lives only in finance (model/prices.js): roles without money get no prices at all.
  const prices = priceBook(data.finance); const mk = prices.market || {};
  s.price = { perKgDead: mk.perKgDead ?? null, enteredOn: mk.enteredOn ?? null }; s.meal = { pricePerTonne: mk.pricePerTonne ?? null };
  const ix = indexHerd(data);
  const store = [...(extra.farmStore || []), ...data.medProducts.map((p) => ({ ...p, name: p.name, wdMeat: p.wdMeat, local: true }))];
  const doneKeys = new Set(data.tasks.filter((t) => t.sourceRef && t.done).map((t) => t.sourceRef));
  const stock = silageStock(meta.silage, { feedGroups: data.feedGroups, adjust: data.feedAdjust, data, today });
  const budget = stock.fullT ? fodderBudget({ leftT: stock.leftT, heads: headByClass(data, ix, today), rates: s.fodderRates, today, turnout: meta.silage?.turnout || null }) : null;
  const silage = budget ? { ...budget, ...stock } : null;
  const snap = { ledger, lid: ledger.id, role: ledger.role, today, data, meta, s, ix, prices, store, contacts: extra.contacts || [], doneKeys, silage };
  snap.c = { data, s, ix, prices, today, lid: ledger.id, store, doneKeys, silage, keeper: meta.keeper || {}, ms: meta.settings || {} };
  return snap;
}

const readable = (ledger, coll) => canRead(ledger.role, coll);

export async function loadBeef(ledger) {
  const data = {}; const meta = {};
  await Promise.all(BEEF_COLLECTIONS.map(async (k) => { data[k] = readable(ledger, k) ? await listRecords(ledger.id, k).catch(() => []) : []; }));
  if (readable(ledger, "meta")) await Promise.all(BEEF_META.map(async (k) => { meta[k] = await getMeta(ledger.id, k).catch(() => null); }));
  const space = farmSpace(ledger); let farmStore = [], contacts = [];
  if (space && readable(space, "medProducts")) { farmStore = await listRecords(space.id, "medProducts").catch(() => []); contacts = await listRecords(space.id, "contacts").catch(() => []); }
  return buildSnap(ledger, data, meta, { farmStore, contacts });
}

export function watchBeef(ledger, cb) {
  const data = {}; const meta = {}; let farmStore = [], contacts = [];
  const subs = []; let timer = null; let ready = false; const pending = new Set();
  const fire = () => { clearTimeout(timer); timer = setTimeout(() => { if (ready) cb(buildSnap(ledger, { ...data }, { ...meta }, { farmStore, contacts })); }, 30); };
  const want = BEEF_COLLECTIONS.filter((k) => readable(ledger, k));
  for (const k of BEEF_COLLECTIONS) data[k] = [];
  for (const k of want) { pending.add(k); subs.push(watchRecords(ledger.id, k, {}, (list) => { data[k] = list; pending.delete(k); if (!pending.size) ready = true; fire(); }, () => { pending.delete(k); if (!pending.size) ready = true; fire(); })); }
  if (readable(ledger, "meta")) for (const k of BEEF_META) subs.push(watchMeta(ledger.id, k, (d) => { meta[k] = d; fire(); }, () => {}));
  const space = farmSpace(ledger);
  if (space && readable(space, "medProducts")) {
    subs.push(watchRecords(space.id, "medProducts", {}, (l) => { farmStore = l; fire(); }, () => {}));
    subs.push(watchRecords(space.id, "contacts", {}, (l) => { contacts = l; fire(); }, () => {}));
  }
  if (!want.length) { ready = true; fire(); }
  return () => { clearTimeout(timer); subs.forEach((u) => u && u()); };
}

/** Live screen helper: paint(snap, n) on every change; `first` resolves after the first paint. */
export function liveSnap(ledger, paint) {
  let resolve; const first = new Promise((r) => (resolve = r)); let n = 0; let busy = Promise.resolve();
  const stop = watchBeef(ledger, (snap) => { busy = busy.then(async () => { try { await paint(snap, n++); } catch (e) { console.error("beef paint", e); } resolve(snap); }); });
  return { first, stop };
}
export { farmSpace };
