// One register / report (design/12 §8): an on-screen table with Print and CSV, plus the AH.2
// annual collation. Routes: paperwork/<doc>.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { largeTitle, backLink } from "../../../screens/common.js";
import { liveSnap } from "../data.js";
import { buildRegister, collation } from "../model/registers.js";
import { printDoc, csvDownload, toHtmlTable } from "../ui.js";
import { addRecord } from "../../../services/records.js";
import { canWrite } from "../../../core/policy.js";

export default async function register(ctx) {
  const key = ctx.match.groups.doc; const body = el(html`<div class="dairy-page"></div>`);
  let title = "Register";
  const { first, stop } = liveSnap(ctx.ledger, (snap) => {
    const doc = key === "collation" ? collation(snap.c) : buildRegister(key, snap.c);
    if (!doc) { body.replaceChildren(el(html`<div>${backLink(`#/l/${snap.lid}/paperwork`, "Paperwork")}${largeTitle("Not found", "")}</div>`)); return; }
    title = doc.title;
    const full = { ...doc, top: [["Herd", snap.s.herdNo || ""], ["Farm", snap.ledger.farmName || snap.ledger.name || ""], ...(doc.top || [])] };
    const node = el(html`<div>${backLink(`#/l/${snap.lid}/paperwork`, "Paperwork")}${largeTitle(doc.title, `${doc.rows.length} ${doc.rows.length === 1 ? "entry" : "entries"}`)}
      <div class="act-grid"><button type="button" class="btn" data-print>${raw(icon("print"))}Print / PDF</button><button type="button" class="btn secondary" data-csv>${raw(icon("download"))}CSV</button></div>
      ${doc.note ? html`<p class="source" style="margin:0 4px 12px">${doc.note}</p>` : ""}
      <div class="table-scroll"><div class="print-view" style="min-width:${Math.max(360, doc.headers.length * 96)}px">${raw(toHtmlTable(full))}</div></div></div>`);
    node.querySelector("[data-print]").onclick = () => { printDoc(full); if (key === "withhold" && canWrite(snap.role, "events")) addRecord(snap.lid, "events", { type: "parlourShared", date: snap.today }); };
    node.querySelector("[data-csv]").onclick = () => csvDownload(full);
    body.replaceChildren(node);
  });
  await first;
  return { el: body, title, tab: "more", destroy: stop };
}
