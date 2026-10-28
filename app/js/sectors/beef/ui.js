// Shared Beef UI pieces: tag display, animal rows with the one most-urgent pill, tiles,
// pills, the animal picker sheet, print/CSV helpers. Styles: css/beef.css (loaded once).
import { html, raw } from "../../core/html.js";
import { el } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { openSheet } from "../../ui/sheet.js";
import { daysBetween, ddmmyy } from "../../core/dates.js";
import { tagParts, tagMatches, normTag } from "./model/tags.js";
import { onFarm, describe, withdrawal, classOf, shortName, CLASS_NAMES } from "./model/animals.js";
import { birthsToRegister, dueInfo } from "./model/breeding.js";
import { finishingFacts } from "./model/finishing.js";
import { listDate } from "../../ui/format.js";

let cssDone = false;
export function ensureCss() {
  if (cssDone || typeof document === "undefined") return; cssDone = true;
  const l = document.createElement("link"); l.rel = "stylesheet"; l.href = "css/beef.css"; document.head.appendChild(l);
}

/** Tag with the read-aloud digits bold. */
export function tagHtml(tag) {
  const p = tagParts(tag);
  return p.head ? html`<span class="tag-num">${p.head} <b>${p.tail}</b></span>` : html`<span class="tag-num"><b>${p.tail}</b></span>`;
}
export function pill(level, text, iconName) {
  const ic = iconName || (level === "late" ? "alert" : level === "due" ? "clock" : level === "ok" ? "check" : null);
  return html`<span class="pill ${level}">${ic ? raw(icon(ic)) : ""}${text}</span>`;
}
/** One most-urgent thing per animal (design/10 §4.1). */
export function urgentPill(snap, a) {
  const { ix, today } = snap;
  const w = withdrawal(ix, a, today); if (w) return ["late", `Withdrawal · ${listDate(w.until).slice(4)}`];
  const reg = a.reg && birthsToRegister({ animals: [a] }, snap.s, today)[0];
  if (reg) { const st = reg.steps.find((x) => !x.done && x.left < 0); if (st) return ["late", st.key === "tagged" ? "Tag overdue" : st.key === "nifais" ? "NIFAIS overdue" : `${st.label} overdue`]; }
  if (a.retagPending) return ["due", "Retag"];
  const cls = classOf(ix, a, today);
  if (!["cow", "bull"].includes(cls) && a.dob && daysBetween(a.dob, today) > 300) {
    const f = finishingFacts(snap.data, snap.s, ix, a, today); const n = f.nearest;
    if (n && n.left >= 0 && n.left <= 30) return ["due", `${n.kind === "bcrs" ? "BCRS" : "Spec"} · ${n.left} d`];
  }
  if (cls === "cow") { const d = dueInfo(snap.data, snap.s, ix, a); const dd = d.date || d.from; if (dd && daysBetween(today, dd) <= 7 && daysBetween(today, dd) >= -14) return ["due", daysBetween(today, dd) < 0 ? `${-daysBetween(today, dd)} d over` : `Due ${listDate(dd).slice(0, 3)}`]; }
  return null;
}
export function animalRow(snap, a, { selectable = false, selected = false, href = true, extra = "" } = {}) {
  const p = urgentPill(snap, a); const name = shortName(a);
  const inner = html`${selectable ? html`<span class="checkbox" aria-hidden="true">${raw(icon("check"))}</span>` : ""}
    <span class="tile">${raw(icon("beef"))}${classOf(snap.ix, a, snap.today) === "bull" ? html`<span class="tile-word">Bull</span>` : ""}</span>
    <span class="main"><span class="primary">${name ? html`<b>${name}</b> <span class="ink-2 nowrap">${tagParts(a.tag).tail}</span>` : tagHtml(a.tag)}</span>
      <span class="secondary">${describe(snap.ix, a, snap.today)}${onFarm(a) ? "" : ` · ${a.offTo === "Dead" ? "died" : "left"} ${ddmmyy(a.offDate || a.dateOff)}`}</span>
      ${a.temperament ? html`<span class="secondary late-ink">⚠ Handle with care</span>` : ""}${p ? html`<span class="row-pill">${pill(p[0], p[1])}</span>` : ""}${extra}</span>
    ${selectable ? "" : html`<span class="chev">${raw(icon("chevron"))}</span>`}`;
  if (selectable) return html`<button type="button" class="row animal-row" role="checkbox" aria-checked="${!!selected}" data-aid="${a.id}">${inner}</button>`;
  return html`<a class="row animal-row" ${raw(href ? `href="#/l/${snap.lid}/animal/${a.id}"` : "")} data-aid="${a.id}">${inner}</a>`;
}
export function numTile({ label, value, delta = "", href = "", hero = false, tone = "" }) {
  const t = html`<span class="label">${label}</span><span class="value ${tone}">${value}</span>${delta ? html`<span class="delta">${delta}</span>` : ""}`;
  return href ? html`<a class="num-tile${hero ? " hero" : ""}" href="${href}">${t}</a>` : html`<div class="num-tile${hero ? " hero" : ""}">${t}</div>`;
}
export function kvRows(rows) {
  return html`<div class="list">${rows.filter(Boolean).map(([k, v, tone]) => html`<div class="row no-lead kv-row"><span class="main"><span class="primary">${k}</span></span><span class="kv-v ${tone || ""}">${v}</span></div>`)}</div>`;
}
export function sparkBars(values, { max } = {}) {
  const m = max || Math.max(1, ...values);
  return html`<div class="spark" aria-hidden="true">${values.map((v) => html`<i style="height:${Math.max(6, (v / m) * 100)}%"></i>`)}</div>`;
}

