// Contract and payment (design/15 §9.2, §9.3, §18). The processor, notice period and FCI address
// for everyone who runs the houses; for the money roles (owner, manager, accountant) also the
// farmer's own pay formula, settlements against the estimate, income per m² per year and heat
// cost per bird per crop. Accountants get this as their Money tab. No processor's real formula
// is shipped — the profile is the farmer's own.
import { html, raw } from "../../../core/html.js";
import { icon } from "../../../ui/icons.js";
import { canWrite, canRead } from "../../../core/policy.js";
import { largeTitle, groupLabel, backLink } from "../../../screens/common.js";
import { liveScreen, flowArg } from "./live.js";
import { kvRows, n0, n1, pounds, dm, d2, note, lawNote, pill } from "../ui.js";
import { contractDoc } from "../actions.js";
import { incomePerM2, cropResults, energyUse, energyCost } from "../model/results.js";
import { addDays } from "../model/time.js";

export default async function contract(ctx) {
  const isTab = ctx.tabId === "money";
  return liveScreen(ctx, { title: isTab ? "Money" : "Contract", tab: isTab ? "money" : "more", depth: isTab ? 0 : 1, paint: (snap) => paint(snap, isTab) });
}

const BASIS = { bird: "per bird", kg: "per kg", m2: "per m²" };
function noticeEnd(s) { if (!s.contractStart || !s.noticeMonths) return null; const d = new Date(); d.setMonth(d.getMonth() + +s.noticeMonths); return d.toISOString().slice(0, 10); }

