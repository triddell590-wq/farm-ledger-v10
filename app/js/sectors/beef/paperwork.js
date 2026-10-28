// Beef → Paperwork (design/10 §9): Inspection ready? hero, herd status (TB, BVD, Johne's),
// registers, plans and certificates, and the "Inspector is here" button.
import { html, raw } from "../../core/html.js";
import { el } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { daysBetween, shortDate } from "../../core/dates.js";
import { listDate } from "../../ui/format.js";
import { largeTitle, groupLabel } from "../../screens/common.js";
import { canWriteMeta } from "../../core/policy.js";
import { liveSnap } from "./data.js";
import { fqaScore, FQA_STANDARD } from "./model/fqa.js";
import { tbNext } from "./model/duties.js";
import { onFarm } from "./model/animals.js";
import { REGISTERS } from "./model/reports.js";

export default async function paperwork(ctx) {
  const body = el(html`<div class="beef-page"></div>`);
  const { first, stop } = liveSnap(ctx.ledger, (snap) => body.replaceChildren(render(snap)));
  await first;
  return { el: body, title: "Paperwork", destroy: stop };
}

export function herdStatus(snap) {
  const { data, today } = snap; const ms = snap.meta.settings || {};
  const last = data.tbTests.filter((t) => t.date).sort((a, b) => b.date.localeCompare(a.date))[0];
  const next = tbNext(snap.c); const left = next ? daysBetween(today, next) : null;
  const status = ms.tbStatus === "restricted" ? "Restricted" : last?.herdStatus || (last ? "OTF" : "Not recorded");
  // untested = recorded as BVDU, or no result for an animal young enough to have been born under the NI programme
  const untested = data.animals.filter((a) => onFarm(a) && a.dob && daysBetween(a.dob, today) > 30 && (/BVDU/.test(a.bvd?.status || "") || (!a.bvd?.status && daysBetween(a.dob, today) < 730))).length;
  const pos = data.animals.some((a) => onFarm(a) && /BVDP/.test(a.bvd?.status || ""));
  return {
    tb: `${status}${next ? ` · next test ${listDate(next).slice(4)} (${left < 0 ? `${-left} d overdue` : `${left} d`})` : ""}`, tbLevel: left != null && left < 0 ? "late" : left != null && left <= 14 ? "due" : "",
    bvd: `${ms.bvdRestricted || pos ? "Herd restricted" : "Herd not restricted"} · ${untested} untested over 30 d`, bvdLevel: ms.bvdRestricted || pos || untested >= 5 ? "late" : untested ? "due" : "",
    johnes: ms.johnes || "Voluntary · not recorded",
  };
}

