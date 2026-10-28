// The crop: one placement of chicks in one house, day 0 = placement day (design/15 §3, §4).
// Pure functions over a snapshot `data` (one array per collection) and an index built once.
import { addDays, daysBetween } from "./time.js";
import { datePart } from "./time.js";

const byDate = (a, b) => String(a.date || a.catchAt || "").localeCompare(String(b.date || b.catchAt || ""));
const live = (list) => (list || []).filter((r) => !r.deleted);
const group = (list, key) => { const m = new Map(); for (const r of live(list)) { const k = r[key]; if (!m.has(k)) m.set(k, []); m.get(k).push(r); } return m; };

/** Index the ledger: houses in name order, crops per house, per-crop records. */
export function indexBroilers(data) {
  const houses = live(data.houses).sort((a, b) => String(a.name).localeCompare(String(b.name), "en", { numeric: true }));
  const crops = live(data.crops).sort((a, b) => String(a.placedDate).localeCompare(String(b.placedDate)));
  const ix = {
    houses, crops, houseById: new Map(houses.map((h) => [h.id, h])), cropById: new Map(crops.map((c) => [c.id, c])),
    cropsByHouse: group(crops, "houseId"), checks: group(data.checks, "cropId"), thins: group(data.thins, "cropId"), weighs: group(data.weighs, "cropId"),
    salm: group(data.salmSamples, "cropId"), fci: group(data.fci, "cropId"), brooding: new Map(live(data.brooding).map((b) => [b.cropId, b])),
    energy: new Map(live(data.energy).map((e) => [e.cropId, e])), feed: group(data.feedDeliveries, "cropId"), meds: group(data.medicines, "cropId"),
    turnarounds: group(data.turnarounds, "houseId"),
  };
  for (const m of [ix.checks, ix.thins, ix.weighs, ix.salm, ix.fci, ix.feed, ix.meds]) for (const l of m.values()) l.sort(byDate);
  return ix;
}
export const listOf = (map, id) => map.get(id) || [];

export const cropDay = (crop, date) => daysBetween(crop.placedDate, date);
export const dateOfDay = (crop, day) => addDays(crop.placedDate, day);
export const legalLine = (ageDays) => 1 + 0.06 * ageDays; // % — Sch. 5 para 14
export const outOf = (c) => (+c.dead || 0) + cullTotal(c);
export const cullTotal = (c) => Object.values(c.culls || {}).reduce((t, v) => t + (+v || 0), 0);

/** Deaths (dead + culled) per date for a crop: Map date -> { dead, culled, total, checks[] } */
export function deathsByDate(ix, crop) {
  const m = new Map();
  for (const c of listOf(ix.checks, crop.id)) {
    const e = m.get(c.date) || { dead: 0, culled: 0, total: 0, checks: [] };
    e.dead += +c.dead || 0; e.culled += cullTotal(c); e.total = e.dead + e.culled; e.checks.push(c); m.set(c.date, e);
  }
  return m;
}
export const deathsOn = (ix, crop, date) => deathsByDate(ix, crop).get(date)?.total || 0;
export const doneThins = (ix, crop) => listOf(ix.thins, crop.id).filter((t) => t.status === "done");
/** Birds taken out in thins/clear on dates strictly before `date` (or on or before, with inclusive). */
export function thinnedBy(ix, crop, date, inclusive = false) {
  return doneThins(ix, crop).filter((t) => (inclusive ? datePart(t.catchAt) <= date : datePart(t.catchAt) < date)).reduce((s, t) => s + (+t.birds || 0), 0);
}
export function deathsBefore(ix, crop, date, inclusive = false) {
  let s = 0; for (const [d, e] of deathsByDate(ix, crop)) if (inclusive ? d <= date : d < date) s += e.total; return s;
}
/** Alive at the start of a day (placed − earlier deaths − earlier thins). */
export const aliveStart = (ix, crop, date) => Math.max(0, (+crop.placed || 0) - deathsBefore(ix, crop, date) - thinnedBy(ix, crop, date));
/** Alive at the end of a day. */
export const aliveEnd = (ix, crop, date) => Math.max(0, (+crop.placed || 0) - deathsBefore(ix, crop, date, true) - thinnedBy(ix, crop, date, true));
/** Daily mortality % = (dead + culled today) ÷ alive at the start of the day × 100 */
export function dailyMortPct(ix, crop, date) { const a = aliveStart(ix, crop, date); return a ? (deathsOn(ix, crop, date) / a) * 100 : 0; }
/** Cumulative mortality % = Σ(dead + culled) ÷ placed × 100 */
export function cumMortPct(ix, crop, date) { return +crop.placed ? (deathsBefore(ix, crop, date, true) / +crop.placed) * 100 : 0; }
/** 7-day mortality: deaths on days 0–7 ÷ placed. */
export function mort7Pct(ix, crop) { return cumMortPct(ix, crop, dateOfDay(crop, 7)); }
/** Average deaths a day over the n full days before `date`. */
export function avgDeaths(ix, crop, date, n = 3) {
  const days = []; for (let k = 1; k <= n; k++) { const d = addDays(date, -k); if (d >= crop.placedDate) days.push(deathsOn(ix, crop, d)); }
  return days.length ? days.reduce((a, b) => a + b, 0) / days.length : 0;
}

/**
 * Thin / clear events for a crop: recorded thins (planned or done) plus planned ones from the
 * crop plan that have no record yet. [{ id?, kind, day, date, birds, done, rec }]
 */
