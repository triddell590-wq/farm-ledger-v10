// Money in the Pigs ledger (design/13 §10): per pig and per kg deadweight, not per head per year.
// Every £ lives in finance records (owner, manager, accountant only); kill sheets, feed deliveries
// and moves link to them by id but never hold prices themselves.
const sum = (a, f) => a.reduce((t, x) => t + (+f(x) || 0), 0);
export const AHDB_COP = { ppk: 201, label: "AHDB GB full cost of production, Q2 2026 (Research A)" };
export const SPP_NOTE = "Standard Pig Price: enter the figure from your processor or AHDB — the app never fetches it without a source.";
const VARIABLE = new Set(["Feed", "Vet & medicine", "Medicine", "Bedding", "Animal Purchase"]);
const INTEGRATOR_OWNS = new Set(["Feed", "Animal Purchase"]);
/** Rows that are the farmer's own money when pigs and feed belong to the integrator. */
export const ownMoneyRow = (r) => (r.kind === "revenue" ? r.source === "contract" : !INTEGRATOR_OWNS.has(r.category));

/** Period figures from finance rows (already filtered to the period). */
export function moneyFigures(rows, { contract = null } = {}) {
  const rev = rows.filter((r) => r.kind === "revenue"); const exp = rows.filter((r) => r.kind === "expense");
  const killRows = rev.filter((r) => r.source === "killSheet");
  const pigsSold = sum(killRows, (r) => r.pigs); const dwKg = sum(killRows, (r) => r.dwKg);
  const sales = sum(killRows, (r) => r.amount);
  const feed = sum(exp.filter((r) => r.category === "Feed"), (r) => r.amount);
  const variable = sum(exp.filter((r) => VARIABLE.has(r.category)), (r) => r.amount);
  const costs = sum(exp, (r) => r.amount);
  const weaners = rev.filter((r) => r.source === "weanerSale");
  const contractIncome = sum(rev.filter((r) => r.source === "contract"), (r) => r.amount);
  return {
    totalIn: sum(rev, (r) => r.amount), totalOut: costs, pigsSold, dwKg, sales, feed,
    pricePpk: dwKg ? (sales / dwKg) * 100 : null,
    pricePerPig: pigsSold ? sales / pigsSold : null,
    feedPerPig: pigsSold ? feed / pigsSold : null,
    marginOverFeed: pigsSold ? (sales - feed) / pigsSold : null,
    marginPerPig: pigsSold ? (sales - variable) / pigsSold : null,
    copPpk: dwKg ? (costs / dwKg) * 100 : null,
    weanerHead: sum(weaners, (r) => r.pigs), weanerPounds: sum(weaners, (r) => r.amount),
    weanerBands: bands(weaners), contractIncome, contract: !!contract,
    // contract mode where the integrator owns pigs and feed: only contract income and the farmer's own costs
    ownCosts: sum(exp.filter((r) => !INTEGRATOR_OWNS.has(r.category)), (r) => r.amount),
  };
}
function bands(rows) {
  const m = new Map();
  for (const r of rows) { const b = r.weightBand || "—"; const x = m.get(b) || { band: b, head: 0, pounds: 0 }; x.head += +r.pigs || 0; x.pounds += +r.amount || 0; m.set(b, x); }
  return [...m.values()].map((x) => ({ ...x, perHead: x.head ? x.pounds / x.head : null }));
}

/** Kill sheet results (design/13 §6.4). pigs: [{ dwKg, p2, grade, ppk?, deductions? }]. */
export function killSheetResults(pigs, s, { totalDwKg = null, count = null, totalPounds = null } = {}) {
  const n = count || pigs.length; const dw = totalDwKg || sum(pigs, (p) => p.dwKg);
  const inSpec = pigs.filter((p) => +p.dwKg >= s.bandMin && +p.dwKg <= s.bandMax).length;
  const pounds = totalPounds ?? (pigs.some((p) => p.ppk) ? sum(pigs, (p) => (+p.dwKg * +p.ppk) / 100 - (+p.deductions || 0)) : null);
  return { pigs: n, dwKg: dw, avgDw: n ? dw / n : null, inSpec: pigs.length ? inSpec : null, inSpecPct: pigs.length ? inSpec / pigs.length : null, pounds, perPig: pounds != null && n ? pounds / n : null, ppk: pounds != null && dw ? (pounds / dw) * 100 : null };
}
/** One-line finance copy for an accountant (01-platform §15.2). */
export function killSheetNote(batchName, r) { return `${r.pigs} finishers ${batchName} · ${Math.round(r.dwKg).toLocaleString("en-GB")} kg dw · avg ${r.avgDw?.toFixed(1)} kg${r.ppk ? ` · £${(r.ppk / 100).toFixed(2)}/kg` : ""}`; }
