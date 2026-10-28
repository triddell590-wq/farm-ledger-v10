// Milkings and the milk-withhold board (design/12 §3.2). Time unit is the milking: a cow's
// milk is "OK from <day> <am/pm> milking" — the first milking at or after the end of the
// withdrawal (last dose + milk withdrawal hours). Robot farms get the exact time.
// Times are local wall-clock strings "YYYY-MM-DDTHH:MM" so they sort and never shift zone.
import { addDays } from "../../../core/dates.js";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (x) => String(x).padStart(2, "0");

export function nowStr(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }
export const at = (date, time = "00:00") => `${date}T${time || "00:00"}`;
export const datePart = (s) => String(s || "").slice(0, 10);
export const timePart = (s) => String(s || "").slice(11, 16);
/** Add hours to a wall-clock time string. */
export function addHours(s, h) {
  const [d, t] = s.split("T"); const [hh, mm] = (t || "00:00").split(":").map(Number);
  let mins = hh * 60 + mm + Math.round(h * 60); let days = Math.floor(mins / 1440); mins -= days * 1440;
  return `${addDays(d, days)}T${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
}
export function hoursBetween(a, b) {
  const ms = (s) => { const [d, t] = s.split("T"); const [hh, mm] = (t || "00:00").split(":").map(Number); return Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10), hh, mm); };
  return (ms(b) - ms(a)) / 3600000;
}
export function dayLabel(date) { const d = new Date(date + "T12:00:00Z"); return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; }

/** The farm's milkings on a date: [{ at, time, part:'am'|'pm', n }]. Robot farms have none. */
export function milkingsOn(s, date) {
  if (s.robot) return [];
  const times = [...s.milkingTimes].sort();
  return times.map((t, i) => ({ at: at(date, t), time: t, n: i, part: times.length === 3 ? ["am", "midday", "pm"][i] : +t.slice(0, 2) < 12 ? "am" : "pm" }));
}
/** First milking at or after a time (parlour). */
export function milkingAtOrAfter(s, when) {
  for (let i = 0; i < 4; i++) { const m = milkingsOn(s, addDays(datePart(when), i)).find((x) => x.at >= when); if (m) return m; }
  return null;
}
/** The milking that has most recently started (today or yesterday's last). */
export function currentMilking(s, now) {
  const today = datePart(now);
  const list = [...milkingsOn(s, addDays(today, -1)), ...milkingsOn(s, today)].filter((m) => m.at <= now);
  return list.length ? list[list.length - 1] : null;
}
export const partWord = (p) => ({ am: "morning", pm: "afternoon", midday: "midday" }[p] || p);
export function milkingLabel(m) { return m ? `${dayLabel(datePart(m.at))} · ${m.part} milking` : ""; }

/**
 * Work out a milk withdrawal. t: { date, time, doses, intervalH, wdMilkHours }.
 * Returns { lastDoseAt, endsAt, okFrom, label } — okFrom is the first milking at/after endsAt
 * (parlour) or endsAt itself (robot). wdMilkHours 0/blank -> no withhold (okFrom null, none:true).
 */
export function withdrawalFor(s, t) {
  const start = at(t.date, t.time || "12:00");
  const doses = Math.max(1, +t.doses || 1); const every = +t.intervalH || 0;
  const lastDoseAt = addHours(start, (doses - 1) * every);
  const h = +t.wdMilkHours || 0;
  if (!h) return { lastDoseAt, endsAt: lastDoseAt, okFrom: null, none: true, label: "No milk withdrawal" };
  const endsAt = addHours(lastDoseAt, h);
  if (s.robot) return { lastDoseAt, endsAt, okFrom: endsAt, label: `${dayLabel(datePart(endsAt))} ${timePart(endsAt)}` };
  const m = milkingAtOrAfter(s, endsAt);
  return { lastDoseAt, endsAt, okFrom: m ? m.at : endsAt, label: m ? milkingLabel(m) : dayLabel(datePart(endsAt)), milking: m };
}
/** Course doses as times: [{ n, at }] (n from 1). */
export function courseTimes(t) {
  const start = at(t.date, t.time || "12:00"); const doses = Math.max(1, +t.doses || 1); const every = +t.intervalH || 0;
  return Array.from({ length: doses }, (_, i) => ({ n: i + 1, at: addHours(start, i * every) }));
}
export function okLabel(s, okFrom) {
  if (!okFrom) return "";
  if (s.robot) return `${dayLabel(datePart(okFrom))} ${timePart(okFrom)}`;
  const m = milkingAtOrAfter(s, okFrom); return m ? milkingLabel(m) : dayLabel(datePart(okFrom));
}

/**
 * Effective "milk OK from" for a withhold record. Dry-cow treatments wait for calving:
 * OK from max(record.okFrom, calving + afterCalvingHours) once she has calved after the
 * treatment; until then { pendingCalving: true }.
 */
export function effectiveOk(s, w, calvedAfter) {
  if (!w.dryCow) return { okFrom: w.okFrom };
  if (!calvedAfter) return { okFrom: null, pendingCalving: true };
  const fromCalving = addHours(at(calvedAfter.date, calvedAfter.time || "12:00"), +w.afterCalvingHours || 0);
  const raw = !w.okFrom || fromCalving > w.okFrom ? fromCalving : w.okFrom;
  if (s.robot) return { okFrom: raw };
  const m = milkingAtOrAfter(s, raw); return { okFrom: m ? m.at : raw };
}

/**
 * The board. withholds: milkWithhold records; ix: herd index; now: wall-clock string.
 * Returns { withheld[], release[], dryPending[] } each item { w, cow, okFrom, label }.
 * withheld = milk must stay out now; release = withdrawal over, waiting for a deliberate tap.
 */
export function board(s, withholds, ix, now) {
  const out = { withheld: [], release: [], dryPending: [] };
  for (const w of withholds) {
    if (w.deleted || w.releasedAt) continue;
    const cow = ix.byId.get(w.animalId); if (!cow || cow.offDate) continue;
    const calvings = ix.calvings.get(cow.id) || [];
    const calvedAfter = w.dryCow ? calvings.find((c) => at(c.date, c.time || "12:00") >= (w.lastDoseAt || w.date)) : null;
    const e = effectiveOk(s, w, calvedAfter);
    const item = { w, cow, okFrom: e.okFrom, label: e.pendingCalving ? `Dry cow — milk OK from calving + ${milkingsIn(s, w.afterCalvingHours)}` : okLabel(s, e.okFrom) };
    if (e.pendingCalving) out.dryPending.push(item);
    else if (e.okFrom && now >= e.okFrom) out.release.push(item);
    else out.withheld.push(item);
  }
  const byNo = (a, b) => String(a.cow.cowNo || "").localeCompare(String(b.cow.cowNo || ""), "en", { numeric: true });
  out.withheld.sort(byNo); out.release.sort(byNo); out.dryPending.sort(byNo);
  return out;
}
/** "6 milkings" for a number of hours at the farm's milking frequency. */
export function milkingsIn(s, hours) {
  const per = s.robot ? 2.8 : Math.max(1, s.milkingTimes.length);
  const n = Math.ceil((+hours || 0) / (24 / per));
  return `${n} milking${n === 1 ? "" : "s"}`;
}
export const QUARTERS = ["LF", "RF", "LH", "RH"];
export const QUARTER_NAMES = { LF: "left front", RF: "right front", LH: "left hind", RH: "right hind" };
export function quartersText(q) { return !q || !q.length ? "" : q.length === 4 ? "All four" : q.join(" "); }
