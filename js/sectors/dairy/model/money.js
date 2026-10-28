// Milk money (design/12 §7.1 Cheques, §9): milk statements are stored as finance records
// (category "Milk", with a `cheque` block) so only Owner / Manager / Accountant ever see them —
// the same rule that hides all money from workers and vets. Processor price schedules differ
// and are not public (Research B/C), so the profile is the farmer's own setting.
import { addDays, daysBetween } from "../../../core/dates.js";

export const KG_PER_LITRE = 1.03;

/** Sum adjustments given as pence per litre or as £ amounts. */
const adjTotal = (list, litres) => (list || []).reduce((t, x) => t + (x.amount != null && x.amount !== "" ? +x.amount : ((+x.ppl || 0) * litres) / 100), 0);

/**
 * A statement: { litres, fat, protein, basePpl, adjustments[{label, ppl|amount}], deductions[{label, ppl|amount}], total? }
 * Returns { gross, deductions, total, ppl, solidsKg, solidsPpkg }.
 * total (the payment received) wins when given; otherwise it is worked out.
 */
export function chequeFigures(c) {
  const L = +c.litres || 0;
  const base = ((+c.basePpl || 0) * L) / 100;
  const adj = adjTotal(c.adjustments, L);
  const ded = adjTotal(c.deductions, L);
  const worked = base + adj - ded;
  const total = c.total != null && c.total !== "" ? +c.total : worked;
  const solidsKg = L * KG_PER_LITRE * (((+c.fat || 0) + (+c.protein || 0)) / 100);
  return { gross: base + adj, deductions: ded, worked, total, ppl: L ? (total * 100) / L : null, solidsKg, perKgSolids: solidsKg ? total / solidsKg : null };
}

/**
 * Estimate pence per litre from the processor profile: base + constituents + bands − deductions.
 * profile: { basePpl, baseFat, baseProtein, fatPer01, proteinPer01, sccBands[{over, ppl}], tbcBands[{over, ppl}], deductPpl }
 */
export function estimatePpl(p, { fat, protein, scc, tbc }) {
  if (p.basePpl == null || p.basePpl === "") return null;
  let ppl = +p.basePpl;
  if (fat !== "" && fat != null) ppl += ((+fat - +p.baseFat) / 0.1) * (+p.fatPer01 || 0);
  if (protein !== "" && protein != null) ppl += ((+protein - +p.baseProtein) / 0.1) * (+p.proteinPer01 || 0);
  const band = (bands, v) => { if (v == null || v === "") return 0; let best = 0; for (const b of [...(bands || [])].sort((x, y) => x.over - y.over)) if (+v > +b.over) best = +b.ppl; return best; };
  ppl += band(p.sccBands, scc) + band(p.tbcBands, tbc);
  ppl -= +p.deductPpl || 0;
  return Math.round(ppl * 100) / 100;
}

/** Cheque vs estimate for one statement. */
export function chequeCheck(p, c) {
  const f = chequeFigures(c); const est = estimatePpl(p, c);
  if (est == null || !c.litres) return { ...f, estPpl: null, estTotal: null, diff: null };
  const estTotal = (est * +c.litres) / 100;
  return { ...f, estPpl: est, estTotal, diff: f.total - estTotal };
}

/** "What if" the base price moves by `delta` pence: yearly effect from the last 12 months' litres. */
export function whatIf(cheques, delta, today) {
  const year = cheques.filter((c) => c.date > addDays(today, -365));
  let litres = year.reduce((t, c) => t + (+c.cheque?.litres || 0), 0);
  let months = new Set(year.map((c) => c.cheque?.month || c.date.slice(0, 7))).size;
  if (months && months < 12) litres = (litres / months) * 12;
  return { litres: Math.round(litres), effect: (litres * delta) / 100, months };
}

/**
 * Margin over purchased feed for a month (YYYY-MM): (milk £ − purchased feed £) per cow per day
 * and per litre; kg concentrate per litre when feed records carry kg.
 * finance: this ledger's finance records; cowsInMilk: average cows in milk that month.
 */
export function mopf(finance, month, cowsInMilk) {
  const inMonth = (r) => String(r.date || "").slice(0, 7) === month && !r.deleted;
  const milk = finance.filter((r) => inMonth(r) && r.kind === "revenue" && r.category === "Milk");
  const feed = finance.filter((r) => inMonth(r) && r.kind === "expense" && r.category === "Feed");
  const milkGBP = milk.reduce((t, r) => t + (+r.amount || 0), 0);
  const feedGBP = feed.reduce((t, r) => t + (+r.amount || 0), 0);
  const litres = milk.reduce((t, r) => t + (+r.cheque?.litres || 0), 0);
  const concKg = feed.reduce((t, r) => t + (+r.kg || 0), 0);
  const [y, m] = month.split("-").map(Number); const days = daysBetween(`${month}-01`, m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`);
  const cowDays = (+cowsInMilk || 0) * days;
  const margin = milkGBP - feedGBP;
  return { month, milkGBP, feedGBP, litres, concKg, margin, perCowDay: cowDays ? margin / cowDays : null, ppl: litres ? (margin * 100) / litres : null, concPerLitre: litres && concKg ? concKg / litres : null, cowDays };
}
