// Overview → Money (design/01 §7.2): farm-wide in/out by period, by ledger, biggest costs, export.
import { html, raw } from "../core/html.js";
import { el } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { canRead, canWrite } from "../core/policy.js";
import { moneyFor, periodRange, vatSettings } from "../services/money.js";
import { vatOf, vatPeriods, vatReturn, BOX_NAMES } from "../services/vat.js";
import { todayStr, shortDate } from "../core/dates.js";
import { segmented, selectField, wireForm } from "../ui/form.js";
import { money, moneyText } from "../ui/format.js";
import { openMoneySheet, openMoneyEntry } from "../ui/money-sheet.js";
import { toCSV } from "../services/export.js";
import { download } from "../ui/download.js";
import { META } from "../sectors/meta.js";
import { largeTitle, groupLabel, sectorTile, emptyState } from "./common.js";

let period = "month"; let shown = 40;
const vatRateText = (rate) => (typeof rate === "number" || /^\d+$/.test(rate) ? `${rate}%` : rate === "exempt" ? "Exempt" : "Outside VAT");
export default async function moneyTab(farm) {
  const ledgers = farm ? [farm.space, ...farm.ledgers].filter((l) => l && canRead(l.role, "finance")) : [];
  const body = el(html`<div>${largeTitle("Money")}
    <div data-seg>${segmented("period", [{ value: "month", label: "This month" }, { value: "ytd", label: "Year to date" }, { value: "last", label: "Last year" }], period)}</div>
    <div data-out></div><div data-vat></div></div>`);
  const out = body.querySelector("[data-out]");
  const paint = async () => {
    if (!ledgers.length) { out.replaceChildren(el(emptyState({ iconName: "lock", title: "Money is hidden for your role", body: "Ask the farm's owner if you need to see it." }))); return; }
    const range = periodRange(period); const m = await moneyFor(ledgers, range);
    const left = m.totalIn - m.totalOut; const margin = m.totalIn ? Math.round((left / m.totalIn) * 100) : null;
    const max = Math.max(1, ...m.byLedger.map((x) => Math.max(x.in, x.out)));
    out.replaceChildren(el(html`<div>
      <div class="card pad" style="margin-top:16px"><div class="money-sum">
        <span class="ink-2">Money in</span><span class="v">${money(m.totalIn)}</span>
        <span class="ink-2">Money out</span><span class="v">${money(m.totalOut)}</span>
        <span class="ink-2">Left over</span><span class="v">${money(left)}${margin != null ? html` <span class="t-callout ink-2">${margin}%</span>` : ""}</span></div></div>
      <div class="section">${groupLabel("By herd and flock")}
        ${m.byLedger.length ? html`<div class="list">${m.byLedger.map((x) => html`<a class="row" href="${x.ledger.type === "farm" ? "#/farm/money" : `#/l/${x.ledger.id}/money`}" data-sector="${x.ledger.type === "farm" ? "" : x.ledger.type}">
          ${x.ledger.type === "farm" ? html`<span class="tile neutral">${raw(icon("farm"))}</span>` : sectorTile(x.ledger.type)}
          <span class="main"><span class="primary">${x.ledger.type === "farm" ? "Whole farm (not one ledger)" : x.ledger.name}</span>
          <span class="secondary">In ${moneyText(x.in)} · Out ${moneyText(x.out)}</span>
          <span class="bar-track" style="margin-top:6px;height:6px"><span style="width:${(x.in / max) * 100}%;${x.ledger.type === "farm" ? "background:var(--ink-3)" : ""}"></span></span></span></a>`)}</div>`
          : html`<div class="card pad t-callout ink-2">No money entries in this period.</div>`}</div>
      ${m.byCat.length ? html`<p class="t-callout ink-2" style="margin:16px 4px 0">Biggest costs: ${m.byCat.slice(0, 3).map(([c, v]) => `${c} ${moneyText(v)}`).join(" · ")}</p>` : ""}
      ${m.rows.length ? html`<div class="section">${groupLabel("Entries", m.rows.length)}<div class="list">${m.rows.slice(0, shown).map((r, i) => html`<button type="button" class="row no-lead" data-i="${i}">
        <span class="main"><span class="primary">${r.category || (r.kind === "revenue" ? "Money in" : "Money out")}${r.note ? html` <span class="ink-2">· ${r.note}</span>` : ""}</span>
        <span class="secondary">${shortDate(r.date)} · ${r.ledger.type === "farm" ? "Whole farm" : r.ledger.name}${vatOf(r).vat ? ` · VAT ${moneyText(vatOf(r).vat, true)}` : ""}</span></span>
        <span class="value">${r.kind === "revenue" ? "+" : "−"}${moneyText(r.amount, true)}</span><span class="chev">${raw(icon("chevron"))}</span></button>`)}</div>
        ${m.rows.length > shown ? html`<button type="button" class="text-btn" data-more>Show all ${m.rows.length}</button>` : ""}</div>` : ""}
      <div class="section btn-col"><button type="button" class="btn secondary" data-export>${raw(icon("download"))}Export for accountant</button></div>
    </div>`));
    out.querySelectorAll("[data-i]").forEach((b) => (b.onclick = () => { const r = m.rows[+b.dataset.i]; if (canWrite(r.ledger.role, "finance")) openMoneyEntry(r.ledger, r, { onSaved: () => setTimeout(repaint, 50) }); }));
    out.querySelector("[data-more]")?.addEventListener("click", () => { shown = Infinity; paint(); });
    out.querySelector("[data-export]").onclick = () => {
      const cols = [["date", "Date"], [(r) => (r.ledger.type === "farm" ? "Whole farm" : r.ledger.name), "Ledger"], [(r) => (r.kind === "revenue" ? "In" : "Out"), "In/Out"], ["category", "Category"], [(r) => (Number(r.amount) || 0).toFixed(2), "Amount (£)"], [(r) => vatOf(r).net.toFixed(2), "Net (£)"], [(r) => vatOf(r).vat.toFixed(2), "VAT (£)"], [(r) => vatRateText(vatOf(r).rate), "VAT rate"], [(r) => (r.eu ? "EU" : ""), "EU goods"], ["note", "Note"]];
      download(`farm-money-${range[0]}-to-${range[1]}.csv`, toCSV(m.rows, cols), "text/csv");
    };
  };
  // VAT return (Tom, 3 Nov): the nine boxes for a return period, worked out from the entries, plus a file for the accountant
  const vb = body.querySelector("[data-vat]"); let vatAt = 0;
  const paintVat = async () => {
    const s = ledgers.length ? await vatSettings(ledgers[0]) : null;
    if (!s || s.registered === "no") { vb.replaceChildren(); return; }
    const periods = vatPeriods(s, todayStr(), 8); const p = periods[vatAt];
    const m = await moneyFor(ledgers, [p.from, p.to]); const { boxes, rows } = vatReturn(m.rows, p.from, p.to);
    vb.replaceChildren(el(html`<div class="section">${groupLabel("VAT return")}
      <div data-vp>${selectField({ name: "vatPeriod", label: "Period", value: String(vatAt), options: periods.map((x, i) => ({ value: String(i), label: `${x.label}${i === 0 ? " (this one)" : ""}` })) })}</div>
      <div class="card pad" style="margin-top:8px"><dl class="kv">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => html`<dt>${k}. ${BOX_NAMES[k]}</dt><dd${raw(k === 5 ? ' style="font-weight:700"' : "")}>${k === 5 && boxes[5] < 0 ? `${moneyText(-boxes[5], true)} to reclaim` : k >= 6 ? moneyText(boxes[k]) : moneyText(boxes[k], true)}</dd>`)}</dl></div>
      <p class="hint" style="margin:8px 4px 0">From ${rows.length} ${rows.length === 1 ? "entry" : "entries"} dated ${shortDate(p.from)} to ${shortDate(p.to)}. Check the rates with your accountant before you submit; Farm Ledger doesn't send returns to HMRC.</p>
      <div class="btn-col" style="margin-top:12px"><button type="button" class="btn secondary" data-vatcsv>${raw(icon("download"))}Export VAT return</button></div></div>`));
    wireForm(vb).onChange(() => { vatAt = +vb.querySelector("select[name=vatPeriod]").value; paintVat(); });
    vb.querySelector("[data-vatcsv]").onclick = () => {
      const lines = [...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => ({ date: "", what: `Box ${k}: ${BOX_NAMES[k]}`, net: "", vat: boxes[k].toFixed(2) })), { date: "", what: "", net: "", vat: "" },
        ...rows.map((r) => ({ date: r.date, what: [r.ledger.type === "farm" ? "Whole farm" : r.ledger.name, r.kind === "revenue" ? "In" : "Out", r.category, r.supplier, r.note, vatRateText(r.rate), r.eu ? "EU" : ""].filter(Boolean).join(" · "), net: r.net.toFixed(2), vat: r.vat.toFixed(2) }))];
      download(`vat-return-${p.from}-to-${p.to}.csv`, toCSV(lines, [["date", "Date"], ["what", "Entry"], ["net", "Net (£)"], ["vat", "VAT (£) / box value"]]), "text/csv");
    };
  };
  const repaint = () => { paint(); paintVat(); };
  const f = wireForm(body.querySelector("[data-seg]")); f.onChange(() => { period = f.values().period; shown = 40; paint(); });
  await paint(); paintVat().catch((e) => console.error("vat", e));
  const space = farm && farm.space && canWrite(farm.space.role, "finance") ? farm.space : null;
  return { el: body, title: "Money", fab: space ? () => openMoneySheet({ ...space, name: "Whole farm" }, null, { onSaved: () => setTimeout(repaint, 50) }) : null };
}
export { META };
