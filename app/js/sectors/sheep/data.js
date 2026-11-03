// One place that reads a Sheep ledger: its collections, meta docs and the farm-space medicine
// store / contacts / fields, turned into a snapshot the screens and the model use.
//   loadSheep(ledger)        -> Promise<snap>
//   liveSnap(ledger, paint)  -> { first, stop }  (paint(snap) after every change, batched)
import { todayStr } from "../../core/dates.js";
import { sheepSettings } from "./model/settings.js";
import { cycleFor, stageOf } from "./model/year.js";
import { countsAt, totals } from "./model/mobs.js";
import { ledgerData } from "../../services/ledger-data.js";

export const SHEEP_COLLECTIONS = ["mobs", "sheep", "events", "lambings", "lambCrops", "medicines", "movements", "sales", "inventories", "deaths", "diseaseReports", "vetOps", "feedRecords", "tasks", "finance", "notes"];
export const SHEEP_META = ["settings", "keeper", "fqa"];

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

export const { load: loadSheep, watch: watchSheep, live: liveSnap } = ledgerData({ name: "sheep", colls: SHEEP_COLLECTIONS, metas: SHEEP_META, farmColls: ["contacts", "fields"], build: buildSnap });
