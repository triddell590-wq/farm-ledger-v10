// Formatting for farmers (design/00 §4.1): tags with the read-aloud digits bold, money with a
// true minus, dates in the three agreed styles, units always shown.
import { html, raw } from "../core/html.js";
import { shortDate, daysBetween, todayStr } from "../core/dates.js";

/** UK tag "UK9 012345 701086" -> "UK 9 01234 5 70108 6" style with the 5 read-aloud digits bold. */
export function formatTag(tag) {
  const s = String(tag || "").replace(/\s+/g, "").toUpperCase();
  const m = /^(UK)(\d)(\d{5})(\d)(\d{5})(\d)$/.exec(s);
  if (m) return html`<span class="tag-num">${m[1]} ${m[2]} ${m[3]} ${m[4]} <b>${m[5]}</b> ${m[6]}</span>`;
  // NI tags (v9 layout): UK/XI + lead digit + 6-digit herd + 4-digit animal + check digit
  const n = /^(UK|XI)(\d)(\d{6})(\d{4})(\d)$/.exec(s);
  if (n) return html`<span class="tag-num">${n[1]} ${n[2]} ${n[3]} <b>${n[4]} ${n[5]}</b></span>`;
  return html`<span class="tag-num">${tag || ""}</span>`;
}
export function tagText(tag) {
  const s = String(tag || "").replace(/\s+/g, "").toUpperCase();
  const m = /^(UK)(\d)(\d{5})(\d)(\d{5})(\d)$/.exec(s);
  if (m) return `${m[1]} ${m[2]} ${m[3]} ${m[4]} ${m[5]} ${m[6]}`;
  const n = /^(UK|XI)(\d)(\d{6})(\d{4})(\d)$/.exec(s);
  return n ? `${n[1]} ${n[2]} ${n[3]} ${n[4]} ${n[5]}` : String(tag || "");
}
const nf0 = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const num = (n, dp = 0) => (dp ? new Intl.NumberFormat("en-GB", { maximumFractionDigits: dp }).format(n || 0) : nf0.format(n || 0));
/** £1,234 (whole pounds) or £1,234.50 with pence=true; negatives "−£240". Returns plain text. */
export function moneyText(v, pence = false) {
  const n = Number(v) || 0; const a = Math.abs(n);
  return (n < 0 ? "−" : "") + "£" + (pence ? nf2.format(a) : nf0.format(Math.round(a)));
}
export function money(v, pence = false) {
  const n = Number(v) || 0; const a = Math.abs(n);
  return html`${n < 0 ? "−" : ""}<span class="money-sign">£</span>${pence ? nf2.format(a) : nf0.format(Math.round(a))}`;
}
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** "Tue 14 Oct" for lists */
export function listDate(iso) { if (!iso) return ""; const d = new Date(iso.slice(0, 10) + "T12:00:00"); return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`; }
/** "14 Oct 2026" for records */
export const recordDate = shortDate;
/** "Tuesday 14 October" */
export function longDate(d = new Date()) { return `${DAY_LONG[d.getDay()]} ${d.getDate()} ${MONTH_LONG[d.getMonth()]}`; }
/** "in 3 days", "today", "2 days overdue" */
export function relDays(iso, from = todayStr()) {
  const n = daysBetween(from, iso);
  if (n === 0) return "today"; if (n === 1) return "tomorrow"; if (n === -1) return "1 day overdue";
  return n > 0 ? `in ${n} days` : `${-n} days overdue`;
}
export function timeHM(d) { d = d instanceof Date ? d : new Date(d); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; }
export function initials(name) {
  const p = String(name || "?").trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || "?") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}
export function avatarClass(name) { let h = 0; for (const c of String(name || "")) h = (h * 31 + c.charCodeAt(0)) | 0; return "av" + (Math.abs(h) % 6); }
export function avatar(name) { return html`<span class="avatar ${avatarClass(name)}" aria-hidden="true">${initials(name)}</span>`; }
export function plural(n, one, many = one + "s") { return `${num(n)} ${n === 1 ? one : many}`; }
export { raw };
