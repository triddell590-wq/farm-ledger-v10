// Scanning groups and the late-pregnancy meal planner (design/11 §3.3, §8).
// Each litter size is fed for `weeks` weeks before lambing, rising in equal steps from 0.2 kg
// to `peak` kg per ewe per day (guide figures based on DAERA/AHDB tables; editable in Targets).
import { addDays } from "../../../core/dates.js";

/** kg/ewe/day for each week before lambing (index 0 = the first fed week). */
export function mealCurve({ weeks, peak }) {
  const w = Math.max(0, Math.round(+weeks || 0)); if (!w) return [];
  if (w === 1) return [+peak];
  const start = Math.min(0.2, +peak);
  return Array.from({ length: w }, (_, i) => Math.round((start + ((+peak - start) * i) / (w - 1)) * 100) / 100);
}
/**
 * groups: { single, twin, triplet } ewe counts. Returns { start, totalKg, tonnes, cost, rows[{week, from, kg (per day all ewes)}], perGroup }.
 */
export function mealPlan(groups, lambFrom, s) {
  const plan = s.meal || {}; const maxW = Math.max(...["single", "twin", "triplet"].map((k) => +plan[k]?.weeks || 0));
  const rows = []; let total = 0; const perGroup = {};
  for (let i = 0; i < maxW; i++) {
    const from = addDays(lambFrom, -7 * (maxW - i)); let day = 0;
    for (const k of ["single", "twin", "triplet"]) {
      const c = mealCurve(plan[k] || {}); const off = maxW - c.length; const kg = i >= off ? c[i - off] : 0;
      const n = +groups[k] || 0; day += kg * n; perGroup[k] = (perGroup[k] || 0) + kg * n * 7;
    }
    rows.push({ week: i + 1, weeksToLambing: maxW - i, from, kgPerDay: Math.round(day * 10) / 10 }); total += day * 7;
  }
  const first = rows.find((r) => r.kgPerDay > 0);
  const tonnes = Math.round((total / 1000) * 10) / 10;
  return { start: first ? first.from : null, totalKg: Math.round(total), tonnes, cost: Math.round((total / 1000) * (+s.mealPrice || 0)), rows, perGroup };
}
/** Feeding groups from a scan tally: names the farmer can change when splitting the mob. */
export function feedingGroups(t) {
  return [["single", "Singles"], ["twin", "Twins"], ["triplet", "Triplets"], ["empty", "Empty"]].filter(([k]) => t[k] > 0).map(([k, name]) => ({ key: k, name, n: t[k] }));
}
/** BCS histogram → % within target band. counts: { "2": 4, "2.5": 20, ... } */
export function bcsSummary(counts, target) {
  let n = 0, on = 0, thin = 0, sum = 0;
  for (const [k, v] of Object.entries(counts || {})) { const sc = +k, c = +v || 0; n += c; sum += sc * c; if (target && sc >= target[0] && sc <= target[1]) on += c; if (target && sc < target[0]) thin += c; }
  return { n, avg: n ? Math.round((sum / n) * 10) / 10 : null, onPct: n ? Math.round((on / n) * 100) : 0, thin };
}
export const BCS_SCORES = [1.5, 2, 2.5, 3, 3.5, 4, 4.5];
