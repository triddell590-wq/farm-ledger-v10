// Shared Dairy UI pieces: cow rows (cow number leads), pills, tiles, the cow picker, the udder,
// small charts and print/CSV helpers. Styles: css/dairy.css (loaded once).
import { html, raw } from "../../core/html.js";
import { el } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { openSheet } from "../../ui/sheet.js";
import { download } from "../../ui/download.js";
import { daysBetween } from "../../core/dates.js";
import { onFarm, groupOf, lactation, dim, lastYield, lastScc, cowLabel, cowMatches, sortByNo, ordinal, ageMonths, isDry } from "./model/cows.js";
import { fertilityOf, dm } from "./model/fertility.js";
import { QUARTERS, QUARTER_NAMES } from "./model/milking.js";
import { tagParts } from "../beef/model/tags.js";

let cssDone = false;
export function ensureCss() {
  if (cssDone || typeof document === "undefined") return; cssDone = true;
  const l = document.createElement("link"); l.rel = "stylesheet"; l.href = "css/dairy.css"; document.head.appendChild(l);
}
const SVG = { stop: '<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>', udder: '<path d="M5 6h14v3a7 7 0 0 1-14 0z"/><path d="M8 14.5V19M12 16v3.5M16 14.5V19"/>' };
export function dIcon(name, size = 24) {
  if (!SVG[name]) return icon(name, { size });
  return `<svg class="i" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SVG[name]}</svg>`;
}
export function pill(level, text, iconName) {
  const ic = iconName || (level === "late" ? "alert" : level === "due" ? "clock" : level === "ok" ? "check" : null);
  return html`<span class="pill ${level}">${ic ? raw(icon(ic)) : ""}${text}</span>`;
}

/** The one most-urgent pill for a cow (design/12 §4.1). */
export function cowPill(snap, a) {
  const { ix, today } = snap;
  if (snap.brd.withheld.some((x) => x.cow.id === a.id)) return ["late", "Withheld"];
  if (snap.notMilked?.has(a.id)) return ["late", "Not milked 12 h"];
  const g = groupOf(ix, a, today);
  if (["milking", "dry", "heifer"].includes(g)) {
    const f = fertilityOf(snap.s, ix, a, today);
    if (g === "milking" && f.dryOffDue && daysBetween(today, f.dryOffDue) <= 7) return ["due", "Dry off"];
    if (f.due && f.pregnant && daysBetween(today, f.due) <= 7 && daysBetween(today, f.due) >= -21) return ["due", "Calving"];
  }
  const sc = lastScc(ix, a); if (g === "milking" && sc && sc.k > 200) return ["due", "High SCC"];
  if (a.cull?.on) return ["neutral", "To cull"];
  return null;
}
export function cowLine(snap, a) {
  const { ix, today } = snap; const g = groupOf(ix, a, today); const lac = lactation(ix, a);
  if (g === "milking") { const y = lastYield(ix, a); const sc = lastScc(ix, a); return [`${ordinal(lac || 1)} lact`, `${dim(ix, a, today)} DIM`, y ? `${y.l} L` : null, sc ? `SCC ${sc.k}k` : null].filter(Boolean).join(" · "); }
  if (g === "dry") { const f = fertilityOf(snap.s, ix, a, today); return [`${ordinal(lac || 1)} lact`, "dry", f.due ? `due ${dm(f.due)}` : null].filter(Boolean).join(" · "); }
  if (g === "heifer") { const f = fertilityOf(snap.s, ix, a, today); return [`${Math.floor(ageMonths(a, today))} mo heifer`, f.pregnant ? `PD+ · due ${dm(f.due)}` : f.lastServe ? `served ${dm(f.lastServe.date)}` : null].filter(Boolean).join(" · "); }
  if (g === "calf") { const d = daysBetween(a.dob, today); return [`${d < 28 ? Math.max(1, Math.floor(d / 7)) + " wk" : Math.floor(d / 30.4) + " mo"}`, /bull|steer|^m/i.test(a.sex || "") ? "bull calf" : "heifer calf", a.calf?.pen ? `Pen ${a.calf.pen}` : null].filter(Boolean).join(" · "); }
  return [a.sex, a.breed].filter(Boolean).join(" · ");
}
export function cowRow(snap, a, { selectable = false, selected = false, extra = "", action = "" } = {}) {
  const p = cowPill(snap, a);
  const inner = html`${selectable ? html`<span class="checkbox" aria-hidden="true">${raw(icon("check"))}</span>` : ""}
    <span class="cow-no">${cowLabel(a)}</span>
    <span class="main"><span class="primary">${a.name ? html`<b>${a.name}</b>` : html`<span class="ink-2">${tagParts(a.tag).tail ? "Tag " + tagParts(a.tag).tail : ""}</span>`}</span><span class="secondary">${cowLine(snap, a)}</span>${extra}${p && action ? pill(p[0], p[1]) : ""}</span>
    ${p && !action ? pill(p[0], p[1]) : ""}${action}${selectable || action ? "" : html`<span class="chev">${raw(icon("chevron"))}</span>`}`;
  if (selectable) return html`<button type="button" class="row cow-row" role="checkbox" aria-checked="${!!selected}" data-aid="${a.id}">${inner}</button>`;
  if (action) return html`<div class="row cow-row" data-aid="${a.id}">${inner}</div>`;
  return html`<a class="row cow-row" href="#/l/${snap.lid}/cow/${a.id}" data-aid="${a.id}">${inner}</a>`;
}
export function numTile({ label, value, delta = "", href = "", tone = "", hero = false }) {
  const t = html`<span class="label">${label}</span><span class="value ${tone}">${value}</span>${delta ? html`<span class="delta">${delta}</span>` : ""}`;
  return href ? html`<a class="num-tile${hero ? " hero" : ""}" href="${href}">${t}</a>` : html`<div class="num-tile${hero ? " hero" : ""}">${t}</div>`;
}
export function kvRows(rows) {
  return html`<div class="list">${rows.filter(Boolean).map(([k, v, tone]) => html`<div class="row no-lead kv-row"><span class="main"><span class="primary">${k}</span></span><span class="kv-v ${tone || ""}">${v}</span></div>`)}</div>`;
}
export const sectionOf = (label, body, right = "") => html`<div class="section"><h2 class="group-label"><span>${label}</span>${right ? html`<span>${right}</span>` : ""}</h2>${body}</div>`;

