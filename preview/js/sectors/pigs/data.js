// One place that reads a Pigs ledger: every collection, the meta docs and the farm-space
// medicine store, as a snapshot the screens and the model share. Money (finance) is read only
// by roles that may see it; nothing else in this ledger carries a £ figure.
//   loadPigs(ledger) -> Promise<snap> ; liveSnap(ledger, paint) -> { first, stop }
import { canRead } from "../../core/policy.js";
import { collectionsFor, metaFor } from "../registry.js";
import { todayStr } from "./model/dates.js";
import { pigSettings, tabSetFor } from "./model/settings.js";
import { indexHerd } from "./model/sows.js";
import { weekIndex } from "./model/weeks.js";
import { nextBatchNo } from "./model/batches.js";
import { batchFactsAll } from "./model/facts.js";
import { ledgerData } from "../../services/ledger-data.js";

export const PIG_COLLECTIONS = [...new Set([...collectionsFor("pigs"), "tasks"])].filter((k) => !["photos", "documents", "notes", "events"].includes(k));
export const PIG_META = metaFor("pigs");
const pad = (n) => String(n).padStart(2, "0");
export function nowStr(d = new Date()) { return `${todayStr(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }

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

export const { load: loadPigs, watch: watchPigs, live: liveSnap } = ledgerData({ name: "pigs", colls: PIG_COLLECTIONS, metas: PIG_META, clock: true, build: buildSnap });

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
