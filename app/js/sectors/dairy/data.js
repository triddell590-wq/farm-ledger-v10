// One place that reads a Dairy ledger: every collection, the meta docs and the farm-space
// medicine store / contacts, as a snapshot the screens and the model use.
//   loadDairy(ledger) -> Promise<snap> ; watchDairy(ledger, cb) -> unsubscribe ; liveSnap(ledger, paint)
import { listRecords, watchRecords, getMeta, watchMeta } from "../../services/records.js";
import { canRead } from "../../core/policy.js";
import { session } from "../../services/session.js";
import { collectionsFor, metaFor } from "../registry.js";
import { dairySettings, PRICE_PROFILE_ID } from "./model/settings.js";
import { indexHerd } from "./model/cows.js";
import { board, nowStr } from "./model/milking.js";
import { notMilked } from "./model/alerts.js";

export const DAIRY_COLLECTIONS = [...new Set([...collectionsFor("dairy"), "tasks"])].filter((k) => !["photos", "documents"].includes(k));
export const DAIRY_META = metaFor("dairy");

function farmSpace(ledger) { return session.farms?.().find((f) => f.farmId === ledger.farmId)?.space || null; }
const readable = (ledger, coll) => canRead(ledger.role, coll);

export function buildSnap(ledger, data, meta, extra = {}) {
  const now = extra.now || nowStr(); const today = now.slice(0, 10);
  for (const k of DAIRY_COLLECTIONS) data[k] = (data[k] || []).filter((r) => !r.deleted);
  const s = dairySettings(ledger, meta.settings || {});
  // The processor price profile is money, so it lives in finance (kind "prices"), never in meta.
  const prof = data.finance.find((r) => r.id === PRICE_PROFILE_ID);
  if (prof?.profile) s.price = { ...s.price, ...prof.profile };
  const ix = indexHerd(data);
  const brd = board(s, data.milkWithhold, ix, now);
  const store = [...data.medProducts.map((p) => ({ ...p, local: true })), ...(extra.farmStore || []).map((p) => ({ ...p, wdMilkHours: p.wdMilkHours ?? (p.wdMilk !== "" && p.wdMilk != null ? +p.wdMilk * 24 : null), wdMeatDays: p.wdMeatDays ?? p.wdMeat }))];
  const doneKeys = new Set(data.tasks.filter((t) => t.sourceRef && t.done).map((t) => t.sourceRef));
  const people = Object.fromEntries((extra.members || []).map((m) => [m.uid, m.displayName || m.email]));
  const snap = { ledger, lid: ledger.id, role: ledger.role, today, now, data, meta, s, ix, brd, store, contacts: extra.contacts || [], doneKeys, people };
  snap.c = { s, ix, data, today, now, lid: ledger.id, doneKeys, brd, meta: meta.settings || {}, people };
  snap.notMilked = new Set(notMilked(snap.c).map((x) => x.a.id));
  return snap;
}

export async function loadDairy(ledger, { now } = {}) {
  const data = {}; const meta = {};
  await Promise.all(DAIRY_COLLECTIONS.map(async (k) => { data[k] = readable(ledger, k) ? await listRecords(ledger.id, k).catch(() => []) : []; }));
  if (readable(ledger, "meta")) await Promise.all(DAIRY_META.map(async (k) => { meta[k] = await getMeta(ledger.id, k).catch(() => null); }));
  const space = farmSpace(ledger); let farmStore = [], contacts = [];
  if (space && readable(space, "medProducts")) { farmStore = await listRecords(space.id, "medProducts").catch(() => []); contacts = await listRecords(space.id, "contacts").catch(() => []); }
  return buildSnap(ledger, data, meta, { farmStore, contacts, now });
}

export function watchDairy(ledger, cb) {
  const data = {}; const meta = {}; let farmStore = [], contacts = [];
  const subs = []; let timer = null; let ready = false; const pending = new Set();
  const fire = () => { clearTimeout(timer); timer = setTimeout(() => { if (ready) cb(buildSnap(ledger, { ...data }, { ...meta }, { farmStore, contacts })); }, 30); };
  const want = DAIRY_COLLECTIONS.filter((k) => readable(ledger, k));
  for (const k of DAIRY_COLLECTIONS) data[k] = [];
  for (const k of want) { pending.add(k); subs.push(watchRecords(ledger.id, k, {}, (list) => { data[k] = list; pending.delete(k); if (!pending.size) ready = true; fire(); }, () => { pending.delete(k); if (!pending.size) ready = true; fire(); })); }
  if (readable(ledger, "meta")) for (const k of DAIRY_META) subs.push(watchMeta(ledger.id, k, (d) => { meta[k] = d; fire(); }, () => {}));
  const space = farmSpace(ledger);
  if (space && readable(space, "medProducts")) {
    subs.push(watchRecords(space.id, "medProducts", {}, (l) => { farmStore = l; fire(); }, () => {}));
    subs.push(watchRecords(space.id, "contacts", {}, (l) => { contacts = l; fire(); }, () => {}));
  }
  if (!want.length) { ready = true; fire(); }
  // milkings pass on the clock: repaint every minute so "OK from" and the tank prompt move on
  const tick = setInterval(fire, 60000);
  return () => { clearTimeout(timer); clearInterval(tick); subs.forEach((u) => u && u()); };
}

/** Live screen helper: paint(snap, n) on every change; `first` resolves after the first paint. */
export function liveSnap(ledger, paint) {
  let resolve; const first = new Promise((r) => (resolve = r)); let n = 0; let busy = Promise.resolve();
  const stop = watchDairy(ledger, (snap) => { busy = busy.then(async () => { try { await paint(snap, n++); } catch (e) { console.error("dairy paint", e); } resolve(snap); }); });
  return { first, stop };
}
export { farmSpace };
