// Shared Sheep UI pieces: CSS loader, swatches, tiles, mob rows and the mob picker, the big
// stepper used by the tallies, entry sheets, the year strip, the funnel and print helpers.
import { html, raw } from "../../core/html.js";
import { el } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { openSheet } from "../../ui/sheet.js";
import { wireForm, guardButton } from "../../ui/form.js";
import { vibrate } from "../../ui/dom.js";
import { num, listDate } from "../../ui/format.js";
import { swatch } from "./model/settings.js";
import { WORMER_GROUPS } from "./model/health.js";
import { STAGES, STAGE_SHORT } from "./model/year.js";
import { activeMobs, mobField, CLASSES } from "./model/mobs.js";

let cssDone = false;
export function ensureCss() {
  if (cssDone || typeof document === "undefined") return; cssDone = true;
  const l = document.createElement("link"); l.rel = "stylesheet"; l.href = "css/sheep.css"; document.head.appendChild(l);
}
export const short = (iso) => (iso ? listDate(iso).slice(4) : "");
/** Raddle colour: swatch + word. */
export const colourChip = (c, lg = false) => html`<span class="sw${lg ? " lg" : ""}" style="background:${swatch(c)}" aria-hidden="true"></span>${c}`;
/** Wormer group: swatch + word ("3-ML clear"). */
export function groupChip(g) { const w = WORMER_GROUPS[g]; if (!w) return ""; return html`<span class="sw${w.colour === "clear" ? " clear" : ""}" style="background:${w.swatch}" aria-hidden="true"></span>${w.label}`; }
export function pill(level, text) { const ic = level === "late" ? "alert" : level === "due" ? "clock" : level === "ok" ? "check" : null; return html`<span class="pill ${level}">${ic ? raw(icon(ic)) : ""}${text}</span>`; }
export function numTile({ label, value, delta = "", href = "", hero = false, tone = "", attr = "" }) {
  const words = typeof value === "string" && value.length > 10 && !/^[\d£–-]/.test(value); // sentences, not numbers: smaller type
  const t = html`<span class="label">${label}</span><span class="value ${tone}${words ? " words" : ""}">${value}</span>${delta ? html`<span class="delta">${delta}</span>` : ""}`;
  return href ? html`<a class="num-tile${hero ? " hero" : ""}" href="${href}" ${raw(attr)}>${t}</a>` : html`<div class="num-tile${hero ? " hero" : ""}" ${raw(attr)}>${t}</div>`;
}
export function kvRows(rows) { return html`<div class="list">${rows.filter(Boolean).map(([k, v, tone, sub]) => html`<div class="row no-lead"><span class="main"><span class="primary">${k}</span>${sub ? html`<span class="secondary">${sub}</span>` : ""}</span><span class="kv-v ${tone || ""}">${v}</span></div>`)}</div>`; }
export const miniHead = (title, btn = "") => html`<div class="mini-head"><h3>${title}</h3>${btn}</div>`;
export function banner(level, title, body) { return html`<div class="banner ${level}" role="${level === "late" ? "alert" : "status"}">${raw(icon(level === "late" ? "alert" : "info"))}<span><b>${title}</b>${body}</span></div>`; }

