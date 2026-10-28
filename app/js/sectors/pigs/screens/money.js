// Money in the Pigs ledger (design/13 §10) — owner, manager, accountant. Per pig and per kg
// deadweight: feed £ per pig, feed cost per kg gain (per batch), margin over feed per pig, price
// p/kg dw vs the Standard Pig Price (entered, never fetched), cost of production. Weaner sales by
// weight band. Contract mode: contract income and the farmer's own costs only.
import { html, raw } from "../../../core/html.js";
import { icon } from "../../../ui/icons.js";
import { canWrite, canWriteMeta } from "../../../core/policy.js";
import { addDays } from "../model/dates.js";
import { openMoneySheet } from "../../../ui/money-sheet.js";
import { largeTitle, backLink, groupLabel } from "../../../screens/common.js";
import { liveScreen } from "./live.js";
import { pounds, n0, n1, d2 } from "../ui.js";
import { moneyFigures, ownMoneyRow, AHDB_COP, SPP_NOTE } from "../model/money.js";
import { batchName } from "../model/batches.js";
import { saveSettings } from "../actions.js";

const periods = new Map();

export default async function money(ctx) {
  const isTab = ctx.tabId === "money";
  return liveScreen(ctx, { title: "Money", depth: isTab ? 0 : 1, tab: isTab ? null : "more", paint: (snap) => {
    const lid = snap.lid; const p = periods.get(lid) || 365;
    const from = addDays(snap.today, -p); const rows = (snap.data.finance || []).filter((f) => f.date > from);
    const m = moneyFigures(rows, { contract: snap.s.contract.on ? snap.s.contract : null });
    const contract = snap.s.contract.on && snap.s.contract.integratorOwns;
    const kv = (k, v, sub = "") => html`<div class="row no-lead pg-kv"><span class="main"><span class="primary">${k}</span>${sub ? html`<span class="secondary">${sub}</span>` : ""}</span><span class="v">${v}</span></div>`;
    const batches = snap.data.batches.filter((b) => b.numberIn != null).sort((a, b) => b.no - a.no).slice(0, 8);
    const spp = snap.s.spp;
    return html`<div>${isTab ? "" : backLink(`#/l/${lid}/more`, "More")}${largeTitle("Money", contract ? `Contract finishing for ${snap.s.contract.integrator || "your integrator"} · paid ${snap.s.contract.basis}` : "Per pig and per kg deadweight")}
      <div class="segmented" role="radiogroup" style="margin-bottom:12px"><span class="thumb"></span>${[[90, "3 months"], [182, "6 months"], [365, "12 months"]].map(([d, l]) => html`<button type="button" role="radio" data-p="${d}" aria-checked="${p === d}">${l}</button>`)}</div>
      <div class="pg-bt">
        <div class="num-tile"><span class="label">Money in</span><span class="value">${pounds(contract ? m.contractIncome : m.totalIn)}</span><span class="delta">${contract ? "contract payments" : `${n0(m.pigsSold)} pigs on kill sheets`}</span></div>
        <div class="num-tile"><span class="label">Money out</span><span class="value">${pounds(contract ? m.ownCosts : m.totalOut)}</span><span class="delta">${contract ? "your own costs" : `feed ${pounds(m.feed)}`}</span></div></div>
      ${contract ? html`<div class="section"><div class="list">${kv("Contract income", pounds(m.contractIncome))}${kv("Your costs (power, labour, slurry…)", pounds(m.ownCosts))}${kv("Left over", pounds(m.contractIncome - m.ownCosts))}</div><p class="pg-note">Pigs and feed belong to the integrator, so feed cost and pig value aren't your money and aren't shown.</p></div>`
        : html`<div class="section">${groupLabel("Per pig")}<div class="list">${kv("Price per pig", pounds(m.pricePerPig))}${kv("Price p/kg deadweight", m.pricePpk != null ? n1(m.pricePpk) + "p" : "—", spp ? `SPP you entered: ${spp}p · ${m.pricePpk != null ? (m.pricePpk - spp >= 0 ? "+" : "") + n1(m.pricePpk - spp) + "p" : ""}` : "")}${kv("Feed £ per pig", pounds(m.feedPerPig))}${kv("Margin over feed per pig", pounds(m.marginOverFeed))}${kv("Margin over variable costs per pig", pounds(m.marginPerPig))}${kv("Cost of production", m.copPpk != null ? n1(m.copPpk) + "p/kg dw" : "—", `AHDB GB ${AHDB_COP.ppk}p (${AHDB_COP.label})`)}</div>
          ${canWriteMeta(snap.role, "settings") ? html`<div class="form-group" style="margin-top:8px"><div class="field"><label>Standard Pig Price (p/kg)</label><input inputmode="decimal" data-spp value="${spp || ""}" placeholder="from your processor or AHDB"></div></div>` : ""}<p class="pg-note">${SPP_NOTE}</p></div>
        <div class="section">${groupLabel("Per batch — feed cost per kg gain")}<div class="list">${batches.length ? batches.map((b) => { const f = snap.c.bf.get(b.id); return html`<a class="row no-lead pg-kv" href="#/l/${lid}/batch/${b.id}"><span class="main"><span class="primary">${batchName(b)}${b.closed ? " · closed" : ""}</span><span class="secondary">${f?.feedPounds ? `${pounds(f.feedPounds)} feed · ${pounds(f.feedPerPig, 2)}/pig` : "no feed £ yet"}</span></span><span class="v">${f?.costPerKgGain != null ? Math.round(f.costPerKgGain * 100) + "p/kg" : "—"}</span><span class="chev">${raw(icon("chevron"))}</span></a>`; }) : html`<div class="row no-lead"><span class="main"><span class="secondary">No batches yet.</span></span></div>`}</div></div>
        ${m.weanerBands.length ? html`<div class="section">${groupLabel("Weaner sales")}<div class="list">${m.weanerBands.map((b) => kv(b.band, `${n0(b.head)} · ${pounds(b.perHead)}/head`))}</div></div>` : ""}`}
      <div class="section">${groupLabel("Latest")}<div class="list">${rows.filter((r) => !contract || ownMoneyRow(r)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8).map((r) => html`<div class="row no-lead pg-kv"><span class="main"><span class="primary">${r.note || r.category}</span><span class="secondary">${d2(r.date)} · ${r.category}</span></span><span class="v ${r.kind === "revenue" ? "ok" : ""}">${r.kind === "revenue" ? "+" : "−"}${pounds(r.amount)}</span></div>`)}${!rows.length ? html`<div class="row no-lead"><span class="main"><span class="secondary">Nothing in this period.</span></span></div>` : ""}</div></div>
      ${canWrite(snap.role, "finance") ? html`<button type="button" class="btn secondary" style="margin-top:12px" data-add>${raw(icon("plus"))}Add money in or out</button>` : ""}</div>`;
  }, after: (node, snap, repaint) => {
    node.querySelectorAll("[data-p]").forEach((b) => (b.onclick = () => { periods.set(snap.lid, +b.dataset.p); repaint(); }));
    requestAnimationFrame(() => { const g = node.querySelector(".segmented"); const on = g?.querySelector("[aria-checked=true]"); const th = g?.querySelector(".thumb"); if (on && th) { th.style.width = on.offsetWidth + "px"; th.style.transform = `translateX(${on.offsetLeft - 3}px)`; } });
    const s = node.querySelector("[data-spp]"); if (s) s.onchange = () => saveSettings(snap, { spp: +s.value || null });
    const a = node.querySelector("[data-add]"); if (a) a.onclick = () => openMoneySheet(snap.ledger);
  } });
}
