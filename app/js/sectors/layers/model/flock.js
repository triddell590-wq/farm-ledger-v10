// Flock maths (design/14 §4, §5): bird age in weeks, birds alive, the daily sheet figures,
// weekly KPIs, hen-housed eggs, the prediction to depop and the flock timeline.
// Pure functions over a snapshot c = { s, data{houses, flocks, days, birdMoves, feedDeliveries…}, today }.
import { addDays, daysBetween } from "../../../core/dates.js";
import { standardFor, layBand, band, mid, vsBand } from "./standards.js";

const sum = (a, f = (x) => x) => a.reduce((t, x) => t + (+f(x) || 0), 0);
export const r1 = (n) => (n == null || !isFinite(n) ? null : Math.round(n * 10) / 10);

export function hatchOf(f) { return f?.hatchDate || (f?.placedDate ? addDays(f.placedDate, -7 * (+f.ageAtPlacement || 16)) : null); }
export function weekOfAge(f, date) { const h = hatchOf(f); return h && date ? Math.floor(daysBetween(h, date) / 7) : null; }
export function dateAtWeek(f, wk) { const h = hatchOf(f); return h ? addDays(h, wk * 7) : null; }
export const deadOf = (d) => (+d?.dead || 0) + (+d?.culled || 0);

export function sortedHouses(c) { return [...(c.data.houses || [])].sort((a, b) => (+a.order || 0) - (+b.order || 0) || String(a.name).localeCompare(String(b.name), "en", { numeric: true })); }
/** Flock in a house on a date (placed on or before, not yet gone). */
export function flockIn(c, houseId, date = c.today) {
  return (c.data.flocks || []).filter((f) => f.houseId === houseId && f.placedDate && f.placedDate <= date && (!f.depopDate || f.depopDate >= date)).sort((a, b) => b.placedDate.localeCompare(a.placedDate))[0] || null;
}
export function plannedFlock(c, houseId, date = c.today) { return (c.data.flocks || []).filter((f) => f.houseId === houseId && f.placedDate > date).sort((a, b) => a.placedDate.localeCompare(b.placedDate))[0] || null; }
export function lastFlock(c, houseId, date = c.today) { return (c.data.flocks || []).filter((f) => f.houseId === houseId && f.depopDate && f.depopDate < date).sort((a, b) => b.depopDate.localeCompare(a.depopDate))[0] || null; }

export function daysFor(c, flockId) {
  c._days = c._days || new Map();
  if (!c._days.has(flockId)) c._days.set(flockId, (c.data.days || []).filter((d) => d.flockId === flockId).sort((a, b) => a.date.localeCompare(b.date)));
  return c._days.get(flockId);
}
export const dayOn = (c, flockId, date) => daysFor(c, flockId).find((d) => d.date === date) || null;

function moveDelta(c, f, before) {
  return sum((c.data.birdMoves || []).filter((m) => m.flockId === f.id && !["placement", "depop"].includes(m.kind) && before(m.date)), (m) => (m.direction === "out" ? -1 : 1) * (+m.n || 0));
}
/** Birds alive at the start of `date` (before that day's deaths). end=true: after them. */
export function aliveAt(c, f, date, { end = false } = {}) {
  if (!f) return 0;
  const before = end ? (x) => x <= date : (x) => x < date;
  return (+f.placed || 0) - sum(daysFor(c, f.id).filter((d) => before(d.date)), deadOf) + moveDelta(c, f, before);
}

