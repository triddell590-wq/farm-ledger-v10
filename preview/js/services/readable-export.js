// "Records for inspection or your accountant" (review A #10): the same records as the full
// backup, but as spreadsheets a person can read — one CSV per register with plain headings
// ("Date", "Animal", "Product", "Amount (£)"), group/mob/house names instead of ids, dates as
// dd/mm/yyyy, money as £1,234.00, nothing nested as JSON, deleted records left out.
// Pure: no DOM, no store (the export screen passes what services/export.js read).
import { makeLookup, fieldsOf, fieldLabel, recordTitle, collHeading, REF_KEYS, pounds } from "../content/record-kinds.js";
import { toCSV } from "./export.js";

const isDay = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isDayTime = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v);
/** 2026-11-02 -> 02/11/2026 */
export const ukDate = (iso) => { const [y, m, d] = String(iso).slice(0, 10).split("-"); return `${d}/${m}/${y}`; };
const MONEY = /^(amount|gross|net|total|price\w*|cost\w*|value|pulletCost|deductions)$/;
// Bookkeeping, settings docs and the app's own working files are not registers.
const SKIP = new Set(["photos", "tasks", "imports", "events"]);
// Registers first, in the order an inspector or accountant asks for them.
const FIRST = ["animals", "sows", "mobs", "sheep", "houses", "flocks", "crops", "medicines", "medProducts", "purchases", "movements", "moves", "birdMoves", "deaths", "sales", "finance"];

/** One cell, readable. */
export function readable(key, v, L) {
  if (v == null || v === "") return "";
  if (v instanceof Date) return `${ukDate(v.toISOString())} ${v.toTimeString().slice(0, 5)}`;
  if (v && typeof v.toDate === "function") return readable(key, v.toDate(), L);
  if (REF_KEYS[key]) { const kind = REF_KEYS[key]; return (kind === "animal" ? L.animal(v) : L[kind] ? L[kind](v) : "") || ""; }
  if (["animalIds", "femaleIds", "calfIds"].includes(key) && Array.isArray(v)) return v.map((id) => L.animal(id)).filter(Boolean).join("; ");
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return MONEY.test(key) ? pounds(v) : String(v);
  if (isDayTime(v)) return `${ukDate(v)} ${v.slice(11, 16)}`;
  if (isDay(v)) return ukDate(v);
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === "object" ? flat(x, L) : readable(key, x, L))).filter(Boolean).join("; ");
  if (typeof v === "object") return flat(v, L);
  return String(v);
}
/** { liveKg: 520, price: 1480, animalId } -> "Animal: 0412 Daisy, Live weight (kg): 520, Price: £1,480.00" */
function flat(o, L) {
  return Object.entries(o).filter(([k, v]) => v != null && v !== "" && !/^(id|createdAt|updatedAt|createdBy|updatedBy|history)$/.test(k))
    .map(([k, v]) => `${fieldLabel(k)}: ${readable(k, v, L)}`).filter((s) => !/: $/.test(s)).join(", ");
}

/**
 * exported: { ledger: { name, type }, members, collections: { coll: records[] } } (services/export.js).
 * -> [{ name: "<folder>/<Register>.csv", text, rows }] — empty registers left out.
 */
export function readableFiles(exported, folder = slug(exported.ledger.name || exported.ledger.type)) {
  const type = exported.ledger.type;
  const cols = exported.collections || {};
  const all = {}; for (const [c, list] of Object.entries(cols)) if (Array.isArray(list)) all[c] = list;
  const L = makeLookup(type, all);
  const order = Object.keys(all).filter((c) => !SKIP.has(c)).sort((a, b) => (FIRST.indexOf(a) + 1 || 99) - (FIRST.indexOf(b) + 1 || 99) || collHeading(a).localeCompare(collHeading(b)));
  const files = [];
  for (const c of order) {
    const list = all[c].filter((r) => !r.deleted && !(c === "finance" && (r.kind === "prices" || r.kind === "settings")));
    if (!list.length) continue;
    // columns: what it is, then every field any record has, in fieldsOf's order, by label
    const keys = []; const labels = new Map();
    for (const r of list) for (const f of fieldsOf(type, c, r, L)) if (!labels.has(f.key)) { keys.push(f.key); labels.set(f.key, f.label); }
    const used = new Map(); // two keys with the same label ("Product") get "Product (2)"
    const columns = [[(r) => recordTitle(type, c, r, L), "Record"], ...keys.map((k) => {
      let h = labels.get(k); const n = (used.get(h) || 0) + 1; used.set(h, n); if (n > 1) h = `${h} (${n})`;
      return [(r) => readable(k, r[k], L), h];
    }), [(r) => r.createdAt ? readable("createdAt", r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt), L) : "", "Entered"]];
    const rows = [...list].sort((a, b) => String(a.date || a.dob || "").localeCompare(String(b.date || b.dob || "")));
    files.push({ name: `${folder}/${collHeading(c)}.csv`, text: "﻿" + toCSV(rows, columns), rows: rows.length });
  }
  const people = (exported.members || []).map((m) => ({ Name: m.displayName || "", Email: m.email || "", Role: ROLE[m.role] || m.role || "" }));
  if (people.length) files.push({ name: `${folder}/People.csv`, text: "﻿" + toCSV(people, [["Name", "Name"], ["Email", "Email"], ["Role", "Role"]]), rows: people.length });
  return files;
}
const ROLE = { owner: "Owner", manager: "Manager", worker: "Worker", viewer: "Vet / Adviser", accountant: "Accountant" };
export const slug = (s) => String(s || "").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "Records";

/** A short note that goes in the zip. */
export function readMe(farmName, day) {
  return `Farm records — ${farmName || "your farm"}\r\nDownloaded from Farm Ledger on ${ukDate(day)}.\r\n\r\nOne spreadsheet (CSV) per register, in a folder for each herd, flock or poultry unit. They open in Excel, Numbers or Google Sheets.\r\nDates are day/month/year. Money is in pounds. Records that were deleted are left out.\r\nFor a complete copy of everything, exactly as stored, choose "Full backup" instead.\r\n`;
}
