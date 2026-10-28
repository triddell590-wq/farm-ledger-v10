// Dairy → More → Paperwork & Red Tractor (design/12 §8): herd status (TB, BVD, Johne's), the
// Red Tractor self-check hero, the shared cattle registers plus the dairy registers, the AH.2
// annual collation and the "Inspector is here" pack.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { daysBetween } from "../../../core/dates.js";
import { largeTitle, backLink, groupLabel } from "../../../screens/common.js";
import { liveSnap } from "../data.js";
import { onFarm } from "../model/cows.js";
import { tbNext } from "../model/duties.js";
import { evaluate, summary } from "../model/checklist.js";
import { REGISTERS } from "../model/registers.js";
import { RT_HEADER, bvdRuleState } from "../model/content.js";

export const SHARED_REGS = ["register", "medicine", "movements", "deaths", "vetops", "tb", "calvings", "breeding"];
export const DAIRY_REGS = ["withhold", "tank", "quality", "mastitis", "dryoffs", "machine", "scores", "foottrims", "training", "abfailures"];

export default async function paperwork(ctx) {
  const body = el(html`<div class="dairy-page"></div>`);
  const { first, stop } = liveSnap(ctx.ledger, (snap) => body.replaceChildren(render(snap)));
  await first;
  return { el: body, title: "Paperwork", tab: "more", destroy: stop };
}

export function herdStatus(snap) {
  const ms = snap.meta.settings || {}; const next = tbNext(snap.c); const left = next ? daysBetween(snap.today, next) : null;
  const lastTb = snap.data.tbTests.filter((t) => !t.deleted).sort((a, b) => b.date.localeCompare(a.date))[0];
  const untested = snap.data.animals.filter((a) => onFarm(a) && a.bornInHerd && a.dob && daysBetween(a.dob, snap.today) > 30 && daysBetween(a.dob, snap.today) < 730 && !a.bvd?.status).length;
  const bvd = bvdRuleState(null, snap.today, snap.s.region);
  return {
    tb: `${ms.tbStatus === "restricted" ? "Restricted" : lastTb?.result || (lastTb ? "Clear" : "Not recorded")}${next ? ` · next test ${next.slice(8)}/${next.slice(5, 7)} (${left < 0 ? `${-left} d overdue` : `${left} d`})` : " · add your last test date in Dairy settings"}`,
    tbLevel: left != null && left < 0 ? "late" : left != null && left <= 14 ? "due" : "",
    bvd: `${ms.bvdAffected ? "Herd affected — moves restricted" : "Herd not restricted"}${untested ? ` · ${untested} calves without a BVD result` : ""}`, bvdLevel: ms.bvdAffected ? "late" : untested ? "due" : "", bvdRule: bvd.line,
    johnes: ms.johnes || "Johne's declaration: upload it in the checklist (AH.1.3)",
  };
}

function render(snap) {
  const { lid } = snap; const rows = evaluate(snap.c, snap.meta.rtChecklist?.items || {}); const sm = summary(rows);
  const hs = herdStatus(snap); const gaps = rows.filter((r) => r.key && r.status !== "ok").slice(0, 2).map((r) => r.text.toLowerCase());
  const reg = (k) => html`<a class="row" href="#/l/${lid}/paperwork/${k}"><span class="tile">${raw(icon("records"))}</span><span class="main"><span class="primary">${REGISTERS[k].title}</span></span><span class="chev">${raw(icon("chevron"))}</span></a>`;
  return el(html`<div>${backLink(`#/l/${lid}/more`, "More")}${largeTitle("Paperwork", [snap.s.herdNo ? `Herd ${snap.s.herdNo}` : null, snap.s.registerMode === "nifais" ? "Register kept on NIFAIS Online" : "Register kept in this app"].filter(Boolean).join(" · "))}
    <a class="num-tile hero" href="#/l/${lid}/rt"><span class="label">Red Tractor ready?</span><span class="value">${Math.round((sm.done / sm.n) * 100)}%</span>
      <span class="sub">${sm.done} of ${sm.n} in place${sm.keyGaps ? ` · ${sm.keyGaps} Key standard${sm.keyGaps > 1 ? "s" : ""} open: ${gaps.join("; ")}${sm.keyGaps > 2 ? "…" : ""}` : " · no Key gaps"}</span><span class="source">${RT_HEADER}</span></a>
    <div class="section">${groupLabel("Herd status")}<div class="list">
      <a class="row no-lead" href="#/l/${lid}/tb"><span class="main"><span class="primary">TB</span><span class="secondary ${hs.tbLevel ? hs.tbLevel + "-ink" : ""}">${hs.tb}</span></span><span class="chev">${raw(icon("chevron"))}</span></a>
      <a class="row no-lead" href="#/l/${lid}/dairy-settings"><span class="main"><span class="primary">BVD</span><span class="secondary ${hs.bvdLevel ? hs.bvdLevel + "-ink" : ""}">${hs.bvd}</span><span class="secondary">${hs.bvdRule}</span></span><span class="chev">${raw(icon("chevron"))}</span></a>
      <a class="row no-lead" href="#/l/${lid}/rt#ah"><span class="main"><span class="primary">Johne's</span><span class="secondary">${hs.johnes}</span></span><span class="chev">${raw(icon("chevron"))}</span></a></div></div>
    <div class="section">${groupLabel("Cattle registers", "print · CSV")}<div class="list">${SHARED_REGS.map(reg)}</div></div>
    <div class="section">${groupLabel("Dairy registers", "print · CSV")}<div class="list">${DAIRY_REGS.map(reg)}</div></div>
    <div class="section">${groupLabel("For the vet")}<div class="list"><a class="row" href="#/l/${lid}/paperwork/collation"><span class="tile">${raw(icon("document"))}</span><span class="main"><span class="primary">Annual health and performance collation</span><span class="secondary">Lameness, mastitis, mortality, culls, medicines (AH.2)</span></span><span class="chev">${raw(icon("chevron"))}</span></a></div></div>
    <div class="section"><a class="btn" href="#/l/${lid}/inspect">${raw(icon("shield"))}Inspector is here</a></div>
  </div>`);
}
