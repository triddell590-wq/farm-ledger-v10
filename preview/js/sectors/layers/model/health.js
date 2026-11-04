// Health rules (design/14 §7): the Salmonella 15-week clock and Class B lock, red-mite scores,
// egg withdrawal, body-weight uniformity, feather scores.
import { addDays, daysBetween } from "../../../core/dates.js";
import { RULES, SALM_POSITIVE } from "./content.js";
import { weekOfAge, dateAtWeek, r1, sum } from "./flock.js";

const rule = (region = "NI") => RULES.salmonella[region] || RULES.salmonella.NI;

/**
 * Salmonella schedule for a flock. Operator samples: first between 22 and 26 weeks of age, then
 * every 15 weeks after the last operator sample. Returns { due, window, last, lastOfficial,
 * level ('ok'|'due'|'late'), plan[] (week ticks), exempt, positive, classB }.
 */
export function salmonella(c, f, today = c.today) {
  if (c.s?.smallFlock) return { exempt: true, reason: "Small flock (under 350 hens, selling direct): the Salmonella programme doesn't apply. Change this in Layers settings if that's no longer true." };
  const R = rule(c.region); const all = (c.data.salmSamples || []).filter((x) => x.flockId === f.id).sort((a, b) => a.date.localeCompare(b.date));
  const op = all.filter((x) => x.sampler !== "official");
  const last = op[op.length - 1] || null; const lastOfficial = all.filter((x) => x.sampler === "official").pop() || null;
  const windowFrom = dateAtWeek(f, R.firstFromWk); const firstBy = dateAtWeek(f, R.firstByWk);
  const due = last ? addDays(last.date, R.everyWeeks * 7) : firstBy;
  const gone = f.depopDate && f.depopDate <= today;
  let level = "ok";
  if (!gone) { if (today > due) level = "late"; else if (daysBetween(today, due) <= 7 || (!last && today >= windowFrom)) level = "due"; }
  const lock = classB(all, f, today);
  // plan ticks: done samples + the next due + further every 15 weeks to planned depop
  const plan = op.map((x) => ({ wk: weekOfAge(f, x.date), state: isPositive(x) ? "pos" : x.result === "Negative" ? "done" : "wait", date: x.date }));
  if (!gone) { let d = due; const end = f.plannedDepop || addDays(due, 7 * 45); let first = true; while (d <= end) { plan.push({ wk: weekOfAge(f, d), state: first ? level : "future", date: d }); first = false; d = addDays(d, R.everyWeeks * 7); } }
  if (f.plannedDepop && !gone) plan.push({ wk: weekOfAge(f, f.plannedDepop), state: "depop", date: f.plannedDepop });
  return { due, windowFrom, firstBy, last, lastOfficial, level, plan, positive: lock.positive, classB: lock.on, lockSince: lock.since, gone };
}
export const isPositive = (x) => SALM_POSITIVE.includes(x?.result);
/** Class B lock: on from a positive S.E./S.T. result until a later negative confirmatory result or the flock leaves. */
export function classB(samples, f, today) {
  const pos = samples.filter(isPositive).sort((a, b) => a.date.localeCompare(b.date)).pop();
  if (!pos) return { on: false };
  const cleared = samples.some((x) => x !== pos && x.confirmatory && x.result === "Negative" && x.date >= pos.date);
  const gone = f.depopDate && f.depopDate <= today;
  return { on: !cleared && !gone, positive: pos, since: pos.resultDate || pos.date, confirmBy: addDays(pos.resultDate || pos.date, 28) };
}

/** Red mite: latest session, average, 8-week trend, over the action level? */
export function mite(c, houseId, today = c.today) {
  const list = (c.data.miteScores || []).filter((x) => x.houseId === houseId).sort((a, b) => a.date.localeCompare(b.date));
  const last = list[list.length - 1] || null; const avg = last ? miteAvg(last.traps) : null;
  const trend = list.filter((x) => x.date > addDays(today, -56)).map((x) => miteAvg(x.traps));
  const doneThisWeek = !!last && daysBetween(last.date, today) < 7;
  return { last, avg, trend, over: avg != null && avg >= (+c.s.miteAction || 2), doneThisWeek };
}
export function miteAvg(traps = []) { const v = traps.map((t) => t.score).filter((x) => x != null && x !== ""); return v.length ? r1(sum(v, Number) / v.length) : null; }
export function trapIds(house) { const rows = +house?.trapRows || 2, cols = +house?.trapCols || 6; const out = []; for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) out.push(`t${r * cols + k + 1}`); return { rows, cols, ids: out }; }

/** Egg withdrawal for a house on a date: the latest "eggs OK from" still in the future. */
export function eggWithheld(c, houseId, date = c.today) {
  const meds = (c.data.medicines || []).filter((m) => (m.houseId === houseId || (m.houseIds || []).includes(houseId)) && m.eggsOkFrom && m.date <= date && m.eggsOkFrom > date);
  if (!meds.length) return null;
  const m = meds.sort((a, b) => b.eggsOkFrom.localeCompare(a.eggsOkFrom))[0];
  return { until: m.eggsOkFrom, product: m.productName, med: m };
}
export function withdrawalDates(date, { doses = 1, intervalDays = 1, eggDays = 0, meatDays = 0 }) {
  const lastDose = addDays(date, (Math.max(1, +doses || 1) - 1) * (+intervalDays || 1));
  return { lastDose, eggsOkFrom: +eggDays ? addDays(lastDose, +eggDays) : null, meatOkFrom: +meatDays ? addDays(lastDose, +meatDays) : null };
}

/** Body weight sample (design/14 §5.5): mean, CV%, uniformity (% within ±10% of mean). */
export function uniformity(values) {
  const v = values.map(Number).filter((x) => x > 0); const n = v.length; if (!n) return { n: 0 };
  const mean = sum(v) / n; const sd = Math.sqrt(sum(v, (x) => (x - mean) ** 2) / (n > 1 ? n - 1 : 1));
  const within = v.filter((x) => Math.abs(x - mean) <= 0.1 * mean).length;
  return { n, mean: Math.round(mean), sd: r1(sd), cv: r1((sd / mean) * 100), uniformity: r1((within / n) * 100) };
}
/** Egg weight sample: mean g and the size mix (S/M/L/XL) in %. */
export function eggMix(values) {
  const v = values.map(Number).filter((x) => x > 0); const n = v.length; if (!n) return { n: 0, mix: {} };
  const g = (x) => (x >= 73 ? "XL" : x >= 63 ? "L" : x >= 53 ? "M" : "S");
  const mix = { S: 0, M: 0, L: 0, XL: 0 }; v.forEach((x) => mix[g(x)]++);
  for (const k in mix) mix[k] = Math.round((mix[k] / n) * 100);
  return { n, mean: r1(sum(v) / n), mix };
}
export const gradeOf = (g) => (g >= 73 ? "XL" : g >= 63 ? "L" : g >= 53 ? "M" : "S");
/** Feather score: tallies of 0 (good), 1, 2 → % good feather. */
export function featherScore(t = {}) { const n = (+t[0] || 0) + (+t[1] || 0) + (+t[2] || 0); return { n, good: n ? Math.round(((+t[0] || 0) / n) * 100) : null }; }