/** The daily sheet maths for one day (design/14 §4). prev = the previous sheet. */
export function sheetFigures(s, { eggsTotal, seconds = 0, floor = 0, waterMeter, waterL, alive, prev, prevWater = [] }) {
  eggsTotal = +eggsTotal || 0; seconds = +seconds || 0;
  const basis = s?.henDayBasis === "saleable" ? eggsTotal - seconds : eggsTotal;
  const henDay = alive > 0 && eggsTotal ? r1((basis / alive) * 100) : null;
  const secondsPct = eggsTotal ? r1((seconds / eggsTotal) * 100) : null;
  let litres = waterL != null && waterL !== "" ? +waterL : null;
  if (litres == null && waterMeter != null && waterMeter !== "" && prev?.waterMeter != null && prev.waterMeter !== "") {
    const gap = Math.max(1, prev.gap || 1); litres = (+waterMeter - +prev.waterMeter) / gap;
    if (litres < 0) litres = null;
  }
  const waterPer1000 = litres != null && alive > 0 ? Math.round((litres / alive) * 1000) : null;
  const avg3 = prevWater.length ? sum(prevWater) / prevWater.length : null;
  const waterChange = litres != null && avg3 ? r1((litres / avg3 - 1) * 100) : null;
  return { henDay, secondsPct, litres: litres == null ? null : Math.round(litres), waterPer1000, waterChange, floor: +floor || 0 };
}

/** Feed used per day from bin readings + deliveries; between readings the average applies. */
export function feedSeries(c, f) {
  const days = daysFor(c, f.id); const dels = (c.data.feedDeliveries || []).filter((x) => x.houseId === f.houseId);
  const bins = days.filter((d) => d.feed?.kind === "bin" && d.feed.kg != null && d.feed.kg !== "");
  const out = new Map();
  for (let i = 1; i < bins.length; i++) {
    const a = bins[i - 1], b = bins[i];
    const between = days.filter((d) => d.date > a.date && d.date <= b.date);
    const delivered = sum(dels.filter((x) => x.date > a.date && x.date <= b.date), (x) => x.kg);
    const used = +a.feed.kg + delivered - +b.feed.kg;
    const birdDays = sum(between, (d) => aliveAt(c, f, d.date));
    if (used > 0 && birdDays > 0) { const g = Math.round((used * 1000) / birdDays); between.forEach((d) => out.set(d.date, { g, kg: used / between.length, from: "bins" })); }
  }
  // no bin readings: each delivery is taken as eaten over the days until the next one (the last
  // gap's rate carries on after the latest delivery), then shown as a 7-day average — deliveries
  // arrive in lumps, so a plain 7-day sum of deliveries swings by a whole load (only once there
  // are 7 days of sheets).
  if (!bins.length && days.length >= 7) {
    const ds = [...dels].filter((x) => +x.kg > 0).sort((a, b) => a.date.localeCompare(b.date));
    const rate = new Map(); // date -> kg/day
    for (let k = 0; k < ds.length - 1; k++) { const gap = daysBetween(ds[k].date, ds[k + 1].date); if (gap <= 0) continue; for (let j = 0; j < gap; j++) rate.set(addDays(ds[k].date, j), (rate.get(addDays(ds[k].date, j)) || 0) + +ds[k].kg / gap); }
    let lastRate = null;
    for (let k = ds.length - 2; k >= 0 && lastRate == null; k--) { const gap = daysBetween(ds[k].date, ds[k + 1].date); if (gap > 0) lastRate = +ds[k].kg / gap; }
    const lastDel = ds[ds.length - 1]?.date;
    const kgOn = (date) => (rate.has(date) ? rate.get(date) : lastDel && lastRate != null && date >= lastDel && daysBetween(lastDel, date) <= 14 ? lastRate : null);
    for (let i = 6; i < days.length; i++) {
      const wk = days.slice(i - 6, i + 1); const kgs = wk.map((d) => kgOn(d.date));
      if (kgs.some((x) => x == null)) continue;
      const kg = sum(kgs); const birdDays = sum(wk, (d) => aliveAt(c, f, d.date));
      if (kg > 0 && birdDays) out.set(days[i].date, { g: Math.round((kg * 1000) / birdDays), kg: kg / 7, from: "deliveries" });
    }
  }
  return out;
}

