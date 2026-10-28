// Money per ewe (design/11 §10; Owner, Manager, Accountant). Every £ comes from this ledger's
// `finance` records — sale prices are only ever stored there (01 §15). Gross margin per ewe
// against the FBS benchmarks, price per lamb over time, outlets, deductions, cost per kg.
// The accountant sees the money lines only (no mobs); workers and vets never get here.
import { html, raw } from "../../core/html.js";
import { el } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { segmented, wireForm } from "../../ui/form.js";
import { openMoneySheet } from "../../ui/money-sheet.js";
import { canRead, canWrite } from "../../core/policy.js";
import { listRecords } from "../../services/records.js";
import { moneyText, num } from "../../ui/format.js";
import { largeTitle, backLink, groupLabel, emptyState } from "../../screens/common.js";
import { ensureCss, short, lineChart, kvRows } from "./ui.js";
import { loadSheep } from "./data.js";
import { ewesToRam } from "./model/mobs.js";
import { grossMargin, costPerKg, FBS_BENCHMARKS } from "./model/selling.js";

const OUTLET = { abattoir: "Processor", market: "Mart", farm: "Another farm", export: "Export" };

/** Money facts for one year from finance rows (pure; tested). */
export function sheepMoney(finance, year, ewes) {
  const rows = finance.filter((f) => !f.deleted && String(f.date || "").startsWith(String(year)));
  const gm = grossMargin(rows, ewes);
  const sales = rows.filter((f) => f.kind === "revenue" && f.source === "sheep-sale").sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const lambSales = sales.filter((f) => f.lambs);
  const lambs = lambSales.reduce((n, f) => n + (+f.count || 0), 0);
  const lambGross = lambSales.reduce((n, f) => n + (+f.gross || +f.amount || 0), 0);
  const deadKg = sales.reduce((n, f) => n + (+f.deadKg || 0), 0);
  const ded = { levy: 0, haulage: 0, commission: 0 };
  for (const f of sales) for (const k of Object.keys(ded)) ded[k] += +f.deductions?.[k] || 0;
  const outlets = {}; for (const f of sales) { const k = OUTLET[f.outletType] || "Other"; outlets[k] = (outlets[k] || 0) + (+f.count || 0); }
  return { ...gm, sales, lambs, perLamb: lambs ? Math.round((lambGross / lambs) * 100) / 100 : null, deadKg, costPerKg: costPerKg(gm.costs, deadKg), deductions: ded, outlets, points: lambSales.filter((f) => +f.count).map((f) => ({ x: f.date, y: Math.round(((+f.gross || +f.amount) / +f.count) * 100) / 100 })) };
}

