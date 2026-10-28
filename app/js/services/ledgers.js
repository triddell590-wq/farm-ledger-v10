// Ledgers: create, list mine (for the Overview), update, transfer ownership, delete.
// A farm is a "farm space" ledger (type "farm", id == farmId) holding farm-wide records;
// each sector ledger carries that farmId. See ARCHITECTURE.md §3.
import { store } from "../core/store.js";
import { auth } from "../core/auth.js";
import { SECTORS, LEDGER_TYPES } from "../core/policy.js";
import { collectionsFor, metaFor, SUBCOLLECTIONS, sectorName } from "../sectors/registry.js";

const me = () => auth.user;
const memberDoc = (user, role) => ({ uid: user.uid, role, addedAt: new Date(), addedBy: user.uid, displayName: user.displayName || "", email: user.email || "" });

/** Create a farm space. Returns its id (the farmId). */
export async function createFarm({ farmName, region = "NI" }) {
  const u = me(); const id = store.newId();
  const b = store.batch();
  b.set(`ledgers/${id}`, { name: farmName, farmName, farmId: id, type: "farm", region, ownerUid: u.uid, createdAt: new Date(), updatedAt: new Date(), settings: {} });
  b.set(`ledgers/${id}/members/${u.uid}`, memberDoc(u, "owner"));
  await b.commit();
  return id;
}

/** Create a sector ledger on a farm (creates the farm space first if farmId is not given). */
export async function createLedger({ type, name, farmId, farmName, region = "NI", settings = {} }) {
  if (!SECTORS.includes(type)) throw new Error("Unknown ledger type " + type);
  const u = me();
  if (!farmId) farmId = await createFarm({ farmName, region });
  const id = store.newId();
  const b = store.batch();
  b.set(`ledgers/${id}`, { name: name || sectorName(type), farmName: farmName || "", farmId, type, region, ownerUid: u.uid, createdAt: new Date(), updatedAt: new Date(), settings });
  b.set(`ledgers/${id}/members/${u.uid}`, memberDoc(u, "owner"));
  await b.commit();
  return id;
}

/** Every ledger I belong to, with my role: [{ ...ledger, role }], sector order. */
export async function listMine() {
  const mems = await store.queryGroup("members", { where: [["uid", "==", me().uid]] });
  const out = [];
  await Promise.all(mems.map(async (m) => {
    const lid = m._path.split("/")[1];
    try { const l = await store.get(`ledgers/${lid}`); if (l) out.push({ ...l, role: m.role }); }
    catch (e) { /* removed between the two reads */ }
  }));
  return out.sort((a, b) => LEDGER_TYPES.indexOf(a.type) - LEDGER_TYPES.indexOf(b.type) || String(a.name).localeCompare(b.name));
}

/** Group my ledgers into farms: [{ farmId, farmName, space (farm-space ledger or null), ledgers: [...] }]. */
export function groupByFarm(ledgers) {
  const farms = new Map();
  for (const l of ledgers) {
    if (!farms.has(l.farmId)) farms.set(l.farmId, { farmId: l.farmId, farmName: l.farmName, space: null, ledgers: [] });
    const f = farms.get(l.farmId);
    if (l.type === "farm") { f.space = l; f.farmName = l.farmName || l.name; } else { f.ledgers.push(l); if (!f.farmName) f.farmName = l.farmName; }
  }
  return [...farms.values()];
}

export const getLedger = (lid) => store.get(`ledgers/${lid}`);
export const watchLedger = (lid, cb, onErr) => store.watchDoc(`ledgers/${lid}`, cb, onErr);
export const updateLedger = (lid, partial) => store.update(`ledgers/${lid}`, { ...partial, updatedAt: new Date() });

/** Rename the farm everywhere I can (farm space + every ledger of that farm I may edit). */
export async function renameFarm(farmId, farmName, ledgers) {
  const b = store.batch();
  for (const l of ledgers) if (l.farmId === farmId && ["owner", "manager"].includes(l.role)) b.update(`ledgers/${l.id}`, { farmName, updatedAt: new Date(), ...(l.type === "farm" ? { name: farmName } : {}) });
  if (b.size) await b.commit();
}

/** Hand the ledger to another member. They become owner; I become manager. */
export async function transferOwnership(lid, toUid) {
  const u = me(); const b = store.batch();
  b.update(`ledgers/${lid}`, { ownerUid: toUid, updatedAt: new Date() });
  b.update(`ledgers/${lid}/members/${toUid}`, { role: "owner", updatedAt: new Date(), updatedBy: u.uid });
  b.update(`ledgers/${lid}/members/${u.uid}`, { role: "manager", updatedAt: new Date(), updatedBy: u.uid });
  await b.commit();
}

// Firestore batches hold at most 500 writes; stay well under.
async function removeAll(paths) {
  for (let i = 0; i < paths.length; i += 400) {
    const b = store.batch();
    paths.slice(i, i + 400).forEach((p) => b.remove(p));
    await b.commit();
  }
}

/**
 * Delete a ledger and everything in it (owner only). Order matters so nothing is orphaned
 * and I never lose access half-way: records (+ their sub-records) -> meta -> private ->
 * open invites -> other members -> finally the ledger and my own member doc together.
 * onProgress(text) is called between steps.
 */
export async function deleteLedger(lid, onProgress = () => {}) {
  const u = me();
  const l = await store.get(`ledgers/${lid}`);
  if (!l) return;
  const paths = [];
  for (const c of collectionsFor(l.type)) {
    const recs = await store.query(`ledgers/${lid}/${c}`);
    for (const r of recs) {
      for (const sub of SUBCOLLECTIONS[c] || []) (await store.query(`ledgers/${lid}/${c}/${r.id}/${sub}`)).forEach((s) => paths.push(`ledgers/${lid}/${c}/${r.id}/${sub}/${s.id}`));
      paths.push(`ledgers/${lid}/${c}/${r.id}`);
    }
  }
  onProgress(`Deleting ${paths.length} records…`);
  await removeAll(paths);
  const metas = await store.query(`ledgers/${lid}/meta`);
  const priv = await store.query(`ledgers/${lid}/private`);
  await removeAll([...metas.map((m) => `ledgers/${lid}/meta/${m.id}`), ...priv.map((p) => `ledgers/${lid}/private/${p.id}`)]);
  onProgress("Cancelling invites…");
  const idx = await store.query(`ledgers/${lid}/inviteIndex`);
  for (const i of idx) {
    const b = store.batch();
    if (await store.get(`invites/${i.id}`)) b.remove(`invites/${i.id}`);
    b.remove(`ledgers/${lid}/inviteIndex/${i.id}`);
    await b.commit();
  }
  onProgress("Removing people…");
  const mems = await store.query(`ledgers/${lid}/members`);
  await removeAll(mems.filter((m) => m.id !== u.uid).map((m) => `ledgers/${lid}/members/${m.id}`));
  const b = store.batch();
  b.remove(`ledgers/${lid}`);
  b.remove(`ledgers/${lid}/members/${u.uid}`);
  await b.commit();
  onProgress("Deleted");
}

/** For tests/debug: every collection and meta name a ledger type can hold. */
export function storageMap(type) { return { collections: collectionsFor(type), meta: metaFor(type) }; }
