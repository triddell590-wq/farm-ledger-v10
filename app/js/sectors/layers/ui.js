// Shared Layers UI pieces: formatting, pills, key/value rows, the mini curve on a house card, the
// full breed-curve chart, the red-mite trap map, the flock timeline chips, pickers and print/CSV.
// Styles: css/layers.css (loaded once). Every class is ly- prefixed.
import { html, raw } from "../../core/html.js";
import { el } from "../../ui/dom.js";
import { icon, FL_ICONS } from "../../ui/icons.js";
import { openSheet } from "../../ui/sheet.js";
import { download } from "../../ui/download.js";

// Layers icons (mockups/layers.html), same 24 grid / 2px stroke as the shared set.
Object.assign(FL_ICONS, {
  house: '<path d="M3.5 11 12 4.5l8.5 6.5"/><path d="M5.5 9.5V20h13V9.5"/><path d="M9 20v-6h6v6"/>',
  chart: '<path d="M4 20V4M4 20h16"/><path d="M7.5 15l3.5-4 3 2.5 5-6.5"/>',
  health: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/><path d="M8.5 12h2l1-2 1.5 4 1-2h1.5"/>',
  bug: '<ellipse cx="12" cy="13" rx="4.5" ry="6"/><path d="M12 7V4M7.5 10 4 8.5M16.5 10 20 8.5M7.5 15H4M16.5 15H20M12 9v10"/>',
  bell: '<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2h-14z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
  phone: '<path d="M6.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4.5 5.5a2 2 0 0 1 2-2z"/>',
});

let cssDone = false;
export function ensureCss() {
  if (cssDone || typeof document === "undefined") return; cssDone = true;
  const l = document.createElement("link"); l.rel = "stylesheet"; l.href = "css/layers.css"; document.head.appendChild(l);
}
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** "Thu 16 Oct" */
export const dm = (iso) => (iso ? `${DOW[new Date(iso.slice(0, 10) + "T12:00:00Z").getUTCDay()]} ${+iso.slice(8, 10)} ${MON[+iso.slice(5, 7) - 1]}` : "");
/** "16 Oct" */
export const d2 = (iso) => (iso ? `${+iso.slice(8, 10)} ${MON[+iso.slice(5, 7) - 1]}` : "");
/** "16 Oct 2026" */
export const d3 = (iso) => (iso ? `${d2(iso)} ${iso.slice(0, 4)}` : "");
export const n0 = (n) => (n == null || Number.isNaN(+n) ? "—" : Math.round(+n).toLocaleString("en-GB"));
export const n1 = (n, dp = 1) => (n == null || Number.isNaN(+n) ? "—" : (+n).toFixed(dp));
export const pounds = (n, dp = 0) => (n == null || Number.isNaN(+n) ? "—" : `${+n < 0 ? "−" : ""}£${Math.abs(+n).toLocaleString("en-GB", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`);
export const pence = (n) => (n == null || Number.isNaN(+n) ? "—" : `${(+n).toFixed(1)}p`);
export const plural = (n, one, many = one + "s") => `${n0(n)} ${+n === 1 ? one : many}`;
export const signed = (n, dp = 1) => (n == null ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(dp)}`);
export const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function pill(level, text, iconName) {
  const ic = iconName || (level === "late" ? "alert" : level === "due" ? "clock" : level === "ok" ? "check" : null);
  return html`<span class="pill ${level}">${ic ? raw(icon(ic)) : ""}${text}</span>`;
}
/** rows: [label, value, tone?, href?, sub?] */
export function kvRows(rows) {
  return html`<div class="list">${rows.filter(Boolean).map(([k, v, tone, href, sub]) => {
    const inner = html`<span class="main"><span class="primary">${k}</span>${sub ? html`<span class="secondary">${sub}</span>` : ""}</span><span class="v ${tone || ""}">${v}</span>`;
    return href ? html`<a class="row no-lead ly-kv" href="${href}">${inner}<span class="chev">${raw(icon("chevron"))}</span></a>` : html`<div class="row no-lead ly-kv">${inner}</div>`;
  })}</div>`;
}
export const linkRow = (href, title, sub = "", right = "", ic = "") => html`<a class="row${ic ? "" : " no-lead"}" href="${href}">${ic ? html`<span class="tile">${raw(icon(ic))}</span>` : ""}<span class="main"><span class="primary">${title}</span>${sub ? html`<span class="secondary">${sub}</span>` : ""}</span>${right}<span class="chev">${raw(icon("chevron"))}</span></a>`;
export const okCard = (text) => html`<div class="card pad t-callout ink-2">${text}</div>`;
export const headRow = (label, btn = "") => html`<div class="ly-head"><h2 class="group-label"><span>${label}</span></h2>${btn}</div>`;
export const note = (text) => html`<p class="ly-note">${text}</p>`;

/** Mini curve on a house card (§3.1): last 14 sheets (solid) over the standard band. */
export function miniCurve(pts, bandNow) {
  const v = pts.map((p) => p.henDay).filter((x) => x != null);
  if (v.length < 2) return html`<div class="ly-mini empty">Line after 2 sheets</div>`;
  const W = 150, H = 56; const bands = pts.map((p) => p.band || bandNow).filter((b) => b && b[1] > 0);
  const lo = Math.min(...v, ...bands.map((b) => b[0])) - 1.5, hi = Math.max(...v, ...bands.map((b) => b[1])) + 1;
  const y = (x) => H - ((x - lo) / (hi - lo || 1)) * H; const n = Math.max(1, pts.length - 1); const x = (i) => (i / n) * W;
  const up = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y((p.band || bandNow || [lo, lo])[1]).toFixed(1)}`).join("");
  const dn = pts.map((p, i) => `L${x(i).toFixed(1)} ${y((p.band || bandNow || [lo, lo])[0]).toFixed(1)}`).reverse().join("");
  const line = pts.map((p, i) => (p.henDay == null ? null : `${x(i).toFixed(1)} ${y(p.henDay).toFixed(1)}`)).filter(Boolean);
  const last = line[line.length - 1].split(" ");
  return html`<svg class="ly-mini" viewBox="0 0 ${W} ${H}" aria-hidden="true">${raw(`<path d="${up}${dn}Z" fill="var(--layers-soft)"/><path class="ly-draw" d="M${line.join("L")}" fill="none" stroke="var(--layers)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${last[0]}" cy="${last[1]}" r="3.5" fill="var(--layers)"/>`)}</svg>`;
}

