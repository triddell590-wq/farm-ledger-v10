// Inspector is here (design/10 §9.3): big tiles that open each register, and "Share as PDF"
// which prints every register (last 12 months; medicines 5 years) behind a cover page.
import { html, raw } from "../../core/html.js";
import { el } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { addDays, shortDate } from "../../core/dates.js";
import { canRead } from "../../core/policy.js";
import { backLink, largeTitle } from "../../screens/common.js";
import { loadBeef } from "./data.js";
import { toHtmlTable } from "./ui.js";
import { buildDoc } from "./model/reports.js";
import { FQA_STANDARD } from "./model/fqa.js";
import { herdStatus } from "./paperwork.js";

const TILES = [["register", "Herd register", "records"], ["medicine", "Medicines (5 years)", "syringe"], ["plans", "Health plan + review", "shield"], ["tb", "TB and BVD status", "alert"], ["feedrecords", "Feed records", "feed"], ["training", "Training", "people"], ["vetops", "Vet operations", "syringe"], ["movements", "Movements", "truck"]];

export default async function inspect(ctx) {
  const snap = await loadBeef(ctx.ledger); const lid = snap.lid;
  const href = (k) => k === "tb" ? `#/l/${lid}/paperwork/tb` : k === "plans" ? `#/l/${lid}/paperwork` : k === "training" ? "#/farm/documents" : `#/l/${lid}/paperwork/${k}`;
  const body = el(html`<div class="beef-page">${backLink(`#/l/${lid}/paperwork`, "Paperwork")}${largeTitle("Inspector is here", "Tap what they ask for")}
    <div class="inspect-grid">${TILES.map(([k, l, ic]) => html`<a class="inspect-tile" href="${href(k)}">${raw(icon(ic, { size: 32 }))}<span>${l}</span></a>`)}</div>
    <button type="button" class="btn" data-pdf style="margin-top:16px">${raw(icon("share"))}Share as PDF</button>
    <p class="hint">Builds one document on this phone — works with no signal. Choose “Save as PDF” in the print screen, then share it.</p></div>`);
  body.querySelector("[data-pdf]").onclick = () => pack(snap);
  return { el: body, title: "Inspector is here", depth: 2, tab: "paperwork" };
}

export function packHtml(snap) {
  const yearAgo = addDays(snap.today, -365), fiveAgo = addDays(snap.today, -365 * 5); const money = canRead(snap.role, "finance");
  const k = snap.meta.keeper || {}; const hs = herdStatus(snap);
  const docs = [buildDoc("register", snap.c, { from: yearAgo }), buildDoc("medicine", snap.c, { from: fiveAgo }), buildDoc("medpurchases", snap.c, { from: fiveAgo }), buildDoc("disposal", snap.c, { from: fiveAgo }),
    buildDoc("movements", snap.c, { from: yearAgo }), buildDoc("deaths", snap.c, { from: yearAgo }), buildDoc("vetops", snap.c, { from: yearAgo }), buildDoc("tbtests", snap.c, {}), buildDoc("feedrecords", snap.c, { money })];
  const e = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const cover = `<div class="pack-cover"><h1>Inspection pack</h1><p><b>${e(k.name || snap.ledger.farmName)}</b><br>${e(k.address || "")}<br>Herd no. ${e(k.herdNo || snap.s.herdNo || "")}</p>
    <p>Prepared ${e(shortDate(snap.today))} from Farm Ledger.<br>TB: ${e(hs.tb)}<br>BVD: ${e(hs.bvd)}<br>Health plan signed: ${e(snap.meta.settings?.healthPlanSigned ? shortDate(snap.meta.settings.healthPlanSigned) : "not recorded")} · Review: ${e(snap.meta.settings?.hparDate ? shortDate(snap.meta.settings.hparDate) : "not recorded")}</p>
    <p class="small">${e(FQA_STANDARD.header)}</p></div>`;
  return cover + docs.map((d) => `<section class="pack-doc">${toHtmlTable(d)}</section>`).join("");
}
function pack(snap) {
  const w = document.createElement("div"); w.className = "print-view print-float pack"; w.innerHTML = packHtml(snap);
  document.body.appendChild(w); document.body.classList.add("printing");
  const done = () => { w.remove(); document.body.classList.remove("printing"); removeEventListener("afterprint", done); };
  addEventListener("afterprint", done);
  setTimeout(() => { try { window.print(); } catch (e) { done(); } setTimeout(() => { if (w.isConnected && !matchMedia("print").matches) done(); }, 1500); }, 50);
}
