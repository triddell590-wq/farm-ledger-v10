// The per-cow fertility loop (design/12 §5): calved → waiting period → heat → serve → repeat?
// → PD → dry off → calve. Pure date maths over the herd index; formulas shown in the UI.
import { addDays, daysBetween } from "../../../core/dates.js";
import { onFarm, calvedDate, isDry, groupOf, ageMonths, isFemale, listOf, lactation } from "./cows.js";
import { gestationDays } from "./settings.js";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const dm = (iso) => (iso ? `${+iso.slice(8, 10)} ${MON[+iso.slice(5, 7) - 1]}` : "");

/** This lactation's fertility facts for one female. */
export function fertilityOf(s, ix, a, today) {
  const calved = calvedDate(ix, a);
  const since = calved || "0000-00-00";
  const heats = listOf(ix.heats, a).filter((h) => h.date > since);
  const serves = listOf(ix.services, a).filter((x) => x.date > since);
  const lastServe = serves[serves.length - 1] || null;
  const lastHeat = heats[heats.length - 1] || null;
  const pdsAfter = lastServe ? listOf(ix.pds, a).filter((p) => p.date >= lastServe.date) : [];
  const pd = pdsAfter[pdsAfter.length - 1] || null;
  const pregnant = !!(pd && pd.result === "+");
  const empty = !!(pd && pd.result === "-");
  const lastEvent = [lastHeat?.date, lastServe?.date].filter(Boolean).sort().pop() || null;
  const due = lastServe && !empty ? addDays(lastServe.date, gestationDays(s, lastServe.sireBreed)) : null;
  const dryOffDue = pregnant && due ? addDays(due, -s.dryPeriod) : null;
  const dimDays = calved && !isDry(ix, a) ? daysBetween(calved, today) : null;
  const heifer = !calved;
  const breedable = heifer ? isFemale(a) && (ageMonths(a, today) ?? 0) >= s.heiferServeMonths : true;
  const pastVwp = heifer ? breedable : dimDays != null && dimDays >= s.vwp;
  return { calved, heats, serves, lastServe, lastHeat, pd, pregnant, empty, lastEvent, due, dryOffDue, dim: dimDays, heifer, breedable, pastVwp, doNotBreed: !!(a.doNotBreed || a.cull?.on), serviceNo: serves.length };
}

/** Females in the breeding loop: cows not dry + heifers of serving age. */
export function breedingFemales(s, ix, data, today) {
  return data.animals.filter((a) => onFarm(a) && isFemale(a) && ["milking", "dry", "heifer"].includes(groupOf(ix, a, today)));
}

/**
 * Action lists. horizon 0 = Today, 7 = This week. Returns groups in the design's order:
 * heats, serve, notSeen, pd, dryOff, calving, doNotBreed — each [{ a, f, why, date }].
 */
