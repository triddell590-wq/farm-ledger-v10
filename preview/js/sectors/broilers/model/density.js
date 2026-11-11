// Stocking density projector and thinning planner (design/15 §6.2) with the legal tiers of
// Sch. 5 paras 12–14 and the Red Tractor 38 kg/m² planned maximum.
import { regionRule } from "./content.js";
import { aliveEnd, avgDeaths, cropDay, dateOfDay, cropEvents, clearDayOf, listOf, cumMortPct } from "./crop.js";
import { estWeight, stdOf } from "./growth.js";
import { workingDaysBefore, addDays } from "./time.js";

export const densityOf = (alive, wtG, area) => (area ? (alive * wtG) / 1000 / area : 0);

/** Farm limit: the farm setting (default 38), never above the legal maximum. */
export function farmLimit(s, crop) { const R = regionRule("broilerDensity"); return Math.min(+(crop?.farmLimitKgM2 || s.farmLimitKgM2 || 38), R.legalMax); }
/** Tier of a density: none (≤33), notify (33–39), approval (39–42), over (>42). */
export function tierOf(kg) { const R = regionRule("broilerDensity"); return kg > R.legalMax ? "over" : kg > R.approvalAbove ? "approval" : kg > R.notifyAbove ? "notify" : "none"; }

/**
 * Day-by-day projection from today to the clear-out day.
 * opts.thins: [{ day, birds }] future thins to apply (default: the crop's planned, not-done thins).
 * Returns [{ day, date, alive, wtG, kg }] (kg = kg/m²). Days before today use actual alive counts.
 */
export function projection(ix, crop, s, area, today, opts = {}) {
  const std = stdOf(crop, s); const tday = cropDay(crop, today); const end = opts.toDay ?? clearDayOf(ix, crop, s);
  const perDay = avgDeaths(ix, crop, today, 3);
  const thins = opts.thins ?? cropEvents(ix, crop, s).filter((e) => e.kind === "thin" && !e.done && e.day >= tday).map((e) => ({ day: e.day, birds: e.birds || (e.virtual ? Math.round(((+crop.placed || 0) * (+s?.plannedThinBirdsPct || 0)) / 100) : 0) })); // a planned thin with no number yet takes the usual share (setting)
  const startAlive = aliveEnd(ix, crop, addDays(today, -1));
  const out = [];
  for (let d = 0; d <= end; d++) {
    const date = dateOfDay(crop, d); let alive;
    if (d < tday) alive = aliveEnd(ix, crop, date);
    else alive = Math.max(0, Math.round(startAlive - perDay * (d - tday + 1) - thins.filter((t) => t.day <= d).reduce((a, t) => a + (+t.birds || 0), 0)));
    const wtG = estWeight(ix, crop, std, d, today);
    out.push({ day: d, date, alive, wtG, kg: densityOf(alive, wtG, area) });
  }
  return out;
}
/** First day (today or later) the projection without any future thins goes over `limit`. */
export function crossDay(ix, crop, s, area, today, limit) {
  const p = projection(ix, crop, s, area, today, { thins: [] }); const t = cropDay(crop, today);
  return p.find((x) => x.day >= t && x.kg > limit)?.day ?? null;
}
/** birdsToThin = alive(clearDay) − limit × area ÷ projectedWt(clearDay), rounded up to the module size. */
export function birdsToThin({ aliveAtClear, wtAtClearG, limit, area, module = 100 }) {
  const raw = aliveAtClear - (limit * area) / (wtAtClearG / 1000);
  if (raw <= 0) return 0; const m = Math.max(1, +module || 1); return Math.ceil(raw / m) * m;
}
/** Thin plan for a chosen thin day: { toThin, atClear, crossDay, clearDay } */
export function thinPlan(ix, crop, s, area, today, thinDay) {
  const limit = farmLimit(s, crop); const clearDay = clearDayOf(ix, crop, s);
  const p0 = projection(ix, crop, s, area, today, { thins: [] }); const c = p0[clearDay];
  const toThin = c ? birdsToThin({ aliveAtClear: c.alive, wtAtClearG: c.wtG, limit, area, module: s.moduleSize }) : 0;
  const p1 = projection(ix, crop, s, area, today, { thins: [{ day: thinDay, birds: toThin }] });
  const maxBefore = Math.max(0, ...p0.filter((x) => x.day < thinDay && x.day >= cropDay(crop, today)).map((x) => x.kg));
  return { limit, clearDay, toThin, atClear: p1[clearDay]?.kg ?? 0, cross: crossDay(ix, crop, s, area, today, limit), maxBeforeThin: maxBefore, overBeforeThin: maxBefore > limit, proj: p1 };
}
/** Highest planned density of the crop (with planned thins). */
export function plannedMax(ix, crop, s, area, today) { return Math.max(0, ...projection(ix, crop, s, area, today).map((x) => x.kg)); }

/**
 * What the law needs for a crop's planned density (Sch. 5 paras 12–14):
 * { tier, notifyBy, notified, notifyOk, needsApproval, approvalRef, sevenCrops{ok, rows} }
 */
export function densityNeeds(ix, crop, s, maxKg) {
  const R = regionRule("broilerDensity"); const tier = tierOf(maxKg);
  const notifyBy = workingDaysBefore(crop.placedDate, R.notifyWorkingDays);
  const out = { tier, maxKg, notifyBy, notified: crop.notifiedDaera || null, notifyOk: true, needsApproval: tier === "approval" || tier === "over", approvalRef: crop.approvalRef || null, over: tier === "over" };
  if (tier !== "none") out.notifyOk = !!crop.notifiedDaera && crop.notifiedDaera <= notifyBy;
  if (out.needsApproval) out.sevenCrops = sevenCropRecord(ix, crop, s, R.approvalCrops);
  return out;
}
/** The 7 earlier crops in this house: cumulative mortality vs 1% + 0.06% × age, all must be under. */
export function sevenCropRecord(ix, crop, s, n = 7) {
  const prev = listOf(ix.cropsByHouse, crop.houseId).filter((c) => c.clearedDate && c.placedDate < crop.placedDate).slice(-n);
  const rows = prev.map((c) => { const age = cropDay(c, c.clearedDate); const cum = cumMortPct(ix, c, c.clearedDate); const line = 1 + 0.06 * age; return { crop: c, age, cum, line, ok: cum < line }; });
  return { rows, ok: rows.length >= n && rows.every((r) => r.ok), count: rows.length };
}
