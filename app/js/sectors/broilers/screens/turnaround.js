// Turnaround between crops (design/15 §10): days empty against the plan, each cleaning step with
// date and who (Litter out is the manure export record), hygiene swabs when the integrator wants
// them or after a Salmonella positive, the ≥ 5 day Red Tractor rule and the next placement.
import { viewPills } from "../../../ui/view-pills.js";
import { html, raw } from "../../../core/html.js";
import { icon } from "../../../ui/icons.js";
import { canWrite } from "../../../core/policy.js";
import { largeTitle, groupLabel, backLink } from "../../../screens/common.js";
import { liveScreen, flowArg } from "./live.js";
import { pill, dm, n0, warnCard, lawNote, note } from "../ui.js";
import { openTurnaround, listOf, currentCrop } from "../model/crop.js";
import { turnaroundDays, salmPositive, MIN_TURNAROUND } from "../model/paper.js";
import { TURNAROUND_STEPS } from "../model/content.js";

export default async function turnaround(ctx) {
  const houseId = ctx.match?.groups?.houseId;
  return liveScreen(ctx, { title: "Turnaround", tab: "crop", paint: (snap) => (houseId ? one(snap, houseId) : all(snap)) });
}

function all(snap) {
  const { ix, today, lid } = snap; const L = (h) => `#/l/${lid}/${h}`;
  const open = ix.houses.map((h) => ({ h, ta: openTurnaround(ix, h.id) })).filter((x) => x.ta);
  if (open.length === 1) return one(snap, open[0].h.id, true);
  const past = (snap.data.turnarounds || []).filter((t) => t.closedAt).sort((a, b) => String(b.clearedDate).localeCompare(String(a.clearedDate))).slice(0, 8);
  return html`<div>${largeTitle("Turnaround", "Clear-out to the next chicks")}${viewPills(snap.lid, [["crop", "This crop"], ["brooding", "Brooding set-up"], ["turnaround", "Turnaround"]], "turnaround", "Crop views")}
    ${open.length ? html`<div class="list">${open.map(({ h, ta }) => { const d = turnaroundDays(ta, today); const done = (ta.steps || []).filter((x) => x.at && x.key !== "placed").length; return html`<a class="row" href="${L(`turnaround/${h.id}`)}"><span class="tile">${raw(icon("house"))}</span><span class="main"><span class="primary">${h.name} · day ${d.days} empty</span><span class="secondary">cleared ${dm(ta.clearedDate)} · ${done} steps done${ta.nextPlacement ? ` · chicks ${dm(ta.nextPlacement)}` : ""}</span></span>${d.short ? pill("due", `${d.planned} days`) : ""}<span class="chev">${raw(icon("chevron"))}</span></a>`; })}</div>`
      : html`<p class="br-quiet">No turnaround running. It starts when you clear a house.</p>`}
    ${past.length ? html`<div class="section">${groupLabel("Recent turnarounds")}<div class="list">${past.map((t) => { const d = turnaroundDays(t, today); return html`<div class="row no-lead br-kv"><span class="main"><span class="primary">${ix.houseById.get(t.houseId)?.name || ""} · cleared ${dm(t.clearedDate)}</span><span class="secondary">chicks ${dm(t.placedDate)}${t.litterOut?.t ? ` · ${t.litterOut.t} t litter to ${t.litterOut.dest || "—"}` : ""}</span></span><span class="v ${d.days < MIN_TURNAROUND ? "due" : ""}">${d.days} days</span></div>`; })}</div></div>` : ""}
    ${lawNote(`Red Tractor needs at least ${MIN_TURNAROUND} days between flocks for cleaning and disinfection.`)}</div>`;
}