/** One mob row: name, field and health line, count on the right. */
export function mobRow(snap, m, { lines = [], href = true, selectable = false, selected = false } = {}) {
  const n = snap.counts.get(m.id) || 0; const f = mobField(snap.data, m);
  const sub = [f.name, f.since ? `since ${short(f.since)}` : null, ...lines.slice(0, 1)].filter(Boolean).join(" · ") || CLASSES[m.class] || "";
  const inner = html`<span class="tile">${raw(icon(m.class === "rams" ? "sheep" : "people"))}</span>
    <span class="main"><span class="primary"><b>${m.name}</b></span><span class="secondary">${sub}</span>${lines.slice(1).map((l) => html`<span class="secondary">${l}</span>`)}</span>
    <span class="count" aria-label="${n} sheep">${num(n)}</span>${selectable ? "" : html`<span class="chev">${raw(icon("chevron"))}</span>`}`;
  if (selectable) return html`<button type="button" class="row mob-row" role="radio" aria-checked="${!!selected}" data-mob="${m.id}">${inner}</button>`;
  return href ? html`<a class="row mob-row" href="#/l/${snap.lid}/mob/${m.id}" data-mob="${m.id}">${inner}</a>` : html`<div class="row mob-row">${inner}</div>`;
}
/** Pick a mob. Resolves with the mob or null. filter(m) narrows the list. */
export function pickMob(snap, { title = "Choose a mob", filter = () => true } = {}) {
  const mobs = activeMobs(snap.data).filter(filter);
  const body = el(html`<div>${mobs.length ? html`<div class="list" role="radiogroup">${mobs.map((m) => mobRow(snap, m, { selectable: true }))}</div>` : html`<p class="hint" style="padding:16px">No mobs yet. Add one on the Mobs tab.</p>`}</div>`);
  const sh = openSheet({ title, body, cancelText: "Cancel" });
  body.addEventListener("click", (e) => { const r = e.target.closest("[data-mob]"); if (r) sh.close(mobs.find((m) => m.id === r.dataset.mob), { force: true }); });
  return sh.done.then((r) => (r && r.id ? r : null));
}
/** A form row that opens the mob picker. Returns { node, mob(), set(m) }. */
export function mobPickRow(snap, { label = "Mob", mob = null, filter, onChange } = {}) {
  let cur = mob;
  const node = el(html`<button type="button" class="field pick-row" data-pick-mob><span class="label">${label}</span><span class="pick-val"></span>${raw(icon("chevron"))}</button>`);
  const paint = () => { node.querySelector(".pick-val").textContent = cur ? `${cur.name} · ${num(snap.counts.get(cur.id) || 0)}` : "Choose"; node.classList.toggle("unset", !cur); };
  node.onclick = async () => { const m = await pickMob(snap, { filter }); if (m) { cur = m; paint(); onChange && onChange(cur); node.dispatchEvent(new Event("input", { bubbles: true })); } }; // the sheet's Save label re-checks
  paint();
  return { node, mob: () => cur, set(m) { cur = m; paint(); } };
}
/** Big stepper with jump buttons (56px+). Returns { node, value(), set(n), onChange(cb) }. */
export function bigStepper({ value = 0, min = 0, max = 99999, jumps = [5, 10], label = "" }) {
  let v = value; const subs = new Set();
  const node = el(html`<div><div class="bigstep" role="group" aria-label="${label}"><button type="button" data-d="-1" aria-label="One fewer">−</button><output aria-live="polite">${v}</output><button type="button" data-d="1" aria-label="One more">+</button></div>
    ${jumps.length ? html`<div class="jumps">${jumps.map((j) => html`<button type="button" data-d="${j}">+${j}</button>`)}<button type="button" data-d="-${jumps[0]}">−${jumps[0]}</button></div>` : ""}</div>`);
  const set = (n) => { v = Math.max(min, Math.min(max, n)); node.querySelector("output").textContent = v; subs.forEach((cb) => cb(v)); };
  node.addEventListener("click", (e) => { const b = e.target.closest("[data-d]"); if (!b) return; vibrate(8); set(v + +b.dataset.d); });
  return { node, value: () => v, set, onChange(cb) { subs.add(cb); } };
}
/**
 * Entry sheet with an honest Save button. missing(values) -> reason|null; save(values, sheet).
 */
export function entrySheet({ title, body, label, missing, save, dirty, size }) {
  const btn = el(html`<button type="button" class="btn">${label}</button>`);
  const f = wireForm(body);
  const lab = typeof label === "function" ? label : () => label;
  const refresh = () => guardButton(btn, lab(f.values()), () => missing(f.values()));
  f.onChange(refresh); body.addEventListener("click", () => setTimeout(refresh, 0)); body.addEventListener("input", () => setTimeout(refresh, 0)); refresh();
  const start = JSON.stringify(f.values());
  const sh = openSheet({ title, body, footer: btn, size, isDirty: dirty || (() => JSON.stringify(f.values()) !== start), discardTitle: `Discard this ${title.toLowerCase()}?` });
  btn.onclick = async () => { const v = f.values(); if (missing(v)) return; btn.disabled = true; try { await save(v, sh); } finally { btn.disabled = false; } };
  return { sheet: sh, form: f, refresh, btn };
}
export const opt = (list) => list.map((x) => (Array.isArray(x) ? { value: x[0], label: x[1] ?? x[0] } : { value: x, label: x }));
export function chipsField(label, inner) { return html`<div class="field chips-field"><span class="label">${label}</span>${inner}</div>`; }

