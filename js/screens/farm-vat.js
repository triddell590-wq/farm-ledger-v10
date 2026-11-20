// Farm → Money → VAT (Tom, 4–5 Nov): a return period in plain rows — the headline figures, every
// purchase and sale with its net and VAT, and the nine return boxes, plus a file for the accountant.
import { html, raw } from "../core/html.js";
import { el } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { canRead, canWrite } from "../core/policy.js";
import { vatPeriodFor } from "../services/money.js";
import { BOX_NAMES, rateText } from "../services/vat.js";
import { MONTHS, shortDate } from "../core/dates.js";
import { selectField, wireForm } from "../ui/form.js";
import { moneyText } from "../ui/format.js";
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
    // Plain list rows (the app's own, readable at any text size): what it was on the left, net and VAT on the right
    const table = (title, list) => (list.length ? html`<div class="section">${groupLabel(title, list.length)}<div class="list">${list.map((r) => html`<button type="button" class="row no-lead" data-i="${all.indexOf(r)}">
        <span class="main"><span class="primary">${r.category || (r.kind === "revenue" ? "Money in" : "Money out")}</span>
        <span class="secondary">${[dayMonth(r.date), r.supplier || r.note, where(r), rateText(r.rate), r.eu ? "EU" : ""].filter(Boolean).join(" · ")}</span></span>
        <span class="value">${pounds(r.net)}<span class="vat-sub">VAT ${pounds(r.vat)}</span></span></button>`)}
      <div class="row no-lead vat-total"><span class="main"><span class="primary">Total</span></span><span class="value">${pounds(list.reduce((s, r) => s + r.net, 0))}<span class="vat-sub">VAT ${pounds(list.reduce((s, r) => s + r.vat, 0))}</span></span></div></div></div>` : "");
    const line = (label, value, cls = "") => html`<span class="vat-line ${cls}"><span>${label}</span><b>${value}</b></span>`;
    out.replaceChildren(el(html`<div>
      <div data-vp>${selectField({ name: "vatPeriod", label: "Period", value: String(at), options: periods.map((x, i) => ({ value: String(i), label: `${x.label}${i === 0 ? " (this one)" : ""}` })) })}</div>
      <div class="card vat-card" style="margin-top:12px">${line("VAT to reclaim", pounds(boxes[4]))}${line("Purchases ex VAT", moneyText(boxes[7]))}${line("VAT on sales", pounds(boxes[3]))}${line("Sales ex VAT", moneyText(boxes[6]))}
        ${line(boxes[5] < 0 ? "To reclaim from HMRC" : "To pay HMRC", pounds(Math.abs(boxes[5])), "total")}</div>
      ${rows.length ? "" : html`<div class="card pad" style="margin-top:12px">No money entries dated ${shortDate(p.from)} to ${shortDate(p.to)}.</div>`}
      ${groups.map(([title, list]) => table(title, list))}
      <div class="section">${groupLabel("VAT return boxes")}<div class="card vat-card">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => line(`${k}. ${BOX_NAMES[k]}`, k >= 6 ? moneyText(boxes[k]) : pounds(boxes[k]), k === 5 ? "total" : ""))}</div></div>
      <p class="hint" style="margin:8px 4px 0">Tap an entry to fix it. Check the rates with your accountant before you submit; Farm Ledger doesn't send returns to HMRC.</p>
      <div class="section btn-col"><button type="button" class="btn secondary" data-vatcsv>${raw(icon("download"))}Export VAT return</button></div></div>`));
    wireForm(out.querySelector("[data-vp]")).onChange(() => { at = +out.querySelector("select[name=vatPeriod]").value; paint(); });
    const open = (r) => { if (canWrite(r.ledger.role, "finance")) openMoneyEntry(r.ledger, r, { onSaved: () => setTimeout(paint, 50) }); };
    out.querySelectorAll("[data-i]").forEach((b) => (b.onclick = () => open(all[+b.dataset.i])));
    out.querySelector("[data-vatcsv]").onclick = () => {
      const lines = [...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => ({ date: "", what: `Box ${k}: ${BOX_NAMES[k]}`, net: "", vat: boxes[k].toFixed(2) })), { date: "", what: "", net: "", vat: "" },
        ...rows.map((r) => ({ date: r.date, what: [where(r), r.kind === "revenue" ? "In" : "Out", r.category, r.supplier, r.note, rateText(r.rate), r.eu ? "EU" : ""].filter(Boolean).join(" · "), net: r.net.toFixed(2), vat: r.vat.toFixed(2) }))];
      download(`vat-return-${p.from}-to-${p.to}.csv`, toCSV(lines, [["date", "Date"], ["what", "Entry"], ["net", "Net (£)"], ["vat", "VAT (£) / box value"]]), "text/csv");
    };
  };
  await paint();
  return makeScreen({ body, title: "VAT", area: "farm", tab: "money", depth: 1, chrome: { tabs: farmTabs(), tab: "money" } });
}
