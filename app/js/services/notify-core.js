// Notification rules shared by the app (notification centre, opt-in screen, "became late" check)
// and the sender (build/notify/send.mjs, Node). Pure functions only: no store, no DOM, no clock
// except the `now` passed in. One copy of every rule, so the phone and the sender always agree.
//
// Item (normalised alert or task):
//   { id, key, ledgerId, ledgerName, ledgerType, role, source: 'alert'|'task', level: 'late'|'due'|'info',
//     legal, kind, title, body, href, due }
// Kinds a person can switch on/off: legal · withdrawal · sampling · tasks · invites.

export const KINDS = ["legal", "withdrawal", "sampling", "tasks", "invites"];
export const KIND_LABELS = {
  legal: "Legal deadlines (late and due)",
  withdrawal: "Withdrawal periods ending",
  sampling: "Samples and tests due",
  tasks: "Jobs due today",
  invites: "Someone joins your ledger",
};
export const DEFAULT_TZ = "Europe/London";
export const DEFAULT_PREFS = Object.freeze({
  summary: true,            // one daily summary
  summaryTime: "07:00",     // local time on this phone's time zone
  ledgers: "all",           // "all" or [ledgerId, ...]
  kinds: Object.freeze({ legal: true, withdrawal: true, sampling: true, tasks: true, invites: true }),
  late: true,               // a push the moment a legal item turns late
  quiet: Object.freeze({ on: false, start: "22:00", end: "06:00" }),
});
export const MONEY_ROLES = ["owner", "manager", "accountant"];
export const SUMMARY_WINDOW_H = 3;   // hourly runs can be late or skipped: send any time in 3 h after the chosen time
export const LOG_KEEP_DAYS = 60;     // users/{uid}/notifyLog entries older than this are pruned
export const MAX_LATE_PUSHES = 3;    // more than this in one run -> one grouped notification

const HM = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const validHm = (s) => typeof s === "string" && HM.test(s);
export const hmToMin = (s) => { const m = HM.exec(s); return m ? +m[1] * 60 + +m[2] : 0; };

/** Merge saved prefs over the defaults, dropping anything malformed. */
export function normPrefs(p = {}) {
  const d = DEFAULT_PREFS;
  const kinds = { ...d.kinds }; for (const k of KINDS) if (p.kinds && typeof p.kinds[k] === "boolean") kinds[k] = p.kinds[k];
  const q = p.quiet || {};
  return {
    summary: typeof p.summary === "boolean" ? p.summary : d.summary,
    summaryTime: validHm(p.summaryTime) ? p.summaryTime : d.summaryTime,
    ledgers: Array.isArray(p.ledgers) ? p.ledgers.filter((x) => typeof x === "string") : "all",
    kinds,
    late: typeof p.late === "boolean" ? p.late : d.late,
    quiet: { on: !!q.on, start: validHm(q.start) ? q.start : d.quiet.start, end: validHm(q.end) ? q.end : d.quiet.end },
  };
}

/** Wall-clock parts of `now` in a time zone: { date 'YYYY-MM-DD', hour, minute, min (minute of day) }. */
export function localParts(now, tz = DEFAULT_TZ) {
  let parts;
  try { parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now); }
  catch (e) { return localParts(now, DEFAULT_TZ); }
  const g = (t) => parts.find((x) => x.type === t)?.value;
  const hour = +g("hour") % 24, minute = +g("minute");
  return { date: `${g("year")}-${g("month")}-${g("day")}`, hour, minute, min: hour * 60 + minute };
}
export function validTz(tz) { try { new Intl.DateTimeFormat("en-GB", { timeZone: tz }); return true; } catch (e) { return false; } }

/** Is the local time inside the quiet hours? Works across midnight (22:00 → 06:00). */
export function inQuiet(now, prefs, tz) {
  const q = normPrefs(prefs).quiet; if (!q.on) return false;
  const m = localParts(now, tz).min, s = hmToMin(q.start), e = hmToMin(q.end);
  if (s === e) return false;
  return s < e ? m >= s && m < e : m >= s || m < e;
}

