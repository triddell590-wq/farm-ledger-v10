// Overview → Money (design/01 §7.2): farm-wide in/out by period, by ledger, biggest costs, export.
import { html, raw } from "../core/html.js";
import { el } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { canRead, canWrite } from "../core/policy.js";
import { moneyFor, periodRange, vatPeriodFor } from "../services/money.js";
import { vatOf, rateText } from "../services/vat.js";
import { shortDate } from "../core/dates.js";
import { segmented, wireForm } from "../ui/form.js";
import { money, moneyText } from "../ui/format.js";
import { openMoneySheet, openMoneyEntry } from "../ui/money-sheet.js";
import { toCSV } from "../services/export.js";
import { download } from "../ui/download.js";
import { META } from "../sectors/meta.js";
import { largeTitle, groupLabel, sectorTile, emptyState } from "./common.js";

let period = "month"; let shown = 40;
export default async function moneyTab(farm) {
  const ledgers = farm ? [farm.space, ...farm.ledgers].filter((l) => l && canRead(l.role, "finance")) : [];
  const body = el(html`<div>${largeTitle("Money")}
    <div data-seg>${segmented("period", [{ value: "month", label: "This month" }, { value: "ytd", label: "Year to date" }, { value: "last", label: "Last year" }], period)}</div>
    <div data-out></div></div>`);
  const vb = el(html`<div data-vat></div>`); // VAT card: kept across repaints, shown just under the in/out totals
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
    out.querySelector(".money-sum").closest(".card").after(vb);
    out.querySelectorAll("[data-i]").forEach((b) => (b.onclick = () => { const r = m.rows[+b.dataset.i]; if (canWrite(r.ledger.role, "finance")) openMoneyEntry(r.ledger, r, { onSaved: () => setTimeout(repaint, 50) }); }));
    out.querySelector("[data-more]")?.addEventListener("click", () => { shown = Infinity; paint(); });
    out.querySelector("[data-export]").onclick = () => {
      const cols = [["date", "Date"], [(r) => (r.ledger.type === "farm" ? "Whole farm" : r.ledger.name), "Ledger"], [(r) => (r.kind === "revenue" ? "In" : "Out"), "In/Out"], ["category", "Category"], [(r) => (Number(r.amount) || 0).toFixed(2), "Amount (£)"], [(r) => vatOf(r).net.toFixed(2), "Net (£)"], [(r) => vatOf(r).vat.toFixed(2), "VAT (£)"], [(r) => rateText(vatOf(r).rate), "VAT rate"], [(r) => (r.eu ? "EU" : ""), "EU goods"], ["note", "Note"]];
      download(`farm-money-${range[0]}-to-${range[1]}.csv`, toCSV(m.rows, cols), "text/csv");
    };
  };
  // VAT (Tom, 4 Nov): the two figures that matter on the front; the full tables are one tap away (farm-vat.js)
  const paintVat = async () => {
    const v = await vatPeriodFor(ledgers, 0);
    if (!v) { vb.replaceChildren(); return; }
    const { boxes, period: p } = v;
    vb.replaceChildren(el(html`<div class="section">${groupLabel("VAT", p.label)}<a class="card vat-card" href="#/farm/vat">
      <span class="vat-line"><span>VAT to reclaim</span><b>${moneyText(boxes[4], true)}</b></span>
      <span class="vat-line"><span>Purchases ex VAT</span><b>${moneyText(boxes[7])}</b></span>
      <span class="vat-line total"><span>${boxes[5] < 0 ? "To reclaim from HMRC" : "To pay HMRC"}</span><b>${moneyText(Math.abs(boxes[5]), true)}</b></span>
      <span class="vat-open">See full VAT details${raw(icon("chevron"))}</span></a></div>`));
  };
  const repaint = () => { paint(); paintVat(); };
  const f = wireForm(body.querySelector("[data-seg]")); f.onChange(() => { period = f.values().period; shown = 40; paint(); });
  await paint(); paintVat().catch((e) => console.error("vat", e));
  const space = farm && farm.space && canWrite(farm.space.role, "finance") ? farm.space : null;
  return { el: body, title: "Money", fab: space ? () => openMoneySheet({ ...space, name: "Whole farm" }, null, { onSaved: () => setTimeout(repaint, 50) }) : null };
}
export { META };
