// House controller import (design/14 §4.1): a CSV export from Maximus, Fancom, Big Dutchman or
// similar, mapped once to the fields the daily sheet can pre-fill (water meter, temperatures,
// feed). Pure: parseCsv(text) -> { headers, rows }, guessMap(headers), toRows(parsed, map).
// Export formats vary by controller and firmware, so column guesses are keyword matches only.
export const CONTROLLERS = [["maximus", "Maximus"], ["fancom", "Fancom"], ["bigdutchman", "Big Dutchman"], ["other", "Other"]];
export const CTL_FIELDS = [
  { key: "date", label: "Date", re: /date|day|datum/i, need: true },
  { key: "waterMeter", label: "Water meter (L)", re: /meter|water.*(total|cum|count)|watermeter/i },
  { key: "tMin", label: "Temperature min (°C)", re: /min.*temp|temp.*min|t ?min/i },
  { key: "tMax", label: "Temperature max (°C)", re: /max.*temp|temp.*max|t ?max/i },
  { key: "feedKg", label: "Feed (kg)", re: /feed|silo|bin/i },
];

export function parseCsv(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (!lines.length) return { headers: [], rows: [] };
  const sep = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ";" : lines[0].includes("\t") ? "\t" : ",";
  const split = (l) => { const out = []; let cur = "", q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === sep && !q) { out.push(cur.trim()); cur = ""; } else cur += ch; } out.push(cur.trim()); return out; };
  return { headers: split(lines[0]), rows: lines.slice(1).map(split) };
}
export function guessMap(headers) {
  const map = {}; const used = new Set();
  for (const f of CTL_FIELDS) { const i = headers.findIndex((h, k) => !used.has(k) && f.re.test(h)); if (i >= 0) { map[f.key] = i; used.add(i); } }
  return map;
}
/** "15/10/2026", "2026-10-15", "15.10.26" -> "2026-10-15" (day first, as NI/EU controllers write it). */
export function isoDate(s) {
  s = String(s || "").trim().split(/[ T]/)[0];
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/); if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/); if (m) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
  return null;
}
const num = (v) => { if (v == null || v === "") return null; const n = +String(v).replace(/\s/g, "").replace(/,(\d{1,2})$/, ".$1").replace(/,/g, ""); return Number.isFinite(n) ? n : null; };
/** Rows the daily sheet reads: [{ date, waterMeter?, tMin?, tMax?, feedKg? }]; rows without a date are skipped. */
export function toRows(parsed, map) {
  const out = [];
  for (const r of parsed.rows) {
    const date = map.date != null ? isoDate(r[map.date]) : null; if (!date) continue;
    const row = { date };
    for (const k of ["waterMeter", "tMin", "tMax", "feedKg"]) if (map[k] != null) { const v = num(r[map[k]]); if (v != null) row[k] = v; }
    out.push(row);
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