/** Every sheet of a flock with its figures (memoised on c). */
export function series(c, f) {
  c._series = c._series || new Map();
  if (c._series.has(f.id)) return c._series.get(f.id);
  const std = standardFor(f.breedStdId); const days = daysFor(c, f.id); const feed = feedSeries(c, f); const out = [];
  let alive = +f.placed || 0; const litresHist = [];
  days.forEach((d, i) => {
    alive = aliveAt(c, f, d.date);
    const prevD = days[i - 1];
    const prev = prevD ? { waterMeter: prevD.waterMeter, gap: daysBetween(prevD.date, d.date) } : null;
    const fig = sheetFigures(c.s, { ...d, alive, prev, prevWater: litresHist.slice(-3) });
    if (fig.litres != null) litresHist.push(fig.litres);
    const wk = weekOfAge(f, d.date); const b = layBand(std, wk);
    out.push({ ...d, ...fig, alive, wk, band: b, vs: vsBand(fig.henDay, b), feedG: feed.get(d.date)?.g ?? null, feedKg: feed.get(d.date)?.kg ?? null });
  });
  c._series.set(f.id, out);
  return out;
}

export function weekly(c, f) {
  const std = standardFor(f.breedStdId); const rows = new Map();
  for (const d of series(c, f)) {
    if (!rows.has(d.wk)) rows.set(d.wk, { wk: d.wk, days: [], from: d.date });
    rows.get(d.wk).days.push(d);
  }
  const placed = +f.placed || 1; let cum = 0;
  return [...rows.values()].map((r) => {
    const n = r.days.length; const avg = (k) => { const v = r.days.map((d) => d[k]).filter((x) => x != null); return v.length ? sum(v) / v.length : null; };
    const deaths = sum(r.days, deadOf); cum += deaths;
    const eggs = sum(r.days, (d) => d.eggsTotal); const sec = sum(r.days, (d) => d.seconds);
    const eggW = (c.data.samples || []).filter((x) => x.flockId === f.id && x.kind === "eggs" && weekOfAge(f, x.date) === r.wk).map((x) => x.mean).filter(Boolean);
    const bw = (c.data.samples || []).filter((x) => x.flockId === f.id && x.kind === "weights" && weekOfAge(f, x.date) === r.wk).map((x) => x.mean).filter(Boolean);
    return { wk: r.wk, from: r.from, n, henDay: r1(avg("henDay")), std: layBand(std, r.wk), eggWt: eggW.length ? r1(sum(eggW) / eggW.length) : null, bw: bw.length ? Math.round(sum(bw) / bw.length) : null, feedG: avg("feedG") == null ? null : Math.round(avg("feedG")), waterPer1000: avg("waterPer1000") == null ? null : Math.round(avg("waterPer1000")), deaths, cumMort: r1((cum / placed) * 100), secondsPct: eggs ? r1((sec / eggs) * 100) : null, floor: sum(r.days, (d) => d.floor), eggs };
  }).sort((a, b) => b.wk - a.wk);
}

export function henHoused(c, f, upTo = c.today) { return r1(sum(daysFor(c, f.id).filter((d) => d.date <= upTo), (d) => d.eggsTotal) / (+f.placed || 1)); }
export function peakOf(c, f) {
  const w = weekly(c, f).filter((r) => r.n >= 4 && r.henDay != null); if (!w.length) return null;
  return w.reduce((a, b) => (b.henDay > a.henDay ? b : a));
}

/**
 * Predicted hen-housed eggs at a depop week (design/14 §5.1): eggs so far + for each remaining
 * week, 7 × standard mid lay % × projected birds alive ÷ birds placed, scaled by the flock's
 * ratio to standard over the last 4 weeks. Estimate.
 */