function one(snap, houseId, fromAll = false) {
  const { ix, today, lid } = snap; const L = (h) => `#/l/${lid}/${h}`;
  const house = ix.houseById.get(houseId); const back = backLink(L(fromAll ? "turnaround" : "crop"), fromAll ? "Turnaround" : "Crop");
  if (!house) return html`<div>${back}${largeTitle("House not found")}</div>`;
  const ta = openTurnaround(ix, houseId);
  const crop = currentCrop(ix, houseId);
  if (!ta) return html`<div>${back}${largeTitle(`Turnaround · ${house.name}`)}<p class="br-quiet">${crop ? `${house.name} has crop ${crop.no || ""} in it. ` : ""}No turnaround running. It starts when you clear a house.</p></div>`;
  const d = turnaroundDays(ta, today); const can = canWrite(snap.role, "turnarounds");
  const lastCrop = ix.cropById.get(ta.cropId);
  const positive = lastCrop && listOf(ix.salm, lastCrop.id).some(salmPositive);
  const swabs = ta.swabsRequired || positive;
  const steps = TURNAROUND_STEPS.filter(([k]) => k !== "placed" && (k !== "swabs" || swabs));
  const by = new Map((ta.steps || []).filter((x) => x.at).map((x) => [x.key, x]));
  const doneN = steps.filter(([k]) => by.has(k)).length; const ready = doneN === steps.length;
  const pct = d.planned ? Math.min(100, (d.days / d.planned) * 100) : Math.min(100, (doneN / steps.length) * 100);
  const detail = (k, st) => k === "litterOut" && ta.litterOut ? [ta.litterOut.t ? `${ta.litterOut.t} t` : "", ta.litterOut.haulier, ta.litterOut.dest ? `to ${ta.litterOut.dest}` : "", ta.litterOut.docket ? `docket ${ta.litterOut.docket}` : ""].filter(Boolean).join(" · ")
    : [st.who, st.product, st.dilution, st.result ? { pass: "pass", fail: "FAIL", pending: "waiting for result" }[st.result] : "", st.litterType, st.tonnes ? `${st.tonnes} t` : "", st.note].filter(Boolean).join(" · ");
  return html`<div>${back}
    ${largeTitle(`Turnaround · ${house.name}`, `Cleared ${dm(ta.clearedDate)}${ta.nextPlacement ? ` · next chicks ${dm(ta.nextPlacement)}` : ""}`)}
    <div class="card pad br-ta"><div class="br-day"><b>Day ${d.days}</b><span>empty${d.planned != null ? ` of ${d.planned} planned` : ""}</span></div>
      <div class="br-prog" role="progressbar" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>
      <p class="br-hc-sub">${doneN} of ${steps.length} steps done${ready ? " · ready for chicks" : ""}</p></div>
    ${d.short ? warnCard(`Only ${d.planned} days between flocks planned. Red Tractor needs at least ${MIN_TURNAROUND} days between flocks for cleaning.`, "due") : ""}
    ${positive ? warnCard("Salmonella positive on the last crop: cleaning and disinfection must be checked before restocking — the hygiene swab step is required.", "late") : ""}
    <div class="section">${groupLabel("Steps")}<div class="list br-ta-steps">${steps.map(([k, l]) => { const st = by.get(k); const inner = html`<span class="tile ${st ? (st.result === "fail" ? "late" : "ok") : ""}">${raw(icon(st ? "check" : "clock"))}</span><span class="main"><span class="primary">${l}</span><span class="secondary">${st ? `${dm(st.at)}${st.by ? ` · ${st.by}` : ""}` : k === "preheat" ? "24–48 hours before the chicks" : "not done yet"}</span>${st && detail(k, st) ? html`<span class="secondary">${detail(k, st)}</span>` : ""}</span>`;
      return can ? html`<button type="button" class="row" data-flow="step" data-arg="${flowArg({ houseId, key: k })}">${inner}<span class="chev">${raw(icon("chevron"))}</span></button>` : html`<div class="row">${inner}</div>`; })}</div>
      ${can && !positive ? html`<button type="button" class="text-btn br-mt" data-flow="swabsToggle" data-arg="${flowArg({ houseId })}">${ta.swabsRequired ? "Hygiene swabs not needed this time" : "My integrator wants hygiene swabs"}</button>` : ""}</div>
    ${can ? html`<div class="br-acts br-acts2"><button type="button" class="btn secondary" data-flow="placement" data-arg="${flowArg({ houseId })}">${raw(icon("clock"))}${ta.nextPlacement ? "Change next chicks" : "Plan next chicks"}</button>${canWrite(snap.role, "crops") ? html`<button type="button" class="btn${ready ? "" : " secondary"}" data-flow="startCrop" data-arg="${flowArg({ houseId })}">${raw(icon("birth"))}Chicks placed</button>` : ""}</div>` : ""}
    ${note("Litter out is your manure export record — it feeds the farm's nitrogen and phosphorus balance and the litter export return due 31 January.")}
    ${lastCrop ? html`<a class="btn secondary br-mt" href="${L(`crop-result/${lastCrop.id}`)}">Crop ${lastCrop.no || ""} results</a>` : ""}
    ${lawNote(`Red Tractor needs at least ${MIN_TURNAROUND} days between flocks. ${n0(house.usableM2)} m² usable.`)}</div>`;
}
