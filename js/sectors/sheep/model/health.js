// Worms, doses, withdrawal, FEC and lameness (design/11 §6.1–6.3, §7).
import { addDays, daysBetween } from "../../../core/dates.js";

// Wormer groups with their colour code (word + swatch, never colour alone).
export const WORMER_GROUPS = {
  "1-BZ": { colour: "white", swatch: "#F2F1EA", label: "1-BZ white" },
  "2-LV": { colour: "yellow", swatch: "#E8C531", label: "2-LV yellow" },
  "3-ML": { colour: "clear", swatch: "transparent", label: "3-ML clear" },
  "4-AD": { colour: "orange", swatch: "#E07A1F", label: "4-AD orange" },
  "5-SI": { colour: "purple", swatch: "#7A4FB0", label: "5-SI purple" },
};
export const REASONS = ["Worms", "Fluke", "Lame", "Vaccine", "Scab", "Fly", "BTV-3 vaccine", "Other"];
// Active ingredients / common product names → group (guide; the farmer can change it).
const GROUP_WORDS = [
  ["5-SI", /derquantel|startect/i],
  ["4-AD", /monepantel|zolvix/i],
  ["3-ML", /ivermectin|moxidectin|doramectin|abamectin|eprinomectin|cydectin|dectomax|ivomec|oramec|noromectin/i],
  ["2-LV", /levamisole|levacide|levafas|levacur/i],
  ["1-BZ", /albendazole|fenbendazole|oxfendazole|mebendazole|ricobendazole|albenzole|panacur|systamex|tramazole|rycoben|allverm/i],
];
export function groupFromProduct(name = "") { const g = GROUP_WORDS.find(([, re]) => re.test(name)); return g ? g[0] : null; }
const FLUKE_STAGES = [[/triclabendazole|fasinex|tribex|endofluke/i, "early immature, immature and adult fluke"], [/closantel|flukiver|closamectin/i, "immature (from 7 weeks) and adult fluke"], [/nitroxinil|trodax/i, "immature (from 7 weeks) and adult fluke"], [/oxyclozanide|zanil|levafas diamond/i, "adult fluke only"], [/albendazole|albenzole/i, "adult fluke only (at the fluke dose rate)"]];
export function flukeStage(name = "", notes = "") { const f = FLUKE_STAGES.find(([re]) => re.test(name)); return notes || (f ? f[1] : ""); }

/** Dose each (ml) for a weight at a rate of `ml` per `perKg` kg, rounded up to 0.1 ml. */
export function doseEach(weightKg, ml = 1, perKg = 5) {
  if (!(weightKg > 0) || !(ml > 0) || !(perKg > 0)) return 0;
  return Math.ceil(((weightKg / perKg) * ml) * 10 - 1e-9) / 10;
}
/** Weight bands: [{from,to,n}] → [{...band, each, total}] dosed to the top of each band. */
export function doseBands(bands, ml, perKg) {
  return bands.filter((b) => b.n > 0).map((b) => { const each = doseEach(b.to, ml, perKg); return { ...b, each, total: Math.round(each * b.n * 10) / 10 }; });
}
export const totalDose = (n, each) => Math.round(n * each * 10) / 10;

/** Meat withdrawal end for a treatment record (date + days). */
export function withdrawalUntil(m) { const d = +m.wdMeatDays; return m.date && d > 0 ? addDays(m.date, d) : null; }
/** Latest running withdrawal for a mob (or null). */
export function mobWithdrawal(data, mobId, today) {
  let best = null;
  for (const m of data.medicines || []) {
    if (m.deleted || m.mobId !== mobId || m.kind === "disposal") continue;
    const u = withdrawalUntil(m); if (u && u > today && (!best || u > best.until)) best = { until: u, med: m };
  }
  return best;
}
export const doses = (data, mobId) => (data.medicines || []).filter((m) => !m.deleted && m.kind !== "disposal" && (!mobId || m.mobId === mobId)).sort((a, b) => String(b.date).localeCompare(String(a.date)));
export const isWormer = (m) => m.reason === "Worms" || !!m.wormerGroup && m.reason !== "Fluke";

