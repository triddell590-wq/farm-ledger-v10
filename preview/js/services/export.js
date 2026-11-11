// Data export (UK GDPR: people can take their data away). JSON for everything; CSV per collection.
import { store } from "../core/store.js";
import { auth } from "../core/auth.js";
import { canRead } from "../core/policy.js";
import { collectionsFor, metaFor } from "../sectors/registry.js";
import { listMine } from "./ledgers.js";
import { listMembers } from "./members.js";
import { listPhotos, imageBytes } from "./photos.js";
import { photoFileName, moneyFilterFor } from "./photo-codec.js";
import { myNotifyData } from "./devices.js";

/** Everything I may read in one ledger: { ledger, members, collections: {name: [...]}, meta: {name: {...}} } */
export async function exportLedger(ledger, role = ledger.role) {
  const out = { ledger: { ...ledger }, members: [], collections: {}, meta: {} };
  delete out.ledger.role;
  out.members = (await listMembers(ledger.id)).map(({ uid, role: r, displayName, email, addedAt }) => ({ uid, role: r, displayName, email, addedAt }));
  for (const c of collectionsFor(ledger.type)) {
    if (c === "photos") { // photos follow their record's visibility; the image files come from photoFiles()
      if (moneyFilterFor(role) === "none") continue;
      try { out.collections.photos = (await listPhotos(ledger.id, role)).map(({ thumb, ...p }) => ({ ...p, file: `photos/${photoFileName(p)}` })); } catch (e) { out.collections.photos = { error: e.code || e.message }; }
      continue;
    }
    if (!canRead(role, c)) continue;
    try { out.collections[c] = await store.query(`ledgers/${ledger.id}/${c}`); } catch (e) { out.collections[c] = { error: e.code || e.message }; }
  }
  if (canRead(role, "meta")) for (const m of metaFor(ledger.type)) {
    try { const d = await store.get(`ledgers/${ledger.id}/meta/${m}`); if (d) out.meta[m] = d; } catch (e) { /* not allowed */ }
  }
  return out;
}

/** Everything about me: profile + every ledger I can see. */
export async function exportAccount() {
  const u = auth.user;
  const profile = await store.get(`users/${u.uid}`);
  const ledgers = await listMine();
  const data = [];
  for (const l of ledgers) data.push(await exportLedger(l));
  const notifications = await myNotifyData(u.uid).catch(() => null); // phones signed up for notifications + log
  return { exportedAt: new Date().toISOString(), app: "Farm Ledger 10", account: { uid: u.uid, email: u.email, displayName: u.displayName }, profile, notifications, ledgers: data };
}

function cell(v) {
  if (v == null) return "";
  if (v instanceof Date) v = v.toISOString();
  else if (typeof v === "object") v = JSON.stringify(v);
  v = String(v);
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
/** Records -> CSV. Columns: `columns` if given ([key, heading] pairs), else every key seen (history left out). */
export function toCSV(records, columns) {
  if (!columns) {
    const keys = new Set(); records.forEach((r) => Object.keys(r).forEach((k) => k !== "history" && keys.add(k)));
    columns = [...keys].map((k) => [k, k]);
  }
  const lines = [columns.map(([, h]) => cell(h)).join(",")];
  for (const r of records) lines.push(columns.map(([k]) => cell(typeof k === "function" ? k(r) : r[k])).join(","));
  return lines.join("\r\n");
}
export function jsonText(obj) { return JSON.stringify(obj, null, 2); }

/** The photo images of an exported ledger: [{ name: "photos/<file>.jpg", bytes, photo }]. Skips any that won't load. */
export async function photoFiles(exported) {
  const list = Array.isArray(exported.collections.photos) ? exported.collections.photos : [];
  const out = [];
  for (const p of list) {
    try { out.push({ name: p.file, bytes: await imageBytes(exported.ledger.id, p), photo: p }); } catch (e) { /* not reachable offline: listed in photos.csv still */ }
  }
  return out;
}