/** Udder picker, viewed from behind the cow. sel: Set of quarters. Returns html. */
export function udderHtml(sel, { readonly = false, counts = null } = {}) {
  return html`<div class="udder" role="group" aria-label="Quarters, viewed from behind the cow">${QUARTERS.map((q) => html`<button type="button" data-q="${q}" aria-pressed="${sel.has(q)}" ${raw(readonly ? "disabled" : "")}>${q}<small>${counts ? `${counts[q] || 0} case${counts[q] === 1 ? "" : "s"}` : sel.has(q) ? "treated" : QUARTER_NAMES[q]}</small></button>`)}</div>`;
}

/** Pick cows. opts: { title, multi, filter(a), preselect[], confirm(n) }. Resolves ids[] or null. */
export function pickCows(snap, { title = "Choose cows", multi = false, filter = onFarm, preselect = [], confirm } = {}) {
  const sel = new Set(preselect);
  const all = snap.data.animals.filter(filter).sort(sortByNo);
  const body = el(html`<div class="picker"><div class="field search-field">${raw(icon("search"))}<input type="search" inputmode="search" placeholder="Cow number, name or tag" aria-label="Search cows" data-q autocomplete="off"></div><div class="list" data-list></div></div>`);
  const btn = el(html`<button type="button" class="btn">Choose</button>`);
  const label = () => (sel.size ? (confirm ? confirm(sel.size) : `Choose ${sel.size}`) : "Pick at least one");
  const paint = () => {
    const q = body.querySelector("[data-q]").value;
    const rows = all.filter((a) => cowMatches(a, q)).slice(0, 200);
    body.querySelector("[data-list]").replaceChildren(el(html`<div style="display:contents">${rows.length ? rows.map((a) => cowRow(snap, a, { selectable: true, selected: sel.has(a.id) })) : html`<p class="hint" style="padding:16px">No cows match “${q}”.</p>`}</div>`));
    btn.disabled = !sel.size; btn.textContent = label();
  };
  body.querySelector("[data-q]").addEventListener("input", paint);
  body.querySelector("[data-q]").addEventListener("keydown", (e) => { if (e.key === "Enter") { const first = all.find((a) => cowMatches(a, e.target.value)); if (first && !multi) sh.close([first.id], { force: true }); } });
  body.addEventListener("click", (e) => {
    const r = e.target.closest("[data-aid]"); if (!r) return; const id = r.dataset.aid;
    if (!multi) { sh.close([id], { force: true }); return; }
    sel.has(id) ? sel.delete(id) : sel.add(id); r.setAttribute("aria-checked", String(sel.has(id))); btn.disabled = !sel.size; btn.textContent = label();
  });
  const sh = openSheet({ title, body, footer: multi ? btn : null });
  btn.onclick = () => sh.close([...sel], { force: true });
  paint();
  return sh.done.then((r) => (Array.isArray(r) ? r : null));
}

