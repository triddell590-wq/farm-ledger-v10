// Mastitis, SCC and selective dry-cow therapy (design/12 §6.1, §6.4, §7.1). AHDB targets:
// clinical ≤ 30 per 100 cows per year; recurrence < 10%; cow > 200k = likely infected.
// Red Tractor DP.4: tell the vet of each antibiotic failure within 1 week; DP.6: investigation
// form after 2+ failures in a rolling 12 months.
import { addDays, daysBetween } from "../../../core/dates.js";
import { onFarm, groupOf, calvedDate, lactation, sccHistory, listOf } from "./cows.js";

export const RECUR_DAYS = 30; // same quarter within 30 days = recurrence (design/12 §6.1)
export const FAIL_DAYS = 21; // 2nd treatment, same quarter, within 21 days = treatment failure
export const HIGH = 200;

const overlap = (a, b) => (a || []).some((q) => (b || []).includes(q));

/** For a new case (cow, date, quarters) given her earlier cases: recurrence / failure / count. */
export function caseFacts(earlier, { date, quarters }, calved) {
  const prev = earlier.filter((c) => !c.deleted && c.date <= date);
  const sameQ = prev.filter((c) => overlap(c.quarters, quarters));
  const recurrence = sameQ.some((c) => daysBetween(c.date, date) <= RECUR_DAYS);
  const failure = sameQ.some((c) => c.treated !== false && daysBetween(c.date, date) <= FAIL_DAYS);
  const thisLact = prev.filter((c) => !calved || c.date >= calved).length + 1;
  return { recurrence, failure, caseNo: thisLact };
}

/** Herd figures over the last 12 months. */
export function herdMastitis(ix, data, today) {
  const from = addDays(today, -365);
  const cases = (data.mastitis || []).filter((c) => !c.deleted && c.date > from);
  const cows = data.animals.filter((a) => onFarm(a) && ["milking", "dry"].includes(groupOf(ix, a, today)));
  const n = cows.length || 0;
  const affected = new Set(cases.map((c) => c.animalId)).size;
  const recur = cases.filter((c) => c.recurrence).length;
  return {
    cases: cases.length, cows: n,
    ratePer100: n ? (cases.length / n) * 100 : null,
    pctAffected: n ? affected / n : null,
    recurrencePct: cases.length ? recur / cases.length : null,
  };
}

/** SCC lists from milk recording: high (> 200k last test), chronic (> 200k last 3), new infections. */
export function sccLists(ix, data, today) {
  const high = [], chronic = [], newInf = [];
  for (const a of data.animals.filter((x) => onFarm(x) && groupOf(ix, x, today) === "milking")) {
    const h = sccHistory(ix, a, 3); if (!h.length) continue;
    const last = h[h.length - 1];
    if (last.scc > HIGH) high.push({ a, scc: last.scc, date: last.date, history: h });
    if (h.length === 3 && h.every((x) => x.scc > HIGH)) chronic.push({ a, history: h });
    if (h.length >= 2 && last.scc > HIGH && h[h.length - 2].scc <= HIGH) newInf.push({ a, history: h });
  }
  high.sort((x, y) => y.scc - x.scc);
  return { high, chronic, newInf };
}

/** AHDB heifer triggers: > 1 in 12 heifers with clinical mastitis in their first month; > 10% over 200k at first test. */
export function heiferTriggers(ix, data, today) {
  const from = addDays(today, -365);
  const fresh = data.animals.filter((a) => lactation(ix, a) === 1 && calvedDate(ix, a) && calvedDate(ix, a) > from);
  const clin = fresh.filter((a) => listOf(ix.cases, a).some((c) => daysBetween(calvedDate(ix, a), c.date) <= 30 && c.date >= calvedDate(ix, a)));
  const tested = fresh.map((a) => ({ a, first: listOf(ix.rec, a).find((r) => r.date >= calvedDate(ix, a) && r.scc != null && r.scc !== "") })).filter((x) => x.first);
  const hi = tested.filter((x) => +x.first.scc > HIGH);
  return {
    heifers: fresh.length, clinical: clin.length, clinicalFlag: fresh.length >= 1 && clin.length / Math.max(fresh.length, 1) > 1 / 12,
    tested: tested.length, highFirst: hi.length, highFlag: tested.length > 0 && hi.length / tested.length > 0.1,
  };
}

/** Cases this lactation for one cow. */
export function casesThisLactation(ix, a) { const c = calvedDate(ix, a); return listOf(ix.cases, a).filter((x) => !c || x.date >= c); }

/**
 * Selective dry cow therapy helper (design/12 §6.4): cows due to dry off with their last 3 SCCs
 * and cases. "Low" = under 200k at all of the last 3 tests and no cases this lactation —
 * a candidate for sealant only. Never says "don't use antibiotics": the vet decides.
 */
export function sdctRow(ix, a) {
  const h = sccHistory(ix, a, 3); const cases = casesThisLactation(ix, a);
  const low = h.length === 3 && h.every((x) => x.scc < HIGH) && !cases.length;
  return { a, history: h, cases: cases.length, low };
}

/** Antibiotic failures in the last 12 months (DP.4 / DP.6). */
export function failures(data, today) {
  return (data.mastitis || []).filter((c) => !c.deleted && c.failure && c.date > addDays(today, -365)).sort((a, b) => a.date.localeCompare(b.date));
}
