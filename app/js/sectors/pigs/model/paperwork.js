// Pigs paperwork (design/13 §8): PM1 movement book, PM2 holding register (counts, not animals),
// QVR 20-week countdown, eMB-Pigs quarterly export, the 1 June inventory and periodic checks.
import { addDays, daysBetween } from "./dates.js";
import { regionRule } from "../../../content/region-rules.js";

export const CATEGORIES = [["weaners", "Weaners"], ["growers", "Growers"], ["finishers", "Finishers"], ["gilts", "Gilts"], ["sows", "Sows"], ["boars", "Boars"], ["culls", "Culls"]];
export const CAT_NAME = Object.fromEntries(CATEGORIES);
// NI: notify moves off on NIFAIS within 7 days (no NI pre-notification found). Read from the shared
// region rules ("pigMovement" asked of the Coordinator 2026-10-20); 7 until that record exists.
export const notifyDays = (region = "NI") => regionRule("pigMovement", region)?.notifyDays ?? 7;
export const NOTIFY_DAYS = notifyDays();
/** Market standstill (design/13 §20): a pig that went through a market can't go to one again for N days. */
export function standstill(moves, batchId, date, region = "NI") {
  const days = regionRule("marketStandstill", region)?.days; if (!days || !batchId) return null;
  const m = moves.filter((x) => x.batchId === batchId && x.direction === "on" && x.fromMarket && x.date <= date && daysBetween(x.date, date) < days).sort((a, b) => b.date.localeCompare(a.date))[0];
  return m ? { market: m.fromName || "market", date: m.date, until: addDays(m.date, days), days } : null;
}

/** Movement notification state (design/13 §11): due from day 5, late after day 7. */
export function notifyState(m, today) {
  if (m.direction !== "off" || m.notified) return { level: "ok", by: null };
  const by = addDays(m.date, NOTIFY_DAYS); const d = daysBetween(m.date, today);
  return { by, level: d > NOTIFY_DAYS ? "late" : d >= 5 ? "due" : "info", days: d };
}
export const PM1_HEADERS = ["Date", "On/off", "Number", "Category", "From (holding code, name)", "To (holding code / abattoir)", "ID mark", "Haulier · auth. no. · vehicle", "FCI", "Feed withdrawn", "Notified"];
export function pm1Rows(moves) {
  return [...moves].sort((a, b) => b.date.localeCompare(a.date)).map((m) => [
    m.date, m.direction === "on" ? "On" : "Off", m.n, CAT_NAME[m.category] || m.category || "",
    [m.fromCode, m.fromName].filter(Boolean).join(" "), [m.toCode, m.toName].filter(Boolean).join(" "),
    [m.markType, m.mark].filter(Boolean).join(": "), [m.haulier, m.haulierAuth, m.vehicle].filter(Boolean).join(" · "),
    m.direction === "off" && m.toSlaughter ? (m.fci?.withdrawals ? "Withdrawals observed" : "NOT declared") : "", m.feedWithdrawnAt ? m.feedWithdrawnAt.replace("T", " ") : "", m.notified || "",
  ]);
}

/**
 * PM2 month (design/13 §8.3): opening + born + on − off − died = closing, per month, all pigs.
 * Category breakdowns are shown, but the balance is on the total (pigs change category as they grow).
 * counted = the number the farmer counted at month end (optional). Balances when equal or explained.
 */
export function pm2Month(month, { litters, moves, deaths }, opening, counted = null, note = "") {
  const inM = (d) => d && d.slice(0, 7) === month;
  const born = litters.filter((l) => inM(l.farrowedAt)).reduce((t, l) => t + (+l.bornAlive || 0), 0);
  const on = moves.filter((m) => m.direction === "on" && inM(m.date)).reduce((t, m) => t + (+m.n || 0), 0);
  const off = moves.filter((m) => m.direction === "off" && inM(m.date)).reduce((t, m) => t + (+m.n || 0), 0);
  const pigletDeaths = litters.reduce((t, l) => t + (l.deaths || []).filter((d) => inM(d.date)).reduce((s, d) => s + (+d.n || 0), 0), 0);
  const died = deaths.filter((d) => inM(d.date)).reduce((t, d) => t + (+d.n || 0), 0) + pigletDeaths;
  const closing = opening + born + on - off - died;
  const diff = counted == null || counted === "" ? null : +counted - closing;
  return { month, opening, born, on, off, died, closing, counted: counted === "" ? null : counted, diff, balanced: diff === 0 || (diff != null && !!note), note };
}

