// Breeding maths (design/10 §5): due dates, Suckler Cow Scheme board, heifer windows,
// births to register, fertility KPIs. Pure.
import { nifaisOnline, usesNifaisRegister } from "./region.js";
import { daysBetween, addDays, addMonths } from "../../../core/dates.js";
import { classOf, onFarm, ageMonths } from "./animals.js";
import { sexCode } from "./tags.js";
import { scLimitDays, scHeiferMaxMonths, SC_MIN_INTERVAL, SC_HEIFER_MIN_MONTHS, gestationDays, schemeYear, ON_FARM } from "./rules.js";

const after = (list, iso) => list.filter((x) => !iso || x.date > iso);
export const lastCalving = (ix, a) => { const c = ix.calvings.get(a.id) || []; return c.length ? c[c.length - 1] : null; };

/** Services and scans for one female since her last calving (or ever, for a heifer). */
export function breedingSince(data, a, since) {
  const svc = (data.services || []).filter((s) => !s.deleted && (s.femaleIds || []).includes(a.id))
    .map((s) => ({ ...s, date: s.date || s.bullIn })).filter((s) => s.date && (!since || s.date > since)).sort((x, y) => x.date.localeCompare(y.date));
  const scans = after((data.scans || []).filter((s) => !s.deleted && s.femaleId === a.id), since).sort((x, y) => x.date.localeCompare(y.date));
  return { svc, scans };
}

/**
 * When is she due? { date?, from?, to?, basis: 'scan'|'ai'|'bull'|null, empty?: true }
 * Scan with foetal age wins; then the last AI; then a bull-in window (bullIn+279 … bullOut+287).
 */
export function dueInfo(data, s, ix, a) {
  const lc = lastCalving(ix, a);
  const { svc, scans } = breedingSince(data, a, lc && lc.date);
  const scan = scans[scans.length - 1];
  if (scan && scan.result === "empty") return { basis: "scan", empty: true, scan };
  const sireBreedOf = (x) => x && (x.sireBreed || "");
  if (scan && (scan.dueDate || +scan.foetalAgeDays > 0)) {
    const lastSvc = svc[svc.length - 1];
    const date = scan.dueDate || addDays(addDays(scan.date, -(+scan.foetalAgeDays)), gestationDays(s, sireBreedOf(lastSvc)));
    return { basis: "scan", date, from: addDays(date, -4), to: addDays(date, 4), scan, twins: scan.result === "twins" };
  }
  const ai = [...svc].reverse().find((x) => x.kind === "AI");
  const bull = [...svc].reverse().find((x) => x.kind !== "AI");
  if (ai && (!bull || ai.date >= bull.date)) {
    const date = addDays(ai.date, gestationDays(s, sireBreedOf(ai)));
    return { basis: "ai", date, from: addDays(date, -4), to: addDays(date, 4), inCalf: !!scan, service: ai };
  }
  if (bull) {
    const from = addDays(bull.bullIn || bull.date, 279);
    const to = addDays(bull.bullOut || bull.plannedOut || addDays(bull.bullIn || bull.date, 63), 287);
    return { basis: "bull", from, to, date: null, inCalf: !!(scan && scan.result !== "empty"), service: bull };
  }
  return { basis: null };
}

/**
 * Suckler Cow Scheme status for a breeding female who has calved (design/10 §5.2).
 * ok | risk | cant | empty | open (served-by date still comfortable) ; deadline = last calving + limit.
 */
export function scStatus(data, s, ix, a, today) {
  const lc = lastCalving(ix, a); if (!lc) return null;
  const limit = scLimitDays(today);
  const deadline = addDays(lc.date, limit);
  const minDate = addDays(lc.date, SC_MIN_INTERVAL);
  const due = dueInfo(data, s, ix, a);
  const sinceCalving = daysBetween(lc.date, today);
  const base = { lastCalving: lc.date, deadline, limit, sinceCalving, due, minDate, serveBy: addDays(deadline, -283) };
  if (due.empty) return { ...base, status: "empty" };
  const expected = due.date || due.to;
  if (expected) {
    if (expected < minDate) return { ...base, status: "soon", expected };
    return { ...base, status: expected <= deadline ? "ok" : due.date ? "cant" : "risk", expected, interval: daysBetween(lc.date, due.date || due.from) };
  }
  if (addDays(today, 279) > deadline) return { ...base, status: "cant" };
  if (addDays(today, 283) > addDays(deadline, -21)) return { ...base, status: "risk" };
  return { ...base, status: "open" };
}
export const SC_WORDS = { ok: "On track", risk: "At risk", cant: "Can't make it", empty: "Empty", open: "Not served yet", soon: "Too soon to count" };
export const SC_LEVEL = { ok: "ok", risk: "due", cant: "late", empty: "late", open: "neutral", soon: "due" };

