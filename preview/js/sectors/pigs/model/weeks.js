// Production weeks (design/13 §3.1, §9 planner). Pig units farm by ISO week number:
// "Batch 41 farrows week 47". Dates are YYYY-MM-DD strings, as everywhere in the app.
import { addDays, daysBetween } from "./dates.js";

const d0 = (iso) => new Date(iso + "T12:00:00Z");
/** ISO-8601 week: { year, week } (week 1 holds the year's first Thursday). */
export function isoWeek(iso) {
  const d = d0(iso); const day = (d.getUTCDay() + 6) % 7; // Mon=0
  d.setUTCDate(d.getUTCDate() - day + 3); // Thursday of this week
  const year = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4, 12)); const j4day = (jan4.getUTCDay() + 6) % 7;
  const week1Thu = new Date(jan4); week1Thu.setUTCDate(jan4.getUTCDate() - j4day + 3);
  return { year, week: 1 + Math.round((d - week1Thu) / (7 * 86400000)) };
}
/** Monday (or the production week's day 1: 1=Mon … 7=Sun) of the week holding iso. */
export function weekStart(iso, startDay = 1) {
  const dow = ((d0(iso).getUTCDay() + 6) % 7) + 1; // Mon=1..Sun=7
  return addDays(iso, -((dow - startDay + 7) % 7));
}
export function weekDates(iso, startDay = 1) { const m = weekStart(iso, startDay); return Array.from({ length: 7 }, (_, i) => addDays(m, i)); }
export const weekNo = (iso) => isoWeek(iso).week;
export function weekLabel(iso) { const w = isoWeek(iso); return `Week ${w.week}`; }

// Absolute week index (weeks since Mon 5 Jan 1970) — modulo on this gives batch weeks across years.
const EPOCH = "1970-01-05";
export const weekIndex = (iso) => Math.floor(daysBetween(EPOCH, weekStart(iso)) / 7);
export const mondayOfIndex = (i) => addDays(EPOCH, i * 7);

/**
 * Batch calendar for a breeding batch served in the week of `serveDate` (design/13 §4.2, §9):
 * return check +18–24, scan +28–35, move to farrowing = due − moveDays, due = serve + gestation
 * (112–116 shown), nesting material due − 1, wean = due + lactation.
 */
export function batchDates(serveDate, s) {
  const due = addDays(serveDate, s.gestation);
  return {
    serve: serveDate, returnFrom: addDays(serveDate, s.returnFrom), returnTo: addDays(serveDate, s.returnTo),
    scanFrom: addDays(serveDate, s.scanFrom), scanTo: addDays(serveDate, s.scanTo),
    move: addDays(due, -s.moveDays), nesting: addDays(due, -1), due, dueFrom: addDays(due, -2), dueTo: addDays(due, 2),
    wean: addDays(due, s.lactation),
  };
}
/** Is the week holding iso a service week for this interval? anchorIdx = a known service week index. */
export function isServeWeek(iso, interval, anchorIdx) { if (interval <= 1) return true; return ((weekIndex(iso) - anchorIdx) % interval + interval) % interval === 0; }

/**
 * Batch farrowing planner (design/13 §9, Research C tool 2): `weeks` rows from `fromIso`.
 * Each row: { week, monday, serve: batchNo|null, farrow: batchNo|null, wean: batchNo|null, due: n }.
 * serveTarget = ceil(places ÷ rate); farrow week = serve week + 16; wean = farrow + lactation.
 * known: [{ no, serveDate, served }] for batches already served (counts), else the target is used.
 */
export function plan({ fromIso, weeks = 26, s, anchorIdx, nextNo, known = [] }) {
  const target = serveTarget(s.farrowingPlaces, s.targets.farrowRate);
  const rows = []; const start = weekIndex(fromIso) - 17;
  const byIdx = new Map(known.map((k) => [weekIndex(k.serveDate), k]));
  // number every service week from start, so a batch keeps its number from serve to wean
  let no = nextNo; const served = new Map();
  for (let i = start; i < start + weeks + 17 + 8; i++) {
    const mon = mondayOfIndex(i);
    if (!isServeWeek(mon, s.interval, anchorIdx)) continue;
    const k = byIdx.get(i);
    served.set(i, k ? { no: k.no, n: k.served } : null);
  }
  // assign numbers to planned (future/unknown) service weeks after the last known one
  const knownIdx = [...byIdx.keys()]; const lastKnown = knownIdx.length ? Math.max(...knownIdx) : weekIndex(fromIso) - 1;
  for (const [i, v] of [...served.entries()].sort((a, b) => a[0] - b[0])) if (!v && i > lastKnown) served.set(i, { no: no++, n: null, planned: true });
  const fr = s.targets.farrowRate / 100; const lacW = Math.round(s.lactation / 7);
  for (let i = weekIndex(fromIso); i < weekIndex(fromIso) + weeks; i++) {
    const sv = served.get(i) || null; const fa = served.get(i - 16) || null; const we = served.get(i - 16 - lacW) || null;
    const due = fa ? Math.round((fa.n ?? target) * fr) : 0;
    rows.push({ week: isoWeek(mondayOfIndex(i)).week, monday: mondayOfIndex(i), serve: sv ? sv.no : null, serveN: sv ? sv.n ?? target : null, farrow: fa ? fa.no : null, wean: we ? we.no : null, due, over: due > s.farrowingPlaces });
  }
  return { target, rows };
}
/** Service target: farrowing places ÷ expected farrowing rate (design/13 §4.3). */
export function serveTarget(places, farrowRatePct) { return Math.ceil(places / ((farrowRatePct || 86) / 100)); }
