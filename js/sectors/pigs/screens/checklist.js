// Red Tractor Pigs checklist (design/13 §8.7) and "Inspector is here" (§8.1). The header states
// the standard version and date exactly; items the ledger evidences are ticked from the records,
// the rest are ticked by the owner/manager with a date. The inspection pack prints every
// register behind a cover page (works offline: Print → Save as PDF → share).
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { toast } from "../../../ui/toast.js";
import { canWriteMeta } from "../../../core/policy.js";
import { addDays } from "../model/dates.js";
import { largeTitle, backLink, groupLabel } from "../../../screens/common.js";
import { liveScreen } from "./live.js";
import { pill, toHtmlTable, d2 } from "../ui.js";
import { evaluate, summary, SECTIONS, HEADER, HEADER_NOTE } from "../model/checklist.js";
import { registerDoc } from "../model/registers.js";
import { qvrState } from "../model/paperwork.js";
import { signChecklist } from "../actions.js";
import { evidenceButton, wireEvidenceButtons } from "../../../ui/photo-strip.js";

const TILES = [["pm1", "Movement book (PM1)", "truck"], ["pm2", "Holding register (PM2)", "records"], ["medicines", "Medicines", "syringe"], ["mortality", "Mortality", "alert"], ["tailbites", "Tail biting", "pigs"], ["enrichment", "Enrichment", "check"], ["alarms", "Alarm tests", "bell"], ["visitors", "Visitors", "people"], ["wash", "Wash and disinfection", "water"], ["feed", "Feed deliveries", "feed"]];
const PACK = ["pm1", "herd", "medicines", "mortality", "tailbites", "enrichment", "alarms", "visitors", "wash", "feed", "vermin", "water"];

export default async function checklist(ctx) {
  const page = ctx.match.groups.page;
  return liveScreen(ctx, { title: page === "rt" ? "Red Tractor Pigs" : "Inspector is here", tab: "paperwork", paint: (snap) => {
    const back = backLink(`#/l/${snap.lid}/${snap.s.breeding && !snap.s.smallHerd ? "pigs-paperwork" : "paperwork"}`, "Paperwork");
    return page === "rt" ? rtHtml(snap, back) : inspectHtml(snap, back);
  }, after: (node, snap) => {
    node.querySelectorAll("[data-sign]").forEach((b) => (b.onclick = () => { const id = b.dataset.sign; const on = b.getAttribute("aria-checked") !== "true"; signChecklist(snap, id, on); toast(on ? `${id} ticked` : `${id} unticked`); }));
    const p = node.querySelector("[data-pack]"); if (p) p.onclick = () => printPack(snap);
    wireEvidenceButtons(node, { lid: snap.lid, role: snap.role, list: "rtChecklist", labelOf: (id) => `Red Tractor Pigs ${id}` });
  } });
}

function rtHtml(snap, back) {
  const rows = evaluate(snap.c, snap.meta.rtChecklist || {}); const sm = summary(rows); const can = canWriteMeta(snap.role, "rtChecklist");
  return html`<div>${back}${largeTitle("Red Tractor Pigs", `${sm.done} of ${sm.n} ready${sm.keyGaps ? ` · ${sm.keyGaps} key standard${sm.keyGaps > 1 ? "s" : ""} open` : ""}`)}
    <div class="info-card">${raw(icon("info"))}<span>${HEADER} ${HEADER_NOTE}</span></div>
    ${SECTIONS.map(([k, name]) => { const items = rows.filter((r) => r.sec === k); if (!items.length) return ""; return html`<div class="section">${groupLabel(name, `${items.filter((r) => r.status === "ok").length}/${items.length}`)}<div class="list">${items.map((r) => html`<div class="row no-lead pg-rt">
      ${r.ev && r.ev.state !== "due" ? html`<span class="tile ${r.status === "ok" ? "ok" : r.status === "gap" ? "late" : "due"}">${raw(icon(r.status === "ok" ? "check" : "alert"))}</span>` : html`<button type="button" class="checkbox" role="checkbox" aria-checked="${r.status === "ok"}" aria-label="Tick ${r.id}" data-sign="${r.id}" ${raw(can ? "" : "disabled")} style="border:0;flex:none;margin-right:12px">${raw(icon("check"))}</button>`}
      <span class="main"><span class="primary">${r.key ? html`<b class="pg-key">Key</b> ` : ""}${r.id} · ${r.text}</span><span class="secondary">${r.ev ? r.ev.text : r.sign?.done ? `Ticked ${d2(r.sign.date)}${r.sign.by ? " · " + r.sign.by : ""}` : "Tick when it's in place"}${r.ev && r.ev.state === "due" && r.sign?.done ? ` · ticked ${d2(r.sign.date)}` : ""}</span><span class="row-actions">${evidenceButton(r.id)}</span></span>
      ${r.link ? html`<a class="text-btn" href="${r.link}">Open</a>` : ""}</div>`)}</div></div>`; })}</div>`;
}

