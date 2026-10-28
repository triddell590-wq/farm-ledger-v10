// One register on screen with Print/PDF and CSV (design/13 §8.3). PM1 has the 7-day NIFAIS
// notification column with a tick; PM2 is the monthly running reconciliation per month,
// "opening + born + on − off − died = closing", which can't be closed until it balances or a
// difference note is entered. Vermin / water have their "Add" button.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { toast } from "../../../ui/toast.js";
import { canWrite, canRead } from "../../../core/policy.js";
import { largeTitle, backLink, groupLabel } from "../../../screens/common.js";
import { liveScreen, flowArg } from "./live.js";
import { docButtons, toHtmlTable, d2, pill } from "../ui.js";
import { registerDoc, contractReport } from "../model/registers.js";
import { notifyState, notifyDays } from "../model/paperwork.js";
import { pm2Series } from "../model/inventory.js";
import { notifyMove } from "../actions.js";

export default async function registers(ctx) {
  const doc = ctx.match.groups.doc;
  return liveScreen(ctx, { title: "Register", tab: "paperwork", paint: (snap) => {
    const lid = snap.lid; const back = backLink(`#/l/${lid}/${snap.s.breeding && !snap.s.smallHerd ? "pigs-paperwork" : "paperwork"}`, "Paperwork");
    if (doc === "pm2") return pm2Html(snap, back);
    if (doc.startsWith("contract-")) { const d = contractReport(snap, doc.slice(9), { money: canRead(snap.role, "finance") }); return html`<div>${back}${largeTitle(d.title, d.top.map(([k, v]) => `${k} ${v}`).join(" · "))}<div data-btns></div><div class="table-scroll"><div class="print-view">${raw(toHtmlTable(d))}</div></div><p class="pg-note">Share as PDF: Print → Save as PDF, then send it on WhatsApp or email.</p></div>`; }
    const d = registerDoc(snap, doc); if (!d) return html`<div>${back}${largeTitle("Not found")}</div>`;
    const pm1 = doc === "pm1" ? snap.data.moves.filter((m) => m.direction === "off").sort((a, b) => b.date.localeCompare(a.date)) : [];
    const addKind = doc === "vermin" || doc === "water" ? doc : null;
    return html`<div>${back}${largeTitle(d.title, `${d.rows.length} row${d.rows.length === 1 ? "" : "s"}`)}
      ${doc === "pm1" ? html`<div class="info-card">${raw(icon("info"))}<span>Pigs moved to NIFAIS in October 2025. Notify moves off on NIFAIS within ${notifyDays(snap.ledger.region || "NI")} days. No pre-movement notification is needed in Northern Ireland.</span></div>
        <div class="section">${groupLabel("Moves off — notification")}<div class="list">${pm1.length ? pm1.slice(0, 20).map((m) => { const n = notifyState(m, snap.today); return html`<div class="row no-lead"><span class="main"><span class="primary">${d2(m.date)} · ${m.n} ${m.category || "pigs"} → ${m.toName || m.toCode || ""}</span><span class="secondary">${m.notified ? `Notified ${d2(m.notified)}${m.notifiedBy ? " · " + m.notifiedBy : ""}` : `Notify by ${d2(n.by)}`}</span></span>${m.notified ? pill("ok", "Done") : canWrite(snap.role, "moves") ? html`<button type="button" class="btn ${n.level === "late" ? "" : "secondary"}" style="width:auto;height:40px;padding:0 14px" data-notify="${m.id}">Notified</button>` : pill(n.level, "To do")}</div>`; }) : html`<div class="row no-lead"><span class="main"><span class="secondary">No moves off yet.</span></span></div>`}</div></div>` : ""}
      ${addKind && canWrite(snap.role, "siteChecks") ? html`<button type="button" class="btn" style="margin:8px 0" data-flow="siteCheck" data-arg="${flowArg({ kind: addKind })}">${raw(icon("plus"))}Add ${addKind === "vermin" ? "a vermin survey" : "a water test"}</button>` : ""}
      ${doc === "visitors" ? html`<a class="btn secondary" href="#/l/${lid}/gate">Gate log and QR sign</a>` : ""}
      <div data-btns></div>
      <div class="table-scroll"><div class="print-view">${raw(toHtmlTable(d))}</div></div></div>`;
  }, after: (node, snap) => {
    const b = node.querySelector("[data-btns]");
    if (b && doc !== "pm2") b.replaceChildren(docButtons(() => doc.startsWith("contract-") ? contractReport(snap, doc.slice(9), { money: canRead(snap.role, "finance") }) : registerDoc(snap, doc), { csv: !doc.startsWith("contract-") }));
    node.querySelectorAll("[data-notify]").forEach((x) => (x.onclick = () => { const m = snap.data.moves.find((y) => y.id === x.dataset.notify); notifyMove(snap, m, snap.today); toast("Marked notified on NIFAIS"); }));
    node.querySelectorAll("[data-close]").forEach((x) => (x.onclick = async () => { const m = pm2Series(snap, 6).find((y) => y.month === x.dataset.close); (await import("../flows/paper.js")).pm2CloseSheet(snap, m); }));
  } });
}

function pm2Html(snap, back) {
  const months = pm2Series(snap, 6); const can = canWrite(snap.role, "pm2Months");
  const doc = { title: "Holding register (PM2)", top: [["Herd mark", snap.s.herdMark || ""]], headers: ["Month", "Opening", "Born", "On", "Off", "Died", "Closing", "Counted", "Note"], rows: months.map((m) => [m.month, m.opening, m.born, m.on, m.off, m.died, m.closing, m.saved?.counted ?? "", m.saved?.note || ""]), note: "Counts, not animals: opening + born + on − off − died = closing." };
  const node = el(html`<div>${back}${largeTitle("Holding register (PM2)", "Opening + born + on − off − died = closing")}
    ${months.map((m) => html`<div class="section">${groupLabel(new Date(m.month + "-15").toLocaleDateString("en-GB", { month: "long", year: "numeric" }), m.saved ? "closed" : m.current ? "open" : "")}<div class="card pad">
      <table class="pg-tbl"><tbody><tr><td>Opening</td><td class="r">${m.opening}</td></tr><tr><td>+ Born alive</td><td class="r">${m.born}</td></tr><tr><td>+ Moved on</td><td class="r">${m.on}</td></tr><tr><td>− Moved off</td><td class="r">${m.off}</td></tr><tr><td>− Died</td><td class="r">${m.died}</td></tr><tr><td><b>Closing</b></td><td class="r"><b>${m.closing}</b></td></tr>
        ${m.saved ? html`<tr class="${m.saved.counted === m.closing ? "ok" : ""}"><td>Counted</td><td class="r">${m.saved.counted ?? "—"}</td></tr>` : ""}</tbody></table>
      ${m.saved?.note ? html`<p class="pg-note">${m.saved.note}</p>` : ""}
      ${!m.saved && can ? html`<button type="button" class="btn secondary" style="margin-top:10px" data-close="${m.month}">Close ${m.month.slice(5)}/${m.month.slice(2, 4)}</button>` : ""}</div></div>`)}
    <div data-btns></div></div>`);
  node.querySelector("[data-btns]").replaceChildren(docButtons(doc));
  return node;
}
