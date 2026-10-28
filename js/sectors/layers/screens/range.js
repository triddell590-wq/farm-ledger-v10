// More → Range and housing log (design/14 §8.1, §8.2): the AI / housing-order state (content),
// days housed, per free-range house the pop-hole log from the daily sheet (proof of range access),
// dusk time, birds per hectare against 2,500 and the range-distance check; housing periods with
// their reason; and (#/l/<id>/range/biosecurity) the daily biosecurity checklist while an order
// or AIPZ is in force.
import { html, raw } from "../../../core/html.js";
import { icon } from "../../../ui/icons.js";
import { canWrite } from "../../../core/policy.js";
import { addDays, daysBetween } from "../../../core/dates.js";
import { largeTitle, backLink, groupLabel } from "../../../screens/common.js";
import { liveScreen, flowArg } from "./live.js";
import { dm, d2, n0, pill, kvRows, okCard, table, linkRow } from "../ui.js";
import { sortedHouses, flockIn, aliveAt, daysFor } from "../model/flock.js";
import { aiState, isFreeRange, sunset, spaceCheck } from "../model/house.js";
import { AI_CHECKS, freeRangeText, SPACE } from "../model/content.js";
import { endHousing } from "../actions.js";

export default async function range(ctx) {
  const bio = ctx.match?.groups?.sub === "biosecurity";
  return liveScreen(ctx, { title: bio ? "Biosecurity" : "Range and housing", tab: "more", paint: (snap) => (bio ? biosecurity(snap) : paint(snap)), after: (node, snap) => {
    node.querySelectorAll("[data-end]").forEach((b) => (b.onclick = () => { const r = snap.data.housing.find((x) => x.id === b.dataset.end); if (r) endHousing(snap, r, snap.today); }));
  } });
}

function aiCard(snap) {
  const ai = aiState(snap.c);
  if (ai.on) return html`<div class="alert ${ai.near ? "late" : "info"}" role="status"><span class="a-icon">${raw(icon(ai.near ? "alert" : "info"))}</span><div style="flex:1;min-width:0"><div class="a-title">Housing order in force since ${d2(ai.from)}</div><div class="a-body">Day <b>${ai.daysHoused}</b> housed · ${freeRangeText(snap.c.region)}. Days housed is shown for information.</div></div></div>`;
  return html`<div class="alert info" role="status"><span class="a-icon">${raw(icon("info"))}</span><div style="flex:1;min-width:0"><div class="a-title">No housing order in Northern Ireland</div><div class="a-body">${ai.content.liftedLine} If an order comes, ${freeRangeText(snap.c.region)}.</div><div class="a-body ly-src">Checked ${d2(ai.content.checkedOn)} · ${ai.content.source}</div></div></div>`;
}

function paint(snap) {
  const L = (h) => `#/l/${snap.lid}/${h}`; const c = snap.c; const T = snap.today;
  const fr = sortedHouses(c).filter(isFreeRange);
  const dusk = sunset(T, +snap.s.lat, +snap.s.lng);
  const periods = [...snap.data.housing].sort((a, b) => b.from.localeCompare(a.from));
  const canLog = canWrite(snap.role, "housing");
  const ai = aiState(c);
  return html`<div>${backLink(L("more"), "More")}${largeTitle("Range and housing", fr.length ? `${fr.length} free-range house${fr.length > 1 ? "s" : ""} · dusk today ${dusk}` : "No free-range houses")}
    <div class="section">${aiCard(snap)}${ai.aipz ? html`<div class="list" style="margin-top:8px">${linkRow(L("range/biosecurity"), "Daily biosecurity check", (snap.data.biosecurity || []).some((b) => b.date === T) ? "Done today" : "Not done today", (snap.data.biosecurity || []).some((b) => b.date === T) ? pill("ok", "Done") : pill("due", "Due"), "shield")}</div>` : ""}</div>
    ${fr.length ? fr.map((h) => houseRange(snap, h, dusk)) : html`<div class="section">${okCard("Pop-hole times and range checks appear for free-range and organic houses (system 1 or 0).")}</div>`}
    <div class="section">${groupLabel("Housing periods", periods.length || "")}
      ${periods.length ? html`<div class="list">${periods.map((r) => { const open = !r.to || r.to >= T; const hn = r.houseId ? snap.data.houses.find((h) => h.id === r.houseId)?.name : "All houses";
        return html`<div class="row no-lead"><span class="main"><span class="primary">${r.reason || "Kept in"} · ${hn}</span><span class="secondary">${dm(r.from)} ${r.from.slice(0, 4)} – ${r.to ? `${dm(r.to)} ${r.to.slice(0, 4)}` : "still in"} · ${daysBetween(r.from, r.to && r.to < T ? r.to : T) + 1} days</span></span>${open && canLog && !r.to ? html`<button type="button" class="btn small secondary" data-end="${r.id}">Let out today</button>` : open ? pill("due", "In") : ""}</div>`; })}</div>` : okCard("No housing periods recorded.")}
      ${canLog ? html`<button type="button" class="btn secondary" style="margin-top:8px" data-flow="log" data-arg='${flowArg({ kind: "housing" })}'>${raw(icon("plus"))}Keep birds in from…</button>` : ""}</div>
    <div class="section"><div class="list">${linkRow("#/farm/map", "Range on the farm map", "Range areas, shelters, tree planting, pop-hole positions", "", "map")}${linkRow(L("logs/visitors"), "Visitors", "Poultry unit log", "", "people")}</div></div>
  </div>`;
}