export function cropEvents(ix, crop, s) {
  const recs = listOf(ix.thins, crop.id);
  const out = recs.map((t) => ({ id: t.id, kind: t.kind, date: datePart(t.catchAt), day: cropDay(crop, datePart(t.catchAt)), birds: +t.birds || 0, done: t.status === "done", rec: t }));
  const plans = crop.plannedThins || (s ? [{ day: s.plannedThinDay, birds: null }] : []);
  for (const p of plans) if (p && p.day != null && !out.some((e) => e.kind === "thin" && Math.abs(e.day - p.day) <= 3)) out.push({ kind: "thin", day: +p.day, date: dateOfDay(crop, +p.day), birds: +p.birds || 0, done: false, virtual: true });
  const clearDay = crop.plannedClearDay ?? s?.plannedClearDay;
  if (!out.some((e) => e.kind === "clear") && clearDay != null) out.push({ kind: "clear", day: +clearDay, date: dateOfDay(crop, +clearDay), birds: null, done: false, virtual: true });
  return out.sort((a, b) => a.day - b.day || (a.kind === "clear") - (b.kind === "clear"));
}
export const clearEvent = (ix, crop, s) => cropEvents(ix, crop, s).find((e) => e.kind === "clear");
export const clearDayOf = (ix, crop, s) => clearEvent(ix, crop, s)?.day ?? s?.plannedClearDay ?? 38;
export const nextEvent = (ix, crop, s, date) => cropEvents(ix, crop, s).find((e) => !e.done && e.date >= date) || null;
export const isCleared = (crop) => !!crop.clearedDate;

/** The crop now in a house (placed, not cleared), else null. */
export function currentCrop(ix, houseId) {
  const l = listOf(ix.cropsByHouse, houseId).filter((c) => !isCleared(c));
  return l.length ? l[l.length - 1] : null;
}
export function lastCrop(ix, houseId) { const l = listOf(ix.cropsByHouse, houseId); return l.length ? l[l.length - 1] : null; }
/** Turnaround running for a house: the newest not closed. */
export function openTurnaround(ix, houseId) { return listOf(ix.turnarounds, houseId).filter((t) => !t.closedAt).sort((a, b) => String(a.clearedDate).localeCompare(String(b.clearedDate))).pop() || null; }

export const STAGES = { empty: "Empty", placement: "Placement due", brooding: "Brooding", growing: "Growing", thinning: "Thinning", clear: "Clear-out", turnaround: "Turnaround" };
/** House state for a date: { house, crop, stage, day, event, turnaround } */
export function houseState(ix, house, s, date) {
  const crop = currentCrop(ix, house.id);
  const ta = openTurnaround(ix, house.id);
  if (!crop) {
    if (ta) return { house, crop: null, stage: ta.nextPlacement && date >= addDays(ta.nextPlacement, -2) ? "placement" : "turnaround", day: null, turnaround: ta };
    return { house, crop: null, stage: "empty", day: null, turnaround: null };
  }
  const day = cropDay(crop, date);
  if (day < 0) return { house, crop, stage: "placement", day, turnaround: ta };
  const ev = cropEvents(ix, crop, s).find((e) => e.date === date && !e.done);
  if (ev) return { house, crop, stage: ev.kind === "clear" ? "clear" : "thinning", day, event: ev, turnaround: null };
  if (day <= 3) return { house, crop, stage: "brooding", day, turnaround: null };
  if (day >= clearDayOf(ix, crop, s)) return { house, crop, stage: "clear", day, turnaround: null };
  return { house, crop, stage: "growing", day, turnaround: null };
}
/** Crop number shown on the home ("Crop 41"): the highest `no` among current crops. */
export function cropNo(ix) { const cur = ix.houses.map((h) => currentCrop(ix, h.id)).filter(Boolean); const l = cur.length ? cur : ix.crops.slice(-1); return l.length ? Math.max(...l.map((c) => +c.no || 0)) || null : null; }
export function nextCropNo(ix, houseId) { const l = listOf(ix.cropsByHouse, houseId); return l.length ? Math.max(...l.map((c) => +c.no || 0)) + 1 : 1; }

/** Days the house stood empty before this crop (previous clear → this placement). */
export function daysEmptyBefore(ix, crop) {
  const prev = listOf(ix.cropsByHouse, crop.houseId).filter((c) => c.placedDate < crop.placedDate && c.clearedDate).pop();
  return prev ? daysBetween(prev.clearedDate, crop.placedDate) : null;
}
/** Water used on a date from meter readings (today's reading − the previous one), litres. */
export function waterOn(ix, crop, date) {
  const reads = listOf(ix.checks, crop.id).filter((c) => c.waterMeter !== "" && c.waterMeter != null && !Number.isNaN(+c.waterMeter)).map((c) => ({ date: c.date, slot: c.slot, v: +c.waterMeter }));
  const todays = reads.filter((r) => r.date === date).sort((a, b) => (a.slot === "pm") - (b.slot === "pm"))[0];
  const prev = reads.filter((r) => r.date < date).sort((a, b) => a.date.localeCompare(b.date) || (a.slot === "pm") - (b.slot === "pm")).pop();
  if (!todays || !prev) return null;
  const days = daysBetween(prev.date, date) || 1; const used = todays.v - prev.v;
  return used >= 0 ? used / days : null;
}
/** Water change vs the 3-day average, %, or null. */
export function waterChangePct(ix, crop, date) {
  const t = waterOn(ix, crop, date); if (t == null) return null;
  const prev = [1, 2, 3].map((k) => waterOn(ix, crop, addDays(date, -k))).filter((v) => v != null);
  if (!prev.length) return null; const avg = prev.reduce((a, b) => a + b, 0) / prev.length;
  return avg ? ((t - avg) / avg) * 100 : null;
}