/** Cows calved more than 42 days ago with no service recorded since. */
export function notSeenBulling(data, ix, a, today) {
  const lc = lastCalving(ix, a); if (!lc) return false;
  if (daysBetween(lc.date, today) <= 42) return false;
  const { svc } = breedingSince(data, a, lc.date);
  return !svc.length && !(data.heats || []).some((h) => !h.deleted && h.femaleId === a.id && h.date > lc.date);
}

/** Breeding females: cows on farm plus heifers that have been served. */
export function breedingFemales(data, ix, today) {
  return data.animals.filter((a) => onFarm(a) && sexCode(a.sex) === "F" && classOf(ix, a, today) === "cow");
}

/** Heifer breeding window (design/10 §5.4). */
export function heiferWindow(data, s, ix, a, today) {
  if (!a.dob) return null;
  // latest age that still counts: the limit of the scheme year she would calve in
  let maxM = SC_HEIFER_MIN_MONTHS; for (let L = 36; L >= SC_HEIFER_MIN_MONTHS; L--) if (scHeiferMaxMonths(addMonths(a.dob, L)) >= L) { maxM = L; break; }
  const earliest = addMonths(a.dob, SC_HEIFER_MIN_MONTHS), latest = addMonths(a.dob, maxM);
  const serveFrom = addDays(earliest, -283), serveTo = addDays(latest, -283), best = addDays(addMonths(a.dob, 24), -283);
  const { svc, scans } = breedingSince(data, a, null);
  const scan = scans[scans.length - 1];
  let status = "open";
  if (scan && scan.result !== "empty") status = "inCalf";
  else if (svc.length) status = "served";
  else if (today < serveFrom) status = "young";
  else if (today > serveTo) status = "missed";
  return { earliest, latest, serveFrom, serveTo, best, maxM, status, daysLeft: daysBetween(today, serveTo) };
}
export const HEIFER_WORDS = { open: "Window open", served: "Served", inCalf: "In calf", young: "Too young", missed: "Missed" };

/** Replacement heifers: females not calved, 9 months+, not marked for finishing. */
export function replacementHeifers(data, ix, today) {
  return data.animals.filter((a) => onFarm(a) && sexCode(a.sex) === "F" && !(ix.calvings.get(a.id) || []).length && (ageMonths(a, today) ?? 0) >= 9
    && classOf(ix, a, today) !== "finisher" && (a.replacement || classOf(ix, a, today) === "heifer"));
}

/** Deadline days for a calf's registration steps. registerMode 'nifais' = NIFAIS used as the herd register. */
export function regDeadlines(s) {
  const n = usesNifaisRegister(s) ? nifaisOnline(s) : null;
  return { tag: ON_FARM.tag, nifais: ON_FARM.nifaisBirth, bvd: ON_FARM.bvd, register: n ? n.birth : ON_FARM.registerBirth, society: ON_FARM.society, dna: ON_FARM.dna };
}
/** Births to register: calves recorded through the calving flow that still have steps open. */
export function birthsToRegister(data, s, today) {
  const dl = regDeadlines(s); const out = [];
  for (const a of data.animals) {
    if (a.deleted || !a.reg || !a.dob) continue;
    const r = a.reg; const age = daysBetween(a.dob, today);
    const steps = [
      { key: "tagged", label: "Tagged", by: addDays(a.dob, dl.tag), done: r.tagged },
      { key: "bvdSample", label: "BVD sample posted", by: addDays(a.dob, dl.tag), done: r.bvdSample },
      { key: "nifais", label: "NIFAIS", by: addDays(a.dob, Math.min(dl.nifais, usesNifaisRegister(s) ? dl.register : dl.nifais)), done: r.nifais },
    ];
    if (s.pedigree) steps.push({ key: "society", label: "Society", by: addDays(a.dob, dl.society), done: r.society }, { key: "dna", label: "DNA", by: addDays(a.dob, dl.dna), done: r.dna });
    if (steps.every((x) => x.done)) continue;
    for (const st of steps) { st.left = daysBetween(today, st.by); st.level = st.done ? "ok" : st.left < 0 ? "late" : st.left <= 7 ? "due" : "info"; }
    const late = steps.some((x) => !x.done && x.left < 0 && (x.key === "tagged" || x.key === "nifais"));
    out.push({ animal: a, age, steps, late, scLost: late, bvdMissing: !a.bvd?.status && age >= 30 });
  }
  return out.sort((x, y) => x.animal.dob.localeCompare(y.animal.dob));
}

