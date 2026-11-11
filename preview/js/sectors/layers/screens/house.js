// One house (#/l/<id>/house/<houseId>): the house card facts at full size, the last 14 daily
// sheets (tap a day to open or correct it), the space check, and links to the flock, red mite,
// Salmonella and notes. An empty house shows its turnaround and the next flock (design/14 §3.1).
import { html, raw } from "../../../core/html.js";
import { icon } from "../../../ui/icons.js";
import { canWrite } from "../../../core/policy.js";
import { addDays } from "../../../core/dates.js";
import { largeTitle, backLink, groupLabel } from "../../../screens/common.js";
import { liveScreen, flowArg } from "./live.js";
import { miniCurve, dm, n0, n1, pill, linkRow, kvRows, okCard, table } from "../ui.js";
import { flockIn, plannedFlock, lastFlock, series, aliveAt } from "../model/flock.js";
import { houseCard } from "../model/cards.js";
import { spaceCheck, systemName, isFreeRange } from "../model/house.js";
import { mite, salmonella } from "../model/health.js";
import { TURN_STAGES } from "../actions.js";

export default async function house(ctx) {
  const id = ctx.match.groups.id;
  return liveScreen(ctx, { title: "House", tab: "houses", paint: (snap) => paint(snap, id), after: (node, snap) => {
    node.querySelectorAll("[data-stage]").forEach((b) => (b.onclick = async () => { const { turnStage } = await import("../actions.js"); const f = snap.data.flocks.find((x) => x.id === b.dataset.fid); if (f) turnStage(snap, f, b.dataset.stage, b.getAttribute("aria-checked") !== "true"); }));
  } });
}

