// Inspector is here (design/11 §9): big tiles that open each register, and "Share as PDF" which
// prints every sheep register (last 3 years; medicines 5 years) behind a cover page.
import { html, raw } from "../../core/html.js";
import { el } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { addDays, shortDate } from "../../core/dates.js";
import { backLink, largeTitle } from "../../screens/common.js";
import { loadSheep } from "./data.js";
import { toHtmlTable } from "./ui.js";
import { registerDoc } from "./registers.js";
import { fqaStatus, FQA_STANDARD } from "./model/fqa.js";
import { restriction, inventoryWindow } from "./model/paperwork.js";

const TILES = [["register", "Flock register", "records"], ["movements", "Movements", "truck"], ["medicine", "Medicines (mob doses)", "syringe"], ["inventory", "Annual inventory", "check"], ["deaths", "Deaths", "alert"], ["vetops", "Castration and docking", "syringe"], ["feed", "Feed records", "feed"], ["tagging", "Tagging", "tag"]];

export default async function inspect(ctx) {
  const snap = await loadSheep(ctx.ledger); const lid = snap.lid;
  const body = el(html`<div class="sheep-page">${backLink(`#/l/${lid}/paperwork`, "Paperwork")}${largeTitle("Inspector is here", "Tap what they ask for")}
    <div class="inspect-grid">${TILES.map(([k, l, ic]) => html`<a class="inspect-tile" href="#/l/${lid}/paperwork/${k}">${raw(icon(ic, { size: 32 }))}<span>${l}</span></a>`)}</div>
    <button type="button" class="btn" data-pdf style="margin-top:16px">${raw(icon("share"))}Share as PDF</button>
    <p class="hint">Builds one document on this phone — works with no signal. Choose “Save as PDF” in the print screen, then share it.</p></div>`);
  body.querySelector("[data-pdf]").onclick = () => pack(snap);
  return { el: body, title: "Inspector is here", depth: 2, tab: "paperwork" };
}

const within = (doc, from) => ({ ...doc, rows: doc.rows.filter((r) => !/^\d{4}-\d\d-\d\d$/.test(String(r[0])) || r[0] >= from) });
export function packHtml(snap) {
  const k = snap.keeper || {}; const e = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const three = addDays(snap.today, -365 * 3), five = addDays(snap.today, -365 * 5);
  const docs = [within(registerDoc(snap, "register"), three), within(registerDoc(snap, "movements"), three), within(registerDoc(snap, "medicine"), five), within(registerDoc(snap, "deaths"), three), within(registerDoc(snap, "vetops"), three), within(registerDoc(snap, "feed"), three)];
  const r = restriction(snap.data); const fq = fqaStatus(snap.c, snap.meta.fqa?.items || {}); const inv = inventoryWindow(snap.today, snap.s);
  const invRec = (snap.data.inventories || []).find((i) => +i.year === inv.year) || (snap.data.inventories || []).find((i) => +i.year === inv.year - 1);
  const cover = `<div class="pack-cover"><h1>Inspection pack — sheep</h1><p><b>${e(k.name || snap.ledger.farmName)}</b><br>${e(k.address || "")}<br>Flock no. ${e(snap.s.flockNo || k.flockNo || "")}</p>
    <p>Prepared ${e(shortDate(snap.today))} from Farm Ledger.<br>Flock status: ${e(r ? `restricted (${r.disease}) since ${r.date}` : "not restricted")}<br>Last inventory: ${e(invRec?.countDate ? `${invRec.total} sheep on ${invRec.countDate}${invRec.submittedOn ? ", sent " + invRec.submittedOn : ""}` : "not recorded")}<br>Self-check score: ${fq.pct}%</p>
    <p class="small">${e(FQA_STANDARD.header)}</p></div>`;
  return cover + docs.map((d) => `<section class="pack-doc">${toHtmlTable(d)}</section>`).join("");
}
function pack(snap) {
  const w = document.createElement("div"); w.className = "print-view print-float pack"; w.innerHTML = packHtml(snap);
  document.body.appendChild(w); document.body.classList.add("printing");
  const done = () => { w.remove(); document.body.classList.remove("printing"); removeEventListener("afterprint", done); };
  addEventListener("afterprint", done);
  setTimeout(() => { try { window.print(); } catch (er) { done(); } setTimeout(() => { if (w.isConnected && !matchMedia("print").matches) done(); }, 1500); }, 50);
}
