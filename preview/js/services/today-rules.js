// The rules for "what's on today" (review fixes 1B): one place that decides what goes in
// "To do today" and what waits in "Coming up", how a job's due line reads, when an alert and a
// job are the same obligation, and what the bell counts. Pure functions only (no DOM, no clock
// except `today` passed in), so the ledger homes, Farm → Today, the bell and the Node sender agree.
import { daysBetween, addDays, todayStr, MONTHS as MON } from "../core/dates.js";

export const SOON_DAYS = 3; // "due" within this many days; further off is "coming up"
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** "Sun 1 Nov" (with the year when it isn't within about 6 months of today). */
export function dayDate(iso, today = todayStr()) {
  if (!iso) return "";
  const d = new Date(iso.slice(0, 10) + "T12:00:00Z");
  const far = Math.abs(daysBetween(today, iso.slice(0, 10))) > 182;
  return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}${far ? " " + d.getUTCFullYear() : ""}`;
}
/** "in 3 days" / "tomorrow" / "today" / "1 day late" / "4 days late". */
export function inDays(iso, today = todayStr()) {
  const n = daysBetween(today, iso);
  if (n === 0) return "today"; if (n === 1) return "tomorrow"; if (n === -1) return "1 day late";
  return n > 0 ? `in ${n} days` : `${-n} days late`;
}

/** Is a job on today's list? Due today, late, or with no date. */
export const isNow = (t, today = todayStr()) => !t.due || String(t.due).slice(0, 10) <= today;
const rank = (t, today) => (t.due && t.due < today ? 0 : 2) + (t.legal ? 0 : 1);
/** Order for "To do today": late first, legal first, then oldest due date, then title. */
export function sortNow(list, today = todayStr()) {
  return [...list].sort((a, b) => rank(a, today) - rank(b, today) || String(a.due || today).localeCompare(String(b.due || today)) || String(a.title).localeCompare(String(b.title)));
}
/** Split jobs: { now (late + today, sorted), later (future, by date), done }. */
export function splitTasks(tasks, today = todayStr()) {
  const open = tasks.filter((t) => !t.done);
  return {
    now: sortNow(open.filter((t) => isNow(t, today)), today),
    later: open.filter((t) => !isNow(t, today)).sort((a, b) => String(a.due).localeCompare(String(b.due)) || String(a.title).localeCompare(String(b.title))),
    done: tasks.filter((t) => t.done),
  };
}
/** How many jobs are really for today (the number next to "To do today"). */
export const nowCount = (tasks, today = todayStr()) => tasks.filter((t) => !t.done && isNow(t, today)).length;

/** The grey line under a job. Never says "due today" next to another date. */
export function dueLine(t, today = todayStr()) {
  const sub = t.sub ? " · " + t.sub : "";
  if (!t.due) return t.sub || "";
  const n = daysBetween(today, t.due);
  if (n < 0) return `${inDays(t.due, today)}${t.legal ? " · legal deadline" : ""}${sub}`;
  if (n === 0) return `due today${sub}`;
  return `${t.legal ? "Legal deadline " : ""}${dayDate(t.due, today)} · ${inDays(t.due, today)}${sub}`;
}

// ---- dates written in alert text ------------------------------------------------------------
const MONTH_RE = "(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*";
const nearestYear = (m, d, today) => {
  const y = +today.slice(0, 4); let best = null;
  for (const yy of [y - 1, y, y + 1]) {
    const iso = `${yy}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (!best || Math.abs(daysBetween(today, iso)) < Math.abs(daysBetween(today, best))) best = iso;
  }
  return best;
};
/** A due date written in an alert ("by Sat 31 Oct", "due 23/11", "in 25 days", "3 days left"), or null. */
export function inferDue(text, today = todayStr()) {
  const s = String(text || "").toLowerCase();
  let m = /\bin (\d+) days?\b/.exec(s) || /\b(\d+) days? left\b/.exec(s);
  if (m) return addDays(today, +m[1]);
  m = new RegExp(`\\b(?:by|due|before)\\s+(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\\s+)?(\\d{1,2})\\s+${MONTH_RE}(?:\\s+(\\d{4}))?`).exec(s);
  if (m) { const mo = MON.findIndex((x) => x.toLowerCase() === m[2]) + 1; return m[3] ? `${m[3]}-${String(mo).padStart(2, "0")}-${m[1].padStart(2, "0")}` : nearestYear(mo, +m[1], today); }
  m = /\b(?:by|due)\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(s);
  if (m) { if (m[3]) { const y = m[3].length === 2 ? "20" + m[3] : m[3]; return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; } return nearestYear(+m[2], +m[1], today); }
  if (/\bdue tomorrow\b/.test(s)) return addDays(today, 1);
  return null;
}

