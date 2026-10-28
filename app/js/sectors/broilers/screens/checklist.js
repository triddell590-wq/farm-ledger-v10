// Red Tractor Chicken checklist and "Inspector is here" (design/15 §11). The header states the
// standard, version and date exactly and says it is not endorsed. Items the records evidence are
// ticked automatically; the rest are ticked by the owner or a manager with a date. The inspection
// pack prints house records (this and the last crop), density notices, Salmonella results,
// FCI copies, medicines, alarm/generator tests, the environment log and the training certificate.
import { html, raw } from "../../../core/html.js";
import { icon } from "../../../ui/icons.js";
import { toast } from "../../../ui/toast.js";
import { canWriteMeta } from "../../../core/policy.js";
import { largeTitle, groupLabel, backLink } from "../../../screens/common.js";
import { liveScreen } from "./live.js";
import { pill, d2, toHtmlTable, printDoc, esc } from "../ui.js";
import { evaluate, summary, GROUPS } from "../model/checklist.js";
import { RT_HEADER, RT_NOTE } from "../model/content.js";
import { registerDoc, houseRecord } from "../model/registers.js";
import { currentCrop, lastCrop } from "../model/crop.js";
import { addDays } from "../model/time.js";
import { tickChecklist } from "../actions.js";
import { evidenceButton, wireEvidenceButtons } from "../../../ui/photo-strip.js";

const TILES = [["house", "House records", "records"], ["density", "Density notices", "chart"], ["salmonella", "Salmonella results", "scan"], ["fci", "FCI copies", "document"], ["medicines", "Medicines", "syringe"], ["alarms", "Alarm and generator tests", "bell"], ["environment", "Environment log", "temp"], ["training", "Training certificate", "user"]];

export default async function checklist(ctx) {
  const page = ctx.match.groups.page;
  return liveScreen(ctx, { title: page === "rt" ? "Red Tractor Chicken" : "Inspector is here", tab: "paperwork", paint: (snap) => (page === "rt" ? rt(snap) : inspect(snap)),
    after: (node, snap) => {
      node.querySelectorAll("[data-tick]").forEach((b) => (b.onclick = () => { const on = b.getAttribute("aria-checked") !== "true"; tickChecklist(snap, b.dataset.tick, on); toast(on ? "Ticked" : "Unticked"); }));
      node.querySelector("[data-pack]")?.addEventListener("click", () => printDoc({ title: "Inspection pack", __html: packHtml(snap) }));
      wireEvidenceButtons(node, { lid: snap.lid, role: snap.role, list: "checklist", labelOf: (id) => `Red Tractor Chicken ${id}` });
    } });
}

function rt(snap) {
  const L = (h) => `#/l/${snap.lid}/${h}`; const list = evaluate(snap.c, snap.meta.checklist || {}); const sm = summary(list);
  const can = canWriteMeta(snap.role, "checklist");
  return html`<div>${backLink(L("paperwork"), "Paperwork")}${largeTitle("Inspection ready?", `${sm.ok} of ${sm.total} ready${sm.gaps ? ` · ${sm.gaps} gap${sm.gaps > 1 ? "s" : ""} in the records` : ""}`)}
    <div class="info-card">${raw(icon("info"))}<span>${RT_HEADER} ${RT_NOTE}</span></div>
    ${Object.entries(GROUPS).map(([g, name]) => { const items = list.filter((x) => x.g === g); if (!items.length) return ""; return html`<div class="section">${groupLabel(name, `${items.filter((x) => x.state === "ok").length}/${items.filter((x) => x.state !== "na").length}`)}<div class="list">${items.map((x) => html`<div class="row no-lead br-rt">
      ${x.auto && x.state !== "gap" ? html`<span class="tile ${x.state === "ok" ? "ok" : ""}">${raw(icon(x.state === "ok" ? "check" : "info"))}</span>` : html`<button type="button" class="checkbox" role="checkbox" aria-checked="${x.state === "ok"}" aria-label="${x.text}" data-tick="${x.id}" ${raw(can ? "" : "disabled")}>${raw(icon("check"))}</button>`}
      <span class="main"><span class="primary">${x.text}</span><span class="secondary">${String(x.note || "").replace(/\d{4}-\d\d-\d\d/g, (m) => d2(m)) || (x.state === "open" ? "Tick when it's in place" : "")}${x.auto && x.state !== "na" ? " · from your records" : ""}</span><span class="row-actions">${evidenceButton(x.id)}</span></span>${x.state === "gap" ? pill("due", "Gap") : x.state === "na" ? pill("neutral", "n/a", "") : ""}</div>`)}</div></div>`; })}
  </div>`;
}

