// Print or save as PDF (design/00 §6.18): show `content` (HTML or a node) on its own, open the
// browser's print dialog, and tidy up after (on afterprint, or 1.5 s on, for browsers without it).
export function printView(content, extraClass = "") {
  const w = document.createElement("div"); w.className = `print-view print-float ${extraClass}`.trim();
  if (typeof content === "string") w.innerHTML = content; else w.append(content);
  document.body.appendChild(w); document.body.classList.add("printing");
  const done = () => { w.remove(); document.body.classList.remove("printing"); removeEventListener("afterprint", done); };
  addEventListener("afterprint", done);
  setTimeout(() => { try { window.print(); } catch (e) { done(); } setTimeout(() => { if (w.isConnected && !matchMedia("print").matches) done(); }, 1500); }, 50);
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const table = (t) => `${t.sub ? `<h3>${esc(t.sub)}</h3>` : ""}<table><thead><tr>${t.headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${
  t.rows.map((r, i) => `<tr${t.refs?.[i] ? ` data-rec="${esc(t.refs[i])}" class="tap" tabindex="0" role="button"` : ""}>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${t.headers.length}">Nothing recorded yet.</td></tr>`}</tbody></table>`;

/** A register as a printable table, for every sector. A doc may hold several `tables` (each with
 *  an optional `sub` heading) or several `sections` (each a doc, on its own page). Rows with a
 *  `refs[i]` are tappable on screen, to fix that record. */
export function toHtmlTable(doc) {
  if (doc.sections) return doc.sections.map(toHtmlTable).join('<div style="page-break-after:always"></div>');
  return `<div class="ph"><b>${esc(doc.title)}</b><span>${(doc.top || []).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join(" · ")}</span></div>
    ${(doc.tables || [doc]).map(table).join("")}
    <div class="pf">${esc(doc.note || "")} Printed from Farm Ledger on ${new Date().toLocaleDateString("en-GB")}.</div>`;
}
/** Print a register (or a doc that brings its own `__html`). */
export const printDoc = (doc) => printView(doc.__html || toHtmlTable(doc));
