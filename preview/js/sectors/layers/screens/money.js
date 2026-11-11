// Money per dozen and per bird housed (design/14 §6.3, §10 depop decision). Owner and Manager see
// the flock maths (feed £ per dozen, kg feed per dozen, FCR, margin over feed per bird per week,
// flock margin per bird housed, keep-or-depop estimate). The Accountant — who cannot read the
// flock or the daily sheets (01-platform §15) — sees the money records only: packer statements as
// income with p/dozen, feed and pullet bills, spent hens, energy. £ lives only in `finance`.
import { html, raw } from "../../../core/html.js";
import { icon } from "../../../ui/icons.js";
import { canRead, canWrite } from "../../../core/policy.js";
import { addDays } from "../../../core/dates.js";
import { largeTitle, backLink, groupLabel, emptyState } from "../../../screens/common.js";
import { liveScreen } from "./live.js";
import { dm, d2, n0, n1, pounds, pence, table, linkRow } from "../ui.js";
import { sortedHouses, flockIn, weekOfAge, aliveAt, predictHHE, sum } from "../model/flock.js";
import { flockMoney, depopDecision } from "../model/eggs.js";
import { REFERENCE_PRICE } from "../model/content.js";
import { PRICE_PROFILE_ID } from "../data.js";

export default async function money(ctx) {
  const tab = ctx.tabId === "money";
  return liveScreen(ctx, { title: "Money", depth: tab ? 0 : 1, tab: tab ? null : "more", paint: (snap) => html`<div>${tab ? "" : backLink(`#/l/${snap.lid}/more`, "More")}${largeTitle(tab ? "Money" : "Money per dozen", tab ? "Egg statements, feed and flock costs" : "Feed cost per dozen · margin over feed")}${moneyBody(snap)}</div>` });
}

export function moneyBody(snap) {
  if (!canRead(snap.role, "finance")) return html`<p class="ly-note">Money is kept by the owner, manager or accountant.</p>`;
  const fin = snap.data.finance.filter((r) => r.id !== PRICE_PROFILE_ID && r.kind !== "prices");
  const ops = canRead(snap.role, "days");
  const parts = [];
  if (ops) parts.push(flockSection(snap, fin));
  parts.push(statementsSection(snap, fin));
  parts.push(costsSection(snap, fin));
  const add = canWrite(snap.role, "finance") ? html`<div class="ly-acts"><button type="button" class="btn secondary" data-flow="money">${raw(icon("plus"))}Add money in or out</button>${ops ? html`<a class="btn secondary" href="#/l/${snap.lid}/layers-settings/prices">Egg prices</a>` : ""}</div>` : "";
  if (!fin.length) return html`<div>${emptyState({ sector: "layers", title: "No money recorded yet", body: "Packer statements with prices, feed bills and pullet invoices appear here — and the cost per dozen works itself out.", action: canWrite(snap.role, "packerStatements") ? "Add a statement" : null, actAttr: 'data-flow="statement"' })}${add}</div>`;
  return html`<div>${parts}${add}</div>`;
}

function flockSection(snap, fin) {
  const c = snap.c; const live = sortedHouses(c).map((h) => ({ h, f: flockIn(c, h.id) })).filter((x) => x.f);
  if (!live.length) return "";
  const ref = snap.s.refPrice ?? REFERENCE_PRICE.pPerDozen; const fpt = snap.s.feedPerTonne;
  return html`${live.map(({ h, f }) => {
    const m = flockMoney(c, f, fin); const wk = weekOfAge(f, snap.today); const depWk = f.plannedDepop ? weekOfAge(f, f.plannedDepop) : 76;
    const ppd = m.avgPpd || ref; const feedG = 118; const birds = aliveAt(c, f, snap.today, { end: true });
    const ratio = predictHHE(c, f, depWk).ratio / 100;
    const dd = fpt && ppd && depWk > wk ? depopDecision(c, f, { ppd, feedPerTonne: fpt, feedG, ratio, fromWk: depWk, birds: Math.round(birds * 0.97), weeksList: [4, 8] }) : null;
    return html`<div class="section">${groupLabel(`${h.name} · week ${wk}`, `${n0(f.placed)} placed`)}
      <div class="ly-tiles"><div class="num-tile"><span class="label">Feed per dozen</span><span class="value">${m.feedPerDozen == null ? "—" : pence(m.feedPerDozen)}</span><span class="delta">${m.kgPerDozen ? `${n1(m.kgPerDozen, 2)} kg feed` : "no feed bills"}</span></div>
        <div class="num-tile"><span class="label">Egg price</span><span class="value">${m.avgPpd == null ? "—" : pence(m.avgPpd)}</span><span class="delta">a dozen · ref ${ref}p</span></div>
        <div class="num-tile"><span class="label">FCR</span><span class="value">${m.fcr == null ? "—" : n1(m.fcr, 2)}</span><span class="delta">kg feed / kg egg${m.eggWtAssumed ? " (62 g egg assumed)" : ""}</span></div></div>
      <div class="card" style="padding:0;margin-top:8px">
        <div class="ly-stat"><span class="k">Margin over feed<small>per bird per week, so far</small></span><span class="v ${m.marginPerBirdWeek < 0 ? "late" : ""}">${m.marginPerBirdWeek == null ? "—" : pounds(m.marginPerBirdWeek, 2)}</span></div>
        <div class="ly-stat"><span class="k">Flock margin per bird housed<small>eggs ${pounds(m.eggsIncome)} + spent hens ${pounds(m.spent)} − pullets ${pounds(m.pullets)} − feed ${pounds(m.feedCost)} − energy ${pounds(m.energy)}${m.other ? ` − other ${pounds(m.other)}` : ""}</small></span><span class="v ${m.marginPerBirdHoused < 0 ? "due" : "ok"}">${pounds(m.marginPerBirdHoused, 2)}</span></div></div>
      ${dd ? html`<div class="ly-banner" style="margin-top:8px">${raw(icon("chart"))}<span>Keeping ${h.name} four more weeks past week ${depWk}: about ${dd[0].margin >= 0 ? "+" : "−"}${pounds(Math.abs(dd[0].margin))} margin over feed; eight weeks: ${dd[1].margin >= 0 ? "+" : "−"}${pounds(Math.abs(dd[1].margin))} (estimate, at ${n1(ppd)}p a dozen and £${fpt}/t feed).</span></div>` : !fpt ? html`<p class="ly-cap">Add your feed price per tonne in Egg prices to see the keep-or-depop estimate.</p>` : ""}</div>`;
  })}${live.length > 1 ? html`<p class="ly-cap">A packer statement or bill for the whole unit is shared between houses — egg income by each flock's eggs that week, other costs by its birds.</p>` : ""}`;
}

function statementsSection(snap, fin) {
  const st = fin.filter((r) => r.kind === "revenue" && ["packerStatement", "farmGate", "eggs"].includes(r.source)).sort((a, b) => b.date.localeCompare(a.date));
  if (!st.length) return "";
  const last8 = st.slice(0, 8); const eggs = sum(last8, (r) => r.eggs || 0); const amt = sum(last8, (r) => r.amount);
  return html`<div class="section">${groupLabel("Egg income", `${last8.length} latest`)}
    <div class="card" style="padding:0"><div class="ly-stat"><span class="k">Average price<small>${n0(eggs)} eggs · ${pounds(amt)}</small></span><span class="v">${eggs ? pence((amt / (eggs / 12)) * 100) : "—"}</span></div></div>
    <div style="margin-top:8px">${table([["Week ending"], ["Eggs", "n"], ["p/doz", "n"], ["Paid £", "n"]], st.slice(0, 12).map((r) => [d2(r.date), r.eggs ? n0(r.eggs) : "—", r.avgPpd ? n1(r.avgPpd) : "—", n0(r.amount)]))}</div></div>`;
}

function costsSection(snap, fin) {
  const since = addDays(snap.today, -90);
  const costs = fin.filter((r) => r.kind === "expense" && r.date >= since);
  const by = {}; for (const r of costs) { const k = { feed: "Feed", pullets: "Pullets", energy: "Energy" }[r.source] || r.category || "Other"; by[k] = (by[k] || 0) + (+r.amount || 0); }
  const spent = fin.filter((r) => r.source === "spentHens").sort((a, b) => b.date.localeCompare(a.date));
  if (!costs.length && !spent.length) return "";
  return html`<div class="section">${groupLabel("Costs, last 90 days")}${table([["What"], ["£", "n"]], Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, n0(v)]))}
    ${spent.length ? html`<p class="ly-cap">Spent hens: ${spent.slice(0, 3).map((r) => `${dm(r.date)} ${pounds(r.amount)}`).join(" · ")}</p>` : ""}
    <div class="list" style="margin-top:8px">${linkRow("#/farm/money", "All farm money", "Overview → Money", "", "money")}</div></div>`;
}