export function actionLists(s, ix, data, today, horizon = 0) {
  const end = addDays(today, horizon);
  const g = { heats: [], serve: [], notSeen: [], pd: [], dryOff: [], calving: [], doNotBreed: [] };
  for (const a of breedingFemales(s, ix, data, today)) {
    const f = fertilityOf(s, ix, a, today); const dry = isDry(ix, a);
    if (f.doNotBreed) { g.doNotBreed.push({ a, f, why: a.cull?.reason || "Do not breed" }); }
    // calving and dry-off apply whatever the breeding status
    if (f.due && !f.empty) {
      const d = daysBetween(today, f.due);
      if (d <= 14 + horizon && d >= -30 && (f.pregnant || dry || f.heifer)) g.calving.push({ a, f, date: f.due, why: d >= 0 ? `due ${d === 0 ? "today" : `in ${d} d`}` : `${-d} d over` });
    }
    if (f.dryOffDue && !dry && f.dryOffDue <= addDays(end, 7)) g.dryOff.push({ a, f, date: f.dryOffDue });
    if (f.doNotBreed || f.pregnant || dry || !f.breedable) continue;
    // PD due: served pdFrom+ days ago and no PD since
    if (f.lastServe && !f.pd) {
      const d = daysBetween(f.lastServe.date, end);
      if (d >= s.pdFrom && daysBetween(f.lastServe.date, today) <= 120) { g.pd.push({ a, f, date: addDays(f.lastServe.date, s.pdFrom), why: `served ${daysBetween(f.lastServe.date, today)} d ago` }); }
    }
    // To serve: seen bulling in the last day, not served since
    if (f.lastHeat && (!f.lastServe || f.lastServe.date < f.lastHeat.date) && daysBetween(f.lastHeat.date, today) <= 1 && f.pastVwp) { g.serve.push({ a, f, date: f.lastHeat.date, why: `seen bulling ${f.lastHeat.date === today ? "today" : "yesterday"}` }); continue; }
    // Empty at PD and no heat since: watch her
    if (f.empty && (!f.lastHeat || f.lastHeat.date < f.pd.date)) { g.heats.push({ a, f, date: f.pd.date, why: `PD− on ${dm(f.pd.date)} · watch for heat` }); continue; }
    // Heats due: repeat window after the last heat or serve
    if (f.lastEvent) {
      const from = addDays(f.lastEvent, s.heatFrom), to = addDays(f.lastEvent, s.heatTo);
      if (from <= end && to >= today && !(f.lastServe && f.pd)) g.heats.push({ a, f, date: addDays(f.lastEvent, 21), why: f.lastServe && f.lastServe.date === f.lastEvent ? `served ${dm(f.lastEvent)} · watch for repeat` : `last heat ${dm(f.lastEvent)} (day ${daysBetween(f.lastEvent, today)})` });
      continue;
    }
    // Nothing seen yet this lactation
    if (!f.heifer && f.dim != null) {
      if (f.dim > s.vwp + 21) g.notSeen.push({ a, f, why: `${f.dim} DIM · no heat seen` });
      else if (f.dim + horizon >= s.vwp) g.heats.push({ a, f, date: addDays(f.calved, s.vwp), why: `${f.dim} DIM · first heat after waiting period` });
    }
  }
  const sortD = (x, y) => String(x.date || "").localeCompare(String(y.date || ""));
  for (const k of Object.keys(g)) g[k].sort(sortD);
  return g;
}

/** Was this service the one that got her in calf? (a later PD+ with no service in between) */
export function conceived(ix, a, svc) {
  const later = listOf(ix.services, a).filter((x) => x.date > svc.date);
  const nextSvc = later[0]?.date || "9999";
  return listOf(ix.pds, a).some((p) => p.result === "+" && p.date >= svc.date && p.date < nextSvc);
}

/**
 * 21-day pregnancy and submission rates for the last `periods` complete 21-day periods.
 * Eligible = in milk, past VWP at the period start, not pregnant then, not "do not breed".
 * Periods that end fewer than pdTo days ago are "pending" (PDs not done yet).
 */
export function rates21(s, ix, data, today, periods = 6) {
  const out = [];
  const cows = data.animals.filter((a) => !a.deleted && isFemale(a) && (lactation(ix, a) > 0 || calvedDate(ix, a)));
  for (let p = periods; p >= 1; p--) {
    const start = addDays(today, -21 * p - s.pdTo), endP = addDays(start, 20);
    let eligible = 0, served = 0, preg = 0;
    for (const a of cows) {
      if (a.onDate && a.onDate > start) continue; if (a.offDate && a.offDate < start) continue;
      if (a.doNotBreed || a.cull?.on) continue;
      const calvings = listOf(ix.calvings, a).map((c) => c.date).concat(a.calvedDateBase ? [a.calvedDateBase] : []).filter((d) => d <= start).sort();
      const calved = calvings[calvings.length - 1]; if (!calved) continue;
      if (daysBetween(calved, start) < s.vwp) continue;
      const svcs = listOf(ix.services, a).filter((x) => x.date > calved);
      if (svcs.some((x) => x.date < start && conceived(ix, a, x))) continue; // already pregnant
      const dried = listOf(ix.dryOffs, a).some((d) => d.date > calved && d.date <= start); if (dried) continue;
      eligible++;
      const inP = svcs.filter((x) => x.date >= start && x.date <= endP);
      if (inP.length) served++;
      if (inP.some((x) => conceived(ix, a, x))) preg++;
    }
    out.push({ start, end: endP, eligible, served, preg, prRate: eligible ? preg / eligible : null, subRate: eligible ? served / eligible : null });
  }
  return out;
}

