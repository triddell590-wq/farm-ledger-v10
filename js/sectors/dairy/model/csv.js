// CSV import for milk recording and robot exports (design/12 §9 Import). The farmer maps the
// columns once; the mapping is saved as a template per source (imports collection).
// Column guesses are keyword matches only — real export formats vary by version (Research C).

/** Parse CSV text (quotes, commas or semicolons, CRLF). Returns { headers, rows[[...]] }. */
export function parseCsv(text) {
  text = String(text || "").replace(/^﻿/, "");
  const first = text.split(/\r?\n/)[0] || "";
  const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ";" : first.includes("\t") && !first.includes(",") ? "\t" : ",";
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell.trim()); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell.trim()); if (row.some((x) => x !== "")) rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  row.push(cell.trim()); if (row.some((x) => x !== "")) rows.push(row);
  const headers = rows.shift() || [];
  return { headers, rows };
}

export const FIELDS = [
  { key: "cowNo", label: "Cow number", words: ["cow no", "cow number", "animal number", "number", "cow", "life no", "nr"] },
  { key: "tag", label: "Ear tag", words: ["tag", "ear", "official", "uk", "eid"] },
  { key: "date", label: "Test / milk date", words: ["test date", "date", "day"] },
  { key: "litres", label: "Yield (litres)", words: ["yield", "litres", "liters", "kg milk", "milk"] },
  { key: "fat", label: "Fat %", words: ["fat", "bf"] },
  { key: "protein", label: "Protein %", words: ["protein", "prot"] },
  { key: "scc", label: "SCC (thousands)", words: ["scc", "cell", "somatic"] },
  { key: "lastMilked", label: "Last milked (date time)", words: ["last milking", "last milked", "last visit"] },
];
export const SOURCES = [
  { id: "NMR", label: "NMR milk recording", robot: false },
  { id: "CIS", label: "CIS milk recording", robot: false },
  { id: "Lely", label: "Lely Horizon (robot)", robot: true },
  { id: "DeLaval", label: "DeLaval DelPro (robot/parlour)", robot: true },
  { id: "Other", label: "Other CSV", robot: false },
];

/** Guess a mapping {field: columnIndex} from header words. */
export function guessMap(headers) {
  const used = new Set(); const map = {};
  const H = headers.map((h) => String(h).toLowerCase());
  for (const f of FIELDS) {
    let best = -1;
    for (const w of f.words) { const i = H.findIndex((h, j) => !used.has(j) && (h === w || h.includes(w))); if (i >= 0) { best = i; break; } }
    if (best >= 0) { map[f.key] = best; used.add(best); }
  }
  return map;
}

const num = (v) => { if (v == null || v === "") return null; const x = parseFloat(String(v).replace(/[^\d.,-]/g, "").replace(",", ".")); return Number.isNaN(x) ? null : x; };
/** "12/10/2026", "2026-10-12", "12.10.26" -> "2026-10-12" (UK day-first). */
export function normDate(v) {
  const s = String(v || "").trim(); let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/))) { const y = m[3].length === 2 ? "20" + m[3] : m[3]; return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
  return "";
}
function normDateTime(v) { const d = normDate(v); const t = String(v || "").match(/(\d{1,2}):(\d{2})/); return d ? `${d}T${t ? t[1].padStart(2, "0") + ":" + t[2] : "00:00"}` : ""; }

/**
 * Turn mapped rows into a recording: { date, cows[{animalId, cowNo, litres, fat, protein, scc, lastMilked}], unmatched[] }.
 * findCow(cowNo, tag) -> animal|null. SCC values over 5,000 are taken as cells/ml and divided by 1000.
 */
export function toRecording(parsed, map, findCow, fallbackDate) {
  const get = (r, k) => (map[k] != null && map[k] >= 0 ? r[map[k]] : "");
  const cows = [], unmatched = []; let date = "";
  for (const r of parsed.rows) {
    const cowNo = String(get(r, "cowNo") || "").trim(); const tag = String(get(r, "tag") || "").trim();
    if (!cowNo && !tag) continue;
    const a = findCow(cowNo, tag);
    let scc = num(get(r, "scc")); if (scc != null && scc > 5000) scc = Math.round(scc / 1000);
    const row = { animalId: a?.id || null, cowNo: cowNo || a?.cowNo || "", litres: num(get(r, "litres")), fat: num(get(r, "fat")), protein: num(get(r, "protein")), scc, lastMilked: map.lastMilked != null ? normDateTime(get(r, "lastMilked")) : "" };
    if (!date) date = normDate(get(r, "date"));
    (a ? cows : unmatched).push(row);
  }
  return { date: date || fallbackDate, cows, unmatched };
}