/** How many times a group was used on a mob this year (rotation warning). */
export function groupUses(data, mobId, group, year) {
  return (data.medicines || []).filter((m) => !m.deleted && m.mobId === mobId && m.wormerGroup === group && String(m.date).startsWith(String(year))).length;
}
/** Doses per wormer group this year (rotation summary). */
export function rotation(data, year, mobId = null) {
  const out = Object.fromEntries(Object.keys(WORMER_GROUPS).map((g) => [g, 0]));
  for (const m of data.medicines || []) if (!m.deleted && m.wormerGroup && String(m.date).startsWith(String(year)) && (!mobId || m.mobId === mobId)) out[m.wormerGroup] = (out[m.wormerGroup] || 0) + 1;
  return out;
}

/** FEC result against the vet's threshold. */
export function fecVerdict(epg, threshold = 500) {
  if (epg == null || epg === "") return null;
  return +epg > +threshold ? { dose: true, text: "Dose needed" } : { dose: false, text: "Not yet — test again in 3–4 weeks" };
}
/** Faecal egg count reduction % = (pre − post) ÷ pre. Below 95% the wormer may not be working. */
export function fecReduction(pre, post) {
  if (!(pre > 0) || post == null) return null;
  const pct = Math.round(((pre - post) / pre) * 1000) / 10;
  return { pct, ok: pct >= 95 };
}
/** Pre-dose FEC for a drench check: the latest FEC on that mob up to 14 days before the dose. */
export function preDoseFec(data, dose) {
  return (data.events || []).filter((e) => !e.deleted && e.kind === "fec" && e.mobId === dose.mobId && e.date <= dose.date && daysBetween(e.date, dose.date) <= 14).sort((a, b) => b.date.localeCompare(a.date))[0] || null;
}
/** Wormer doses still waiting for their drench check (no FEC 7–21 days after). */
export function drenchChecksDue(data, s, today) {
  const out = [];
  for (const m of data.medicines || []) {
    if (m.deleted || !m.mobId || !isWormer(m) || !m.date) continue;
    if (daysBetween(m.date, today) > 60) continue;
    const done = (data.events || []).some((e) => !e.deleted && e.kind === "fec" && e.mobId === m.mobId && daysBetween(m.date, e.date) >= 7 && daysBetween(m.date, e.date) <= 21);
    if (!done) out.push({ dose: m, due: addDays(m.date, +s.drenchCheckDays || 10) });
  }
  return out;
}
export const lamePct = (lame, outOf) => (outOf > 0 ? Math.round((lame / outOf) * 1000) / 10 : 0);
export const lameChecks = (data, mobId) => (data.events || []).filter((e) => !e.deleted && e.kind === "lame" && (!mobId || e.mobId === mobId)).sort((a, b) => b.date.localeCompare(a.date));
/** Latest lame % for a mob. */
export function lastLame(data, mobId) { const e = lameChecks(data, mobId)[0]; return e ? { date: e.date, pct: lamePct(+e.counts?.lame || 0, +e.counts?.outOf || 0), lame: +e.counts?.lame || 0, outOf: +e.counts?.outOf || 0 } : null; }
/**
 * Five-point plan: a ewe treated for lameness twice in a season gets a "repeat lame" cull flag.
 * Season = the 12 months up to `today`. Returns tags lame twice or more.
 */
export function repeatLame(data, today) {
  const from = addDays(today, -365); const n = new Map();
  for (const e of data.events || []) if (!e.deleted && e.kind === "lame" && e.date >= from) for (const i of e.counts?.individuals || []) if (i.tag) n.set(i.tag, (n.get(i.tag) || 0) + 1);
  for (const m of data.medicines || []) if (!m.deleted && m.reason === "Lame" && m.date >= from) for (const t of m.tags || []) n.set(t, (n.get(t) || 0) + 1);
  return [...n].filter(([, k]) => k >= 2).map(([tag, k]) => ({ tag, times: k }));
}
/** FEC due: a mob whose last FEC (or dose) is over 4 weeks old in the grazing season. */
export function fecDue(data, mobId, today) {
  const last = (data.events || []).filter((e) => !e.deleted && e.kind === "fec" && e.mobId === mobId).map((e) => e.date).sort().pop();
  const month = +today.slice(5, 7);
  if (month < 5 || month > 10) return false;
  return !last || daysBetween(last, today) > 28;
}
