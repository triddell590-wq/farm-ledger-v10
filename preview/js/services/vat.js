// VAT on money entries and the VAT return (Tom, 3 Nov: "doing the VAT is very time consuming").
// Pure functions: no store, no DOM, no clock except `today` passed in.
//
// A money entry keeps `amount` exactly as the farmer typed it, plus:
//   vat: 'inc' | 'ex'   is that amount including or excluding VAT ('none' on older entries: no VAT charged, taken as 0%)
//   vatRate: 20 | 5 | 0 | 'exempt' | 'outside'   (missing: the category's usual rate)
//   eu: true            goods bought from / sold to the EU (NI under the Windsor Framework: boxes 2, 8, 9)
// The rates below are the usual ones for farm supplies; the farmer can change any entry, and the
// accountant should confirm them (e.g. straw for bedding, or rent where the landlord has opted to tax).
import { addMonths, MONTHS } from "../core/dates.js";

export const VAT_SETTINGS_ID = "vat-settings"; // finance/{id} in the farm space, kind 'settings' (accountants can read finance, not meta)

export const RATE_OPTIONS = [
  { value: "20", label: "20% standard" }, { value: "5", label: "5% reduced" }, { value: "0", label: "0% zero-rated" },
  { value: "exempt", label: "Exempt" }, { value: "outside", label: "No VAT (outside VAT)" },
];
const USUAL = {
  revenue: { "Livestock Sales": 0, Milk: 0, Eggs: 0, "Crop Sales": 0, Subsidy: "outside" },
  expense: { "Animal Purchase": 0, Feed: 0, "Rent & rates": "exempt", Insurance: "exempt", Wages: "outside" },
};
/** The usual rate for a category: livestock for food, feed, milk, eggs 0%; insurance exempt; wages and grants outside VAT; the rest 20%. */
export const usualRate = (kind, category) => USUAL[kind]?.[category] ?? 20;

const r2 = (n) => Math.round(n * 100) / 100;
const rateOf = (rec) => rec.vatRate ?? (rec.vat === "none" ? 0 : usualRate(rec.kind, rec.category)); // older "No VAT" entries: zero-rated (feed etc.), still in box 7

/** { rate, net, vat, gross } for one entry. EU purchases are entered without VAT (it is accounted for in box 2). */
export function vatOf(rec) {
  const rate = rateOf(rec); const amount = Number(rec.amount) || 0;
  const pct = typeof rate === "number" ? rate : Number(rate) || 0;
  if (!pct || (rec.eu && rec.kind === "expense")) return { rate, net: amount, vat: 0, gross: amount };
  if (rec.vat === "ex") return { rate, net: amount, vat: r2(amount * pct / 100), gross: r2(amount * (1 + pct / 100)) };
  const net = r2(amount / (1 + pct / 100));
  return { rate, net, vat: r2(amount - net), gross: amount };
}
/** The fields stored with an entry so exports and the accountant see them without working them out. */
export const vatFields = (rec) => { const v = vatOf(rec); return { vatRate: v.rate, net: v.net, vatAmount: v.vat }; };

/** Return periods ending on or before the one containing `today`, newest first.
 *  s = { returns: 'quarterly'|'monthly', stagger: 1|2|3 } — stagger 1 ends Mar/Jun/Sep/Dec, 2 Apr/Jul/Oct/Jan, 3 May/Aug/Nov/Feb. */
export function vatPeriods(s = {}, today, n = 6) {
  const len = s.returns === "monthly" ? 1 : 3; const endsOn = ((+s.stagger || 1) - 1) % 3; // month number % 3 of a quarter end
  const [y, m] = today.split("-").map(Number); // m is 1–12
  let end = m; while (len === 3 && end % 3 !== endsOn) end++; // first period end at or after this month
  let endIso = lastDay(y + Math.floor((end - 1) / 12), ((end - 1) % 12) + 1);
  const out = [];
  for (let i = 0; i < n; i++) {
    const from = addMonths(endIso.slice(0, 8) + "01", -(len - 1));
    out.push({ from, to: endIso, label: label(from, endIso, len) });
    endIso = lastDay(...addMonths(from, -1).split("-").map(Number));
  }
  return out;
}
const lastDay = (y, m) => { const d = new Date(Date.UTC(y, m, 0)); return d.toISOString().slice(0, 10); };
const label = (from, to, len) => (len === 1 ? `${MONTHS[+to.slice(5, 7) - 1]} ${to.slice(0, 4)}` : `${MONTHS[+from.slice(5, 7) - 1]}–${MONTHS[+to.slice(5, 7) - 1]} ${to.slice(0, 4)}`);

/** The nine boxes for entries dated within [from, to]. rows: money entries (revenue / expense). */
export function vatReturn(rows, from, to) {
  const b = { 1: 0, 2: 0, 4: 0, 6: 0, 7: 0, 8: 0, 9: 0 }; const used = [];
  for (const r of rows) {
    if (r.deleted || (r.kind !== "revenue" && r.kind !== "expense") || !r.date || r.date < from || r.date > to) continue;
    const v = vatOf(r); used.push({ ...r, ...v });
    if (v.rate === "outside") continue; // wages, grants, rates: not on the return at all
    if (r.kind === "revenue") { b[1] += v.vat; b[6] += v.net; if (r.eu) b[8] += v.net; }
    else {
      b[4] += v.vat; b[7] += v.net;
      if (r.eu) { b[9] += v.net; const pct = Number(v.rate) || 0; const acq = r2(v.net * pct / 100); b[2] += acq; b[4] += acq; }
    }
  }
  for (const k of Object.keys(b)) b[k] = r2(b[k]);
  b[3] = r2(b[1] + b[2]); b[5] = r2(b[3] - b[4]);
  for (const k of [6, 7, 8, 9]) b[k] = Math.round(b[k]); // HMRC wants whole pounds in boxes 6–9
  return { boxes: b, rows: used.sort((a, z) => String(a.date).localeCompare(String(z.date))) };
}

export const BOX_NAMES = {
  1: "VAT due on sales", 2: "VAT due on goods from the EU", 3: "Total VAT due", 4: "VAT reclaimed on purchases",
  5: "Net VAT to pay (or reclaim)", 6: "Total sales, ex VAT", 7: "Total purchases, ex VAT", 8: "Goods sold to the EU, ex VAT", 9: "Goods bought from the EU, ex VAT",
};