/** % pregnant at PD: PD+ ÷ PDs done 32–39 days after the service they check (last 12 months). */
export function pctPregnantAtPd(ix, data, today) {
  let n = 0, pos = 0, all = 0, allPos = 0;
  for (const p of (data.pds || []).filter((x) => !x.deleted && x.date >= addDays(today, -365))) {
    const a = ix.byId.get(p.animalId); if (!a) continue;
    const svc = listOf(ix.services, a).filter((x) => x.date <= p.date).pop(); if (!svc) continue;
    const d = daysBetween(svc.date, p.date); all++; if (p.result === "+") allPos++;
    if (d >= 32 && d <= 39) { n++; if (p.result === "+") pos++; }
  }
  return { n, rate: n ? pos / n : null, all, allRate: all ? allPos / all : null };
}

/** Pregnancies per 100 cows per week over the last 4 complete weeks before the PD lag. */
export function weeklyPregnancies(s, ix, data, today) {
  const end = addDays(today, -s.pdTo), start = addDays(end, -28);
  const cows = data.animals.filter((a) => onFarm(a) && ["milking", "dry"].includes(groupOf(ix, a, today))).length;
  let preg = 0;
  for (const svc of (data.services || []).filter((x) => !x.deleted && x.date > start && x.date <= end)) { const a = ix.byId.get(svc.animalId); if (a && conceived(ix, a, svc)) preg++; }
  return { cows, preg, rate: cows ? (preg / 4) * (100 / cows) : null };
}

/** Block herds: % of cows in calf by day 42 of the breeding season. */
export function sixWeekInCalf(s, ix, data, today, { heifers = false } = {}) {
  if (!s.breedingStart) return null;
  const end = addDays(s.breedingStart, 41);
  const pool = data.animals.filter((a) => !a.deleted && isFemale(a) && (!a.offDate || a.offDate >= s.breedingStart) && (heifers ? !calvedDate(ix, a) && (ageMonths(a, s.breedingStart) ?? 0) >= s.heiferServeMonths : !!calvedDate(ix, a)) && !a.doNotBreed);
  let inCalf = 0;
  for (const a of pool) if (listOf(ix.services, a).some((x) => x.date >= s.breedingStart && x.date <= end && conceived(ix, a, x))) inCalf++;
  const week = Math.min(s.breedingWeeks, Math.max(1, Math.floor(daysBetween(s.breedingStart, today) / 7) + 1));
  return { cows: pool.length, inCalf, rate: pool.length ? inCalf / pool.length : null, week, complete: today > addDays(end, s.pdTo) };
}

/** Mean calving interval (cows calved in the last 12 months that have an earlier calving). */
export function calvingInterval(ix, data, today) {
  const v = [];
  for (const a of data.animals) {
    const c = listOf(ix.calvings, a).map((x) => x.date); if (a.calvedDateBase && !c.includes(a.calvedDateBase)) c.push(a.calvedDateBase); c.sort();
    for (let i = 1; i < c.length; i++) if (c[i] >= addDays(today, -365)) v.push(daysBetween(c[i - 1], c[i]));
  }
  return { n: v.length, days: v.length ? Math.round(v.reduce((x, y) => x + y, 0) / v.length) : null };
}
/** Mean age at first calving (months), first calvings in the last 12 months. */
export function ageFirstCalving(ix, data, today) {
  const v = [];
  for (const a of data.animals) { if (!a.dob || +a.lactationBase) continue; const c = listOf(ix.calvings, a)[0]; if (c && c.date >= addDays(today, -365)) v.push(daysBetween(a.dob, c.date) / 30.4375); }
  return { n: v.length, months: v.length ? Math.round((v.reduce((x, y) => x + y, 0) / v.length) * 10) / 10 : null };
}

/** Straws: count left after services that used them. */
export function strawsLeft(straws, services) {
  return straws.filter((x) => !x.deleted).map((x) => ({ ...x, left: (+x.count || 0) - services.filter((v) => !v.deleted && v.strawId === x.id).length }));
}
