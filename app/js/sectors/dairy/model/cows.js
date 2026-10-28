// The dairy herd worked out from its records. Pure: no DOM, no store.
// Animal record (cattle engine shape shared with Beef: tag, dob, sex, breed, damId/damTag,
// sireText, onDate, offDate, offTo, bornInHerd, reg{}) plus dairy fields: cowNo, name,
// lactationBase (lactations before this app), calvedDateBase, doNotBreed, cull{on,reason},
// marks, sirePlan, vetCheck{reason,added}, calf{colostrum{time,litres,brix}, pen, stage,
// disbud{date,anaesthetic,analgesic}, weanDate, destination}.
import { daysBetween } from "../../../core/dates.js";
import { normTag, sexCode, tagParts } from "../../beef/model/tags.js";

export const onFarm = (a) => !a.deleted && !a.offDate && a.status !== "gone";
export const ageDays = (a, today) => (a.dob ? daysBetween(a.dob, today) : null);
export const ageMonths = (a, today) => (a.dob ? daysBetween(a.dob, today) / 30.4375 : null);
export const isFemale = (a) => sexCode(a.sex) === "F";
const byDate = (x, y) => String(x.date).localeCompare(String(y.date)) || String(x.time || "").localeCompare(String(y.time || ""));

/** Index the herd once per snapshot. data: { animals, calvings, services, heats, pds, dryOffs, recordings, mastitis, scoreSessions, weighings } */
export function indexHerd(data) {
  const byId = new Map(), byTag = new Map(), byNo = new Map();
  for (const a of data.animals) { byId.set(a.id, a); if (a.tag) byTag.set(normTag(a.tag), a); if (a.cowNo != null && a.cowNo !== "" && onFarm(a)) byNo.set(String(a.cowNo), a); }
  const per = (list, key = "animalId") => { const m = new Map(); for (const r of list || []) { if (r.deleted || !r[key]) continue; if (!m.has(r[key])) m.set(r[key], []); m.get(r[key]).push(r); } for (const l of m.values()) l.sort(byDate); return m; };
  const calvings = per(data.calvings, "damId");
  const services = per(data.services), heats = per(data.heats), pds = per(data.pds), dryOffs = per(data.dryOffs), cases = per(data.mastitis), weights = per(data.weighings), trims = per(data.footTrims), fresh = per(data.freshChecks);
  // milk recording: per cow list of { date, litres, fat, protein, scc }
  const rec = new Map();
  for (const r of [...(data.recordings || [])].filter((x) => !x.deleted).sort(byDate)) for (const c of r.cows || []) {
    const id = c.animalId || byNo.get(String(c.cowNo))?.id; if (!id) continue;
    if (!rec.has(id)) rec.set(id, []); rec.get(id).push({ date: r.date, litres: c.litres, fat: c.fat, protein: c.protein, scc: c.scc });
  }
  // scores from sessions: per cow latest mobility / bcs
  const scores = new Map();
  for (const s of [...(data.scoreSessions || [])].filter((x) => !x.deleted).sort(byDate)) for (const c of s.scores || []) {
    const id = c.animalId || byNo.get(String(c.cowNo))?.id; if (!id) continue;
    const cur = scores.get(id) || {}; cur[s.method === "bcs" ? "bcs" : "mobility"] = { score: +c.score, date: s.date }; scores.set(id, cur);
  }
  const kids = new Map();
  for (const a of data.animals) { const dam = a.damId ? byId.get(a.damId) : a.damTag ? byTag.get(normTag(a.damTag)) : null; if (dam) { if (!kids.has(dam.id)) kids.set(dam.id, []); kids.get(dam.id).push(a); } }
  return { byId, byTag, byNo, calvings, services, heats, pds, dryOffs, cases, rec, scores, weights, trims, fresh, kids };
}

export const listOf = (m, a) => m.get(a.id) || [];
export function lastCalving(ix, a) { const l = listOf(ix.calvings, a); return l.length ? l[l.length - 1] : null; }
/** Last calving date: from calving records or the imported base date. */
export function calvedDate(ix, a) { const c = lastCalving(ix, a); const base = a.calvedDateBase || null; return c && (!base || c.date >= base) ? c.date : base; }
export function lactation(ix, a) { const base = +a.lactationBase || 0; const after = listOf(ix.calvings, a).filter((c) => !a.calvedDateBase || c.date > a.calvedDateBase).length; return base + after; }
export function lastDryOff(ix, a) { const l = listOf(ix.dryOffs, a); return l.length ? l[l.length - 1] : null; }
export function isDry(ix, a) { const d = lastDryOff(ix, a); const c = calvedDate(ix, a); return !!d && (!c || d.date > c); }
export function dim(ix, a, today) { const c = calvedDate(ix, a); return c && !isDry(ix, a) ? daysBetween(c, today) : null; }