function render(snap) {
  const { lid } = snap;
  const ticks = snap.meta.fqa?.items || snap.meta.fqa?.ticks || {};
  const sc = fqaScore({ ...snap.c, overdueNifais: 0 }, ticks);
  const hs = herdStatus(snap); const ms = snap.meta.settings || {};
  const gaps = sc.gaps.slice(0, 2).map(({ it }) => (/^[A-Z][a-z]/.test(it.t) ? it.t.charAt(0).toLowerCase() + it.t.slice(1) : it.t)).join("; ");
  const plan = (k, label, help) => { const d = ms[k]; const stale = d && daysBetween(d, snap.today) > 335; return html`<button type="button" class="row" data-plan="${k}"><span class="main"><span class="primary">${label}</span><span class="secondary ${!d || stale ? "due-ink" : ""}">${d ? `${help} ${shortDate(d)}${stale ? " · due again soon" : ""}` : "Not recorded — tap to add the date"}</span></span><span class="chev">${raw(icon("chevron"))}</span></button>`; };
  const node = el(html`<div>${largeTitle("Paperwork", [snap.meta.keeper?.herdNo || snap.s.herdNo ? `Herd ${snap.meta.keeper?.herdNo || snap.s.herdNo}` : null, snap.ledger.farmName].filter(Boolean).join(" · "))}
    <a class="num-tile hero inspect-hero" href="#/l/${lid}/paperwork/fqa"><span class="label">Inspection ready?</span><span class="value">${sc.pct}%</span>
      <span class="sub">${sc.gaps.length ? `${sc.gaps.length} gap${sc.gaps.length > 1 ? "s" : ""}: ${gaps}${sc.gaps.length > 2 ? "…" : ""}` : "No gaps found in what the app can check."}</span><span class="source">${FQA_STANDARD.header}</span></a>
    <div class="section">${groupLabel("Herd status")}<div class="list">
      <a class="row no-lead" href="#/l/${lid}/paperwork/tb"><span class="main"><span class="primary">TB</span><span class="secondary ${hs.tbLevel ? hs.tbLevel + "-ink" : ""}">${hs.tb}</span></span><span class="chev">${raw(icon("chevron"))}</span></a>
      <a class="row no-lead" href="#/l/${lid}/herd"><span class="main"><span class="primary">BVD</span><span class="secondary ${hs.bvdLevel ? hs.bvdLevel + "-ink" : ""}">${hs.bvd}</span></span><span class="chev">${raw(icon("chevron"))}</span></a>
      <a class="row no-lead" href="#/l/${lid}/targets#status"><span class="main"><span class="primary">Johne's</span><span class="secondary">${hs.johnes}</span></span><span class="chev">${raw(icon("chevron"))}</span></a></div></div>
    <div class="section">${groupLabel("Registers", "print · PDF · CSV")}<div class="list">
      ${["register", "medicine", "medpurchases", "disposal", "movements", "deaths", "vetops", "tbtests", "feedrecords"].map((k) => html`<a class="row" href="#/l/${lid}/paperwork/${k}"><span class="tile">${raw(icon("records"))}</span><span class="main"><span class="primary">${REGISTERS[k]}</span></span><span class="chev">${raw(icon("chevron"))}</span></a>`)}</div></div>
    <div class="section">${groupLabel("Reports")}<div class="list">
      ${["calvings", "sc", "finishing-list"].map((k) => html`<a class="row" href="#/l/${lid}/paperwork/${k}"><span class="tile">${raw(icon("document"))}</span><span class="main"><span class="primary">${REGISTERS[k]}</span></span><span class="chev">${raw(icon("chevron"))}</span></a>`)}</div></div>
    <div class="section">${groupLabel("Plans and certificates")}<div class="list">
      ${plan("healthPlanSigned", "Animal health plan", "signed")}${plan("hparDate", "Health, performance & antibiotic review", "done")}
      <a class="row" href="#/farm/documents"><span class="main"><span class="primary">Training records, bait plan, emergency info, complaints</span><span class="secondary">Kept in the farm's Documents</span></span><span class="chev">${raw(icon("chevron"))}</span></a></div></div>
    <div class="section"><a class="btn" href="#/l/${lid}/paperwork/inspect">${raw(icon("shield"))}Inspector is here</a></div>
  </div>`);
  node.querySelectorAll("[data-plan]").forEach((b) => (b.onclick = () => planSheet(snap, b.dataset.plan)));
  return node;
}

async function planSheet(snap, key) {
  const { textField } = await import("../../ui/form.js"); const { entrySheet } = await import("./flows/common.js"); const { setMeta } = await import("./actions.js"); const { toast } = await import("../../ui/toast.js");
  if (!canWriteMeta(snap.role, "settings")) { toast("Only the owner or a manager can change this."); return; }
  const label = key === "hparDate" ? "Review done on" : "Plan signed on";
  const body = el(html`<form novalidate><div class="form-group">${textField({ name: "d", label, type: "date", value: snap.meta.settings?.[key] || snap.today })}</div><p class="hint">Keep the signed copy in the farm's Documents. We'll remind you 30 days before it's a year old.</p></form>`);
  entrySheet({ title: key === "hparDate" ? "Health, performance & antibiotic review" : "Animal health plan", body, label: "Save", missing: (v) => (!v.d ? "Add the date" : null), save(v, sh) { setMeta(snap.lid, "settings", { [key]: v.d }); sh.close(true, { force: true }); toast("Saved"); } });
}