// ---- one obligation, one item ---------------------------------------------------------------
// Words that name a distinct legal or routine obligation. An alert and a job that open the same
// screen and name the same of these are the same thing ("TB test in 25 days" / "TB test: book
// the vet"; "Milking machine test due by 23/11 (ISO 6690…)" / "ISO 6690 machine test due").
const TOPICS = ["tb", "iso", "6690", "liner", "tank", "nifais", "daera", "society", "dna", "swab", "swabs", "salmonella", "alarm", "generator", "emb", "vermin", "inventory", "qvr", "scab", "fec", "bvd", "raddle"];
const words = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
const topics = (s) => [...new Set(words(s).filter((w) => TOPICS.includes(w)))].sort().join(",");
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const rootHref = (h) => !h || /^#\/l\/[^/]+\/?$/.test(h);
/** Are this alert and this job the same obligation? */
export function sameObligation(a, t) {
  if (!a || !t) return false;
  const ak = String(a.key || ""), tk = String(t.key || t.id || "");
  if (ak && tk && (ak === tk || tk.startsWith(ak + ":"))) return true;
  if (t.dupOf && t.dupOf === ak) return true;
  const na = norm(a.title), nt = norm(t.title);
  if (Math.min(na.length, nt.length) >= 12 && (na.startsWith(nt) || nt.startsWith(na))) return true;
  if (rootHref(a.href) || a.href !== t.href) return false;
  if (a.legal && t.legal) return true; // same legal job on the same screen
  const ta = topics(a.title), tt = topics(t.title);
  return !!ta && ta === tt;
}
/** An alert's level once its date is known: "due" more than SOON_DAYS away is only "info". */
export function alertLevel(a, today = todayStr()) {
  if (!a || a.level !== "due") return a ? a.level || "info" : "info";
  const due = a.date || a.due || inferDue(`${a.title || ""} ${a.body || ""}`, today);
  return due && daysBetween(today, String(due).slice(0, 10)) > SOON_DAYS ? "info" : "due";
}
/** Alerts that aren't already a job in `tasks` (the job keeps its date and tick). */
export function alertsNotTasks(alerts, tasks) {
  return alerts.filter((a) => !tasks.some((t) => !t.done && sameObligation(a, t)));
}

/** A ledger home shows each obligation once: a late alert stays at the top (its job leaves the
 *  list); anything else shows as the job, with its date and tick (the alert card goes). */
export function homeDedupe(alerts, tasks) {
  const live = tasks.filter((t) => !t.done);
  const late = alerts.filter((a) => a.level === "late");
  const keepTasks = tasks.filter((t) => t.done || !late.some((a) => sameObligation(a, t)));
  const keepAlerts = alerts.filter((a) => a.level === "late" || !live.some((t) => sameObligation(a, t)));
  return { alerts: keepAlerts, tasks: keepTasks };
}

// ---- the bell ------------------------------------------------------------------------------
/** Does this item count on the bell? Legal, not a withdrawal period, and late or due within 3 days. */
export function countsOnBell(i, today) {
  if (!i || !i.legal || i.kind === "withdrawal" || i.level === "info") return false;
  if (i.level === "late") return true;
  if (!i.due || !today) return true;
  return daysBetween(today, String(i.due).slice(0, 10)) <= SOON_DAYS;
}
/** Bell / app badge count: distinct legal items that are late or due within 3 days. */
export function bellCount(items, today) {
  const seen = new Set();
  for (const i of items || []) if (countsOnBell(i, today)) seen.add(`${i.ledgerId || ""}|${norm(i.title)}`);
  return seen.size;
}