function paint(snap, id) {
  const L = (h) => `#/l/${snap.lid}/${h}`; const c = snap.c; const T = snap.today;
  const h = snap.data.houses.find((x) => x.id === id);
  const back = backLink(L("houses"), "Houses");
  if (!h) return html`<div>${back}${largeTitle("House not found", "It may have been removed.")}</div>`;
  const f = flockIn(c, h.id); const k = houseCard(c, h);
  const canDay = canWrite(snap.role, "days"); const canHouse = canWrite(snap.role, "houses");
  const ctxLine = [systemName(h.system), h.producerCode, h.places ? `${n0(h.places)} places` : null].filter(Boolean).join(" · ");
  const notes = (snap.data.notes || []).filter((n) => n.houseId === h.id).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 3);
  const actions = html`<div class="section ly-acts">${canHouse ? html`<button type="button" class="btn secondary" data-flow="house" data-arg='${flowArg({ id: h.id })}'>${raw(icon("edit"))}Edit house</button>` : ""}${canDay ? html`<button type="button" class="btn secondary" data-flow="note" data-arg='${flowArg({ houseId: h.id })}'>${raw(icon("message"))}Note</button>` : ""}</div>`;
  const notesBlock = notes.length ? html`<div class="section">${groupLabel("Notes")}<div class="list">${notes.map((n) => html`<div class="row no-lead"><span class="main"><span class="primary">${n.text}</span><span class="secondary">${dm(n.date)}${n.byName ? ` · ${n.byName}` : ""}</span></span></div>`)}</div></div>` : "";

  if (!f) {
    const last = lastFlock(c, h.id); const next = plannedFlock(c, h.id); const done = new Set((last?.turnaround?.stages || []).map((s) => s.stage));
    return html`<div>${back}${largeTitle(h.name, `${ctxLine} · empty`)}
      <div class="section"><div class="card pad"><p class="t-callout" style="margin:0">${k.day ? html`Day <b>${k.day}</b> of clean-out` : "No flock in this house"}${k.nextDate ? html` · next flock placed <b>${dm(k.nextDate)}</b>` : ""}</p>
        ${last ? html`<div class="ly-stages" style="margin-top:12px">${TURN_STAGES.map((s) => html`<button type="button" class="chip" role="checkbox" aria-checked="${done.has(s)}" data-stage="${s}" data-fid="${last.id}" ${raw(canWrite(snap.role, "flocks") ? "" : "disabled")}><span class="chk">${raw(icon("check", { size: 18 }))}</span>${s}</button>`)}</div>` : ""}</div></div>
      ${last ? html`<div class="section">${kvRows([["Last flock", `${dm(last.placedDate)} – ${dm(last.depopDate)}`], ["Spent hens out", n0(last.numberOut), null, null, last.destination || ""]])}</div>` : ""}
      ${next ? html`<div class="section">${groupLabel("Next flock")}<div class="list">${linkRow(L(`flock/${next.id}`), `${n0(next.placed)} pullets · ${dm(next.placedDate)}`, next.daeraNotified ? "DAERA told" : `Tell DAERA by ${dm(addDays(next.placedDate, -14))}`, next.daeraNotified ? pill("ok", "Told") : T > addDays(next.placedDate, -14) ? pill("late", "Late") : pill("due", "Due"), "plus")}</div></div>`
        : canWrite(snap.role, "flocks") ? html`<div class="section"><button type="button" class="btn" data-flow="place" data-arg='${flowArg({ houseId: h.id })}'>Place a flock</button></div>` : ""}
      ${spaceBlock(h, 0)}${notesBlock}${actions}</div>`;
  }

  const s = series(c, f).filter((d) => d.date <= T); const last14 = s.slice(-14).reverse();
  const mt = mite(c, h.id); const sal = salmonella(c, f); const hens = aliveAt(c, f, T, { end: !!k.today });
  const below = k.vs?.pos === "below";
  return html`<div>${back}${largeTitle(h.name, `${ctxLine} · ${k.std.breed} · week ${k.wk}`)}
    <div class="section"><div class="ly-hc ${k.edge}" style="margin:0">
      <div class="ly-facts" style="margin:0">${n0(hens)} hens${k.classB ? html` · <span class="w">Class B</span>` : ""}${k.withheld ? html` · <span class="w">eggs withheld to ${dm(k.withheld.until)}</span>` : ""}</div>
      <div class="ly-mid"><div><div class="ly-big">${k.lay != null ? html`${n1(k.lay)}<small>%</small>` : "—"}</div><div class="t-cap ink-2">${k.lay != null ? `lay ${k.label}` : "no sheet yet"}</div></div>
        <div>${miniCurve(k.pts, k.band)}<div class="ly-vs ${k.lay == null ? "" : below ? "due" : "ok"}">${k.band && k.band[1] ? `standard ${n0(k.band[0])}–${n0(k.band[1])}%` : ""}</div></div></div>
      ${k.done ? html`<a class="ly-done" href="${L(`sheet/${h.id}/${T}`)}">${raw(icon("check"))}Sheet done ${k.done.at}${k.done.by ? " " + k.done.by : ""}</a>` : canDay ? html`<button type="button" class="btn" data-flow="sheet" data-arg='${flowArg({ houseId: h.id })}'>Fill today's sheet</button>` : ""}</div></div>
    <div class="section">${groupLabel("Last 14 sheets", html`<a class="text-btn" href="${L(`weekly/${f.id}`)}">Weekly</a>`)}
      ${last14.length ? table([["Day"], ["Lay %", "n"], ["Dead", "n"], ["Water", "n"], ["°C", "n"]], last14.map((d) => [html`<a href="${L(`sheet/${h.id}/${d.date}`)}">${dm(d.date)}</a>`, d.henDay == null ? "—" : html`<span class="${d.vs?.pos === "below" ? "ly-ink-due" : ""}">${n1(d.henDay)}</span>`, n0((+d.dead || 0) + (+d.culled || 0)), d.waterPer1000 == null ? "—" : html`<span class="${d.waterChange != null && Math.abs(d.waterChange) >= +snap.s.waterAlertPct ? "ly-ink-due" : ""}">${n0(d.waterPer1000)}</span>`, d.tMax == null ? "—" : `${d.tMin ?? "—"}–${d.tMax}`]))
        : okCard("No sheets yet for this flock.")}
      <p class="ly-cap">Water is litres per 1,000 birds. Tap a day to open or correct its sheet.</p></div>
    <div class="section"><div class="list">
      ${linkRow(L(`flock/${f.id}`), "Flock and breed curve", `${k.std.breed} · placed ${dm(f.placedDate)} · ${n0(f.placed)}`, "", "chart")}
      ${linkRow(L(`mite/${h.id}`), "Red mite", mt.last ? `Average ${n1(mt.avg)} · ${dm(mt.last.date)}` : "No trap scores yet", mt.over ? pill("due", "Over") : "", "bug")}
      ${linkRow(L(`salmonella/${f.id}`), "Salmonella", sal.exempt ? "Not needed for a small flock" : `Next sample ${dm(sal.due)}`, sal.classB ? pill("late", "Class B") : !sal.exempt && sal.level !== "ok" ? pill(sal.level, sal.level === "late" ? "Late" : "Due") : "", "syringe")}
      ${isFreeRange(h) ? linkRow(L("range"), "Range and pop-holes", h.rangeHa ? `${h.rangeHa} ha · ${n0(hens / h.rangeHa)} birds per ha` : "Add the range area to check birds per hectare", "", "map") : ""}
    </div></div>
    ${spaceBlock(h, hens)}${notesBlock}${actions}</div>`;
}

function spaceBlock(h, hens) {
  const sc = spaceCheck(h, hens || h.places || 0);
  if (!sc.rows.length) return html`<div class="section">${groupLabel("Space check")}${okCard("Add the usable area, nests and perch in Edit house to check the space limits.")}</div>`;
  return html`<div class="section">${groupLabel("Space check", hens ? `${n0(hens)} hens` : `${n0(h.places)} places`)}${kvRows(sc.rows.map((r) => [r.label, r.ok ? "✓" : "Short", r.ok ? "ok" : "due", null, r.text]))}
    <p class="ly-cap">System digit ${h.system ?? "—"} on the producer code: DAERA checks the house still meets this system.</p></div>`;
}
