// Kill sheet reader (design/13 §6.4): text from the OCR photo (or pasted / typed) → one row per
// pig: slap mark, deadweight kg, P2 mm, lean %, grade, price p/kg, deductions £. Abattoirs lay
// their sheets out differently, so this reads each line on its own and keeps only lines that
// carry a believable pig deadweight. Totals lines ("Total 180 16020.0") fill the header.

const NUM = /-?\d+(?:[.,]\d+)?/g;
const toN = (s) => +String(s).replace(",", ".");

/** One line → a pig row, or null. */
export function parseLine(line) {
  const t = String(line).trim(); if (!t || /total|average|avg|summary/i.test(t)) return null;
  const nums = (t.match(NUM) || []).map((s) => ({ s, v: toN(s), dec: /[.,]/.test(s) }));
  const dwI = nums.findIndex((n) => n.dec && n.v >= 40 && n.v <= 200);
  if (dwI < 0) return null;
  const dw = nums[dwI].v; const rest = nums.slice(dwI + 1);
  const slap = (t.slice(0, t.indexOf(nums[dwI].s)).match(/[A-Z]{0,3}\s?\d{2,6}/i) || [""])[0].trim() || null;
  const p2 = rest.find((n) => !n.dec && n.v >= 4 && n.v <= 40)?.v ?? null;
  const lean = rest.find((n) => n.v >= 45 && n.v <= 70 && n !== rest.find((m) => !m.dec && m.v >= 4 && m.v <= 40))?.v ?? null;
  const ppkRaw = rest.find((n) => (n.v >= 90 && n.v <= 400) || (n.dec && n.v >= 0.9 && n.v <= 4));
  const ppk = ppkRaw ? (ppkRaw.v < 5 ? +(ppkRaw.v * 100).toFixed(1) : ppkRaw.v) : null;
  const grade = (t.match(/\b([SEURO]\d?)\b(?![.,]\d)/) || [])[1] || null; // EUROP letter grades (S, E, U…, E1)
  const ded = (t.match(/-\s?£?\s?(\d+(?:\.\d+)?)/) || [])[1];
  return { slap, dwKg: dw, p2, lean, grade, ppk, deductions: ded ? +ded : null };
}

/** Whole sheet → { pigs: [...], header: { date, abattoir, count, totalDwKg, doa, condemned, tailDamage } } */
export function parsePigKillSheet(text) {
  const lines = String(text || "").split(/\r?\n/);
  const pigs = lines.map(parseLine).filter(Boolean);
  const all = String(text || "");
  const date = (all.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/) || []);
  const iso = date.length ? `${date[3].length === 2 ? "20" + date[3] : date[3]}-${date[2].padStart(2, "0")}-${date[1].padStart(2, "0")}` : null;
  const tot = all.match(/total[^\d\n]*(\d+)[^\d\n]+(\d+(?:[.,]\d+)?)/i);
  const n = (re) => { const m = all.match(re); return m ? +m[1] : 0; };
  const abattoir = (lines.find((l) => /(foods?|meats?|abattoir|plant|karro|cranswick|dunbia|meat)/i.test(l)) || "").trim().slice(0, 60) || null;
  return { pigs, header: { date: iso, abattoir, count: tot ? +tot[1] : pigs.length || null, totalDwKg: tot ? toN(tot[2]) : null, doa: n(/D\.?O\.?A\.?\D{0,12}(\d+)/i), condemned: n(/condemn\w*\D{0,12}(\d+)/i), tailDamage: n(/tail\s*(?:damage|bit\w*)\D{0,12}(\d+)/i) } };
}
