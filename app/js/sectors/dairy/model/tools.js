// Dairy tools (design/12 §9) that are not covered elsewhere: slurry storage and cull ranking.
import { daysBetween } from "../../../core/dates.js";
import { onFarm, groupOf, lactation, sccHistory, mobility, lastYield, cowLabel } from "./cows.js";
import { fertilityOf } from "./fertility.js";
import { casesThisLactation } from "./mastitis.js";

/**
 * Weeks of slurry storage: capacity ÷ weekly production (cows, youngstock, calves × weekly
 * output + washings/rain). NAP needs 22 weeks for cattle. Output figures are editable guides.
 */
export function slurryWeeks(p) {
  const weekly = (+p.cows || 0) * (+p.perCowWk || 0) + (+p.youngstock || 0) * (+p.perYoungWk || 0) + (+p.calves || 0) * (+p.perCalfWk || 0) + (+p.extraWk || 0);
  const weeks = weekly && +p.capacityM3 > 0 ? +p.capacityM3 / weekly : null;
  const target = +p.targetWeeks || 22;
  return { weekly, weeks, target, shortM3: weeks != null && weeks < target ? Math.round((target - weeks) * weekly) : 0, ok: weeks != null && weeks >= target };
}

/**
 * Cull ranking (Research C §9): a transparent weighted score, each factor 0–1, with reasons.
 * Factors: age (lactation, 1 at 6+), SCC (mean of last 3 ÷ 400k), cases this lactation (÷ 3),
 * days open (past 150 days, full at 250), lameness (mobility ÷ 3), low yield (vs herd average).
 */
export function cullRanking(s, ix, data, today) {
  const cows = data.animals.filter((a) => onFarm(a) && ["milking", "dry"].includes(groupOf(ix, a, today)));
  const yields = cows.map((a) => lastYield(ix, a)?.l).filter((x) => x > 0);
  const avgY = yields.length ? yields.reduce((t, x) => t + x, 0) / yields.length : null;
  const w = s.cullWeights; const wsum = Object.values(w).reduce((t, x) => t + (+x || 0), 0) || 1;
  const rows = cows.map((a) => {
    const lac = lactation(ix, a); const h = sccHistory(ix, a, 3); const sccAvg = h.length ? h.reduce((t, x) => t + x.scc, 0) / h.length : null;
    const cases = casesThisLactation(ix, a).length; const f = fertilityOf(s, ix, a, today);
    const open = !f.pregnant && f.dim != null ? f.dim : null; const mob = mobility(ix, a)?.score ?? null; const y = lastYield(ix, a)?.l ?? null;
    const fx = {
      age: Math.min(1, lac / 6),
      scc: sccAvg == null ? 0 : Math.min(1, sccAvg / 400),
      cases: Math.min(1, cases / 3),
      daysOpen: open == null ? 0 : Math.max(0, Math.min(1, (open - 150) / 100)),
      lameness: mob == null ? 0 : Math.min(1, mob / 3),
      yield: avgY && y ? Math.max(0, Math.min(1, (avgY - y) / avgY / 0.4)) : 0,
    };
    const score = Object.entries(fx).reduce((t, [k, v]) => t + v * (+w[k] || 0), 0) / wsum;
    const reasons = [
      lac >= 5 && `${lac}th lactation`,
      sccAvg != null && sccAvg > 200 && `SCC avg ${Math.round(sccAvg)}k`,
      cases && `${cases} mastitis case${cases > 1 ? "s" : ""}`,
      open != null && open > 150 && `${open} days open`,
      mob != null && mob >= 2 && `mobility ${mob}`,
      fx.yield > 0.25 && `yield ${y} L vs ${Math.round(avgY)} L avg`,
      a.doNotBreed && "marked do not breed",
    ].filter(Boolean);
    return { a, label: cowLabel(a), score: Math.round(score * 100), fx, reasons };
  });
  return rows.sort((x, y) => y.score - x.score);
}

/** Days until a yearly job (machine test, liner change) is due again. */
export function yearlyDue(lastDate, today, months = 12) {
  if (!lastDate) return { due: null, left: null };
  const d = new Date(lastDate + "T12:00:00Z"); d.setUTCMonth(d.getUTCMonth() + months);
  const due = d.toISOString().slice(0, 10);
  return { due, left: daysBetween(today, due) };
}