/** milking | dry | heifer | calf | bull | other */
export function groupOf(ix, a, today) {
  if (lactation(ix, a) > 0 || calvedDate(ix, a)) return isDry(ix, a) ? "dry" : "milking";
  const m = ageMonths(a, today) ?? 0;
  if (m < 6) return "calf";
  if (isFemale(a)) return "heifer";
  return sexCode(a.sex) === "B" ? "bull" : "other";
}
export const GROUP_NAMES = { milking: "Milking", dry: "Dry", heifer: "Heifers", calf: "Calves", bull: "Bulls", other: "Other cattle", cull: "To cull" };

export function lastRecording(ix, a) { const l = listOf(ix.rec, a); return l.length ? l[l.length - 1] : null; }
export function sccHistory(ix, a, n = 3) { return listOf(ix.rec, a).filter((r) => r.scc != null && r.scc !== "").slice(-n).map((r) => ({ date: r.date, scc: +r.scc })); }
export function lastYield(ix, a) { const l = listOf(ix.rec, a).filter((r) => +r.litres > 0); return l.length ? { l: +l[l.length - 1].litres, date: l[l.length - 1].date } : a.lastYield || null; }
export function lastScc(ix, a) { const h = sccHistory(ix, a, 1); return h.length ? { k: h[0].scc, date: h[0].date } : a.lastScc || null; }
export function mobility(ix, a) { return ix.scores.get(a.id)?.mobility || a.mobility || null; }
export function bcs(ix, a) { return ix.scores.get(a.id)?.bcs || a.bcs || null; }

/** Lactation yield to date from recordings (trapezoid between test days, from calving). */
export function yieldToDate(ix, a, today) {
  const c = calvedDate(ix, a); if (!c) return null;
  const tests = listOf(ix.rec, a).filter((r) => r.date >= c && +r.litres > 0);
  if (!tests.length) return null;
  let total = 0, prevDate = c, prevL = +tests[0].litres;
  for (const t of tests) { total += ((prevL + +t.litres) / 2) * daysBetween(prevDate, t.date); prevDate = t.date; prevL = +t.litres; }
  const end = isDry(ix, a) ? lastDryOff(ix, a).date : today;
  if (end > prevDate) total += prevL * daysBetween(prevDate, end);
  const days = daysBetween(c, end);
  // 305-day projection: simple persistency (‑0.2%/day after the last test), only when ≥ 1 test and < 305 days
  let p305 = null;
  if (days < 305) { let l = prevL, t = total; for (let d = days; d < 305; d++) { l *= 0.998; t += l; } p305 = Math.round(t); } else p305 = null;
  return { litres: Math.round(total), days, p305, lastTest: tests[tests.length - 1] };
}

/** Cow number leads (design/12 §4.1); the tag is the second line. */
export function cowLabel(a) { return a.cowNo != null && a.cowNo !== "" ? String(a.cowNo) : tagParts(a.tag).tail || a.tag || "—"; }
export function cowName(a) { return a.name || ""; }
export function cowWithName(a) { return [cowLabel(a), a.name].filter(Boolean).join(" "); }
export function ordinal(n) { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

/** Search: cow number, name, last digits of the tag. */
export function cowMatches(a, q) {
  q = String(q || "").trim().toLowerCase(); if (!q) return true;
  if (String(a.cowNo || "").toLowerCase() === q || String(a.cowNo || "").toLowerCase().startsWith(q)) return true;
  if (a.name && a.name.toLowerCase().includes(q)) return true;
  const d = q.replace(/\D/g, "");
  if (d.length >= 3 && String(a.tag || "").replace(/\D/g, "").endsWith(d)) return true;
  return normTag(a.tag).includes(normTag(q));
}
export function sortByNo(a, b) {
  const x = parseFloat(a.cowNo), y = parseFloat(b.cowNo);
  if (!Number.isNaN(x) && !Number.isNaN(y) && x !== y) return x - y;
  return String(a.cowNo || a.tag || "").localeCompare(String(b.cowNo || b.tag || ""), "en", { numeric: true });
}
export { normTag };