/** Fertility KPIs for a calving year (design/10 §5.5). Calvings in `year` (calendar). */
export function fertilityKpis(data, ix, year) {
  const all = []; for (const [damId, list] of ix.calvings) for (const c of list) all.push({ ...c, damId });
  const yc = all.filter((c) => c.date.startsWith(String(year))).sort((a, b) => a.date.localeCompare(b.date));
  const intervals = [];
  for (const c of yc) { const l = ix.calvings.get(c.damId); const i = l.findIndex((x) => x.date === c.date); if (i > 0) intervals.push(daysBetween(l[i - 1].date, c.date)); }
  const start = yc[0]?.date;
  const in3 = start ? yc.filter((c) => daysBetween(start, c.date) <= 21).length : 0;
  const in6 = start ? yc.filter((c) => daysBetween(start, c.date) <= 42).length : 0;
  const firsts = []; for (const [damId, l] of ix.calvings) { const d = ix.byId.get(damId); if (d?.dob && l[0]?.date.startsWith(String(year))) firsts.push(daysBetween(d.dob, l[0].date) / 30.4375); }
  let born = 0, alive = 0; for (const c of yc) for (const k of c.calves || [{}]) { born++; if (k.alive !== false) alive++; }
  const calves = yc.flatMap((c) => (c.calves || []).map((k) => k.animalId).filter(Boolean)).map((id) => ix.byId.get(id)).filter(Boolean);
  const died = calves.filter((k) => k.offTo === "Dead" && k.offDate && daysBetween(k.dob, k.offDate) < 240).length;
  const females = new Set(yc.map((c) => c.damId)).size;
  const weeks = []; if (start) for (const c of yc) { const w = Math.floor(daysBetween(start, c.date) / 7); weeks[w] = (weeks[w] || 0) + 1; }
  return {
    calvings: yc.length, start,
    interval: intervals.length ? Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length) : null,
    pct3: yc.length ? Math.round((in3 / yc.length) * 100) : null, pct6: yc.length ? Math.round((in6 / yc.length) * 100) : null,
    firstCalvingMonths: firsts.length ? Math.round((firsts.reduce((a, b) => a + b, 0) / firsts.length) * 10) / 10 : null,
    bornAlivePer100: females ? Math.round((alive / females) * 100) : null,
    mortality: alive ? Math.round((died / alive) * 1000) / 10 : null,
    weeks: Array.from({ length: weeks.length }, (_, i) => weeks[i] || 0),
  };
}

/** SC Scheme year report: per calving in the scheme year, does it qualify and why not. */
export function scYearReport(data, ix, startYear) {
  const rows = [];
  for (const [damId, list] of ix.calvings) {
    list.forEach((c, i) => {
      if (schemeYear(c.date) !== startYear) return;
      const dam = ix.byId.get(damId); const reasons = [];
      if (i > 0) { const iv = daysBetween(list[i - 1].date, c.date); if (iv > scLimitDays(c.date)) reasons.push(`interval ${iv} days (limit ${scLimitDays(c.date)})`); if (iv < SC_MIN_INTERVAL) reasons.push(`interval ${iv} days — too soon to count (needs ${SC_MIN_INTERVAL}+)`); }
      else if (dam?.dob) { const m = daysBetween(dam.dob, c.date) / 30.4375; if (m > scHeiferMaxMonths(c.date)) reasons.push(`first calving at ${Math.floor(m)} months`); if (m < SC_HEIFER_MIN_MONTHS) reasons.push("first calving under 21 months"); }
      for (const k of c.calves || []) { const calf = k.animalId && ix.byId.get(k.animalId); if (calf?.reg) { if (calf.reg.tagged && calf.reg.tagged > addDays(calf.dob, 20)) reasons.push("tagged late"); if (calf.reg.nifais && calf.reg.nifais > addDays(calf.dob, 27)) reasons.push("registered late"); } }
      rows.push({ dam, date: c.date, qualifies: !reasons.length, reasons });
    });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}