function inspect(snap) {
  const L = (h) => `#/l/${snap.lid}/${h}`; const sm = summary(evaluate(snap.c, snap.meta.checklist || {}));
  const crop = snap.ix.houses.map((h) => currentCrop(snap.ix, h.id)).find(Boolean) || snap.ix.crops.slice(-1)[0];
  return html`<div>${backLink(L("paperwork"), "Paperwork")}${largeTitle("Inspector is here", "Tap what they ask for")}
    <div class="br-inspect">${TILES.map(([k, l, ic]) => html`<a class="br-itile" href="${L(k === "house" && crop ? `paperwork/house/${crop.id}` : `paperwork/${k}`)}">${raw(icon(ic, { size: 30 }))}<span>${l}</span></a>`)}
      <a class="br-itile" href="${L("rt")}">${raw(icon("check", { size: 30 }))}<span>Checklist · ${sm.ok}/${sm.total}</span></a><a class="br-itile" href="${L("paperwork/visitors")}">${raw(icon("people", { size: 30 }))}<span>Visitors</span></a></div>
    <button type="button" class="btn br-mt" data-pack>${raw(icon("share"))}Share as PDF</button>
    <p class="hint">Builds one document on this phone — works with no signal. Choose “Save as PDF” in the print screen, then share it. House records for this and the last crop; Salmonella results for 2 years; medicines for 5.</p></div>`;
}

/** Inspection pack: cover + registers (dated rows cut to what the inspector needs). */
export function packHtml(snap) {
  const c = snap.c; const within = (doc, from) => ({ ...doc, rows: doc.rows.filter((r) => !/^\d{4}-\d\d-\d\d/.test(String(r[0])) || String(r[0]) >= from) });
  const crops = snap.ix.houses.flatMap((h) => { const cur = currentCrop(snap.ix, h.id); const prev = snap.ix.crops.filter((x) => x.houseId === h.id && x.clearedDate).slice(-1)[0]; return [cur, prev].filter(Boolean); });
  const sm = summary(evaluate(c, snap.meta.checklist || {}));
  const cover = `<div class="pack-cover"><h1>Inspection pack — broilers</h1><p><b>${esc(snap.keeper?.name || snap.ledger.farmName || "")}</b><br>Bird Register ${esc(snap.s.registerNo || "—")} · establishment ${esc(snap.s.establishmentNo || snap.ix.houses.map((h) => h.establishmentNo).filter(Boolean).join(", ") || "—")}</p>
    <p>Prepared ${esc(d2(snap.today))} ${esc(snap.today.slice(0, 4))} from Farm Ledger. Self-check: ${sm.ok} of ${sm.total} ready.</p><p class="small">${esc(RT_HEADER)}</p></div>`;
  const docs = [...crops.map((cr) => houseRecord(c, cr)), registerDoc(c, "density"), within(registerDoc(c, "salmonella"), addDays(snap.today, -730)), registerDoc(c, "fci"), within(registerDoc(c, "medicines"), addDays(snap.today, -365 * 5)), within(registerDoc(c, "alarms"), addDays(snap.today, -365)), within(registerDoc(c, "environment"), addDays(snap.today, -120)), registerDoc(c, "training"), within(registerDoc(c, "visitors"), addDays(snap.today, -365))];
  return cover + docs.filter(Boolean).map((d) => `<section class="pack-doc">${toHtmlTable(d)}</section>`).join("");
}
export { lastCrop };
