// Picker search ranking (review A #1): exact matches always come first, in the order farmers
// name stock — the management / cow / sow number, then the tag's own number as one block
// (last 4 digits, or last 5 with the check digit), then the name — and only then the loose
// "contains" matches. Pure functions, no DOM; every animal / cow / sow picker uses them.

const lc = (s) => String(s ?? "").trim().toLowerCase();
const digitsOf = (s) => String(s ?? "").replace(/\D/g, "");
const noZeros = (s) => s.replace(/^0+(?=\d)/, "");

/**
 * Score one item against a query. Lower is better; null = no match.
 * keys: { no, name, tag }  (no = management / cow / sow number)
 *  0 number exact ("0105" = "0105", or "105" = "0105")
 *  1 tag block exact: last 4 animal digits ("0403") or last 5 incl. check digit ("04031")
 *  2 name exact
 *  3 number starts with the query
 *  4 name starts with the query (or a word in it does)
 *  5 tag digits end with the query (3+ digits)
 *  6 anything contains the query (tag, number, name)
 */
export function matchScore(keys, q) {
  q = lc(q); if (!q) return 6;
  const no = lc(keys.no), name = lc(keys.name), tag = String(keys.tag ?? "");
  const qd = digitsOf(q), isNum = /^\d+$/.test(q.replace(/\s+/g, ""));
  const qq = q.replace(/\s+/g, "");
  if (no && (no === q || no.replace(/\s+/g, "") === qq || (isNum && /^\d+$/.test(no) && noZeros(no) === noZeros(qd)))) return 0;
  const td = digitsOf(tag);
  if (isNum && td.length >= 5 && qd.length >= 3) {
    const animal4 = td.slice(-5, -1), last5 = td.slice(-5);
    if (qd === animal4 || qd === last5 || noZeros(qd) === noZeros(animal4)) return 1;
  }
  if (name && name === q) return 2;
  if (no && no.startsWith(q)) return 3;
  if (name && (name.startsWith(q) || name.split(/\s+/).some((w) => w.startsWith(q)))) return 4;
  if (qd.length >= 3 && isNum && td.endsWith(qd)) return 5;
  const tn = tag.replace(/\s+/g, "").toLowerCase();
  if ((qq && tn.includes(qq)) || (no && no.includes(q)) || (name && name.includes(q))) return 6;
  return null;
}

/**
 * Filter and sort a list by match quality. keysOf(item) -> { no, name, tag }.
 * Ties keep the list's own order (callers pass it already sorted by number).
 * Returns [{ item, score }] — empty query returns every item with score 6.
 */
export function rankMatches(list, q, keysOf) {
  const out = [];
  list.forEach((item, i) => { const s = matchScore(keysOf(item), q); if (s != null) out.push({ item, score: s, i }); });
  out.sort((a, b) => a.score - b.score || a.i - b.i);
  return out.map(({ item, score }) => ({ item, score }));
}
export const isExact = (score) => score != null && score <= 2;

// The keys each sector uses.
export const cattleKeys = (a) => ({ no: a.mgmtNo, name: a.name, tag: a.tag });
export const cowKeys = (a) => ({ no: a.cowNo, name: a.name, tag: a.tag });
export const sowKeys = (s) => ({ no: s.sowNo, name: s.name, tag: s.tag });
