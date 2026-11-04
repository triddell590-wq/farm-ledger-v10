// Farm → Money → VAT (Tom, 4 Nov): a return period as plain tables — the headline figures, every
// purchase and sale with its net and VAT, and the nine return boxes, plus a file for the accountant.
import { html, raw } from "../core/html.js";
import { el } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { canRead, canWrite } from "../core/policy.js";
import { vatPeriodFor } from "../services/money.js";
import { BOX_NAMES, rateText } from "../services/vat.js";
import { MONTHS, shortDate } from "../core/dates.js";
import { selectField, wireForm } from "../ui/form.js";
import { money, moneyText } from "../ui/format.js";
import { openMoneyEntry } from "../ui/money-sheet.js";
import { toCSV } from "../services/export.js";
import { download } from "../ui/download.js";
import { session } from "../services/session.js";
import { makeScreen, largeTitle, backLink, groupLabel, farmTabs, emptyState } from "./common.js";

let at = 0; // the period shown stays picked while you go in and out of entries
const dayMonth = (iso) => `${+iso.slice(8, 10)} ${MONTHS[+iso.slice(5, 7) - 1]}`;
const where = (r) => (r.ledger.type === "farm" ? "Whole farm" : r.ledger.name);
const pounds = (v) => moneyText(v, true);

export default async function farmVat() {
  const farm = session.farm();
  const ledgers = farm ? [farm.space, ...farm.ledgers].filter((l) => l && canRead(l.role, "finance")) : [];
  const body = el(html`<div>${backLink("#/farm/money", "Money")}${largeTitle("VAT")}<div data-out></div></div>`);
  const out = body.querySelector("[data-out]");
  const paint = async () => {
    if (!ledgers.length) { out.replaceChildren(el(emptyState({ iconName: "lock", title: "Money is hidden for your role", body: "Ask the farm's owner if you need to see it." }))); return; }
    const v = await vatPeriodFor(ledgers, at);
    if (!v) { out.replaceChildren(el(emptyState({ iconName: "info", title: "VAT is switched off", body: "This farm is set as not VAT registered.", action: "Change in Settings", href: "#/settings/tax" }))); return; }
    const { boxes, rows, period: p, periods } = v;
    const onReturn = rows.filter((r) => r.rate !== "outside");
    const groups = [["Purchases", onReturn.filter((r) => r.kind === "expense")], ["Sales", onReturn.filter((r) => r.kind === "revenue")], ["Not on the VAT return", rows.filter((r) => r.rate === "outside")]];
    const all = groups.flatMap(([, list]) => list);
    const table = (title, list) => (list.length ? html`<div class="section">${groupLabel(title, list.length)}<div class="card vat-table"><table class="vat-tbl">
      <thead><tr><th>Date</th><th>Entry</th><th class="num">Net</th><th class="num">VAT</th></tr></thead>
      <tbody>${list.map((r) => html`<tr data-i="${all.indexOf(r)}" tabindex="0"><td class="nowrap">${dayMonth(r.date)}</td>
        <td>${r.category || (r.kind === "revenue" ? "Money in" : "Money out")}<span class="sub">${[r.supplier || r.note, where(r), rateText(r.rate), r.eu ? "EU" : ""].filter(Boolean).join(" · ")}</span></td>
        <td class="num">${pounds(r.net)}</td><td class="num">${pounds(r.vat)}</td></tr>`)}</tbody>
      <tfoot><tr><td></td><td>Total</td><td class="num">${pounds(list.reduce((s, r) => s + r.net, 0))}</td><td class="num">${pounds(list.reduce((s, r) => s + r.vat, 0))}</td></tr></tfoot></table></div></div>` : "");
    out.replaceChildren(el(html`<div>
      <div data-vp>${selectField({ name: "vatPeriod", label: "Period", value: String(at), options: periods.map((x, i) => ({ value: String(i), label: `${x.label}${i === 0 ? " (this one)" : ""}` })) })}</div>
      <div class="card pad" style="margin-top:12px"><div class="vat-figs">
        <div><span class="t-callout ink-2">VAT to reclaim</span><span class="v">${money(boxes[4], true)}</span></div>
        <div><span class="t-callout ink-2">Purchases ex VAT</span><span class="v">${money(boxes[7])}</span></div>
        <div><span class="t-callout ink-2">VAT on sales</span><span class="v">${money(boxes[3], true)}</span></div>
        <div><span class="t-callout ink-2">Sales ex VAT</span><span class="v">${money(boxes[6])}</span></div></div>
        <div class="vat-foot"><span>${boxes[5] < 0 ? "To reclaim from HMRC" : "To pay HMRC"}</span><b class="vat-net">${pounds(Math.abs(boxes[5]))}</b></div></div>
      ${rows.length ? "" : html`<div class="card pad t-callout ink-2" style="margin-top:12px">No money entries dated ${shortDate(p.from)} to ${shortDate(p.to)}.</div>`}
      ${groups.map(([title, list]) => table(title, list))}
      <div class="section">${groupLabel("VAT return boxes")}<div class="card vat-table"><table class="vat-tbl"><tbody>
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => html`<tr class="${k === 5 ? "strong" : ""}"><td class="nowrap">Box ${k}</td><td>${BOX_NAMES[k]}</td><td class="num">${k >= 6 ? moneyText(boxes[k]) : pounds(boxes[k])}</td></tr>`)}</tbody></table></div></div>
      <p class="hint" style="margin:8px 4px 0">Tap an entry to fix it. Check the rates with your accountant before you submit; Farm Ledger doesn't send returns to HMRC.</p>
      <div class="section btn-col"><button type="button" class="btn secondary" data-vatcsv>${raw(icon("download"))}Export VAT return</button></div></div>`));
    wireForm(out.querySelector("[data-vp]")).onChange(() => { at = +out.querySelector("select[name=vatPeriod]").value; paint(); });
    const open = (r) => { if (canWrite(r.ledger.role, "finance")) openMoneyEntry(r.ledger, r, { onSaved: () => setTimeout(paint, 50) }); };
    out.querySelectorAll("tr[data-i]").forEach((tr) => {
      tr.onclick = () => open(all[+tr.dataset.i]);
      tr.onkeydown = (e) => { if (e.key === "Enter") open(all[+tr.dataset.i]); };
    });
    out.querySelector("[data-vatcsv]").onclick = () => {
      const lines = [...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => ({ date: "", what: `Box ${k}: ${BOX_NAMES[k]}`, net: "", vat: boxes[k].toFixed(2) })), { date: "", what: "", net: "", vat: "" },
        ...rows.map((r) => ({ date: r.date, what: [where(r), r.kind === "revenue" ? "In" : "Out", r.category, r.supplier, r.note, rateText(r.rate), r.eu ? "EU" : ""].filter(Boolean).join(" · "), net: r.net.toFixed(2), vat: r.vat.toFixed(2) }))];
      download(`vat-return-${p.from}-to-${p.to}.csv`, toCSV(lines, [["date", "Date"], ["what", "Entry"], ["net", "Net (£)"], ["vat", "VAT (£) / box value"]]), "text/csv");
    };
  };
  await paint();
  return makeScreen({ body, title: "VAT", area: "farm", tab: "money", depth: 1, chrome: { tabs: farmTabs(), tab: "money" } });
}
