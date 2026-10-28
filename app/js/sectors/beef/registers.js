// A register or report on screen (design/10 §9.1, §9.4): filters, the table in DAERA column
// order, Print (browser print → PDF) and CSV. Medicine purchases and disposals can be added here.
import { usesNifaisRegister, nifaisOnlineText } from "./model/region.js";
import { html, raw } from "../../core/html.js";
import { el } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { textField, checkRow, wireForm } from "../../ui/form.js";
import { canRead, canWrite } from "../../core/policy.js";
import { download } from "../../ui/download.js";
import { backLink, largeTitle } from "../../screens/common.js";
import { liveSnap } from "./data.js";
import { printDoc, toHtmlTable } from "./ui.js";
import { buildDoc, REGISTERS } from "./model/reports.js";
import { toCsv } from "./model/registers.js";

const INFO = {
  register: (s) => (usesNifaisRegister(s) ? `NIFAIS Online is your herd register: ${nifaisOnlineText(s)}.` : "Births within 30 days, moves and retags within 36 hours, deaths within 7 days."),
  medicine: () => "Every treatment, line by line. Keep for 5 years.",
  movements: () => "Moves on and off the holding with their NIFAIS notification.",
};

export default async function registerScreen(ctx) {
  const kind = ctx.match.groups.doc; const st = { from: "", to: "", onFarmOnly: false, includeDisposals: true };
  const body = el(html`<div class="beef-page"></div>`);
  const { first, stop } = liveSnap(ctx.ledger, (snap) => {
    const paint = () => {
      const money = canRead(snap.role, "finance");
      const doc = buildDoc(kind, snap.c, { ...st, money });
      const node = el(html`<div>${backLink(`#/l/${snap.lid}/paperwork`, "Paperwork")}${largeTitle(REGISTERS[kind] || "Register", `${doc.rows.length} ${doc.rows.length === 1 ? "line" : "lines"}`)}
        ${INFO[kind] ? html`<p class="hint" style="margin-top:0">${INFO[kind](snap.s)}</p>` : ""}
        <form class="form-group reg-filters" novalidate>${textField({ name: "from", label: "From", type: "date", value: st.from })}${textField({ name: "to", label: "To", type: "date", value: st.to })}
          ${kind === "register" ? html`${checkRow("onFarmOnly", "Only animals on the farm", st.onFarmOnly)}${checkRow("includeDisposals", "Include animals that left or died", st.includeDisposals)}` : ""}</form>
        <div class="act-grid"><button type="button" class="btn secondary" data-print>${raw(icon("print"))}Print or PDF</button><button type="button" class="btn secondary" data-csv>${raw(icon("download"))}CSV</button>
          ${kind === "medpurchases" && canWrite(snap.role, "purchases") ? html`<button type="button" class="btn" data-add style="grid-column:1/-1">${raw(icon("plus"))}Add a medicine purchase</button>` : ""}
          ${kind === "disposal" && canWrite(snap.role, "medicines") ? html`<button type="button" class="btn" data-add style="grid-column:1/-1">${raw(icon("plus"))}Record a disposal</button>` : ""}
          ${kind === "tbtests" ? html`<a class="btn" href="#/l/${snap.lid}/paperwork/tb" style="grid-column:1/-1">TB tests and test day</a>` : ""}</div>
        <div class="table-scroll"><div class="print-view">${raw(toHtmlTable(doc))}</div></div></div>`);
      const f = wireForm(node.querySelector("form")); f.onChange(() => { Object.assign(st, f.values()); paint(); });
      node.querySelector("[data-print]").onclick = () => printDoc(doc);
      node.querySelector("[data-csv]").onclick = () => download(`${doc.title.replace(/[^A-Za-z0-9]+/g, "-")}-${snap.today}.csv`, toCsv(doc), "text/csv");
      node.querySelector("[data-add]")?.addEventListener("click", () => import("./flows/medicine-records.js").then((m) => (kind === "disposal" ? m.disposalSheet(snap) : m.medPurchaseSheet(snap))));
      const y = window.scrollY; body.replaceChildren(node); if (y) window.scrollTo(0, y);
    };
    paint();
  });
  await first;
  return { el: body, title: REGISTERS[kind] || "Register", depth: 1, tab: "paperwork", destroy: stop };
}
