// Breeding KPIs (design/13 §4.4) over the last 12 months, with the formula shown beside each
// and AHDB Agrosoft benchmarks (average → top third) labelled with source and date.
import { addDays, daysBetween } from "./dates.js";
import { preWeanMortality } from "./litters.js";

export const BENCH_SOURCE = "AHDB indoor breeding herd costings (Agrosoft), porktools.ahdb.org.uk — as quoted by Research C, Oct 2026";
export const BENCH = {
  pwsy: [27.8, 31.7], bornAlive: [14.6, 15.5], pwm: [13.2, 11.4], lsy: [2.2, 2.31], farrowRate: [81.9, 86.1],
  sowMort: [7.7, 7.9], replacement: [53, 57],
};

/**
 * KPIs over 12 months to `today`. avgSows = average sows + served gilts on farm across the
 * period, worked out day by day from entry and cull dates.
 */
export function breedingKpis({ sows, services, litters, deaths = [] }, today) {
  const from = addDays(today, -365);
  const inP = (d) => d && d > from && d <= today;
  const L = litters.filter((l) => inP(String(l.farrowedAt).slice(0, 10)));
  const weaned = litters.filter((l) => inP(l.weaned?.date)).reduce((t, l) => t + (+l.weaned.n || 0), 0);
  const servedIds = new Set(services.map((s) => s.sowId));
  // average breeding females: each sow/served gilt counts for the days she was on farm
  let sowDays = 0;
  for (const s of sows) {
    if (s.type === "boar") continue;
    if (s.type === "gilt" && !servedIds.has(s.id)) continue;
    const a = s.entered && s.entered > from ? s.entered : from; const b = s.cull?.date && s.cull.date < today ? s.cull.date : s.died && s.died < today ? s.died : today;
    if (b > a) sowDays += daysBetween(a, b);
  }
  const avgSows = sowDays / 365;
  const ba = L.reduce((t, l) => t + (+l.bornAlive || 0), 0);
  const sowDeaths = deaths.filter((d) => d.stage === "Sow" && inP(d.date)).reduce((t, d) => t + (+d.n || 0), 0);
  const giltsIn = sows.filter((s) => s.type === "gilt" && inP(s.entered)).length;
  // farrowing rate: sows farrowed ÷ sows served in batches whose due date fell in the period
  const firstServes = new Map();
  for (const sv of [...services].sort((a, b) => a.date.localeCompare(b.date))) {
    const key = sv.sowId + ":" + (sv.batchId || sv.date.slice(0, 7));
    if (!firstServes.has(key)) firstServes.set(key, sv);
  }
  const servedIn = [...firstServes.values()].filter((sv) => inP(addDays(sv.date, 116)));
  const farrowed = servedIn.filter((sv) => litters.some((l) => l.sowId === sv.sowId && l.farrowedAt > sv.date && daysBetween(sv.date, l.farrowedAt) <= 125)).length;
  return {
    avgSows,
    pwsy: avgSows ? weaned / avgSows : null,
    bornAlive: L.length ? ba / L.length : null,
    pwm: preWeanMortality(L),
    lsy: avgSows ? L.length / avgSows : null,
    farrowRate: servedIn.length ? farrowed / servedIn.length : null,
    sowMort: avgSows ? sowDeaths / avgSows : null,
    replacement: avgSows ? giltsIn / avgSows : null,
    litters: L.length, weaned,
  };
}

/** Farrowing rate per batch: [{ no, served, farrowed, rate }] oldest first (last `n` batches due). */
export function farrowRateByBatch(batches, services, litters, today, n = 8) {
  const rows = [];
  for (const b of batches) {
    const sv = services.filter((s) => s.batchId === b.id);
    const sowIds = [...new Set(sv.map((s) => s.sowId))]; if (!sowIds.length) continue;
    const first = sv.map((s) => s.date).sort()[0]; if (addDays(first, 117) > today) continue;
    const f = sowIds.filter((id) => litters.some((l) => l.sowId === id && l.farrowedAt > first && daysBetween(first, l.farrowedAt) <= 125)).length;
    rows.push({ no: b.no, served: sowIds.length, farrowed: f, rate: f / sowIds.length });
  }
  return rows.sort((a, b) => a.no - b.no).slice(-n);
}

/** Parity profile: count of sows at parity 1..8+ (gilts = 0). */
export function parityProfile(parities) {
  const out = Array(9).fill(0);
  for (const p of parities) out[Math.min(8, Math.max(0, p))]++;
  return out;
}
// A healthy herd's parity shape (guide only — marked "guide" on the chart): % of sows per parity 0..8+
export const PARITY_GUIDE = [18, 17, 15, 14, 12, 10, 7, 4, 3];