/** Small bar chart (inline SVG) with an optional dashed target line. */
export function barChart(values, { target = null, max = null, labels = [] } = {}) {
  const m = max || Math.max(1, target || 0, ...values.map((v) => v || 0)) * 1.15; const w = 320, h = 90, n = values.length || 1, bw = (w / n) * 0.7;
  return html`<svg class="chart" viewBox="0 0 ${w} ${h + 16}" preserveAspectRatio="none" role="img" aria-label="${labels.map((l, i) => `${l}: ${values[i] == null ? "pending" : Math.round(values[i])}`).join(", ")}">
    ${raw(values.map((v, i) => `<rect x="${i * (w / n) + (w / n - bw) / 2}" y="${h - ((v || 0) / m) * h}" width="${bw}" height="${((v || 0) / m) * h}" rx="4" fill="var(--dairy)" opacity="${v == null ? 0.2 : 1}"/>`).join(""))}
    ${target != null ? raw(`<path d="M0 ${h - (target / m) * h}H${w}" stroke="var(--ink-3)" stroke-dasharray="4 4" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`) : ""}
    ${raw(labels.map((l, i) => `<text x="${i * (w / n) + w / n / 2}" y="${h + 13}" text-anchor="middle" font-size="10" fill="var(--ink-3)">${l}</text>`).join(""))}</svg>`;
}
/** Line chart with a dashed limit line. points: [number|null]. */
export function lineChart(points, { limit = null, max = null } = {}) {
  const vals = points.filter((v) => v != null); const m = max || Math.max(1, limit || 0, ...vals) * 1.1; const w = 320, h = 90; const n = Math.max(1, points.length - 1);
  const d = points.map((v, i) => (v == null ? null : `${i * (w / n)} ${h - (v / m) * h}`)).filter(Boolean).map((p, i) => `${i ? "L" : "M"}${p}`).join("");
  return html`<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">${limit != null ? raw(`<path d="M0 ${h - (limit / m) * h}H${w}" stroke="var(--late)" stroke-dasharray="4 4" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`) : ""}${raw(`<path d="${d}" fill="none" stroke="var(--dairy)" stroke-width="2.5" vector-effect="non-scaling-stroke"/>`)}</svg>`;
}

/** Printable table (design/00 §6.18): opens the browser print dialog. */
export function printDoc(doc) {
  const w = document.createElement("div"); w.className = "print-view print-float"; w.innerHTML = doc.__html || toHtmlTable(doc);
  document.body.appendChild(w); document.body.classList.add("printing");
  const done = () => { w.remove(); document.body.classList.remove("printing"); removeEventListener("afterprint", done); };
  addEventListener("afterprint", done);
  setTimeout(() => { try { window.print(); } catch (e) { done(); } setTimeout(() => { if (w.isConnected && !matchMedia("print").matches) done(); }, 1500); }, 50);
}
export function toHtmlTable(doc) {
  const e = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  return `<div class="ph"><b>${e(doc.title)}</b><span>${(doc.top || []).map(([k, v]) => `${e(k)}: ${e(v)}`).join(" · ")}</span></div>
    <table><thead><tr>${doc.headers.map((h) => `<th>${e(h)}</th>`).join("")}</tr></thead><tbody>${doc.rows.map((r) => `<tr>${r.map((c) => `<td>${e(c)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${doc.headers.length}">Nothing recorded yet.</td></tr>`}</tbody></table>
    <div class="pf">${e(doc.note || "")} Printed from Farm Ledger on ${new Date().toLocaleDateString("en-GB")}.</div>`;
}
export function csvDownload(doc) {
  const q = (s) => { s = String(s == null ? "" : s); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  download(`${doc.title.replace(/[^\w]+/g, "-").toLowerCase()}.csv`, [doc.headers, ...doc.rows].map((r) => r.map(q).join(",")).join("\n"), "text/csv");
}
export const dryWord = (ix, a) => (isDry(ix, a) ? "Dry" : "");
export { cowLabel, dm };
