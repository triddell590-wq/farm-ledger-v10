// Dairy → More → Feed and silage (route "feed") and Slurry and nutrients (route "slurry"),
// design/12 §9, §14. Feed: fodder budget (dairy cow 1.5 t silage a month housed — DAERA, via
// Research A), feed deliveries with the FW.8 sample tick and concentrate per litre (money roles).
// Slurry: 22-week storage calculator (NAP) and the NAP / derogation dates (Research B).
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { toast } from "../../../ui/toast.js";
import { textField } from "../../../ui/form.js";
import { canRead, canWrite, canWriteMeta } from "../../../core/policy.js";
import { addDays } from "../../../core/dates.js";
import { num, moneyText } from "../../../ui/format.js";
import { largeTitle, backLink } from "../../../screens/common.js";
import { liveSnap } from "../data.js";
import { sectionOf, kvRows, pill } from "../ui.js";
import { entrySheet } from "../flows/common.js";
import { setMeta } from "../actions.js";
import { onFarm, groupOf } from "../model/cows.js";
import { slurryWeeks } from "../model/tools.js";
import { feedSheet } from "./money.js";

// Monthly housed silage need, tonnes fresh weight (DAERA figures via Research A; editable later).
export const SILAGE_T_MONTH = { milking: 1.5, dry: 1.2, heifer: 0.9, calf: 0.3 };
// NAP dates (Research B, NAP section). Content, not logic.
export const NAP_DATES = [
  ["31 Jan", "Manure export records to NIEA; closed periods end"],
  ["1 Mar", "Derogation farms: fertilisation plan ready and fertilisation account submitted"],
  ["30 Jun", "Last year's NAP records prepared (keep 5 years)"],
  ["15 Sep", "Chemical fertiliser closed period starts"],
  ["15 Oct", "Slurry closed period starts"],
  ["31 Oct", "Farmyard manure closed period starts"],
];

/** Fodder budget: herd by group × t/month → months the silage in stock lasts. */
export function fodderBudget(counts, stockT, rates = SILAGE_T_MONTH) {
  const perMonth = Object.entries(rates).reduce((t, [g, r]) => t + (counts[g] || 0) * r, 0);
  return { perMonth, months: perMonth ? stockT / perMonth : null };
}

export default async function feed(ctx) {
  const page = ctx.match.groups.page; const body = el(html`<div class="dairy-page"></div>`);
  const { first, stop } = liveSnap(ctx.ledger, (snap) => body.replaceChildren(page === "slurry" ? slurry(snap) : feedPage(snap)));
  await first;
  return { el: body, title: page === "slurry" ? "Slurry and nutrients" : "Feed and silage", tab: "more", destroy: stop };
}

