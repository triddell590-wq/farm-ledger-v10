// Density projector and thinning planner (design/15 §6.2, the signature tool). kg/m² by day with
// the legal tier lines (33 notify · 38 Red Tractor · 39 approval · 42 legal max); pick a thin day
// and it says how many birds to take to stay under the farm limit at clear-out. "Plan thin" makes
// the thin event (feed-off and FCI jobs follow). Below: what the law needs for this crop's
// planned density — DAERA notice date, the para 13 documents, approval and the 7-crop record.
import { html, raw } from "../../../core/html.js";
import { icon } from "../../../ui/icons.js";
import { toast } from "../../../ui/toast.js";
import { canWrite } from "../../../core/policy.js";
import { largeTitle, groupLabel, backLink, emptyState } from "../../../screens/common.js";
import { liveScreen, flowArg } from "./live.js";
import { densityChart, n0, n1, pc, dm, lawNote, kvRows } from "../ui.js";
import { cropDay, cropEvents, clearDayOf } from "../model/crop.js";
import { thinPlan, plannedMax, densityNeeds, farmLimit, crossDay } from "../model/density.js";
import { regionRule, DENSITY_TIERS } from "../model/content.js";
import { updateCrop } from "../actions.js";
import { pickCrop, houseChips } from "./growth.js";

const thinPick = new Map(); // crop id -> chosen thin day
const DOCS = [["housePlan", "House plan with usable area"], ["ventPlan", "Ventilation and heating plan"], ["alarm", "Alarm and back-up ventilation details"], ["envLimits", "Environment limits: NH₃ ≤ 20 ppm, CO₂ ≤ 3,000 ppm, RH ≤ 70% rule"]];

export default async function density(ctx) {
  const cropId = ctx.match?.groups?.cropId;
  return liveScreen(ctx, { title: "Density planner", tab: "growth", paint: (snap) => paint(snap, cropId),
    after: (node, snap, repaint) => {
      node.querySelectorAll("[data-thin]").forEach((b) => (b.onclick = () => { thinPick.set(b.dataset.crop, +b.dataset.thin); repaint(); node.querySelector("[data-tothin]")?.classList.add("flash"); }));
      node.querySelectorAll("[data-doc]").forEach((b) => (b.onclick = () => { const crop = snap.ix.cropById.get(b.dataset.crop); const on = b.getAttribute("aria-checked") !== "true"; updateCrop(snap, crop, { densityDocs: { ...(crop.densityDocs || {}), [b.dataset.doc]: on ? snap.today : null } }); toast(on ? "Ticked" : "Unticked"); }));
    } });
}

