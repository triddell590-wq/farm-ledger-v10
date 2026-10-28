// The legal paper chain before every slaughter (design/15 §7, §8, §11): Salmonella window,
// FCI send-by, feed-off time, medicine withdrawal against the catch, turnaround days.
import { regionRule } from "./content.js";
import { addDays, daysBetween, addHours, hoursBetween, datePart, at } from "./time.js";
import { listOf, cropEvents, cropDay } from "./crop.js";

/** Salmonella sampling window for a slaughter date: { from, to, doBy, days } (Reg. 200/2012). */
export function salmWindow(slaughterDate, s, ageAtSlaughter = 0) {
  const R = regionRule("broilerSalmonella");
  const long = !!(s?.organic || s?.longLife || ageAtSlaughter >= R.longAgeDays);
  const days = long ? R.longWindowDays : R.windowDays;
  return { from: addDays(slaughterDate, -days), to: slaughterDate, doBy: addDays(slaughterDate, -R.warnDaysBefore), days, noLitterFrom: addDays(addDays(slaughterDate, -R.warnDaysBefore), -R.noLitterDays) };
}
/** The sample that covers a slaughter event (taken within its window), newest first. */
export function sampleFor(ix, crop, ev, s) {
  const w = salmWindow(ev.date, s, ev.day);
  return listOf(ix.salm, crop.id).filter((x) => x.date >= w.from && x.date <= w.to).sort((a, b) => b.date.localeCompare(a.date))[0] || null;
}
export const salmPositive = (x) => !!x && ["SE", "ST", "mST"].includes(x.result);
export const salmResultText = (r) => ({ pending: "Waiting for result", negative: "Negative", SE: "S. Enteritidis — positive", ST: "S. Typhimurium — positive", mST: "Monophasic S. Typhimurium — positive", other: "Other Salmonella (not S.E./S.T.)" }[r] || "Waiting for result");

/** Salmonella status for each remaining slaughter event: [{ ev, window, sample, state: ok|open|due|late|positive|waiting }] */
export function salmStatus(ix, crop, s, today) {
  return cropEvents(ix, crop, s).filter((e) => !e.done).map((ev) => {
    const w = salmWindow(ev.date, s, ev.day); const smp = sampleFor(ix, crop, ev, s);
    let state = "future";
    if (smp) state = salmPositive(smp) ? "positive" : smp.result === "negative" ? "ok" : "waiting";
    else if (today > w.doBy) state = "late";
    else if (today >= w.from) state = "open";
    if (!smp && today >= addDays(w.doBy, -2) && today <= w.doBy) state = "due";
    return { ev, window: w, sample: smp, state };
  });
}

/** Arrival at the plant (catch + travel hours) and the FCI send-by time (arrival − 24 h). */
export function arrivalOf(catchAt, s) { return addHours(catchAt, +(s?.arrivalHoursAfterCatch || 0)); }
export function fciSendBy(catchAt, s, arrivalAt) { return addHours(arrivalAt || arrivalOf(catchAt, s), -regionRule("fci").hoursBefore); }
/** Feed-off: default catch − s.feedOffHours. Level of a chosen time: ok | due (> 9 h, Red Tractor) | late (> 12 h, law). */
export const feedOffDefault = (catchAt, s) => addHours(catchAt, -(+s?.feedOffHours || 9));
export function feedOffLevel(feedOffAt, catchAt) {
  const R = regionRule("feedWithdrawal"); const h = hoursBetween(feedOffAt, catchAt);
  return { hours: h, level: h > R.lawHours ? "late" : h > R.schemeHours ? "due" : "ok", text: h > R.lawHours ? `${fmtH(h)} — over the legal 12 hours` : h > R.schemeHours ? `${fmtH(h)} — Red Tractor allows 9 hours` : `${fmtH(h)}` };
}
const fmtH = (h) => `${Math.round(h * 10) / 10} h`;

/** In-water medicine withdrawal end (meat): last treatment day + withdrawal days. */
export function withdrawalEnd(m) {
  if (m.withdrawalEnd) return m.withdrawalEnd;
  const last = addDays(m.date, Math.max(0, (+m.days || 1) - 1));
  return addDays(last, +m.wdDays || 0);
}
/** Medicines whose withdrawal ends after a catch date (they block the thin/clear). */
export function withdrawalClashes(ix, crop, catchDate) {
  return listOf(ix.meds, crop.id).filter((m) => withdrawalEnd(m) > catchDate);
}
/** Medicines given in the FCI's relevant period (this crop) with their withdrawal ends. */
export function medsForFci(ix, crop) { return listOf(ix.meds, crop.id).map((m) => ({ ...m, wdEnd: withdrawalEnd(m) })); }

/** Turnaround: days empty so far (or in total), and the ≥ 5 calendar day Red Tractor rule. */
export function turnaroundDays(ta, today) {
  const end = ta.placedDate || today; const days = daysBetween(ta.clearedDate, end);
  const planned = ta.nextPlacement ? daysBetween(ta.clearedDate, ta.nextPlacement) : null;
  return { days, planned, short: planned != null && planned < 5, shortActual: !!ta.placedDate && days < 5 };
}
export const MIN_TURNAROUND = 5;
export { at, datePart, cropDay };
