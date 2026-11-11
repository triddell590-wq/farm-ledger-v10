// One place that reads a Dairy ledger: every collection, the meta docs and the farm-space
// medicine store / contacts, as a snapshot the screens and the model use.
//   loadDairy(ledger) -> Promise<snap> ; watchDairy(ledger, cb) -> unsubscribe ; liveSnap(ledger, paint)
import { collectionsFor, metaFor } from "../registry.js";
import { dairySettings, PRICE_PROFILE_ID } from "./model/settings.js";
import { indexHerd } from "./model/cows.js";
import { board, nowStr } from "./model/milking.js";
import { notMilked } from "./model/alerts.js";
import { mergeStores } from "../../services/med-store.js";
import { ledgerData } from "../../services/ledger-data.js";

export const DAIRY_COLLECTIONS = [...new Set([...collectionsFor("dairy"), "tasks"])].filter((k) => !["photos", "documents"].includes(k));
export const DAIRY_META = metaFor("dairy");

export function buildSnap(ledger, data, meta, extra = {}) {
  const now = extra.now || nowStr(); const today = now.slice(0, 10);
  for (const k of DAIRY_COLLECTIONS) data[k] = (data[k] || []).filter((r) => !r.deleted);
  const s = dairySettings(ledger, meta.settings || {});
  // The processor price profile is money, so it lives in finance (kind "prices"), never in meta.
  const prof = data.finance.find((r) => r.id === PRICE_PROFILE_ID);
  if (prof?.profile) s.price = { ...s.price, ...prof.profile };
  const ix = indexHerd(data);
  const brd = board(s, data.milkWithhold, ix, now);
  // one store (review A #9): farm products (with days turned into dairy's hours) and this ledger's own; the farm's wins on the same name
  const store = mergeStores(extra.farmStore || [], data.medProducts).map((p) => ({ ...p, wdMilkHours: p.wdMilkHours ?? (p.wdMilk !== "" && p.wdMilk != null ? +p.wdMilk * 24 : null), wdMeatDays: p.wdMeatDays ?? p.wdMeat }));
  const doneKeys = new Set(data.tasks.filter((t) => t.sourceRef && t.done).map((t) => t.sourceRef));
  const people = Object.fromEntries((extra.members || []).map((m) => [m.uid, m.displayName || m.email]));
  const snap = { ledger, lid: ledger.id, role: ledger.role, today, now, data, meta, s, ix, brd, store, contacts: extra.contacts || [], doneKeys, people };
  snap.c = { s, ix, data, today, now, lid: ledger.id, doneKeys, brd, meta: meta.settings || {}, people };
  snap.notMilked = new Set(notMilked(snap.c).map((x) => x.a.id));
  return snap;
}

export const { load: loadDairy, watch: watchDairy, live: liveSnap } = ledgerData({ name: "dairy", colls: DAIRY_COLLECTIONS, metas: DAIRY_META, clock: true, build: buildSnap });