// ---- QVR (Red Tractor AH.10.1: every quarter, never more than 20 weeks apart) ----
export function qvrState(visits, today) {
  const q = visits.filter((v) => v.type !== "other").sort((a, b) => a.date.localeCompare(b.date));
  const last = q[q.length - 1] || null;
  if (!last) return { last: null, weeks: null, nextBy: today, level: "late", pct: 1 };
  const weeks = Math.floor(daysBetween(last.date, today) / 7); const nextBy = addDays(last.date, 140);
  return { last, weeks, nextBy, level: weeks >= 20 ? "late" : weeks >= 16 ? "due" : "ok", pct: Math.min(1, daysBetween(last.date, today) / 140) };
}

// ---- eMB-Pigs (antibiotic use uploaded quarterly, within 6 weeks of quarter end) ----
export function quarterOf(iso) { const y = +iso.slice(0, 4), m = +iso.slice(5, 7); const q = Math.ceil(m / 3); const endM = q * 3; const end = `${y}-${String(endM).padStart(2, "0")}-${String(new Date(Date.UTC(y, endM, 0)).getUTCDate()).padStart(2, "0")}`; return { y, q, start: `${y}-${String(endM - 2).padStart(2, "0")}-01`, end, due: addDays(end, 42), label: `Q${q} ${y}` }; }
/** The quarter whose upload is due next (the previous quarter until its 6-week window passes). */
export function embDue(today, uploads = []) {
  const cur = quarterOf(today); const prev = quarterOf(addDays(cur.start, -1));
  const done = (q) => uploads.some((u) => u.quarter === q.label);
  if (!done(prev) && today <= prev.due) return { ...prev, level: daysBetween(today, prev.due) <= 14 ? "due" : "info", done: false };
  if (!done(prev) && today > prev.due) return { ...prev, level: "late", done: false };
  return { ...cur, level: "ok", done: done(cur) };
}
/** eMB rows for a quarter: antibiotic medicine records grouped by product. */
export function embRows(medicines, q) {
  const m = new Map();
  for (const r of medicines.filter((x) => x.antibiotic && x.date >= q.start && x.date <= q.end)) {
    const k = r.productName || "?";
    const row = m.get(k) || { product: k, active: r.activeIngredient || "", unit: r.quantityUnit || "", qty: 0, pigs: 0, batches: new Set(), routes: new Set(), mg: 0, mgKnown: true };
    row.qty += +r.quantity || 0; row.pigs += +r.pigs || 0; if (r.batchName) row.batches.add(r.batchName); if (r.route) row.routes.add(r.route);
    if (r.activeMgPerUnit) row.mg += (+r.quantity || 0) * +r.activeMgPerUnit; else row.mgKnown = false;
    m.set(k, row);
  }
  return [...m.values()].map((r) => ({ ...r, batches: [...r.batches].join(" "), routes: [...r.routes].join(", ") }));
}
export const EMB_HEADERS = ["Product", "Active ingredient", "Quantity", "Unit", "Pigs treated", "Batches", "Route"];

// ---- 1 June pig inventory (NISRA survey, one return per herd / establishment number) ----
export function inventoryDue(today, region = "NI") {
  const md = regionRule("inventories", region)?.pigsAndBirdsOn || "06-01";
  const y = +today.slice(0, 4); let date = `${y}-${md}`; if (today > addDays(date, 29)) date = `${y + 1}-${md}`;
  const remind = addDays(date, -7);
  return { date, remind, level: today >= remind && today <= addDays(date, 29) ? "due" : "info" };
}

// ---- periodic checks: vermin (quarterly, VC.1), water test (yearly, FW.3 non-mains) ----
export const CHECK_KINDS = { vermin: { label: "Vermin survey", every: 91, legal: false }, water: { label: "Water test (TVC + coliforms)", every: 365, legal: false }, tailRisk: { label: "Tail-biting risk assessment", every: 365, legal: false } };
export function checkState(checks, kind, today) {
  const last = checks.filter((c) => c.kind === kind).sort((a, b) => a.date.localeCompare(b.date)).pop() || null;
  const every = CHECK_KINDS[kind].every;
  if (!last) return { last: null, due: today, level: "due" };
  const due = addDays(last.date, every); const d = daysBetween(today, due);
  return { last, due, level: d < 0 ? "late" : d <= 14 ? "due" : "ok" };
}
export const PLANS = [["health", "Veterinary health plan (incl. Salmonella control)"], ["tailBiting", "Tail-biting risk assessment and action plan"], ["emergency", "Emergency plan"], ["weather", "Extreme weather plan"], ["biosecurity", "Biosecurity policy"], ["trichinella", "Trichinella controlled-housing status"]];
