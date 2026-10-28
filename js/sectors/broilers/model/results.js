// Crop results at clear-out (design/15 §9.1): liveability, average weight, age, FCR, EPEF;
// payment estimate from the farmer's own contract profile (§9.2); energy per crop (§9.3).
import { listOf, doneThins, cropDay, mort7Pct, cumMortPct, daysEmptyBefore } from "./crop.js";
import { datePart } from "./time.js";

/** EPEF = liveability % × average weight kg ÷ (age days × FCR) × 100 */
export function epef({ liveability, avgKg, ageDays, fcr }) { return liveability && avgKg && ageDays && fcr ? (liveability * avgKg) / (ageDays * fcr) * 100 : null; }

/** Totals from thins/clear (docket figures win over the field entry). */
export function soldTotals(ix, crop) {
  let birds = 0, kg = 0, ageW = 0, doa = 0, rejKg = 0, rejN = 0, fp = [], hock = [];
  for (const t of doneThins(ix, crop)) {
    const d = t.docket || {}; const n = +d.received || +t.birds || 0; const k = +d.kg || n * (+t.avgKg || 0);
    birds += n; kg += k; ageW += n * cropDay(crop, datePart(t.catchAt)); doa += +d.doa || 0;
    if (d.rejPct !== "" && d.rejPct != null) { rejKg += (+d.rejPct || 0) * n; rejN += n; }
    if (d.footpad !== "" && d.footpad != null) fp.push(+d.footpad); if (d.hockPct !== "" && d.hockPct != null) hock.push(+d.hockPct);
  }
  return { birds, kg, ageDays: birds ? ageW / birds : null, doa, doaPct: birds ? (doa / birds) * 100 : null, rejPct: rejN ? rejKg / rejN : null, footpad: fp.length ? fp.reduce((a, b) => a + b, 0) / fp.length : null, hockPct: hock.length ? hock.reduce((a, b) => a + b, 0) / hock.length : null };
}
/** Feed used: delivered − returned / left in bins (kg). Integrator-owned: no price. */
export function feedUsedKg(ix, crop) { return listOf(ix.feed, crop.id).reduce((t, f) => t + (f.kind === "return" ? -(+f.kg || 0) : +f.kg || 0), 0) - (+crop.feedLeftKg || 0); }

/** Full results for a crop (calculated; stored on the crop at clear-out as a snapshot). */
export function cropResults(ix, crop) {
  const t = soldTotals(ix, crop); const placed = +crop.placed || 0;
  const liveability = placed ? (t.birds / placed) * 100 : null;
  const avgKg = t.birds ? t.kg / t.birds : null;
  const feed = feedUsedKg(ix, crop); const fcr = t.kg && feed > 0 ? feed / t.kg : null;
  const endDate = crop.clearedDate || null;
  return {
    placed, sold: t.birds, kg: t.kg, liveability, avgKg, ageDays: t.ageDays, fcr, feedKg: feed,
    epef: epef({ liveability, avgKg, ageDays: t.ageDays, fcr }), mort7: mort7Pct(ix, crop), cumMort: endDate ? cumMortPct(ix, crop, endDate) : null,
    doaPct: t.doaPct, rejPct: t.rejPct, footpad: t.footpad, hockPct: t.hockPct, daysEmpty: daysEmptyBefore(ix, crop),
  };
}

/**
 * Payment estimate from the contract profile (money: finance-only record).
 * profile: { basis: bird|kg|m2, rate, bonusRows[{ metric: fcr|mortality|rejects|footpad|epef|avgKg, op: '<'|'>', value, amount, per: bird|kg|crop }] }
 * r: results-like { sold, kg, fcr, cumMort, rejPct, footpad, epef, avgKg }, area: m²
 */
export function paymentEstimate(profile, r, area = 0) {
  if (!profile || profile.rate == null || profile.rate === "") return null;
  const qty = { bird: r.sold || 0, kg: r.kg || 0, m2: area || 0 };
  const base = (+profile.rate || 0) * (qty[profile.basis || "bird"] || 0);
  const metric = { fcr: r.fcr, mortality: r.cumMort, rejects: r.rejPct, footpad: r.footpad, epef: r.epef, avgKg: r.avgKg };
  const lines = [{ label: `Base ${profile.basis === "kg" ? "per kg" : profile.basis === "m2" ? "per m²" : "per bird"}`, amount: base }];
  for (const b of profile.bonusRows || []) {
    const v = metric[b.metric]; if (v == null || b.value === "" || b.value == null) continue;
    const hit = b.op === "<" ? v < +b.value : v > +b.value; if (!hit) continue;
    const mult = b.per === "kg" ? qty.kg : b.per === "bird" ? qty.bird : 1;
    lines.push({ label: b.label || `${b.metric} ${b.op} ${b.value}`, amount: (+b.amount || 0) * mult });
  }
  const total = lines.reduce((t, l) => t + l.amount, 0);
  return { lines, total, perBird: qty.bird ? total / qty.bird : null };
}
/** Settlement vs estimate: { diff, pct, flag } (flag when it differs by more than 2%). */
export function settlementCheck(estimate, paid) {
  if (estimate == null || paid == null || paid === "") return null;
  const diff = +paid - estimate; const pct = estimate ? (diff / estimate) * 100 : 0;
  return { diff, pct, flag: Math.abs(pct) > 2 };
}
/** Income per m² per year: Σ crop payments in the last 365 days ÷ total usable area. */
export function incomePerM2(settlements, area, today) {
  const from = new Date(Date.parse(today + "T12:00:00Z") - 365 * 864e5).toISOString().slice(0, 10);
  const sum = settlements.filter((x) => x.date > from && x.date <= today).reduce((t, x) => t + (+x.amount || 0), 0);
  return area ? sum / area : null;
}

export const ENERGY_KINDS = [
  { key: "lpg", label: "LPG (litres)", unit: "L", stock: true }, { key: "lpgPct", label: "LPG tank (%)", unit: "%", stock: true, pct: true },
  { key: "oil", label: "Oil (litres)", unit: "L", stock: true }, { key: "biomass", label: "Biomass (kg)", unit: "kg", stock: true },
  { key: "heat", label: "Heat meter (kWh)", unit: "kWh" }, { key: "elec", label: "Electricity (kWh)", unit: "kWh" },
];
/** Energy used per kind: meters = end − start; stores = start + delivered − end. LPG % × tank size → litres. */
export function energyUse(e, s = {}) {
  const out = {};
  for (const r of e?.readings || []) {
    const k = ENERGY_KINDS.find((x) => x.key === r.kind); if (!k || r.start === "" || r.end === "" || r.start == null || r.end == null) continue;
    const del = (e.deliveries || []).filter((d) => d.kind === r.kind).reduce((t, d) => t + (+d.qty || 0), 0);
    let used = k.stock ? +r.start + del - +r.end : +r.end - +r.start;
    let key = r.kind;
    if (k.pct) { used = (used / 100) * (+s.lpgTankLitres || 0); key = "lpg"; }
    out[key] = (out[key] || 0) + used;
  }
  return out;
}
/** Heat £ per crop / bird / kg from use × unit prices (prices: { lpg, oil, biomass, heat, elec } £ per unit). */
export function energyCost(use, prices, birds, kg) {
  if (!prices) return null; let total = 0; let any = false;
  for (const [k, q] of Object.entries(use)) if (prices[k] != null && prices[k] !== "") { total += q * +prices[k]; any = true; }
  if (!any) return null;
  return { total, perBird: birds ? total / birds : null, perKgPence: kg ? (total / kg) * 100 : null };
}
