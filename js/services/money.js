// Money entries: ledgers/{lid}/finance/{id} = { kind: 'revenue'|'expense', category, amount (£),
// date 'YYYY-MM-DD', note, vat?, lines?, source?, split? } — v9's shape, so Tom's records move as-is.
// Where an entry lives (Builder decision, see ARCHITECTURE.md §3): in the ledger it belongs to;
// "Whole farm" entries (rates, insurance, shared diesel) in the farm space. A whole-farm entry
// may carry split: [{ ledgerId, pct }] and then shows pro-rata in each ledger's Money tab.
import { listRecords } from "./records.js";
import { canRead } from "../core/policy.js";

export const EXPENSE_CATEGORIES = ["Animal Purchase", "Feed", "Vet & medicine", "Medicine", "Fertiliser", "Diesel", "Contractor", "Machinery Maintenance", "Bedding", "Rent & rates", "Insurance", "Wages", "Miscellaneous"];
export const REVENUE_CATEGORIES = ["Livestock Sales", "Milk", "Eggs", "Crop Sales", "Subsidy", "Other Income"];

export function periodRange(period, now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth();
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (period === "month") return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))];
  // NI tax year default: 6 April – 5 April (design/01 §7.2 "April–April").
  const tyStart = (yr) => new Date(yr, 3, 6);
  const start = now >= tyStart(y) ? tyStart(y) : tyStart(y - 1);
  if (period === "ytd") return [iso(start), iso(now)];
  const ls = new Date(start.getFullYear() - 1, 3, 6); const le = new Date(start.getFullYear(), 3, 5);
  return [iso(ls), iso(le)];
}

/** Money for ledgers the person may read finance in. Returns { rows, byLedger, byCat, totalIn, totalOut }. */
export async function moneyFor(ledgers, [from, to]) {
  const rows = [];
  await Promise.all(ledgers.map(async (l) => {
    if (!canRead(l.role, "finance")) return;
    try { (await listRecords(l.id, "finance")).forEach((r) => { if (r.kind !== "prices" && (!from || r.date >= from) && (!to || r.date <= to)) rows.push({ ...r, ledger: l }); }); } catch (e) { /* no access */ }
  }));
  const byLedger = new Map(); const byCat = new Map(); let totalIn = 0, totalOut = 0;
  for (const r of rows) {
    const a = Number(r.amount) || 0; const k = r.ledger.id;
    if (!byLedger.has(k)) byLedger.set(k, { ledger: r.ledger, in: 0, out: 0 });
    if (r.kind === "revenue") { totalIn += a; byLedger.get(k).in += a; }
    else { totalOut += a; byLedger.get(k).out += a; byCat.set(r.category || "Other", (byCat.get(r.category || "Other") || 0) + a); }
  }
  rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return { rows, byLedger: [...byLedger.values()], byCat: [...byCat.entries()].sort((a, b) => b[1] - a[1]), totalIn, totalOut };
}