/**
 * The breed-curve chart (§5.1). bandAt(wk) -> [min,max]|null; weeks: [{wk, v}] flock weekly
 * values; dots: [{wk (fractional), v}] faint daily values; todayWk marker; unit for the y labels.
 */
export function curveChart({ bandAt, weeks, dots = [], fromWk = 18, toWk = 80, todayWk = null, unit = "%", label = "" }) {
  const W = 340, H = 200, L = 34, T = 10; const vals = [...weeks.map((w) => w.v), ...dots.map((d) => d.v)].filter((x) => x != null);
  const bs = []; for (let w = fromWk; w <= toWk; w++) { const b = bandAt(w); if (b) bs.push(b); }
  const all = [...vals, ...bs.flat()].filter((x) => x != null && isFinite(x));
  if (!all.length) return html`<p class="ly-note">Nothing to draw yet.</p>`;
  let lo = Math.min(...all), hi = Math.max(...all); const pad = (hi - lo) * 0.08 || 1; lo = Math.max(0, lo - pad); hi += pad;
  if (unit === "%") { lo = Math.max(0, Math.floor(Math.min(...[...vals, ...bs.filter((b) => b[1] > 0).map((b) => b[0])].filter((x) => x > 0), 100) / 10) * 10 - 10); hi = 100; }
  const x = (w) => L + ((w - fromWk) / (toWk - fromWk || 1)) * (W - L - 6); const y = (v) => T + (H - T) - ((v - lo) / (hi - lo || 1)) * (H - T);
  let up = "", dn = "";
  for (let w = fromWk; w <= toWk; w++) { const b = bandAt(w); if (!b) continue; up += `${up ? "L" : "M"}${x(w).toFixed(1)} ${y(Math.max(lo, b[1])).toFixed(1)}`; dn = `L${x(w).toFixed(1)} ${y(Math.max(lo, b[0])).toFixed(1)}` + dn; }
  const ticks = niceTicks(lo, hi); const wks = []; for (let w = Math.ceil(fromWk / 10) * 10; w <= toWk; w += 10) wks.push(w);
  const line = weeks.filter((w) => w.v != null).sort((a, b) => a.wk - b.wk).map((w, i) => `${i ? "L" : "M"}${x(w.wk + 0.5).toFixed(1)} ${y(w.v).toFixed(1)}`).join("");
  const lastW = weeks.filter((w) => w.v != null).sort((a, b) => b.wk - a.wk)[0];
  const svg = `${ticks.map((v) => `<path d="M${L - 4} ${y(v).toFixed(1)}H${W}" stroke="var(--hair)"/><text x="0" y="${(y(v) + 4).toFixed(1)}">${fmtTick(v)}${unit === "%" ? "%" : ""}</text>`).join("")}
    ${up ? `<path d="${up}${dn}Z" fill="var(--layers-soft)" stroke="none"/>` : ""}
    ${dots.map((d) => `<circle cx="${x(d.wk).toFixed(1)}" cy="${y(d.v).toFixed(1)}" r="1.6" fill="var(--layers)" opacity=".28"/>`).join("")}
    ${line ? `<path class="ly-draw" d="${line}" fill="none" stroke="var(--layers)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>` : ""}
    ${lastW ? `<circle cx="${x(lastW.wk + 0.5).toFixed(1)}" cy="${y(lastW.v).toFixed(1)}" r="5" fill="var(--layers)"/>` : ""}
    ${todayWk != null && todayWk >= fromWk && todayWk <= toWk ? `<path d="M${x(todayWk).toFixed(1)} ${T}V${H}" stroke="var(--ink-3)" stroke-dasharray="3 4"/><text x="${(x(todayWk) + 3).toFixed(1)}" y="${T + 8}">today</text>` : ""}
    ${wks.map((w) => `<text x="${(x(w) - 6).toFixed(1)}" y="${H + 14}">${w}</text>`).join("")}`;
  return html`<svg class="ly-chart" viewBox="0 0 ${W} ${H + 18}" role="img" aria-label="${label}">${raw(svg)}</svg>`;
}
function niceTicks(lo, hi) { const span = hi - lo; const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500].find((s) => span / s <= 6) || 1000; const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(v); return out; }
const fmtTick = (v) => (Math.abs(v) >= 1000 ? (v / 1000).toFixed(v % 1000 ? 1 : 0) + "k" : Number.isInteger(v) ? String(v) : v.toFixed(1));

/** Red-mite trap map (§7.2): the house plan as a rows × cols grid of traps coloured by score. */
export function trapMap(grid, scores = {}, { action = 2, onTap = false } = {}) {
  const cells = grid.ids.map((id, i) => { const s = scores[id]; const cls = s == null || s === "" ? "na" : `s${Math.min(4, +s)}${+s >= 3 ? " hi" : ""}`;
    return onTap ? html`<button type="button" class="ly-trap ${cls}" data-trap="${id}" aria-label="Trap ${i + 1}, score ${s ?? "not scored"}">${s ?? "·"}</button>` : html`<span class="ly-trap ${cls}" aria-label="Trap ${i + 1}, score ${s ?? "not scored"}">${s ?? "·"}</span>`; });
  return html`<div class="ly-trapmap" style="grid-template-columns:repeat(${grid.cols},1fr)" data-action="${action}"><span class="ly-door" aria-hidden="true">door</span>${cells}</div>`;
}
/** Small bars for a trend (e.g. mite average over 8 weeks). */
export function bars(values, { max = null, mark = null } = {}) {
  const v = values.map((x) => (x == null ? 0 : +x)); const m = max || Math.max(1, ...v); const W = 120, H = 28, bw = W / Math.max(8, v.length);
  return html`<svg class="ly-bars" viewBox="0 0 ${W} ${H}" aria-hidden="true">${raw(v.map((x, i) => `<rect x="${(i * bw + 1).toFixed(1)}" y="${(H - (x / m) * H).toFixed(1)}" width="${(bw - 3).toFixed(1)}" height="${((x / m) * H).toFixed(1)}" rx="2" fill="${mark != null && x >= mark ? "var(--late)" : "var(--layers)"}"/>`).join(""))}</svg>`;
}
/** Horizontal bars with labels (causes of death — never a pie, 00 §6.12). */
export function hbars(rows) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return html`<div class="ly-hbars">${rows.map(([k, n]) => html`<div class="ly-hb"><span class="k">${k}</span><span class="b"><i style="width:${Math.max(2, (n / max) * 100)}%"></i></span><span class="n">${n0(n)}</span></div>`)}</div>`;
}
/** Timeline chips (§5.2, §7.3): [{label, state:'done'|'due'|'late'|'future'|'pos'|'depop', href?}] */
export function tline(items) {
  return html`<div class="ly-tline">${items.map((m) => { const cls = { done: "", due: "d", late: "l", pos: "l", wait: "f", future: "f", depop: "f", ok: "" }[m.state] ?? "f";
    return m.href ? html`<a class="${cls}" href="${m.href}">${m.label}</a>` : m.data ? html`<button type="button" class="${cls}" ${raw(m.data)}>${m.label}</button>` : html`<span class="${cls}">${m.label}</span>`; })}</div>`;
}

/** Generic list picker sheet. items: [{ id, title, sub }]. Resolves id or null. */
export function pickFrom({ title, items, empty = "Nothing to choose." }) {
  const body = el(html`<div class="list">${items.length ? items.map((i) => html`<button type="button" class="row no-lead" data-pick="${i.id}"><span class="main"><span class="primary">${i.title}</span>${i.sub ? html`<span class="secondary">${i.sub}</span>` : ""}</span></button>`) : html`<p class="hint" style="padding:16px">${empty}</p>`}</div>`);
  const sh = openSheet({ title, body, size: "small" });
  body.addEventListener("click", (e) => { const b = e.target.closest("[data-pick]"); if (b) sh.close(b.dataset.pick, { force: true }); });
  return sh.done.then((r) => (typeof r === "string" ? r : null));
}

/** Printable table (design/00 §6.18): opens the browser print dialog. */
export function printDoc(doc) {
  const w = document.createElement("div"); w.className = "print-view print-float"; w.innerHTML = toHtmlTable(doc);
  document.body.appendChild(w); document.body.classList.add("printing");
  const done = () => { w.remove(); document.body.classList.remove("printing"); removeEventListener("afterprint", done); };
  addEventListener("afterprint", done);
  setTimeout(() => { try { window.print(); } catch (e) { done(); } setTimeout(() => { if (w.isConnected && !matchMedia("print").matches) done(); }, 1500); }, 50);
}
export function toHtmlTable(doc) {
  const sections = doc.sections || [doc];
  return sections.map((d) => `<div class="ph"><b>${esc(d.title)}</b><span>${(d.top || []).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join(" · ")}</span></div>
    <table><thead><tr>${d.headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${d.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${d.headers.length}">Nothing recorded yet.</td></tr>`}</tbody></table>
    <div class="pf">${esc(d.note || "")} Printed from Farm Ledger on ${new Date().toLocaleDateString("en-GB")}.</div>`).join('<div style="page-break-after:always"></div>');
}
export function csvDownload(doc) {
  const q = (s) => { s = String(s == null ? "" : s); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  download(`${doc.title.replace(/[^\w]+/g, "-").toLowerCase()}.csv`, [doc.headers, ...doc.rows].map((r) => r.map(q).join(",")).join("\n"), "text/csv");
}
/** Print / CSV buttons wired to a doc (or a function returning one). */
export function docButtons(doc, { csv = true, label = "Print or PDF" } = {}) {
  const node = el(html`<div class="ly-acts"><button type="button" class="btn secondary" data-print>${raw(icon("print"))}${label}</button>${csv ? html`<button type="button" class="btn secondary" data-csv>${raw(icon("download"))}CSV</button>` : ""}</div>`);
  node.querySelector("[data-print]").onclick = () => printDoc(typeof doc === "function" ? doc() : doc);
  node.querySelector("[data-csv]")?.addEventListener("click", () => csvDownload(typeof doc === "function" ? doc() : doc));
  return node;
}
/** A table that fits the phone (numbers right-aligned). cols: [label, align?] */
export function table(cols, rows, { cls = "" } = {}) {
  return html`<div class="ly-tblwrap"><table class="ly-tbl ${cls}"><thead><tr>${cols.map(([c, a]) => html`<th class="${a || ""}">${c}</th>`)}</tr></thead><tbody>${rows.map((r) => html`<tr>${r.map((v, i) => html`<td class="${cols[i]?.[1] || ""}">${v}</td>`)}</tr>`)}</tbody></table></div>`;
}
