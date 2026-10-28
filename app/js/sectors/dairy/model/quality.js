// Milk quality and the tank log (design/12 §6.3, §7.1). Legal limits: Reg. (EC) 853/2004 —
// TBC ≤ 100,000/ml as a rolling geometric mean over 2 months, SCC ≤ 400,000/ml over 3 months.
// Values are kept in thousands per ml (186 = 186,000).
import { addDays, addMonths } from "../../../core/dates.js";
import { milkingsOn, datePart, currentMilking, at } from "./milking.js";

export const LEGAL = { tbc: 100, scc: 400 };
export const WINDOW_MONTHS = { tbc: 2, scc: 3 };

/** geoMean = exp(mean(ln(x_i))) — values ≤ 0 ignored. */
export function geoMean(xs) {
  const v = xs.map(Number).filter((x) => x > 0);
  if (!v.length) return null;
  return Math.exp(v.reduce((s, x) => s + Math.log(x), 0) / v.length);
}

/** Rolling geometric mean for 'tbc' or 'scc' ending at `asOf` (default: the latest result). */
export function rolling(results, key, asOf) {
  const list = results.filter((r) => !r.deleted && r[key] != null && r[key] !== "").sort((a, b) => a.date.localeCompare(b.date));
  if (!list.length) return null;
  const end = asOf || list[list.length - 1].date;
  const from = addMonths(end, -WINDOW_MONTHS[key]);
  const win = list.filter((r) => r.date > from && r.date <= end);
  const g = geoMean(win.map((r) => r[key]));
  return g == null ? null : { value: Math.round(g), n: win.length, from, to: end };
}

/** Traffic light vs the legal limit and the processor band. */
export function qualityStatus(key, value, s) {
  if (value == null) return { level: "none", text: "" };
  const legal = LEGAL[key]; const warn = key === "scc" ? s.bands.sccWarn : s.bands.tbcWarn;
  if (value > legal) return { level: "late", text: `Over the ${legal}k legal limit` };
  if (value >= legal * (s.bands.nearLegalPct / 100)) return { level: "late", text: `Close to the ${legal}k legal limit` };
  if (value > warn) return { level: "due", text: `Above your processor's ${warn}k band` };
  return { level: "ok", text: `Under ${warn}k` };
}

/** Rolling series for a chart: one point per result date. */
export function rollingSeries(results, key) {
  const dates = [...new Set(results.filter((r) => !r.deleted && r[key] != null && r[key] !== "").map((r) => r.date))].sort();
  return dates.map((d) => ({ date: d, value: rolling(results, key, d)?.value ?? null }));
}

/** Inhibitory (antibiotic residue) fails in the last 12 months. */
export function inhibitoryFails(results, today) {
  return results.filter((r) => !r.deleted && r.inhibitory === "fail" && r.date > addDays(today, -365)).sort((a, b) => a.date.localeCompare(b.date));
}

// ---- tank log -------------------------------------------------------------------------
export const overLimit = (s, r) => +r.tempC > s.tankLimit;

/**
 * The calendar strip (design/12 §6.3): last `days` days × the farm's milkings.
 * Each slot: { date, part, state: 'ok' | 'over' | 'missing' | 'future', rec }.
 * Robot farms: one daily check per day.
 */
export function tankStrip(s, log, now, days = 14) {
  const today = datePart(now); const out = [];
  const live = log.filter((r) => !r.deleted);
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    const slots = s.robot ? [{ at: at(date, "23:59"), part: "day", n: 0 }] : milkingsOn(s, date);
    for (const m of slots) {
      const rec = live.find((r) => r.date === date && (s.robot || r.milking === m.part || (!r.milking && slots.length === 1)));
      const state = rec ? (overLimit(s, rec) ? "over" : "ok") : (s.robot ? date > today : m.at > now) ? "future" : "missing";
      out.push({ date, part: m.part, state, rec });
    }
  }
  return out;
}
/** Is the reading for the current milking missing? Returns that milking or null. */
export function tankDue(s, log, now) {
  if (!s.tankLogOn) return null;
  if (s.robot) { const d = datePart(now); return log.some((r) => !r.deleted && r.date === d) ? null : { at: at(d, "00:00"), part: "day", date: d }; }
  const m = currentMilking(s, now); if (!m) return null;
  const d = datePart(m.at);
  return log.some((r) => !r.deleted && r.date === d && r.milking === m.part) ? null : { ...m, date: d };
}
export function latestTank(log) { return [...log].filter((r) => !r.deleted).sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || ""))).pop() || null; }