export function predictHHE(c, f, depopWk, today = c.today) {
  const std = standardFor(f.breedStdId); const nowWk = weekOfAge(f, today); const placed = +f.placed || 1;
  const recent = weekly(c, f).filter((r) => r.henDay != null && r.n >= 3).slice(0, 4);
  const ratio = recent.length ? sum(recent, (r) => r.henDay / (mid(r.std) || r.henDay)) / recent.length : 1;
  const alive = aliveAt(c, f, today, { end: true });
  const last28 = sum(daysFor(c, f.id).filter((d) => d.date > addDays(today, -28) && d.date <= today), deadOf);
  const lossPerWk = last28 / 4; let birds = alive; let eggs = sum(daysFor(c, f.id).filter((d) => d.date <= today), (d) => d.eggsTotal);
  for (let w = nowWk + 1; w <= depopWk; w++) { birds = Math.max(0, birds - lossPerWk); eggs += 7 * birds * ((mid(layBand(std, w)) * ratio) / 100); }
  return { hhe: Math.round(eggs / placed), ratio: r1(ratio * 100), stdRange: hheStd(std, depopWk) };
}
/** Standard hen-housed eggs to a week, from the band (min, max) × livability. */
export function hheStd(std, toWk, fromWk = 18) {
  let lo = 0, hi = 0;
  for (let w = fromWk; w < toWk; w++) { const b = layBand(std, w); const m = band(std, "mort", w); const live = 1 - (mid(m) || 0) / 100; lo += 7 * (b[0] / 100) * live; hi += 7 * (b[1] / 100) * live; }
  return [Math.round(lo), Math.round(hi)];
}

/** Stage of a flock (design/14 §3.1): prelay = first 4 weeks after placement and below 50% lay. */
export function stageOf(c, f, today = c.today) {
  if (!f) return "empty";
  if (f.placedDate > today) return "planned";
  if (f.depopDate && f.depopDate <= today) return "depop";
  const s = series(c, f); const last = s[s.length - 1];
  if (daysBetween(f.placedDate, today) < 28 && !(last?.henDay >= 50)) return "prelay";
  return "lay";
}

/** Flock timeline markers (design/14 §5.2). */
export function timeline(c, f, today = c.today) {
  const s = series(c, f); const m = [];
  m.push({ key: "placed", label: `Placed wk ${weekOfAge(f, f.placedDate)}`, date: f.placedDate, state: "done" });
  const first = s.find((d) => +d.eggsTotal > 0); if (first) m.push({ key: "first", label: `First eggs wk ${first.wk}`, date: first.date, state: "done" });
  const half = s.find((d) => d.henDay >= 50); if (half) m.push({ key: "half", label: `50% lay wk ${half.wk}`, date: half.date, state: "done" });
  const pk = peakOf(c, f); if (pk) m.push({ key: "peak", label: `Peak wk ${pk.wk} (${pk.henDay}%)`, state: "done" });
  if (!f.depopDate || f.depopDate > today) m.push({ key: "today", label: `Today wk ${weekOfAge(f, today)}`, date: today, state: "due" });
  if (f.plannedDepop && !f.depopDate) m.push({ key: "depop", label: `Depop wk ${weekOfAge(f, f.plannedDepop)} · ${dm(f.plannedDepop)}`, date: f.plannedDepop, state: "future", edit: true });
  if (f.depopDate) m.push({ key: "depop", label: `Depopulated ${dm(f.depopDate)}`, date: f.depopDate, state: "done" });
  if (f.turnaroundWeeks) m.push({ key: "turn", label: `Turnaround ${f.turnaroundWeeks} weeks`, state: "future" });
  if (f.nextPlacement) m.push({ key: "next", label: `Next flock ${dm(f.nextPlacement)}`, date: f.nextPlacement, state: "future", edit: true });
  return m;
}
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function dm(iso) { if (!iso) return ""; const [, m, d] = iso.split("-"); return `${+d} ${MON[+m - 1]}`; }

/** Cumulative mortality % and this-week mortality % for a flock. */
export function mortality(c, f, today = c.today) {
  const days = daysFor(c, f.id).filter((d) => d.date <= today); const placed = +f.placed || 1;
  const wk = days.filter((d) => d.date > addDays(today, -7)); const startWk = aliveAt(c, f, addDays(today, -6));
  const byCause = {};
  for (const d of days) for (const x of d.deaths || []) byCause[x.cause] = (byCause[x.cause] || 0) + (+x.n || 0);
  const std = standardFor(f.breedStdId); const stdCum = band(std, "mort", weekOfAge(f, today));
  return { cum: r1((sum(days, deadOf) / placed) * 100), weekDeaths: sum(wk, deadOf), weekPct: startWk ? Math.round((sum(wk, deadOf) / startWk) * 10000) / 100 : null, byCause, stdCum: stdCum ? stdCum[0] : null };
}
export { sum };
