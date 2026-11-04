// Rooms (design/13 §5): order the pigs flow through, the wash cycle for empty rooms,
// readings (water drop), the legal space calculator (Schedule 8, SR 2012/156) and room checks.
import { addDays, daysBetween } from "./dates.js";

export const KINDS = [["service", "Service"], ["dry", "Dry sow"], ["farrowing", "Farrowing"], ["weaner", "Weaner"], ["grower", "Grower"], ["finisher", "Finisher"], ["hospital", "Hospital / isolation"]];
export const KIND_NAME = Object.fromEntries(KINDS);
const ORDER = Object.fromEntries(KINDS.map(([k], i) => [k, i]));
export const sortRooms = (a, b) => (ORDER[a.kind] ?? 9) - (ORDER[b.kind] ?? 9) || String(a.house || "").localeCompare(String(b.house || "")) || String(a.name).localeCompare(String(b.name), "en", { numeric: true });

// ---- wash cycle (all-in/all-out; Red Tractor BI.12) ----
export const WASH = ["emptied", "soaked", "washed", "disinfected", "dried", "ready"];
export const WASH_WORD = { emptied: "Emptied", soaked: "Soaked", washed: "Washed", disinfected: "Disinfected", dried: "Dried", ready: "Ready" };
/** The room's wash state. A room with a batch in it is "in use". */
export function washState(room, today) {
  if (room.batchId) return { inUse: true };
  const w = room.wash || {}; const stage = w.stage || (w.at?.emptied ? "emptied" : "ready");
  const i = WASH.indexOf(stage); const next = i >= 0 && i < WASH.length - 1 ? WASH[i + 1] : null;
  const emptyDays = w.at?.emptied ? daysBetween(w.at.emptied.slice(0, 10), today) : null;
  return { inUse: false, stage, next, ready: stage === "ready", emptyDays, at: w.at || {} };
}
export const canFill = (room, today) => !room.batchId && washState(room, today).ready;

// ---- space (Schedule 8, checked by Research B 2026-10-15) ----
const BANDS = [[10, 0.15], [20, 0.2], [30, 0.3], [50, 0.4], [85, 0.55], [110, 0.65], [Infinity, 1.0]];
/** Minimum unobstructed floor per growing pig (m²) at average live weight. */
export function spacePerPig(avgKg) { return BANDS.find(([max]) => avgKg <= max)[1]; }
/** Breeding pigs in groups: gilts 1.64, sows 2.25; +10% if group < 6; may be −10% if group ≥ 40. */
export function breederSpace(type, group) {
  const base = type === "gilt" ? 1.64 : 2.25;
  return group < 6 ? base * 1.1 : group >= 40 ? base * 0.9 : base;
}
/** Pigs allowed in a pen of area m² at average weight (growing pigs). */
export function pigsAllowed(areaM2, avgKg) { return Math.floor(+areaM2 / spacePerPig(avgKg) + 1e-9); }
/** Space badge for a room: ✓ under 90% of the legal maximum, Tight 90–100%, Over above. */
export function spaceBadge(pigs, pens, avgKg) {
  const area = (pens || []).reduce((t, p) => t + (+p.areaM2 || 0), 0);
  if (!area || !pigs) return null;
  const allowed = pigsAllowed(area, avgKg); const r = pigs / allowed;
  return { allowed, area, ratio: r, level: r > 1 ? "late" : r >= 0.9 ? "due" : "ok", word: r > 1 ? "Over" : r >= 0.9 ? "Tight" : "✓" };
}
/** Pen checks once at set-up: sides > 2.8 m (2.4 m for groups under 6); solid floor per sow/gilt; boar pen. */
export function penChecks({ side, group = 10, solidM2PerPig, type, boarPenM2, service } = {}) {
  const out = [];
  if (side != null) { const min = group < 6 ? 2.4 : 2.8; if (+side < min) out.push(`Pen sides must be more than ${min} m for this group size.`); }
  if (solidM2PerPig != null && (type === "gilt" || type === "sow")) { const min = type === "gilt" ? 0.95 : 1.3; if (+solidM2PerPig < min) out.push(`Solid floor must be at least ${min} m² per ${type}.`); }
  if (boarPenM2 != null) { const min = service ? 10 : 6; if (+boarPenM2 < min) out.push(`A boar pen must be at least ${min} m²${service ? " when used for service" : ""}.`); }
  return out;
}

// ---- readings ----
/**
 * Water use from meter readings (cumulative m³): use(day) = reading(day) − reading(day before).
 * change = use(today) ÷ use(yesterday) − 1. Returns { today, yesterday, change } or null.
 */
export function waterChange(readings, roomId, today) {
  const r = readings.filter((x) => x.roomId === roomId && x.waterM3 != null).sort((a, b) => a.date.localeCompare(b.date));
  const at = (d) => r.find((x) => x.date === d);
  const t = at(today), y = at(addDays(today, -1)), yy = at(addDays(today, -2));
  if (!t || !y || !yy) return null;
  const useT = t.waterM3 - y.waterM3, useY = y.waterM3 - yy.waterM3;
  if (useY <= 0 || useT < 0) return null;
  return { today: useT, yesterday: useY, change: useT / useY - 1 };
}
export const waterAlert = (wc, pct) => !!wc && wc.change <= -(pct / 100);
/** Last 7 days of water use (m³/day) for a sparkline; null where a day is missing. */
export function waterSeries(readings, roomId, today) {
  const r = new Map(readings.filter((x) => x.roomId === roomId && x.waterM3 != null).map((x) => [x.date, +x.waterM3]));
  return Array.from({ length: 7 }, (_, i) => { const d = addDays(today, i - 6), p = addDays(d, -1); return r.has(d) && r.has(p) ? r.get(d) - r.get(p) : null; });
}
export function tempRange(readings, roomId, today) {
  const t = readings.filter((x) => x.roomId === roomId && x.date === today)[0];
  return t && (t.tMin != null || t.tMax != null) ? { min: t.tMin, max: t.tMax } : null;
}

// ---- room checks (daily inspection — the legal evidence) ----
export const PEN_ISSUES = ["Tail bite", "Lame", "Scour", "Fighting", "To hospital"];
export const checkedToday = (checks, roomId, today) => checks.find((c) => c.roomId === roomId && c.date === today) || null;
export function lastCheck(checks, roomId) { return checks.filter((c) => c.roomId === roomId).sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || ""))).pop() || null; }
/** Pens flagged at the latest check: Set of pen numbers with any issue. */
export function issuePens(check) { return new Set((check?.pens || []).filter((p) => (p.status || []).some((x) => x !== "OK")).map((p) => +p.no)); }
/** Tail biting twice in one room within 7 days → info (design/13 §5.3). */
export function tailBiteRepeat(tailBites, roomId, date) {
  return tailBites.filter((t) => t.roomId === roomId && daysBetween(t.date, date) <= 7 && daysBetween(t.date, date) >= 0).length >= 2;
}

// ---- alarm tests (every 7 days per house — the law) ----
export const houses = (rooms) => [...new Set(rooms.map((r) => r.house || r.name))];
export function alarmState(tests, house, today) {
  const last = tests.filter((t) => t.house === house).sort((a, b) => a.date.localeCompare(b.date)).pop() || null;
  const days = last ? daysBetween(last.date, today) : null;
  return { last, days, next: last ? addDays(last.date, 7) : today, level: !last || days > 7 ? "late" : days === 7 ? "due" : "ok", failed: last && last.sounded === false };
}
