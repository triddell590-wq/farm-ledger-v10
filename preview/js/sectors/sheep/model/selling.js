// Weighing, drafting, growth, culls and money per ewe (design/11 §6.6, §6.7, §10, tools §8).
import { addDays, daysBetween } from "../../../core/dates.js";

/** Draft bucket for one lamb: sell now (≥ target and fat OK) / 1–2 weeks (within 3 kg) / keep. */
export function bucket(kg, s, fatOk = true) {
  const t = +s.draftKg || 42;
  if (kg >= t && fatOk) return "now";
  if (kg >= t - 3) return "soon";
  return "keep";
}
export const BUCKETS = { now: "Sell now", soon: "1–2 weeks", keep: "Keep" };
export const carcase = (kg, koPct = 45) => Math.round(kg * (koPct / 100) * 10) / 10;
/** Summary of a weigh session: counts per bucket, average, estimated carcase, over-weight risk. */
export function draftSummary(weights, s) {
  const out = { now: 0, soon: 0, keep: 0, n: 0, avg: 0, avgCarcase: 0, overMax: 0 };
  let sum = 0;
  for (const w of weights) { const kg = +w.kg || 0; if (!kg) continue; out[bucket(kg, s, w.fatOk !== false)]++; out.n++; sum += kg; if (carcase(kg, s.koPct) > +s.maxCarcase) out.overMax++; }
  out.avg = out.n ? Math.round((sum / out.n) * 10) / 10 : 0; out.avgCarcase = carcase(out.avg, s.koPct);
  return out;
}
/** Daily liveweight gain (g/day) from birth. */
export function growth(kg, ageDays, birthKg = 4.5) { return ageDays > 0 ? Math.round(((kg - birthKg) / ageDays) * 1000) : null; }
/** Draft value: carcase kg × price per kg (p/kg). */
export function draftValue(kg, koPct, pencePerKg) { const c = carcase(kg, koPct); return { carcase: c, value: Math.round(c * pencePerKg) / 100 }; }

export const CULL_REASONS = ["Teeth", "Toes", "Teats (udder)", "Tumours/lumps", "Tone (BCS)", "Empty", "Repeat lame", "Prolapse", "Mastitis", "Bad mother", "No milk", "Aborted", "Age"];
/**
 * The cull list: individual cull flags plus mob cull-check counts and lambing/scan flags this cycle.
 * Returns { total, byReason{reason: n}, ewes[{tag, reasons}] }.
 */
export function cullList(data, cy, repeatLameTags = []) {
  const by = {}; const ewes = []; const add = (r, n = 1) => { by[r] = (by[r] || 0) + n; };
  for (const sh of data.sheep || []) {
    if (sh.deleted || (sh.status && sh.status !== "on")) continue;
    const flags = (sh.cullFlags || []).filter((f) => f.date >= cy.ramsIn); if (!flags.length) continue;
    ewes.push({ id: sh.id, tag: sh.tag, reasons: [...new Set(flags.map((f) => f.reason))] }); flags.forEach((f) => add(f.reason));
  }
  const tagged = new Set(ewes.map((e) => e.tag));
  for (const r of repeatLameTags) if (!tagged.has(r.tag)) { ewes.push({ tag: r.tag, reasons: ["Repeat lame"] }); add("Repeat lame"); }
  for (const e of data.events || []) if (!e.deleted && e.kind === "cullCheck" && e.date >= cy.ramsIn) for (const [k, v] of Object.entries(e.counts?.reasons || {})) add(k, +v || 0);
  for (const l of data.lambings || []) if (!l.deleted && !l.eweId && (l.datetime || "") >= cy.ramsIn) { (l.problems || []).forEach((p) => add(p)); if (l.aborted) add("Aborted"); }
  for (const e of data.events || []) if (!e.deleted && e.kind === "scan" && e.date >= cy.ramsIn && e.cullEmpties) add("Empty", +e.counts?.empty || 0);
  const total = Object.values(by).reduce((a, b) => a + b, 0);
  return { total, byReason: by, ewes };
}
/** Replacements needed = culls + deaths + (target flock − ewes) − ewe lambs kept. */
export function replacementsNeeded({ ewes, culls, deaths, target, eweLambsKept }) {
  const t = +target || ewes;
  return Math.max(0, culls + deaths + (t - ewes) - (eweLambsKept || 0));
}
/** Flock size planner (tool): replacements to keep or buy. */
export function flockPlanner(target, ewes, cullPct, mortPct) {
  const culls = Math.round(ewes * (cullPct / 100)); const deaths = Math.round(ewes * (mortPct / 100));
  return { culls, deaths, replacements: Math.max(0, target - (ewes - culls - deaths)) };
}
// FBS 2024/25 gross margin per ewe benchmarks (Research A).
export const FBS_BENCHMARKS = [["Non-LFA", 111], ["DA", 85], ["SDA crossbred", 93], ["SDA hardy hill", 34]];
/**
 * Gross margin per ewe = (lamb + cull ewe + wool + scheme income − flock costs) ÷ ewes to the ram.
 * finance rows: {kind, category, amount}. Sales give lamb/cull income by the sale's `lambs` flag.
 */
export function grossMargin(finance, ewes) {
  let income = 0, costs = 0; const lines = { lambs: 0, culls: 0, wool: 0, schemes: 0, other: 0 };
  for (const f of finance) {
    if (f.deleted) continue; const a = +f.amount || 0;
    if (f.kind === "revenue") {
      income += a; const c = String(f.category || "") + " " + String(f.note || "");
      if (/wool/i.test(c)) lines.wool += a; else if (/scheme|grant|subsid|payment/i.test(c)) lines.schemes += a; else if (/cull/i.test(c)) lines.culls += a; else if (/lamb|livestock|sale/i.test(c)) lines.lambs += a; else lines.other += a;
    } else costs += a;
  }
  return { income, costs, lines, perEwe: ewes ? Math.round((income - costs) / ewes) : null };
}
/** Cost per kg of lamb carcase sold. */
export const costPerKg = (costs, carcaseKg) => (carcaseKg > 0 ? Math.round((costs / carcaseKg) * 100) / 100 : null);
export const ewesPerHa = (ewes, ha) => (ha > 0 ? Math.round((ewes / ha) * 10) / 10 : null);
export { addDays, daysBetween };