export default async function moneyScreen(ctx) {
  ensureCss();
  const { ledger } = ctx; const isTab = ctx.tabId === "money"; const thisYear = Number(new Date().toISOString().slice(0, 4));
  const st = { year: thisYear };
  const body = el(html`<div class="sheep-page"></div>`);
  const paint = async () => {
    const ops = canRead(ledger.role, "events");
    const snap = ops ? await loadSheep(ledger) : null;
    const fin = snap ? snap.data.finance : await listRecords(ledger.id, "finance").catch(() => []);
    const ewes = (snap ? ewesToRam(snap.data, snap.cy) || snap.totals.ewes : 0) || +ledger.settings?.ewes || 0;
    const m = sheepMoney(fin, st.year, ewes);
    const best = Math.max(1, ...FBS_BENCHMARKS.map(([, v]) => v), Math.abs(m.perEwe || 0));
    const node = el(html`<div>${isTab ? "" : backLink(`#/l/${ledger.id}/more`, "More")}${largeTitle("Money per ewe", `${ledger.name} · ${st.year}`)}
      <div class="seg-wrap">${segmented("year", [thisYear, thisYear - 1].map((y) => ({ value: String(y), label: y === thisYear ? "This year" : "Last year" })), String(st.year))}</div>
      <div class="num-tile hero" style="margin-top:12px"><span class="label">Gross margin per ewe</span><span class="value">${m.perEwe == null ? "–" : moneyText(m.perEwe)}</span><span class="delta">${ewes ? `${num(ewes)} ewes to the ram · income ${moneyText(m.income)} − costs ${moneyText(m.costs)}` : "Add your ewes on the Mobs tab to work this out"}</span></div>
      <div class="section">${groupLabel("Against FBS 2024/25 (per ewe)")}<div class="card pad bench">
        ${m.perEwe != null ? html`<div class="me"><span><b style="text-align:left">You</b></span><i style="width:${(Math.max(0, m.perEwe) / best) * 100}%"></i><b>${moneyText(m.perEwe)}</b></div>` : ""}
        ${FBS_BENCHMARKS.map(([k, v]) => html`<div><span>${k}</span><i style="width:${(v / best) * 100}%;background:var(--ink-3)"></i><b>£${v}</b></div>`)}
        <p class="source">Farm Business Survey NI 2024/25 gross margins (Research A). Shown as text, not a target.</p></div></div>
      <div class="section">${groupLabel("Where the money came from")}${kvRows([["Lamb sales", moneyText(m.lines.lambs)], ["Cull ewe sales", moneyText(m.lines.culls)], ["Wool", moneyText(m.lines.wool)], ["Schemes", moneyText(m.lines.schemes)], m.lines.other ? ["Other income", moneyText(m.lines.other)] : null, ["Costs (this ledger)", moneyText(m.costs), "late"]])}</div>
      <div class="s-tiles">
        <div class="num-tile"><span class="label">Price per lamb</span><span class="value">${m.perLamb == null ? "–" : moneyText(m.perLamb)}</span><span class="delta">${m.lambs ? `${num(m.lambs)} lambs sold` : "No lamb sales yet"}</span></div>
        <div class="num-tile"><span class="label">Cost per kg carcase</span><span class="value">${m.costPerKg == null ? "–" : `£${m.costPerKg.toFixed(2)}`}</span><span class="delta">${m.deadKg ? `${num(Math.round(m.deadKg))} kg dead sold` : "From kill sheets"}</span></div></div>
      ${m.points.length > 1 ? html`<div class="section">${groupLabel("Price per lamb sold")}<div class="card pad">${lineChart(m.points.map((p) => ({ x: p.x, y: Math.round(p.y) })), { unit: "" })}</div></div>` : ""}
      ${m.sales.length ? html`<div class="section">${groupLabel("Outlets")}${kvRows(Object.entries(m.outlets).map(([k, v]) => [k, `${num(v)}`, "", "sheep sold"]))}
        <p class="form-label">Deductions this year</p>${kvRows([["Levy", moneyText(m.deductions.levy)], ["Haulage", moneyText(m.deductions.haulage)], ["Commission", moneyText(m.deductions.commission)]])}</div>
      <div class="section">${groupLabel("Sales", m.sales.length)}<div class="list">${m.sales.slice().reverse().map((f) => html`<div class="row no-lead"><span class="main"><span class="primary">${f.note || "Sale"}</span><span class="secondary">${short(f.date)}${f.gross && f.gross !== f.amount ? ` · gross ${moneyText(f.gross)}` : ""}${(f.lines || []).map((l) => l.grade).filter(Boolean).length ? ` · grade ${(f.lines || []).map((l) => l.grade).filter(Boolean).join(", ")}` : ""}</span></span><span class="kv-v">${moneyText(f.amount)}</span></div>`)}</div></div>`
        : emptyState({ sector: "sheep", title: "No sheep sales this year", body: "Sales appear here when you draft and sell lambs, with the price per lamb and the deductions." })}
      ${canWrite(ledger.role, "finance") ? html`<button type="button" class="btn secondary" data-add style="margin-top:16px">${raw(icon("plus"))} Add income or a cost</button>` : ""}
      <p class="foot-note">Costs are the money lines in this Sheep ledger. Wool, scheme payments and cull ewe sales are recognised from their category or note.</p></div>`);
    body.replaceChildren(node);
    const f = wireForm(node); f.onChange(() => { st.year = +f.values().year; paint(); });
    node.querySelector("[data-add]")?.addEventListener("click", () => openMoneySheet(ledger, null, { onSaved: paint }));
  };
  await paint();
  return { el: body, title: "Money per ewe", depth: isTab ? 0 : 1, tab: isTab ? "money" : "more" };
}
