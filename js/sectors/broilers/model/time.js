// Date and time helpers for broilers: local "YYYY-MM-DDTHH:MM" strings (no time-zone surprises,
// as everywhere else in the app), hours arithmetic, NI working days and bank holidays.
import { addDays, daysBetween } from "../../../core/dates.js";
import { NI_FIXED_HOLIDAYS } from "./content.js";

const p2 = (n) => String(n).padStart(2, "0");
export function nowStr(d = new Date()) { return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`; }
export const datePart = (s) => String(s || "").slice(0, 10);
export const timePart = (s) => String(s || "").slice(11, 16);
export const at = (date, time = "00:00") => `${date}T${time || "00:00"}`;
export function addHours(s, h) {
  const d = new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13) || 0, +s.slice(14, 16) || 0));
  d.setUTCMinutes(d.getUTCMinutes() + Math.round(h * 60));
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}T${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}
export function hoursBetween(a, b) {
  const t = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13) || 0, +s.slice(14, 16) || 0);
  return (t(b) - t(a)) / 3600000;
}
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]; const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Mon 20 Oct" */
export function dayLabel(iso) { if (!iso) return ""; const d = new Date(datePart(iso) + "T12:00:00Z"); return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; }
/** "Wed 22 Oct 12:00" */
export const whenLabel = (s) => `${dayLabel(s)}${timePart(s) ? " " + timePart(s) : ""}`;
export const dowOf = (iso) => new Date(iso + "T12:00:00Z").getUTCDay();

/** Easter Sunday (Anonymous Gregorian algorithm). */
export function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${y}-${p2(month)}-${p2(day)}`;
}
const firstMon = (y, m) => { let d = `${y}-${p2(m)}-01`; while (dowOf(d) !== 1) d = addDays(d, 1); return d; };
const lastMon = (y, m) => { const e = new Date(Date.UTC(y, m, 0)); let d = `${y}-${p2(m)}-${p2(e.getUTCDate())}`; while (dowOf(d) !== 1) d = addDays(d, -1); return d; };

/** Northern Ireland bank holidays for a year, with weekend substitutes. */
export function niBankHolidays(y) {
  const out = new Set(); const weekend = (d) => dowOf(d) === 0 || dowOf(d) === 6;
  const fixed = NI_FIXED_HOLIDAYS.map((md) => `${y}-${md}`);
  for (const d of fixed) if (!weekend(d)) out.add(d);
  for (const d of fixed) if (weekend(d)) { let s = addDays(d, 1); while (weekend(s) || out.has(s)) s = addDays(s, 1); out.add(s); }
  const e = easter(y); out.add(addDays(e, -2)); out.add(addDays(e, 1));
  out.add(firstMon(y, 5)); out.add(lastMon(y, 5)); out.add(lastMon(y, 8));
  return out;
}
export function isWorkingDay(iso) {
  const w = dowOf(iso); if (w === 0 || w === 6) return false;
  return !niBankHolidays(+iso.slice(0, 4)).has(iso);
}
/** The date n working days before iso (iso itself not counted). */
export function workingDaysBefore(iso, n) { let d = iso; let k = 0; while (k < n) { d = addDays(d, -1); if (isWorkingDay(d)) k++; } return d; }
/** Working days from a (exclusive) to b (inclusive). */
export function workingDaysBetween(a, b) { if (b <= a) return 0; let k = 0; let d = a; while (d < b) { d = addDays(d, 1); if (isWorkingDay(d)) k++; } return k; }
export { addDays, daysBetween };
