// One place that reads a Broilers ledger: every collection, the meta docs and the farm-space
// medicine store, as a snapshot the screens and the model share. Money (finance) is read only by
// roles that may see it; nothing else in this ledger carries a £ figure (integrator owns chicks
// and feed, so feed deliveries carry tonnes and batch numbers only).
//   loadBroilers(ledger) -> Promise<snap> ; liveSnap(ledger, paint) -> { first, stop }
import { canRead } from "../../core/policy.js";
import { collectionsFor, metaFor } from "../registry.js";
import { broilerSettings } from "./model/settings.js";
import { indexBroilers } from "./model/crop.js";
import { useRegion } from "./model/content.js";
import { nowStr } from "./model/time.js";
import { ledgerData } from "../../services/ledger-data.js";

export const BR_COLLECTIONS = [...new Set([...collectionsFor("broilers"), "tasks"])].filter((k) => !["photos", "documents", "notes", "events"].includes(k));
export const BR_META = metaFor("broilers");

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

export const { load: loadBroilers, watch: watchBroilers, live: liveSnap } = ledgerData({ name: "broilers", colls: BR_COLLECTIONS, metas: BR_META, clock: true, build: buildSnap });