/** The sheep year strip: five stages, the current one filled, a track showing today. */
export function yearStrip(snap, { linkTo = "year" } = {}) {
  const { stage } = snap; const pct = Math.round(stage.progress * 100);
  return html`<nav class="ystrip" aria-label="The sheep year">${STAGES.map((st, i) => html`<a href="#/l/${snap.lid}/${linkTo}/${st}" aria-current="${i === stage.index}">${STAGE_SHORT[st]}</a>`)}</nav>
    <div class="ytrack" aria-hidden="true"><i style="width:${pct}%"></i><b style="left:${pct}%"></b></div>`;
}
/** The lamb funnel (compact on the home, full in Sheep year). */
export function funnelView(f, { compact = false, ghost = null, lid } = {}) {
  const max = Math.max(1, ...f.steps.map((s) => s.n || 0), ...(ghost ? ghost.steps.map((s) => s.n || 0) : [0]));
  const steps = compact ? f.steps.filter((s) => ["ewes", "scanned", "born", "weaned"].includes(s.key)) : f.steps;
  return html`<div class="funnel">${steps.map((s) => { const g = ghost?.steps.find((x) => x.key === s.key); return html`
    <${raw(lid && !compact ? "a" : "div")} class="f-step" ${raw(lid && !compact ? `href="#/l/${lid}/funnel/${s.key}"` : "")}><span class="lab">${s.label}</span><span class="bar">${g && g.n ? html`<u style="width:${(g.n / max) * 100}%"></u>` : ""}<i style="width:${s.n ? (s.n / max) * 100 : 0}%"></i></span><span class="n">${s.n == null ? "–" : num(s.n)}${s.pct != null ? html`<small>${s.pct}%</small>` : ""}</span></${raw(lid && !compact ? "a" : "div")}>
    ${s.loss && !compact ? html`<p class="f-loss">−${num(s.loss.n)} lost ${s.loss.label.replace(/^lost /, "")} (${s.loss.pct}%)</p>` : ""}`; })}
    ${f.totalLoss != null ? html`<p class="f-foot">Loss scanning → weaning: <b class="${f.totalLoss > 12 ? "v-late" : "v-ok"}">${f.totalLoss}% lost</b> · target under 12% (DAERA)</p>` : ""}</div>`;
}
/** A small line chart (count over time, lame % with a target line). points: [{x(date), y}] */
export function lineChart(points, { target = null, unit = "" } = {}) {
  if (points.length < 2) return "";
  const W = 320, H = 110, P = 18; const ys = points.map((p) => p.y); const max = Math.max(...ys, target || 0) * 1.1 || 1; const min = 0;
  const x = (i) => P + (i * (W - 2 * P)) / (points.length - 1); const y = (v) => H - P - ((v - min) / (max - min)) * (H - 2 * P);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join("");
  return raw(`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Chart from ${points[0].x} to ${points[points.length - 1].x}">${target != null ? `<line class="t" x1="${P}" x2="${W - P}" y1="${y(target)}" y2="${y(target)}"/><text x="${W - P}" y="${y(target) - 4}" text-anchor="end">target ${target}${unit}</text>` : ""}<path class="l" d="${d}"/><text x="${P}" y="${H - 2}">${points[0].x.slice(5)}</text><text x="${W - P}" y="${H - 2}" text-anchor="end">${points[points.length - 1].x.slice(5)}</text><text x="${x(points.length - 1)}" y="${y(points[points.length - 1].y) - 6}" text-anchor="end">${points[points.length - 1].y}${unit}</text></svg>`);
}

/** Printable table (register, movement document) — opens the print dialog. */
export function printDoc(doc) {
  const w = document.createElement("div"); w.className = "print-view print-float"; w.innerHTML = toHtmlTable(doc);
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
export function csvOf(doc) { const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`; return [doc.headers, ...doc.rows].map((r) => r.map(q).join(",")).join("\n"); }
export { num, listDate };
