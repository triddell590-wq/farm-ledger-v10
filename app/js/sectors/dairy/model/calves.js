// Calves and heifers (design/12 §7.2; Research C §4–5). Pure.
import { daysBetween } from "../../../core/dates.js";

/** Mixing sheet for one pen: calves × litres × feeds = litres → kg powder (g per litre). */
export function mixing({ calves, lPerFeed, feedsPerDay, gPerL }) {
  const n = +calves || 0; const L = n * (+lPerFeed || 0) * (+feedsPerDay || 0);
  const perFeed = n * (+lPerFeed || 0);
  return { litresDay: L, kgDay: (L * (+gPerL || 0)) / 1000, litresFeed: perFeed, kgFeed: (perFeed * (+gPerL || 0)) / 1000 };
}

/**
 * Heifer growth target (kg) at an age, as % of mature cow weight (CAFRE/AHDB):
 * double birth weight by 56 d · 27% at 6 mo · 50% at 12 mo · 55–60% at service (~14 mo)
 * · 85–90% at calving (~23 mo). Linear between points.
 */
export function targetKg(ageDays, matureKg, birthKg = 40) {
  const pts = [[0, birthKg], [56, birthKg * 2], [182, 0.27 * matureKg], [365, 0.5 * matureKg], [425, 0.575 * matureKg], [700, 0.875 * matureKg]];
  if (ageDays <= 0) return birthKg;
  for (let i = 1; i < pts.length; i++) if (ageDays <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + ((y1 - y0) * (ageDays - x0)) / (x1 - x0); }
  return pts[pts.length - 1][1];
}
export const MILESTONES = [
  { key: "wean", label: "Weaning (56 days)", text: "2 × birth weight" },
  { key: "m6", label: "6 months", pct: 27 },
  { key: "m12", label: "12 months", pct: 50 },
  { key: "service", label: "At service (13–15 months)", pct: "55–60" },
  { key: "calving", label: "At calving (22–24 months)", pct: "85–90" },
];

/** On track / behind for one weighing. Behind = under 90% of target. */
export function growthStatus(dob, weigh, matureKg, birthKg) {
  if (!dob || !weigh) return null;
  const age = daysBetween(dob, weigh.date); const t = targetKg(age, matureKg, birthKg);
  const ratio = +weigh.kg / t;
  return { age, target: Math.round(t), kg: +weigh.kg, ratio, behind: ratio < 0.9, gainSinceBirth: age > 0 ? (+weigh.kg - birthKg) / age : null };
}

/**
 * Weigh-tape: heart girth (cm) → live weight (kg) for Holstein heifers.
 * Heinrichs, Rogers & Cooper (1992) J Dairy Sci 75:3576 quadratic, as recalled (not re-fetched):
 * kg = 102.7 − 2.875·HG + 0.02689·HG². Valid roughly 80–210 cm. Shown with "estimate" wording.
 */
export function tapeKg(girthCm) {
  const g = +girthCm; if (!(g >= 70 && g <= 230)) return null;
  return Math.round(102.7 - 2.875 * g + 0.02689 * g * g);
}
export function tapeTable(from = 80, to = 210, step = 5) { const out = []; for (let g = from; g <= to; g += step) out.push([g, tapeKg(g)]); return out; }

/** Colostrum quality flag: Brix ≥ 22% commonly used as "good" (guidance-level; vet to confirm). */
export const brixGood = (b) => (b === "" || b == null ? null : +b >= 22);