function paint(snap, cropId) {
  const { ix, s, today, lid } = snap; const L = (h) => `#/l/${lid}/${h}`;
  const { crop, current } = pickCrop(snap, cropId);
  const back = backLink(L("growth"), "Growth");
  if (!crop || crop.clearedDate) return html`<div>${back}${largeTitle("Density planner")}${emptyState({ sector: "broilers", title: "No crop growing", body: "The planner projects kg/m² from placement to clear-out for a crop in the house." })}</div>`;
  const house = ix.houseById.get(crop.houseId) || {}; const area = +house.usableM2 || 0;
  if (!area) return html`<div>${back}${largeTitle("Density planner", house.name)}${emptyState({ sector: "broilers", title: "Add the usable floor area", body: "The legal limits are kg of live bird per m² of usable floor.", action: "Houses", href: L("houses") })}</div>`;
  const day = cropDay(crop, today); const clearDay = clearDayOf(ix, crop, s); const lim = farmLimit(s, crop);
  const planned = cropEvents(ix, crop, s).find((e) => e.kind === "thin" && !e.done);
  const base = planned?.day ?? s.plannedThinDay;
  const choices = [...new Set([base - 2, base - 1, base, base + 1].filter((d) => d > Math.max(day, 7) && d < clearDay))];
  const tday = thinPick.get(crop.id) ?? (choices.includes(base) ? base : choices[choices.length - 1]);
  const plan = tday != null ? thinPlan(ix, crop, s, area, today, tday) : null;
  const cross = crossDay(ix, crop, s, area, today, lim);
  const mx = Math.max(plannedMax(ix, crop, s, area, today), +crop.targetDensity || 0); const n = densityNeeds(ix, crop, s, mx); const R = regionRule("broilerDensity");
  const canPlan = canWrite(snap.role, "thins");
  return html`<div>${back}
    ${largeTitle("Density", `${house.name} · ${n0(area)} m² usable · day ${day} of ${clearDay}`)}
    ${houseChips(snap, crop, current, "density")}
    <div class="section"><div class="card br-chartcard">${densityChart({ points: plan ? plan.proj : [], limit: lim, thinDay: tday, maxDay: Math.max(42, clearDay + 2), aria: "Projected stocking density with legal tiers" })}
      <p class="br-cap">kg/m² by day of crop. Lines: ${DENSITY_TIERS.map((t) => t.label).join(" · ")}. Your farm limit is ${lim} kg/m².</p></div></div>
    ${choices.length ? html`<div class="section">${groupLabel("Thin on day")}<div class="chips br-thinpick">${choices.map((d) => html`<button type="button" class="chip" role="radio" aria-checked="${d === tday}" data-thin="${d}" data-crop="${crop.id}"><span class="chk">${raw(icon("check"))}</span>Day ${d}</button>`)}</div>
      ${kvRows([[`Without a thin, crosses ${lim} kg/m²`, cross != null ? `day ${cross}` : "never", cross != null ? "due" : "ok"], [`Birds to take on day ${tday}`, html`<span data-tothin>${n0(plan.toThin)}</span>`], ["Density at clear-out", `${n1(plan.atClear)} kg/m²`, plan.atClear > lim ? "late" : ""], plan.overBeforeThin ? [`Before the thin it reaches`, `${n1(plan.maxBeforeThin)} kg/m²`, "due", null, "thin earlier to stay under the limit"] : null])}
      <p class="br-cap" style="padding:8px 4px 0">Birds to take = birds at clear-out − ${lim} × ${n0(area)} m² ÷ projected weight, rounded up to ${n0(s.moduleSize)} (your catch module). Thinning earlier gives the birds left more room sooner. Projection is an estimate from your sample weighs and the last 3 days' deaths.</p>
      ${canPlan ? html`<button type="button" class="btn br-mt" data-flow="planThin" data-arg="${flowArg({ cropId: crop.id, day: tday, birds: plan.toThin })}">Plan thin · day ${tday} · ${n0(plan.toThin)} birds</button>` : ""}
      ${planned?.rec ? html`<p class="br-cap" style="padding:8px 4px 0">Planned: ${dm(planned.date)} · ${n0(planned.birds)} birds. <a href="${L(`thin/${crop.id}/${planned.rec.id}`)}">Open the thin</a></p>` : ""}</div>` : ""}
    <div class="section">${groupLabel("What the law needs", `planned ${n1(mx)} kg/m²`)}
      ${kvRows([
        ["Tier", { none: `${R.notifyAbove} or under — no notice needed`, notify: `Above ${R.notifyAbove} — tell DAERA`, approval: `Above ${R.approvalAbove} — DAERA approval`, over: `Above ${R.legalMax} — not allowed` }[n.tier], n.tier === "over" ? "late" : n.tier === "none" ? "ok" : ""],
        n.tier !== "none" ? ["Tell DAERA by", dm(n.notifyBy), n.notifyOk ? "ok" : "late", null, `${R.notifyWorkingDays} working days before placement (NI bank holidays don't count)`] : null,
        n.tier !== "none" ? ["Told DAERA", crop.notifiedDaera ? dm(crop.notifiedDaera) : "not recorded", crop.notifiedDaera ? (n.notifyOk ? "ok" : "late") : "late"] : null,
        n.needsApproval ? ["Approval reference", crop.approvalRef || "missing", crop.approvalRef ? "ok" : "late"] : null,
      ])}
      ${n.tier !== "none" && canWrite(snap.role, "crops") ? html`<button type="button" class="btn secondary br-mt" data-flow="notice" data-arg="${flowArg({ cropId: crop.id })}">Add the notice date${n.needsApproval ? " or approval" : ""}</button>` : ""}
      ${n.tier !== "none" ? html`<div class="list br-mt">${DOCS.map(([k, l]) => html`<div class="row no-lead"><button type="button" class="checkbox" role="checkbox" aria-checked="${!!crop.densityDocs?.[k]}" aria-label="${l}" data-doc="${k}" data-crop="${crop.id}" ${raw(canWrite(snap.role, "crops") ? "" : "disabled")} style="flex:none;margin-right:12px">${raw(icon("check"))}</button><span class="main"><span class="primary">${l}</span>${crop.densityDocs?.[k] ? html`<span class="secondary">ticked ${dm(crop.densityDocs[k])}</span>` : ""}</span></div>`)}</div>${lawNote("Above 33 kg/m² the keeper must keep these documents (Sch. 5 para 13) and record ammonia, CO₂, temperature and humidity on every check.")}` : ""}
      ${n.needsApproval ? sevenCrops(n) : ""}</div>
  </div>`;
}

function sevenCrops(n) {
  const r = n.sevenCrops;
  return html`<div class="section">${groupLabel("Last 7 crops in this house", r.ok ? "all under the line" : `${r.count} of 7`)}
    ${r.rows.length ? html`<div class="list">${r.rows.map((x) => html`<div class="row no-lead br-kv"><span class="main"><span class="primary">Crop ${x.crop.no || ""} · ${x.age} days</span><span class="secondary">legal line ${pc(x.line, 2)}</span></span><span class="v ${x.ok ? "ok" : "late"}">${pc(x.cum, 2)}</span></div>`)}</div>` : ""}
    ${lawNote("Above 39 kg/m² every one of the last 7 crops must have finished under 1% + 0.06% × age at slaughter (Sch. 5 para 14).")}</div>`;
}
