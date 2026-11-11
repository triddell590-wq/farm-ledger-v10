// Finishing planner (design/10 §7): BCRS and processor-spec deadlines, estimated weight and
// carcase now, ready-by date, flags. Pure.
import { addMonths, addDays, daysBetween, shortDate } from "../../../core/dates.js";
import { classOf, onFarm, lastWeight, dlwg, bornInNI, daysOnHolding } from "./animals.js";
import { sexCode } from "./tags.js";
import { bcrsMonths, BCRS_RESIDENCY } from "./rules.js";

/** BCRS deadline: DOB + the limit for the year the animal reaches it (limit drops yearly). */
export function bcrsDeadline(a, s) {
  if (!a.dob) return null;
  let y = Number(a.dob.slice(0, 4)) + 2; let d = addMonths(a.dob, bcrsMonths(y, s));
  for (let i = 0; i < 3; i++) { const yy = Number(d.slice(0, 4)); if (yy === y) break; y = yy; d = addMonths(a.dob, bcrsMonths(y, s)); }
  return { date: d, months: bcrsMonths(y, s) };
}
export const specDeadline = (a, s) => (a.dob ? addMonths(a.dob, s.processor.maxAgeMonths) : null);
export function koPct(a, s) { const sx = sexCode(a.sex); return s.processor.ko[sx === "F" ? "Heifer" : sx === "B" ? "Bull" : "Steer"] || 55; }

/** Animals whose age deadlines matter: everything but cows, stock bulls and kept replacements. */
export function deadlineAnimals(data, ix, today) {
  return data.animals.filter((a) => onFarm(a) && a.dob && !a.replacement && !a.stockBull && !["cow", "bull"].includes(classOf(ix, a, today)) && sexCode(a.sex) !== "" && (daysBetween(a.dob, today) > 300));
}

export function finishingFacts(data, s, ix, a, today) {
  const bc = bornInNI(a) ? bcrsDeadline(a, s) : null;
  const spec = specDeadline(a, s);
  const lw = lastWeight(ix, a); const g = dlwg(ix, a);
  const gain = g && g.value > 0 ? g.value : s.dlwgTarget.finisher;
  const estNow = lw ? lw.kg + gain * Math.max(0, daysBetween(lw.date, today)) : null;
  const ko = koPct(a, s) / 100;
  const estCarcase = estNow ? estNow * ko : null;
  const target = s.targetCarcaseKg;
  const readyBy = estNow ? (estCarcase >= target ? today : addDays(today, Math.ceil((target / ko - estNow) / gain))) : null;
  const deadlines = [bc && { kind: "bcrs", label: `BCRS (${bc.months} months)`, date: bc.date }, spec && { kind: "spec", label: `Processor spec (${s.processor.maxAgeMonths} m)`, date: spec }].filter(Boolean)
    .map((d) => ({ ...d, left: daysBetween(today, d.date) })).filter((d) => d.left >= -366);
  const nearest = deadlines.filter((d) => d.left >= 0).sort((x, y) => x.left - y.left)[0] || deadlines.sort((x, y) => y.left - x.left)[0] || null;
  const flags = [];
  if (bc && readyBy && readyBy > bc.date && bc.date >= today) flags.push({ level: "due", text: "Will miss BCRS at current gain" });
  if (!bc && a.dob) flags.push({ level: "info", text: "Not eligible for BCRS: not born in NI" });
  if (estCarcase && estCarcase > s.processor.maxCarcase) flags.push({ level: "due", text: `Too heavy for spec (${Math.round(estCarcase)} kg carcase)` });
  if ((+a.prevMoves || 0) + (a.onDate ? 1 : 0) >= s.processor.maxMoves) flags.push({ level: "due", text: `${ordinal((+a.prevMoves || 0) + (a.onDate ? 1 : 0))} move — out of spec` });
  const held = daysOnHolding(a, today);
  if (bc && held < BCRS_RESIDENCY.days) flags.push({ level: "info", text: `Residency: ${BCRS_RESIDENCY.days} of ${BCRS_RESIDENCY.of} days met from ${shortDate(addDays(a.onDate || a.dob, BCRS_RESIDENCY.days))}` });
  return { bcrs: bc, spec, lw, gain: g ? g.value : null, estNow, estCarcase, ko: ko * 100, readyBy, deadlines, nearest, flags };
}

const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;

/** Deadline alerts at 60, 30 and 14 days (info / due / due); on or past the day = late. */
export function deadlineLevel(left) { if (left < 0) return null; if (left === 0) return "late"; if (left <= 30) return "due"; if (left <= 60) return "info"; return null; }

/** Buy-in calculator (design/10 §6.5). */
export function maxBid({ weightIn, saleWeight, koPct = 55, salePricePerKg, days, dailyCost, targetMargin = 0 }) {
  const value = saleWeight * (koPct / 100) * salePricePerKg;
  const bid = value - days * dailyCost - targetMargin;
  return { saleValue: value, maxBid: bid, breakEvenPerKg: weightIn ? (value - days * dailyCost) / weightIn : null, perKgAtMax: weightIn ? bid / weightIn : null };
}
/** Adjusted 200-day weight and % of dam weight (design/10 §10). */
export function adj200({ weanKg, birthKg = 40, ageDays, damKg }) {
  if (!(weanKg > 0 && ageDays > 0)) return null;
  const v = ((weanKg - birthKg) / ageDays) * 200 + birthKg;
  return { adj200: v, pctOfDam: damKg ? (v / damKg) * 100 : null };
}
export { onFarm };
