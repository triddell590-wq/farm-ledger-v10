// One medicine store (review A #9). Products live in the farm space's `medProducts`; older Beef
// and Dairy ledgers (v9 migration, early entries) also hold some in their own `medProducts`.
// Nothing is moved: every reader merges the two the same way, so the farm store and each
// ledger's product list always agree. The farm's own product wins when both have the same name.
import { listRecords, watchRecords } from "./records.js";
import { canRead } from "../core/policy.js";
import { session } from "./session.js";

const key = (p) => String(p?.name || "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * farm: farm-space products; local: [{ ledger, products }] or a plain product list (one ledger).
 * Returns products with `local: true, lid, ledgerName` on those that come from a ledger.
 */
export function mergeStores(farm = [], local = []) {
  const out = []; const seen = new Set();
  for (const p of farm) { if (p.deleted || !p.name) continue; const k = key(p); if (seen.has(k)) continue; seen.add(k); out.push(p); }
  const groups = Array.isArray(local) && local.length && local[0] && Array.isArray(local[0].products) ? local : [{ ledger: null, products: local }];
  for (const g of groups) for (const p of g.products || []) {
    if (p.deleted || !p.name) continue; const k = key(p); if (seen.has(k)) continue; seen.add(k);
    out.push({ ...p, local: true, ...(g.ledger ? { lid: g.ledger.id, ledgerName: g.ledger.name, ledgerType: g.ledger.type } : {}) });
  }
  return out;
}

/** Sector ledgers on the farm whose own product lists still count (those the person can read). */
export const storeLedgers = (ledgers, farmId) => ledgers.filter((l) => l.type !== "farm" && l.farmId === farmId && ["beef", "dairy"].includes(l.type) && canRead(l.role, "medProducts"));

/** Watch the whole farm store: farm space + every readable sector ledger. cb(mergedList). */
export function watchFarmStore(space, ledgers, cb) {
  let farm = []; const local = new Map(); const subs = [];
  const fire = () => cb(mergeStores(farm, ledgers.map((l) => ({ ledger: l, products: local.get(l.id) || [] }))));
  subs.push(watchRecords(space.id, "medProducts", {}, (l) => { farm = l; fire(); }, () => fire()));
  for (const l of ledgers) subs.push(watchRecords(l.id, "medProducts", {}, (list) => { local.set(l.id, list); fire(); }, () => {}));
  return () => subs.forEach((u) => u && u());
}
export async function loadFarmStore(space, ledgers) {
  const farm = space ? await listRecords(space.id, "medProducts").catch(() => []) : [];
  const local = await Promise.all(ledgers.map(async (l) => ({ ledger: l, products: await listRecords(l.id, "medProducts").catch(() => []) })));
  return mergeStores(farm, local);
}

/** For a sector ledger: the farm store plus the other Beef/Dairy ledgers' own products (its own come with its data). */
const othersOf = (ledger) => storeLedgers(session.ledgers, ledger.farmId).filter((l) => l.id !== ledger.id);
export function loadFarmProducts(space, ledger) { return loadFarmStore(space, othersOf(ledger)); }
export function watchFarmProducts(space, ledger, cb) { return watchFarmStore(space, othersOf(ledger), cb); }