function paint(snap, isTab) {
  const { ix, s, today, lid } = snap; const L = (h) => `#/l/${lid}/${h}`;
  const money = snap.money; const ops = canRead(snap.role, "crops");
  const doc = money ? contractDoc(snap) : null; const prof = doc?.profile; const prices = doc?.energyPrices || {};
  const settles = (snap.finance || []).filter((f) => f.source === "settlement" && !f.deleted).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const area = ix.houses.reduce((t, h) => t + (+h.usableM2 || 0), 0);
  const perM2 = area ? incomePerM2(settles, area, today) : null;
  const yearSum = settles.filter((x) => x.date > addDays(today, -365)).reduce((t, x) => t + (+x.amount || 0), 0);
  const ne = noticeEnd(s);
  const editFlow = money && canWrite(snap.role, "finance") && ops ? "contract" : canWrite(snap.role, "houses") && ops ? "processor" : null;
  const waiting = ops && money ? ix.crops.filter((c) => c.clearedDate && !settles.some((f) => f.cropId === c.id)).slice(-4) : [];
  const energy = ops && money ? ix.crops.filter((c) => c.clearedDate).slice(-6).map((c) => { const r = cropResults(ix, c); const cost = energyCost(energyUse(ix.energy.get(c.id), s), prices, r.sold || +c.placed, r.kg); return { c, cost }; }).filter((x) => x.cost) : [];
  return html`<div>${isTab ? "" : backLink(L("more"), "More")}
    ${largeTitle(isTab ? "Money" : money ? "Contract and payment" : "Processor", ops ? [s.processor || "Add your processor", s.processorPlant].filter(Boolean).join(" · ") : "Crop payments and energy")}
    ${ops ? html`<div class="section">${groupLabel("Contract")}${kvRows([
      ["Processor", s.processor || "—"], s.processorPlant ? ["Plant", s.processorPlant] : null,
      ["Started", s.contractStart ? d2(s.contractStart) + " " + s.contractStart.slice(0, 4) : "—"],
      ["Notice period", s.noticeMonths ? `${s.noticeMonths} months` : "—", "", null, ne ? `notice given today would end ${dm(ne)} ${ne.slice(0, 4)}` : ""],
      ["FCI email", s.fciEmail || "—", s.fciEmail ? "" : "due"], ["Catch module", `${n0(s.moduleSize)} birds`]])}</div>` : ""}
    ${money ? html`<div class="section">${groupLabel("How you're paid", "money roles only")}${prof && prof.rate != null ? kvRows([["Base rate", `${pounds(prof.rate, 3)} ${BASIS[prof.basis] || ""}`], ...(prof.bonusRows || []).map((b) => [b.label, `${b.amount < 0 ? "−" : "+"}${pounds(Math.abs(b.amount), 3)} per ${b.per}`, b.amount < 0 ? "due" : "ok"])]) : html`<p class="br-quiet">Add your pay basis and bonus rows to see an estimate for every crop.</p>`}
      ${lawNote("Your own copy of how you're paid. Farm Ledger doesn't ship any processor's formula.")}</div>` : ""}
    ${money ? html`<div class="section">${groupLabel("Settlements", settles.length ? `${pounds(yearSum)} in 12 months` : "")}${settles.length ? html`<div class="list">${settles.slice(0, 12).map((f) => html`<div class="row no-lead br-kv"><span class="main"><span class="primary">${String(f.note || "Crop payment").replace(/\s*·\s*£[\d,.]+$/, "")}</span><span class="secondary">${d2(f.date)}${f.settlement?.estimate != null ? ` · estimate ${pounds(f.settlement.estimate)}` : ""}${f.settlement?.ref ? ` · ref ${f.settlement.ref}` : ""}</span></span><span class="v">${pounds(f.amount)}${f.settlement?.flag ? html`<small class="due">${f.settlement.diff >= 0 ? "+" : "−"}${pounds(Math.abs(f.settlement.diff))}</small>` : ""}</span></div>`)}</div>` : html`<p class="br-quiet">No settlements yet. Record one when the statement comes after clear-out.</p>`}
      ${waiting.length && canWrite(snap.role, "finance") ? html`<div class="list br-mt">${waiting.map((c) => html`<button type="button" class="row" data-flow="settlement" data-arg="${flowArg({ cropId: c.id })}"><span class="tile">${raw(icon("money"))}</span><span class="main"><span class="primary">Record the settlement · crop ${c.no || ""} ${ix.houseById.get(c.houseId)?.name || ""}</span><span class="secondary">cleared ${dm(c.clearedDate)}</span></span>${pill("due", "Waiting", "")}</button>`)}</div>` : ""}
      ${kvRows([["Income per m² per year", perM2 != null && settles.length ? pounds(perM2, 2) : "—", "", null, area ? `crop payments in the last 12 months ÷ ${n0(area)} m² usable — compare contracts` : "crop payments ÷ usable area"]])}</div>` : ""}
    ${money ? html`<div class="section">${groupLabel("Energy prices")}${Object.keys(prices).length ? kvRows([["LPG", prices.lpg != null ? `${pounds(prices.lpg, 3)}/L` : "—"], ["Oil", prices.oil != null ? `${pounds(prices.oil, 3)}/L` : "—"], ["Biomass", prices.biomass != null ? `${pounds(prices.biomass, 3)}/kg` : "—"], ["Heat meter", prices.heat != null ? `${pounds(prices.heat, 3)}/kWh` : "—"], ["Electricity", prices.elec != null ? `${pounds(prices.elec, 3)}/kWh` : "—"]]) : html`<p class="br-quiet">Add unit prices to turn meter readings into £ per bird.</p>`}
      ${energy.length ? html`<div class="list br-mt">${energy.map(({ c, cost }) => html`<a class="row no-lead br-kv" href="${L(`crop-result/${c.id}`)}"><span class="main"><span class="primary">Crop ${c.no || ""} · ${ix.houseById.get(c.houseId)?.name || ""}</span><span class="secondary">${d2(c.placedDate)} · ${cost.perKgPence != null ? `${n1(cost.perKgPence)}p per kg` : ""}</span></span><span class="v">${n1((cost.perBird || 0) * 100)}p/bird</span></a>`)}</div>` : ""}</div>` : ""}
    ${editFlow ? html`<button type="button" class="btn br-mt" data-flow="${editFlow}">${raw(icon("edit"))}${editFlow === "contract" ? "Edit contract and payment" : "Edit processor details"}</button>` : ""}
    ${snap.role === "accountant" ? note("Crop numbers (birds, kg, FCR) come from the farm team's records; you see the payments and prices.") : ""}
    ${!money ? note("Contract payments and energy prices are only shown to the owner, managers and the accountant.") : ""}</div>`;
}