/** Should the daily summary go now? Due from the chosen time for SUMMARY_WINDOW_H hours, once per local day. */
export function summaryDue(now, prefs, tz, lastSentDate) {
  const p = normPrefs(prefs); if (!p.summary) return false;
  const lp = localParts(now, tz); const start = hmToMin(p.summaryTime);
  const since = lp.min - start;
  return since >= 0 && since < SUMMARY_WINDOW_H * 60 && lastSentDate !== lp.date;
}

/** Which switchable kind an item belongs to (null = shown in the app only, never pushed). */
export function classify(a) {
  const text = `${a.title || ""} ${a.body || ""} ${a.key || ""}`;
  // Withdrawal first: "3 cattle under withdrawal" is shown as late + legal in the ledger, but it is
  // a period running, not a missed deadline, so it must never fire a "now late" push.
  if (/withdraw|withhold|milk out of the tank|back in the tank|wd[:-]/i.test(text)) return "withdrawal";
  if (a.level === "info") return null;
  if (a.legal) return "legal";
  if (/sampl|swab|salmonella|bvd test|tb test|tb reading|bulk.?tank|blood test|faecal|\bfec\b/i.test(text)) return "sampling";
  if (a.source === "task") return "tasks";
  if (a.level === "late" || a.level === "due") return "tasks";
  return null;
}

/** Money must never reach a phone for a role that can't see money. */
export const canSeeMoney = (role) => MONEY_ROLES.includes(role);
const MONEY_RE = /[−-]?£\s?[−-]?\d[\d,]*(\.\d+)?(\s?(k|m|bn)\b)?(\s?(\/|per)\s?(kg|head|t|tonne|bird|pig|dozen|litre|l|ha|acre)\b)?/gi;
export function redactMoney(text) { return String(text || "").replace(MONEY_RE, "(amount hidden)").replace(/\s{2,}/g, " ").trim(); }
export function forRole(item) {
  if (canSeeMoney(item.role)) return item;
  return { ...item, title: redactMoney(item.title), body: redactMoney(item.body) };
}

const LEVEL = { late: 0, due: 1, info: 2 };
/** Normalise a ledger's alerts() and tasks() output into items, money-safe for the role, sorted. */
export function itemsFrom(ledger, alerts = [], tasks = [], today) {
  const base = { ledgerId: ledger.id, ledgerName: ledger.name || "", ledgerType: ledger.type, role: ledger.role };
  const out = [];
  for (const a of alerts) {
    if (!a || !a.title) continue;
    const key = String(a.key || `t:${a.title}`);
    const it = { ...base, source: "alert", id: `${ledger.id}|a|${key}`, key, level: a.level || "info", legal: !!a.legal, title: String(a.title), body: String(a.body || ""), href: a.href || `#/l/${ledger.id}`, due: a.date || a.due || null };
    it.kind = classify(it); out.push(forRole(it));
  }
  const seen = new Set(out.map((x) => x.key));
  // A ledger often lists the same job as an alert and as a To-do row ("Register calf … on NIFAIS
  // by 30 Oct" / "Register calf … on NIFAIS"): keep the alert only.
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
  const alertTitles = out.map((x) => norm(x.title));
  const alertSpots = new Set(out.filter((x) => x.legal && x.href && x.href !== `#/l/${ledger.id}`).map((x) => `${x.href}|${x.level}`));
  for (const t of tasks) {
    if (!t || !t.title || t.done) continue;
    const key = String(t.key || t.id || `t:${t.title}`);
    if (seen.has(key)) continue; seen.add(key);
    const nt = norm(t.title);
    if (nt.length >= 12 && alertTitles.some((at) => at.startsWith(nt) || nt.startsWith(at))) continue;
    const lvl = t.due && today && t.due < today ? "late" : "due";
    if (t.legal && t.href && alertSpots.has(`${t.href}|${lvl}`)) continue; // same legal job, same screen
    const it = { ...base, source: "task", id: `${ledger.id}|t|${key}`, key, level: lvl, legal: !!t.legal, title: String(t.title), body: String(t.sub || t.note || ""), href: t.href || `#/l/${ledger.id}`, due: t.due || null };
    it.kind = classify(it); out.push(forRole(it));
  }
  return out.sort((a, b) => LEVEL[a.level] - LEVEL[b.level] || (b.legal - a.legal) || String(a.due || "").localeCompare(String(b.due || "")));
}

