// Weight against the breed objective, sample-weigh statistics and the projection
// (design/15 §6.1; Research C tool 2 — the projection method is an estimate and says so).
import { standardById } from "./content.js";
import { listOf, cropDay } from "./crop.js";

/** Interpolated value of a standard column at day d (fractional days allowed). */
export function stdAt(std, d, key = "wtG") {
  const rows = std.days.filter((r) => r[key] != null);
  if (!rows.length) return null;
  if (d <= rows[0].d) return rows[0][key];
  for (let i = 1; i < rows.length; i++) if (d <= rows[i].d) { const a = rows[i - 1], b = rows[i]; return a[key] + ((b[key] - a[key]) * (d - a.d)) / (b.d - a.d); }
  const a = rows[rows.length - 2], b = rows[rows.length - 1]; return b[key] + ((b[key] - a[key]) * (d - b.d)) / (b.d - a.d);
}
export const stdWt = (std, d) => stdAt(std, d, "wtG");
export const stdGain = (std, d) => stdWt(std, d + 1) - stdWt(std, d);
export const stdFcr = (std, d) => stdAt(std, d, "cumFcr");
export const stdFeed = (std, d) => stdAt(std, d, "feedG");
export const stdOf = (crop, s) => standardById(crop?.breedStdId || s?.breedStdId);

/** Sample statistics. weights: grams. Returns { n, mean, sd, cv, uniformity } (uniformity = % within ±10% of mean). */
export function weighStats(w) {
  if (w && !Array.isArray(w) && w.n) { const n = +w.n; const mean = n ? (+w.totalKg * 1000) / n : null; return { n, mean, sd: null, cv: null, uniformity: null }; }
  const xs = (w || []).map(Number).filter((x) => x > 0);
  if (!xs.length) return { n: 0, mean: null, sd: null, cv: null, uniformity: null };
  const n = xs.length; const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(xs.reduce((t, x) => t + (x - mean) ** 2, 0) / (n - 1)) : 0;
  const uni = (xs.filter((x) => Math.abs(x - mean) <= mean * 0.1).length / n) * 100;
  return { n, mean, sd, cv: mean ? (sd / mean) * 100 : null, uniformity: uni };
}
/** Weigh sessions for a crop with their stats and day, oldest first; only up to `date` if given. */
export function weighSessions(ix, crop, date) {
  return listOf(ix.weighs, crop.id).filter((w) => !date || w.date <= date).map((w) => ({ ...w, day: w.day ?? cropDay(crop, w.date), ...(w.mean ? { mean: +w.mean } : weighStats(w.weights?.length ? w.weights : w.bulk)) })).filter((w) => w.mean > 0).sort((a, b) => a.day - b.day);
}
/**
 * Performance ratio: actual ÷ standard gain between the last two weighs 3–8 days apart, else
 * the last weigh ÷ the standard weight that day. { base: {day, mean} | null, ratio, method }
 */
export function performance(ix, crop, std, date) {
  const ws = weighSessions(ix, crop, date);
  if (!ws.length) return { base: null, ratio: 1, method: "standard" };
  const w2 = ws[ws.length - 1];
  const w1 = [...ws].reverse().find((w) => w2.day - w.day >= 3 && w2.day - w.day <= 8);
  if (w1) { const sg = stdWt(std, w2.day) - stdWt(std, w1.day); if (sg > 0) return { base: w2, ratio: (w2.mean - w1.mean) / sg, method: "gain" }; }
  return { base: w2, ratio: w2.mean / stdWt(std, w2.day), method: "weight" };
}
/** Estimated weight (g) at crop day `d`, from the weighs known on `asOf`. */
export function estWeight(ix, crop, std, d, asOf) {
  const p = performance(ix, crop, std, asOf);
  if (!p.base) return stdWt(std, d);
  if (d <= p.base.day) return (p.base.mean / stdWt(std, p.base.day)) * stdWt(std, d);
  let w = p.base.mean; for (let k = p.base.day; k < d; k++) w += stdGain(std, k) * p.ratio; return w;
}
/** % above (+) / below (−) the objective at day d. */
export function vsStdPct(ix, crop, std, d, asOf) { const e = estWeight(ix, crop, std, d, asOf); const st = stdWt(std, d); return st ? (e / st - 1) * 100 : 0; }
/** Days in a row (ending today) the estimate has been more than pct under the objective. */
export function daysUnder(ix, crop, std, today, pct, max = 10) {
  let n = 0;
  for (let k = 0; k < max; k++) {
    const date = new Date(Date.parse(today + "T12:00:00Z") - k * 864e5).toISOString().slice(0, 10);
    const d = cropDay(crop, date); if (d < 0) break;
    if (!weighSessions(ix, crop, date).length) break;
    if (vsStdPct(ix, crop, std, d, date) < -pct) n++; else break;
  }
  return n;
}
/** Water:feed ratio for a day (L per kg). Normal 1.6–2.0 (guidance). */
export const waterFeedRatio = (waterL, feedKg) => (waterL && feedKg ? waterL / feedKg : null);