function houseRange(snap, h, dusk) {
  const c = snap.c; const T = snap.today; const f = flockIn(c, h.id);
  const hens = f ? aliveAt(c, f, T) : 0; const sc = spaceCheck(h, hens);
  const rows = sc.rows.filter((r) => /^Range/.test(r.label));
  const days = f ? daysFor(c, f.id).filter((d) => d.date > addDays(T, -14)).reverse() : [];
  const today = days.find((d) => d.date === T);
  const keptIn = days.filter((d) => d.keptIn).length;
  return html`<div class="section">${groupLabel(h.name, f ? `${n0(hens)} hens` : "empty")}
    ${kvRows([
      ["Pop-holes today", today ? `${today.popOpen || "—"} – ${today.popClose || "—"}` : "No sheet yet", today?.keptIn ? "due" : "", null, today?.keptIn ? `Kept in: ${today.keptIn}` : `Close at dusk (${dusk})`],
      ["Range area", h.rangeHa ? `${h.rangeHa} ha` : "—", null, null, h.rangeHa && hens ? `${n0(hens / h.rangeHa)} birds per ha · limit ${n0(SPACE.rangeHensPerHa)}` : "Add it in Edit house"],
      ...rows.map((r) => [r.label, r.ok ? "✓" : "Over", r.ok ? "ok" : "due", null, r.text]),
    ])}
    ${days.length ? html`<p class="ly-cap" style="margin:12px 4px 6px">Last 14 days${keptIn ? ` · kept in ${keptIn} day${keptIn > 1 ? "s" : ""}` : ""}</p>${table([["Day"], ["Opened"], ["Closed"], ["Kept in"]], days.map((d) => [dm(d.date), d.popOpen || "—", d.popClose || "—", d.keptIn || ""]))}` : ""}
  </div>`;
}

function biosecurity(snap) {
  const L = (h) => `#/l/${snap.lid}/${h}`; const T = snap.today; const ai = aiState(snap.c);
  const list = [...snap.data.biosecurity].sort((a, b) => b.date.localeCompare(a.date));
  const todayDone = list.find((b) => b.date === T);
  return html`<div>${backLink(L("range"), "Range and housing")}${largeTitle("Biosecurity", ai.aipz ? "Daily while the housing order or AIPZ is in force" : "No order in force — checks are optional")}
    <div class="section">${aiCard(snap)}</div>
    <div class="section">${groupLabel("Today")}${todayDone ? html`<div class="ly-banner ok">${raw(icon("check"))}<span>Done today${todayDone.byName ? ` by ${todayDone.byName}` : ""}: ${AI_CHECKS.filter((_, i) => todayDone[`c${i}`]).length} of ${AI_CHECKS.length} checks ticked.</span></div>`
      : canWrite(snap.role, "biosecurity") ? html`<button type="button" class="btn" data-flow="log" data-arg='${flowArg({ kind: "biosecurity" })}'>${raw(icon("shield"))}Do today's biosecurity check</button>` : okCard("Not done today.")}
      <p class="ly-cap">${AI_CHECKS.join(" · ")}</p></div>
    <div class="section">${groupLabel("Log", list.length || "")}${list.length ? table([["Day"], ["Ticked", "n"], ["By"]], list.slice(0, 30).map((b) => [dm(b.date), `${AI_CHECKS.filter((_, i) => b[`c${i}`]).length}/${AI_CHECKS.length}`, b.byName || ""])) : okCard("No checks recorded yet.")}</div>
    <div class="section"><div class="list">${linkRow(L("logs/visitors"), "Visitors", "Sign every visitor in", "", "people")}${linkRow(L("reg/biosecurity"), "Print the biosecurity log", "Print or CSV", "", "print")}</div></div>
  </div>`;
}