function inspectHtml(snap, back) {
  const lid = snap.lid; const rows = evaluate(snap.c, snap.meta.rtChecklist || {}); const sm = summary(rows); const q = qvrState(snap.data.vetVisits, snap.today);
  return html`<div>${back}${largeTitle("Inspector is here", "Tap what they ask for")}
    <div class="pg-inspect">${TILES.map(([k, l, ic]) => html`<a class="pg-itile" href="#/l/${lid}/reg/${k}">${raw(icon(ic, { size: 30 }))}<span>${l}</span></a>`)}
      <a class="pg-itile" href="#/l/${lid}/qvr">${raw(icon("syringe", { size: 30 }))}<span>Vet visits (QVR)${q.last ? ` · ${q.weeks} wk` : ""}</span></a><a class="pg-itile" href="#/l/${lid}/rt">${raw(icon("check", { size: 30 }))}<span>Checklist · ${sm.done}/${sm.n}</span></a></div>
    <button type="button" class="btn" data-pack style="margin-top:16px">${raw(icon("share"))}Share as PDF</button>
    <p class="hint">Builds one document on this phone — works with no signal. Choose “Save as PDF” in the print screen, then share it. Movements and visitors cover 3 years, medicines 5.</p></div>`;
}

export function packHtml(snap) {
  const e = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const three = addDays(snap.today, -365 * 3), five = addDays(snap.today, -365 * 5);
  const within = (doc, from) => ({ ...doc, rows: doc.rows.filter((r) => !/^\d{4}-\d\d-\d\d/.test(String(r[0])) || String(r[0]) >= from) });
  const sm = summary(evaluate(snap.c, snap.meta.rtChecklist || {})); const q = qvrState(snap.data.vetVisits, snap.today);
  const cover = `<div class="pack-cover"><h1>Inspection pack — pigs</h1><p><b>${e(snap.meta.keeper?.name || snap.ledger.farmName)}</b><br>Herd mark ${e(snap.s.herdMark || "")}</p>
    <p>Prepared ${e(snap.today)} from Farm Ledger.<br>Self-check: ${sm.done} of ${sm.n} ready${sm.keyGaps ? `, ${sm.keyGaps} key standards open` : ""}<br>Last quarterly vet visit: ${e(q.last ? `${q.last.date} (${q.last.vet || ""})` : "none recorded")}</p><p class="small">${e(HEADER)}</p></div>`;
  return cover + PACK.map((k) => registerDoc(snap, k)).filter(Boolean).map((d) => `<section class="pack-doc">${toHtmlTable(within(d, d.title.startsWith("Medicines") ? five : three))}</section>`).join("");
}
function printPack(snap) {
  const w = document.createElement("div"); w.className = "print-view print-float pack"; w.innerHTML = packHtml(snap);
  document.body.appendChild(w); document.body.classList.add("printing");
  const done = () => { w.remove(); document.body.classList.remove("printing"); removeEventListener("afterprint", done); };
  addEventListener("afterprint", done);
  setTimeout(() => { try { window.print(); } catch (err) { done(); } setTimeout(() => { if (w.isConnected && !matchMedia("print").matches) done(); }, 1500); }, 50);
}
export { el };
