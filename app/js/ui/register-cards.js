// Registers on a phone (review A #25, #26): a wide DAERA table shows 1.5 columns on a 390 px
// screen, so on phones each line becomes a card (first column as its heading, the rest as
// "label  value" rows, blanks left out) and "Print / share full register" gives the real table.
// Wide screens keep the table. doc: { headers, rows, refs? } (the registers' shared shape).
import { html, raw } from "../core/html.js";

export const PRINT_LABEL = "Print / share full register";

export function registerCards(doc) {
  const h = doc.headers || [];
  if (!doc.rows || !doc.rows.length) return html`<div class="reg-cards"><div class="card pad t-callout ink-2">Nothing recorded yet.</div></div>`;
  return html`<div class="reg-cards" role="list">${doc.rows.map((r, i) => {
    const ref = doc.refs?.[i];
    const rest = r.map((c, j) => [h[j], c]).slice(1).filter(([, c]) => c !== "" && c != null && c !== "—");
    return html`<div class="reg-card${ref ? " tap" : ""}" role="listitem" ${raw(ref ? `data-rec="${String(ref).replace(/"/g, "&quot;")}" tabindex="0"` : "")}>
      <div class="reg-card-h"><span class="reg-k">${h[0] || ""}</span><b>${r[0] ?? ""}</b></div>
      <dl>${rest.map(([k, v]) => html`<div><dt>${k || ""}</dt><dd>${v}</dd></div>`)}</dl></div>`;
  })}</div>`;
}
/** Cards on phones, the given table HTML (in .table-scroll) on wide screens. */
export function registerView(doc, tableHtml, style = "") {
  return html`${registerCards(doc)}<div class="table-scroll reg-wide"><div class="print-view" ${raw(style ? `style="${style}"` : "")}>${raw(tableHtml)}</div></div>`;
}
