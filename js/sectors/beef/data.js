// One place that reads a Beef ledger: every collection, the meta docs and the farm-space
// medicine store / contacts, turned into a snapshot the screens and the model use.
//   loadBeef(ledger)        -> Promise<snap>   (one-off)
//   watchBeef(ledger, cb)   -> unsubscribe     (live; cb(snap) after any change, batched)
// snap = { ledger, lid, role, today, data{coll:[]}, meta{}, s (settings), ix (herd index),
//          store (medicine products), contacts, doneKeys, silage (budget), c (model context) }
import { todayStr } from "../../core/dates.js";
import { beefSettings } from "./model/rules.js";
import { indexHerd } from "./model/animals.js";
import { priceBook } from "./model/prices.js";
import { silageStock, headByClass, fodderBudget } from "./model/feed.js";
import { mergeStores } from "../../services/med-store.js";
import { ledgerData } from "../../services/ledger-data.js";

export const BEEF_COLLECTIONS = ["animals", "calvings", "services", "scans", "heats", "weighings", "medicines", "movements", "sales", "purchases", "deaths", "tbTests", "vetOps", "groups", "feedGroups", "feedAdjust", "tasks", "finance", "medProducts", "notes"];
export const BEEF_META = ["keeper", "fqa", "silage", "settings", "places", "tbDay", "calfChecks"];

export function buildSnap(ledger, data, meta, extra = {}) {
  const today = extra.today || todayStr();
  for (const k of BEEF_COLLECTIONS) data[k] = (data[k] || []).filter((r) => !r.deleted);
  const s = beefSettings(ledger, meta.settings || {});
  s.region = ledger.region || "NI";
  // £ lives only in finance (model/prices.js): roles without money get no prices at all.
  const prices = priceBook(data.finance); const mk = prices.market || {};
  s.price = { perKgDead: mk.perKgDead ?? null, enteredOn: mk.enteredOn ?? null }; s.meal = { pricePerTonne: mk.pricePerTonne ?? null, silagePerTonne: mk.silagePerTonne ?? null };
  const ix = indexHerd(data);
  const store = mergeStores(extra.farmStore || [], data.medProducts); // one store (review A #9): the farm's product wins on the same name
  const doneKeys = new Set(data.tasks.filter((t) => t.sourceRef && t.done).map((t) => t.sourceRef));
  const stock = silageStock(meta.silage, { feedGroups: data.feedGroups, adjust: data.feedAdjust, data, today });
  const budget = stock.fullT ? fodderBudget({ leftT: stock.leftT, heads: headByClass(data, ix, today), rates: s.fodderRates, today, turnout: meta.silage?.turnout || null }) : null;
  const silage = budget ? { ...budget, ...stock } : null;
  const snap = { ledger, lid: ledger.id, role: ledger.role, today, data, meta, s, ix, prices, store, contacts: extra.contacts || [], doneKeys, silage };
  snap.c = { data, s, ix, prices, today, lid: ledger.id, store, doneKeys, silage, keeper: meta.keeper || {}, ms: meta.settings || {} };
  return snap;
}

export const { load: loadBeef, watch: watchBeef, live: liveSnap } = ledgerData({ name: "beef", colls: BEEF_COLLECTIONS, metas: BEEF_META, build: buildSnap });