function feedPage(snap) {
  const { lid, today } = snap; const sil = snap.meta.silage || {};
  const counts = {}; for (const a of snap.data.animals.filter(onFarm)) { const g = groupOf(snap.ix, a, today); counts[g] = (counts[g] || 0) + 1; }
  const fb = fodderBudget(counts, +sil.tonnes || 0);
  const lastsTo = fb.months != null && sil.tonnes ? addDays(sil.date || today, Math.round(fb.months * 30.4)) : null;
  const money = canRead(snap.role, "finance");
  const del = money ? snap.data.finance.filter((r) => !r.deleted && r.kind === "expense" && r.category === "Feed").sort((a, b) => b.date.localeCompare(a.date)) : [];
  const node = el(html`<div>${backLink(`#/l/${lid}/more`, "More")}${largeTitle("Feed and silage", `${num(counts.milking || 0)} milking · ${num(counts.dry || 0)} dry · ${num((counts.heifer || 0) + (counts.calf || 0))} youngstock`)}
    ${sectionOf("Silage", html`<div class="card pad">${sil.tonnes ? html`<p class="t-head" style="margin:0">${lastsTo ? `Lasts to about ${lastsTo.slice(8)}/${lastsTo.slice(5, 7)}/${lastsTo.slice(0, 4)}` : "—"}</p><p class="t-callout ink-2" style="margin:2px 0 0">${num(+sil.tonnes)} t in the pit on ${sil.date || "—"} · herd eats about ${num(fb.perMonth, 1)} t a month housed</p>` : html`<p class="t-callout" style="margin:0">Enter the tonnes in the pit to see how long it lasts.</p>`}
      <p class="formula">Housed need per month: milking cow ${SILAGE_T_MONTH.milking} t · dry cow ${SILAGE_T_MONTH.dry} t · heifer ${SILAGE_T_MONTH.heifer} t · calf ${SILAGE_T_MONTH.calf} t (DAERA guide figures). If the farm also has a Beef ledger, use the pit diagram there — one pit serves both.</p></div>
      ${canWriteMeta(snap.role, "silage") ? html`<button type="button" class="btn secondary" data-silage style="margin-top:8px">Update silage stock</button>` : ""}`)}
    ${money ? sectionOf("Feed deliveries", html`${del.length ? html`<div class="list">${del.slice(0, 30).map((r) => html`<div class="row no-lead"><span class="main"><span class="primary">${r.product || r.note || "Feed"}${r.kg ? ` · ${num(r.kg)} kg` : ""}</span><span class="secondary">${[r.date, r.supplier, r.batch].filter(Boolean).join(" · ")}</span><span style="display:block;margin-top:4px">${r.sampleKept ? pill("ok", "Sample kept") : pill("due", "No sample")}</span></span><span class="kv-v" style="flex:none">${moneyText(r.amount, true)}</span></div>`)}</div>` : html`<p class="hint">Record deliveries to keep feed records for 2 years (Red Tractor FW.6) and work out concentrate per litre.</p>`}
      ${canWrite(snap.role, "finance") ? html`<div class="act-grid"><button type="button" class="btn" data-feed>Add a delivery</button><a class="btn secondary" href="#/l/${lid}/money">MOPF and conc/L</a></div>` : ""}`, del.length || "")
      : html`<div class="section"><div class="card pad t-callout ink-2">Feed costs and margins are for the owner, managers and the accountant.</div></div>`}
    <div class="section"><div class="info-card">${raw(icon("info"))}<span>Keep a sample of each feed for 4 weeks after you finish it (Red Tractor FW.8). BCS twice a year goes in Mobility and BCS (FW.1).</span></div></div></div>`);
  const s = node.querySelector("[data-silage]"); if (s) s.onclick = () => silageSheet(snap);
  const f = node.querySelector("[data-feed]"); if (f) f.onclick = () => feedSheet(snap);
  return node;
}

function silageSheet(snap) {
  const sil = snap.meta.silage || {};
  const body = el(html`<form novalidate><div class="form-group">${textField({ name: "tonnes", label: "Tonnes in the pit", value: sil.tonnes ?? "", inputmode: "numeric" })}${textField({ name: "date", label: "Measured on", type: "date", value: snap.today })}${textField({ name: "dm", label: "Dry matter %", value: sil.dm ?? "", inputmode: "decimal", optional: true })}${textField({ name: "me", label: "ME (MJ/kg DM)", value: sil.me ?? "", inputmode: "decimal", optional: true })}</div></form>`);
  return entrySheet({ title: "Silage stock", body, label: "Save", missing: (v) => (!(+v.tonnes >= 0) || v.tonnes === "" ? "Add the tonnes" : null),
    save(v, sh) { setMeta(snap.lid, "silage", { tonnes: +v.tonnes, date: v.date, dm: v.dm === "" ? null : +v.dm, me: v.me === "" ? null : +v.me }); sh.close(true, { force: true }); toast("Silage stock saved"); } }).sheet.done;
}

function slurry(snap) {
  const { lid, today } = snap; const p = { ...snap.s.slurry };
  const counts = {}; for (const a of snap.data.animals.filter(onFarm)) { const g = groupOf(snap.ix, a, today); counts[g] = (counts[g] || 0) + 1; }
  if (p.cows == null) p.cows = (counts.milking || 0) + (counts.dry || 0);
  if (p.youngstock == null) p.youngstock = counts.heifer || 0;
  if (p.calves == null) p.calves = counts.calf || 0;
  const r = slurryWeeks(p); const can = canWriteMeta(snap.role, "settings");
  const node = el(html`<div>${backLink(`#/l/${lid}/more`, "More")}${largeTitle("Slurry and nutrients", "Nitrates Action Programme (NI)")}
    <div class="num-tile hero"><span class="label">Slurry storage</span><span class="value ${r.weeks == null ? "" : r.ok ? "ok" : "late"}">${r.weeks == null ? "—" : `${r.weeks.toFixed(1)} weeks`}</span><span class="sub">${r.weeks == null ? (r.weekly ? "Add your store capacity below." : "Add your store capacity and stock numbers below.") : r.ok ? `Meets the ${r.target}-week rule for cattle.` : `Short of ${r.target} weeks by about ${num(r.shortM3)} m³.`}</span><span class="source">NAP: 22 weeks for cattle; new above-ground stores since 2020 must be covered.</span></div>
    ${sectionOf("Calculator", html`<form novalidate data-form><div class="form-group">${textField({ name: "capacityM3", label: "Store capacity (m³)", value: p.capacityM3 || "", inputmode: "numeric" })}${textField({ name: "cows", label: "Cows (milking + dry)", value: p.cows, inputmode: "numeric" })}${textField({ name: "youngstock", label: "Youngstock housed", value: p.youngstock, inputmode: "numeric" })}${textField({ name: "calves", label: "Calves housed", value: p.calves, inputmode: "numeric" })}${textField({ name: "extraWk", label: "Washings and rain (m³ a week)", value: p.extraWk || 0, inputmode: "decimal" })}</div>
      <p class="formula">Weeks = capacity ÷ (cows × ${p.perCowWk} + youngstock × ${p.perYoungWk} + calves × ${p.perCalfWk} m³ a week + washings/rain). Output per head is a guide figure — check against the NAP tables for your stock and diet.</p>
      ${can ? html`<button type="button" class="btn" data-save style="margin-top:8px">Save</button>` : ""}</form>`)}
    ${sectionOf("Dates", html`<div class="card pad">${kvRows(NAP_DATES.map(([d, t]) => [t, d]))}<p class="formula">Derogation (up to 250 kg N/ha, 80%+ grassland) is usually driven by the dairy herd — plan and account by 1 March. Keep NAP records 5 years. Source: DAERA Nitrates Action Programme.</p></div>`)}
  </div>`);
  const b = node.querySelector("[data-save]");
  if (b) b.onclick = () => { const f = new FormData(node.querySelector("[data-form]")); const v = Object.fromEntries([...f].map(([k, x]) => [k, x === "" ? null : +x])); setMeta(lid, "settings", { slurry: { ...snap.s.slurry, ...v } }); toast("Slurry figures saved"); };
  return node;
}
