// One place that reads a Layers ledger: every collection, the meta docs (settings, lion) and the
// farm-space medicine store, as a snapshot the screens and the model share. Money (finance) is
// read only by roles that may see it; nothing else in this ledger carries a £ figure.
//   loadLayers(ledger) -> Promise<snap> ; liveSnap(ledger, paint) -> { first, stop }
// snap.c is the model's snapshot: { s, data, today, now, lid, doneKeys, region, ledger, money }.
import { canRead } from "../../core/policy.js";
import { todayStr } from "../../core/dates.js";
import { collectionsFor, metaFor } from "../registry.js";
import { layerSettings } from "./model/settings.js";
import { ledgerData } from "../../services/ledger-data.js";

export const LAYER_COLLECTIONS = [...new Set([...collectionsFor("layers"), "tasks", "notes"])].filter((k) => !["photos", "documents", "events"].includes(k));
export const LAYER_META = metaFor("layers");
export const PRICE_PROFILE_ID = "layers-price-profile";
const pad = (n) => String(n).padStart(2, "0");
export function nowStr(d = new Date()) { return `${todayStr(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }

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

export const { load: loadLayers, watch: watchLayers, live: liveSnap } = ledgerData({ name: "layers", colls: LAYER_COLLECTIONS, metas: LAYER_META, clock: true, build: buildSnap });