/**
 * Pick animals. opts: { title, multi, filter(a), preselect[], confirm(n) -> label }
 * Resolves with an array of ids (or null when cancelled).
 */
export function pickAnimals(snap, { title = "Choose cattle", multi = true, filter = onFarm, preselect = [], confirm } = {}) {
  const sel = new Set(preselect);
  const all = snap.data.animals.filter(filter).sort((a, b) => String(a.tag).localeCompare(String(b.tag)));
  const groups = [...snap.ix.groups.values()];
  const body = el(html`<div class="picker">
    <div class="field search-field">${raw(icon("search"))}<input type="search" placeholder="Search tag, last 5 digits or name" aria-label="Search cattle" data-q autocomplete="off"></div>
    ${multi && groups.length ? html`<div class="chips scroll-chips" data-groups>${groups.map((g) => html`<button type="button" class="chip" data-g="${g.id}">${g.name}</button>`)}</div>` : ""}
    <div class="list" data-list></div></div>`);
  const btn = el(html`<button type="button" class="btn">Choose</button>`);
  const paint = () => {
    const q = body.querySelector("[data-q]").value;
    const rows = all.filter((a) => tagMatches(a, q)).slice(0, 200);
    body.querySelector("[data-list]").replaceChildren(el(html`<div style="display:contents">${rows.length ? rows.map((a) => animalRow(snap, a, { selectable: true, selected: sel.has(a.id) })) : html`<p class="hint" style="padding:16px">No cattle match “${q}”.</p>`}</div>`));
    btn.disabled = !sel.size; btn.textContent = sel.size ? (confirm ? confirm(sel.size) : multi ? `Choose ${sel.size}` : "Choose") : "Pick at least one";
  };
  body.querySelector("[data-q]").addEventListener("input", paint);
  body.addEventListener("click", (e) => {
    const g = e.target.closest("[data-g]");
    if (g) { const ids = all.filter((a) => a.groupId === g.dataset.g).map((a) => a.id); const on = ids.every((i) => sel.has(i)); ids.forEach((i) => (on ? sel.delete(i) : sel.add(i))); g.setAttribute("aria-pressed", String(!on)); paint(); return; }
    const r = e.target.closest("[data-aid]"); if (!r) return;
    const id = r.dataset.aid;
    if (!multi) { sel.clear(); sel.add(id); sh.close([id], { force: true }); return; }
    sel.has(id) ? sel.delete(id) : sel.add(id); r.setAttribute("aria-checked", String(sel.has(id)));
    btn.disabled = !sel.size; btn.textContent = sel.size ? (confirm ? confirm(sel.size) : `Choose ${sel.size}`) : "Pick at least one";
  });
  const sh = openSheet({ title, body, footer: multi ? btn : null });
  btn.onclick = () => sh.close([...sel], { force: true });
  paint();
  return sh.done.then((r) => (Array.isArray(r) ? r : null));
}
export const animalLabel = (a) => (shortName(a) ? `${shortName(a)} (${tagParts(a.tag).tail})` : tagParts(a.tag).tail || a.tag);
export function namesOf(snap, ids, max = 3) { const l = ids.map((id) => snap.ix.byId.get(id)).filter(Boolean).map(animalLabel); return l.length > max ? `${l.slice(0, max).join(", ")} +${l.length - max}` : l.join(", "); }

/** Printable table view (design/00 §6.18) for a register: opens the browser print dialog. */
export function printDoc(doc) {
  const w = document.createElement("div"); w.className = "print-view print-float";
  w.innerHTML = toHtmlTable(doc);
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
export { CLASS_NAMES, normTag };
