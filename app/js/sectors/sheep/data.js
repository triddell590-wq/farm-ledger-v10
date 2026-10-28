// One place that reads a Sheep ledger: its collections, meta docs and the farm-space medicine
// store / contacts / fields, turned into a snapshot the screens and the model use.
//   loadSheep(ledger)        -> Promise<snap>
//   liveSnap(ledger, paint)  -> { first, stop }  (paint(snap) after every change, batched)
import { listRecords, watchRecords, getMeta, watchMeta } from "../../services/records.js";
import { canRead } from "../../core/policy.js";
import { todayStr } from "../../core/dates.js";
import { session } from "../../services/session.js";
import { sheepSettings } from "./model/settings.js";
import { cycleFor, stageOf } from "./model/year.js";
import { countsAt, totals } from "./model/mobs.js";

export const SHEEP_COLLECTIONS = ["mobs", "sheep", "events", "lambings", "lambCrops", "medicines", "movements", "sales", "inventories", "deaths", "diseaseReports", "vetOps", "feedRecords", "tasks", "finance", "notes"];
export const SHEEP_META = ["settings", "keeper", "fqa"];

export function farmSpace(ledger) { return session.farms?.().find((f) => f.farmId === ledger.farmId)?.space || null; }

export function buildSnap(ledger, data, meta, extra = {}) {
  const now = extra.now || new Date(); const today = extra.today || todayStr(now);
  for (const k of SHEEP_COLLECTIONS) data[k] = (data[k] || []).filter((r) => !r.deleted);
  const s = sheepSettings(ledger, meta.settings || {});
  const cy = cycleFor(s, today, data.events);
  const stage = stageOf(cy, today);
  const counts = countsAt(data);
  const doneKeys = new Set(data.tasks.filter((t) => t.sourceRef && t.done).map((t) => t.sourceRef));
  const store = (extra.farmStore || []).filter((p) => !p.deleted);
  const snap = { ledger, lid: ledger.id, role: ledger.role, today, now, data, meta, s, cy, stage, counts, totals: totals(data, counts), store, contacts: extra.contacts || [], fields: (extra.fields || []).filter((f) => !f.deleted), doneKeys, keeper: meta.keeper || {} };
  snap.c = { data, s, today, now, lid: ledger.id, cy, stage, counts, store, doneKeys, keeper: snap.keeper };
  return snap;
}
const readable = (l, coll) => canRead(l.role, coll);

export async function loadSheep(ledger, extra = {}) {
  const data = {}; const meta = {};
  await Promise.all(SHEEP_COLLECTIONS.map(async (k) => { data[k] = readable(ledger, k) ? await listRecords(ledger.id, k).catch(() => []) : []; }));
  if (readable(ledger, "meta")) await Promise.all(SHEEP_META.map(async (k) => { meta[k] = await getMeta(ledger.id, k).catch(() => null); }));
  const space = farmSpace(ledger); let farmStore = [], contacts = [], fields = [];
  if (space && readable(space, "medProducts")) [farmStore, contacts, fields] = await Promise.all(["medProducts", "contacts", "fields"].map((k) => listRecords(space.id, k).catch(() => [])));
  return buildSnap(ledger, data, meta, { farmStore, contacts, fields, ...extra });
}

export function watchSheep(ledger, cb) {
  const data = {}; const meta = {}; const far = { farmStore: [], contacts: [], fields: [] };
  const subs = []; let timer = null; let ready = false; const pending = new Set();
  const fire = () => { clearTimeout(timer); timer = setTimeout(() => { if (ready) cb(buildSnap(ledger, { ...data }, { ...meta }, far)); }, 30); };
  const want = SHEEP_COLLECTIONS.filter((k) => readable(ledger, k));
  for (const k of SHEEP_COLLECTIONS) data[k] = [];
  for (const k of want) { pending.add(k); subs.push(watchRecords(ledger.id, k, {}, (list) => { data[k] = list; pending.delete(k); if (!pending.size) ready = true; fire(); }, () => { pending.delete(k); if (!pending.size) ready = true; fire(); })); }
  if (readable(ledger, "meta")) for (const k of SHEEP_META) subs.push(watchMeta(ledger.id, k, (d) => { meta[k] = d; fire(); }, () => {}));
  const space = farmSpace(ledger);
  if (space && readable(space, "medProducts")) for (const [k, coll] of [["farmStore", "medProducts"], ["contacts", "contacts"], ["fields", "fields"]]) subs.push(watchRecords(space.id, coll, {}, (l) => { far[k] = l; fire(); }, () => {}));
  if (!want.length) { ready = true; fire(); }
  return () => { clearTimeout(timer); subs.forEach((u) => u && u()); };
}
/** Live screen helper: paint(snap, n) on every change; `first` resolves after the first paint. */
export function liveSnap(ledger, paint) {
  let resolve; const first = new Promise((r) => (resolve = r)); let n = 0; let busy = Promise.resolve();
  const stop = watchSheep(ledger, (snap) => { busy = busy.then(async () => { try { await paint(snap, n++); } catch (e) { console.error("sheep paint", e); } resolve(snap); }); });
  return { first, stop };
}