/** Items the person asked to hear about on this device. */
export function filterForPrefs(items, prefs) {
  const p = normPrefs(prefs);
  return items.filter((i) => i.kind && p.kinds[i.kind] && (p.ledgers === "all" || p.ledgers.includes(i.ledgerId)));
}

/** Legal items that are late (the ones that get an immediate push and a note on opening the app). */
export const lateLegal = (items) => items.filter((i) => i.kind === "legal" && i.level === "late");

/** Count shown on the bell and the app badge: late + due (not info). */
export const badgeCount = (items) => items.filter((i) => i.level === "late" || i.level === "due").length;

/** Group items by ledger, keeping the ledger order given. */
export function groupByLedger(items, ledgers) {
  return ledgers.map((l) => ({ ledger: l, items: items.filter((i) => i.ledgerId === l.id) })).filter((g) => g.items.length);
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
/** The daily summary notification: { title, body, url, count } or null when nothing is due. */
export function summaryMessage(items, { farmName } = {}) {
  if (!items.length) return null;
  const late = lateLegal(items);
  const legalDue = items.filter((i) => i.kind === "legal" && i.level !== "late");
  const n = (k) => items.filter((i) => i.kind === k).length;
  const bits = [];
  if (late.length) bits.push(`${plural(late.length, "legal job is", "legal jobs are")} late: ${late[0].title}${late.length > 1 ? " and more" : ""}.`);
  if (legalDue.length) bits.push(`${plural(legalDue.length, "legal deadline", "legal deadlines")} due.`);
  if (n("withdrawal")) bits.push(`${plural(n("withdrawal"), "withdrawal ends", "withdrawals end")}.`);
  if (n("sampling")) bits.push(`${plural(n("sampling"), "sample or test", "samples or tests")} due.`);
  if (n("tasks")) bits.push(`${plural(n("tasks"), "job", "jobs")} to do.`);
  return { title: farmName ? `Today on ${farmName}` : "Today on your farm", body: bits.join(" "), url: "#/notifications", count: badgeCount(items), tag: "fl-summary" };
}

/** The "now late" notification for one item, or a grouped one for many. */
export function lateMessage(list) {
  if (list.length === 1) {
    const i = list[0];
    return { title: `Late: ${i.title}`, body: [i.ledgerName, i.body].filter(Boolean).join(" · ") || "This legal deadline has passed.", url: i.href, tag: `fl-late-${shortHash(i.id)}` };
  }
  return { title: `${list.length} legal jobs are late`, body: list.slice(0, 3).map((i) => i.title).join(" · ") + (list.length > 3 ? " …" : ""), url: "#/notifications", tag: "fl-late-many" };
}

/** Message when someone accepts an invite you made. */
export function inviteMessage(inv) {
  const who = inv.usedByName || "Someone"; const role = inv.role ? ` as ${inv.role}` : "";
  return { title: `${who} joined ${inv.ledgerName || "your ledger"}`, body: `They accepted your invite${role}. You can change what they can do in People.`, url: inv.ledgerId ? `#/l/${inv.ledgerId}/more/people` : "#/farm/people", tag: `fl-invite-${shortHash(inv.code || who)}` };
}

// Stable short hash (FNV-1a, two 32-bit lanes) so the same key gives the same log id in the
// browser and in Node. Used for notifyLog document ids and notification tags.
export function shortHash(s) {
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x5bd1e995; const str = String(s);
  for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0; h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0; h2 ^= h2 >>> 15; }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}
/** notifyLog document id for a dedupe key (Firestore ids can't hold "/"). */
export const logId = (key) => `${String(key).split(":")[0].replace(/[^a-z]/gi, "").slice(0, 12) || "k"}-${shortHash(key)}`;
export const lateKey = (item) => `late:${item.ledgerId}:${item.key}`;
export const summaryKey = (deviceId, localDate) => `summary:${deviceId}:${localDate}`;
export const inviteKey = (code) => `invite:${code}`;
/** Log entries older than LOG_KEEP_DAYS are pruned. */
export function isStale(entry, now) {
  const t = entry && entry.sentAt instanceof Date ? entry.sentAt.getTime() : Date.parse(entry && entry.sentAt);
  return !(t > 0) || now.getTime() - t > LOG_KEEP_DAYS * 86400000;
}
