// Shared Pigs UI pieces: pills, number tiles, key/value rows, the sow row (sow number leads),
// the room tile (room board), pickers for sows / rooms / batches, sparklines, small charts and
// print/CSV helpers. Styles: css/pigs.css (loaded once).
import { html, raw } from "../../core/html.js";
import { el } from "../../ui/dom.js";
import { icon, FL_ICONS } from "../../ui/icons.js";
import { openSheet } from "../../ui/sheet.js";
import { download } from "../../ui/download.js";
import { sowLabel, sowPill, sowLine, sowMatches, sortByNo, onFarm, cycleOf, dayName } from "./model/sows.js";
import { weekDates } from "./model/weeks.js";
import { batchName } from "./model/batches.js";
import { KIND_NAME } from "./model/rooms.js";

// Pigs icons (mockups/pigs.html), same 24 grid / 2px stroke as the shared set.
Object.assign(FL_ICONS, {
  house: '<path d="M3.5 11 12 4.5l8.5 6.5"/><path d="M5.5 9.5V20h13V9.5"/><path d="M9 20v-6h6v6"/>',
  chart: '<path d="M4 20V4M4 20h16"/><path d="M7.5 15l3.5-4 3 2.5 5-6.5"/>',
  bell: '<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2h-14z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="m9 5 7 7-7 7"/>',
  gate: '<path d="M3.5 20.5V5M20.5 20.5V5M3.5 8h17M3.5 16h17M8 8v8M12.5 8v8M17 8v8"/>',
});

let cssDone = false;
export function ensureCss() {
  if (cssDone || typeof document === "undefined") return; cssDone = true;
  const l = document.createElement("link"); l.rel = "stylesheet"; l.href = "css/pigs.css"; document.head.appendChild(l);
}
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Thu 16 Oct" */
export const dm = (iso) => (iso ? `${dayName(iso.slice(0, 10))} ${+iso.slice(8, 10)} ${MON[+iso.slice(5, 7) - 1]}` : "");
/** "16 Oct" */
export const d2 = (iso) => (iso ? `${+iso.slice(8, 10)} ${MON[+iso.slice(5, 7) - 1]}` : "");
export const n0 = (n) => (n == null || Number.isNaN(+n) ? "—" : Math.round(+n).toLocaleString("en-GB"));
export const n1 = (n, dp = 1) => (n == null || Number.isNaN(+n) ? "—" : (+n).toFixed(dp));
export const pctText = (x, dp = 1) => (x == null ? "—" : `${(x * 100).toFixed(dp)}%`);
export const pounds = (n, dp = 0) => (n == null || Number.isNaN(+n) ? "—" : `${+n < 0 ? "−" : ""}£${Math.abs(+n).toLocaleString("en-GB", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`);
export const plural = (n, one, many = one + "s") => `${n0(n)} ${+n === 1 ? one : many}`;

export function pill(level, text, iconName) {
  const ic = iconName || (level === "late" ? "alert" : level === "due" ? "clock" : level === "ok" ? "check" : null);
  return html`<span class="pill ${level}">${ic ? raw(icon(ic)) : ""}${text}</span>`;
}
export function numTile({ label, value, delta = "", href = "", tone = "", data = "" }) {
  const t = html`<span class="label">${label}</span><span class="value ${tone}">${value}</span>${delta ? html`<span class="delta">${delta}</span>` : ""}`;
  if (href) return html`<a class="num-tile" href="${href}">${t}</a>`;
  if (data) return html`<button type="button" class="num-tile" ${raw(data)}>${t}</button>`;
  return html`<div class="num-tile">${t}</div>`;
}
export function kvRows(rows) {
  return html`<div class="list">${rows.filter(Boolean).map(([k, v, tone, href]) => href
    ? html`<a class="row no-lead pg-kv" href="${href}"><span class="main"><span class="primary">${k}</span></span><span class="v ${tone || ""}">${v}</span><span class="chev">${raw(icon("chevron"))}</span></a>`
    : html`<div class="row no-lead pg-kv"><span class="main"><span class="primary">${k}</span></span><span class="v ${tone || ""}">${v}</span></div>`)}</div>`;
}
export const sectionOf = (label, body, right = "") => html`<div class="section"><h2 class="group-label"><span>${label}</span>${right ? html`<span>${right}</span>` : ""}</h2>${body}</div>`;
export const headRow = (label, btn = "") => html`<div class="pg-head"><h2 class="group-label"><span>${label}</span></h2>${btn}</div>`;
export const linkRow = (href, title, sub = "", right = "", ic = "") => html`<a class="row${ic ? "" : " no-lead"}" href="${href}">${ic ? html`<span class="tile">${raw(icon(ic))}</span>` : ""}<span class="main"><span class="primary">${title}</span>${sub ? html`<span class="secondary">${sub}</span>` : ""}</span>${right}<span class="chev">${raw(icon("chevron"))}</span></a>`;
export const okCard = (text) => html`<div class="card pad t-callout ink-2">${text}</div>`;

/** The sow row (design/13 §4.1): sow number big; parity pill; status pill; batch, days, room. */
export function sowRow(snap, sow, cy, { selectable = false, selected = false } = {}) {
  const c = cy || cycleOf(snap.s, snap.ix, sow, snap.today);
  const wk = weekDates(snap.today, snap.s.weekStart);
  const p = sow.type === "boar" ? ["neutral", "Boar"] : sowPill(snap.s, c, sow, snap.today, wk[6]);
  const line = sow.type === "boar" ? [sow.breed, sow.tag].filter(Boolean).join(" · ") : sowLine(c, snap.ix, (id) => batchName(snap.ix.batches.get(id))) || (sow.type === "gilt" ? "Gilt · not served yet" : "");
  const inner = html`${selectable ? html`<span class="checkbox" aria-hidden="true">${raw(icon("check"))}</span>` : ""}<span class="pg-no">${sowLabel(sow)}</span>
    <span class="main"><span class="primary">${sow.type === "boar" ? "Boar" : html`<span class="par">P${c.parity}</span>${sow.type === "gilt" && !c.litters.length ? "Gilt" : ""}`}</span><span class="secondary">${line}</span></span>
    ${p ? pill(p[0], p[1]) : ""}${selectable ? "" : html`<span class="chev">${raw(icon("chevron"))}</span>`}`;
  if (selectable) return html`<button type="button" class="row pg-sow-row" role="checkbox" aria-checked="${!!selected}" data-sid="${sow.id}">${inner}</button>`;
  return html`<a class="row pg-sow-row" href="#/l/${snap.lid}/sow/${sow.id}" data-sid="${sow.id}">${inner}</a>`;
}

/** Room tile (§3.1 / §5.1). x = one roomFacts entry. */
export function roomTile(lid, x, { full = false } = {}) {
  const t = x.tile; const empty = !x.batch && !x.sowsIn.length && !x.litters.length;
  return html`<a class="pg-room ${t.level} ${empty ? "pg-empty" : ""}" href="#/l/${lid}/room/${x.room.id}" data-room="${x.room.id}">
    <span class="rn"><span>${x.room.name}</span>${t.level === "late" ? raw(icon("alert")) : ""}</span>
    <span class="rs">${t.stage}</span>
    ${full && x.space ? html`<span class="badge ${x.space.level}">${x.space.word === "✓" ? `Space ✓ · ${x.f.onFarm}/${x.space.allowed}` : `${x.space.word} · ${x.f.onFarm}/${x.space.allowed}`}</span>` : ""}
    <span class="rk ${t.keyLevel}">${t.key}</span></a>`;
}

/** Generic list picker sheet. items: [{ id, html, search }]. Resolves id or null. */
export function pickFrom({ title, items, placeholder = "Search", empty = "Nothing to choose." }) {
  const body = el(html`<div class="picker">${items.length > 8 ? html`<div class="pg-search">${raw(icon("search"))}<input type="search" inputmode="search" placeholder="${placeholder}" aria-label="${placeholder}" data-q autocomplete="off"></div>` : ""}<div class="list" data-list style="margin-top:8px"></div></div>`);
  const paint = () => {
    const q = (body.querySelector("[data-q]")?.value || "").trim().toLowerCase();
    const rows = items.filter((i) => !q || String(i.search || "").toLowerCase().includes(q)).slice(0, 200);
    body.querySelector("[data-list]").replaceChildren(el(html`<div style="display:contents">${rows.length ? rows.map((i) => html`<button type="button" class="row" data-pick="${i.id}">${raw(i.html)}</button>`) : html`<p class="hint" style="padding:16px">${empty}</p>`}</div>`));
  };
  body.querySelector("[data-q]")?.addEventListener("input", paint);
  body.addEventListener("click", (e) => { const b = e.target.closest("[data-pick]"); if (b) sh.close(b.dataset.pick, { force: true }); });
  const sh = openSheet({ title, body });
  paint();
  return sh.done.then((r) => (typeof r === "string" ? r : null));
}
const rowHtml = (no, primary, secondary = "", right = "") => `<span class="pg-no">${esc(no)}</span><span class="main"><span class="primary">${esc(primary)}</span>${secondary ? `<span class="secondary">${esc(secondary)}</span>` : ""}</span>${right}`;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** Pick one breeding pig (sow number keypad first). filter(sow, cycle) */
export function pickSow(snap, { title = "Choose a sow", filter = () => true } = {}) {
  const list = snap.data.sows.filter(onFarm).sort(sortByNo).map((s) => ({ s, c: cycleOf(snap.s, snap.ix, s, snap.today) })).filter((x) => filter(x.s, x.c));
  return pickFrom({ title, placeholder: "Sow number or tag", empty: "No sows to choose.", items: list.map(({ s, c }) => ({ id: s.id, search: `${s.sowNo} ${s.tag || ""}`, html: rowHtml(sowLabel(s), `P${c.parity} · ${s.type === "gilt" && !c.litters.length ? "gilt" : c.status}`, sowLine(c, snap.ix, (id) => batchName(snap.ix.batches.get(id)))) })) });
}
/** Pick a room. filter(room, facts?) */
export function pickRoom(snap, { title = "Choose a room", filter = () => true, facts = [] } = {}) {
  const rooms = snap.data.rooms.filter((r) => !r.deleted && filter(r, facts.find((x) => x.room.id === r.id)));
  return pickFrom({ title, empty: "No rooms to choose. Add rooms in More → Rooms and houses.", items: rooms.map((r) => { const f = facts.find((x) => x.room.id === r.id); return { id: r.id, search: `${r.name} ${r.house || ""}`, html: `<span class="tile">${icon("farm")}</span><span class="main"><span class="primary">${esc(r.name)}</span><span class="secondary">${esc([KIND_NAME[r.kind], f?.tile?.stage].filter(Boolean).join(" · "))}</span></span>` }; }) });
}
/** Pick a growing batch. */
export function pickBatch(snap, { title = "Choose a batch", filter = (b) => !b.closed } = {}) {
  const bs = snap.data.batches.filter((b) => filter(b) && (b.numberIn != null || b.inDate)).sort((a, b) => b.no - a.no);
  return pickFrom({ title, empty: "No growing batches.", items: bs.map((b) => { const f = snap.c.bf.get(b.id); const r = snap.ix.rooms.get(b.roomId); return { id: b.id, search: `B${b.no} ${r?.name || ""}`, html: rowHtml(batchName(b), r?.name || b.stage || "", f ? `${f.onFarm} pigs · day ${f.days}` : "") }; }) });
}

/** Sparkline (7 values, nulls skipped). */
export function spark(vals) {
  const v = vals.filter((x) => x != null); if (v.length < 2) return html`<span class="ink-3" style="font-size:13px">—</span>`;
  const max = Math.max(...v), min = Math.min(...v); const w = 96, h = 28, n = vals.length - 1;
  const pts = vals.map((x, i) => (x == null ? null : `${(i / n) * w} ${h - 3 - ((x - min) / (max - min || 1)) * (h - 6)}`)).filter(Boolean);
  return html`<svg class="pg-spark" viewBox="0 0 ${w} ${h}" aria-hidden="true">${raw(`<path d="M${pts.join("L")}"/>`)}</svg>`;
}
/** Bars with an optional dashed target line and an optional outline series (guide). */
export function barChart(values, { target = null, labels = [], outline = null, max = null, fmt = (x) => x } = {}) {
  const all = [...values, ...(outline || []), target || 0].filter((x) => x != null);
  const m = max || Math.max(1, ...all) * 1.15; const w = 320, h = 100, n = values.length || 1, bw = (w / n) * 0.62;
  const y = (v) => h - ((v || 0) / m) * h;
  return html`<svg class="pg-chart" viewBox="0 0 ${w} ${h + 16}" role="img" aria-label="${labels.map((l, i) => `${l}: ${values[i] == null ? "none" : fmt(values[i])}`).join(", ")}">
    ${raw(values.map((v, i) => `<rect x="${i * (w / n) + (w / n - bw) / 2}" y="${y(v)}" width="${bw}" height="${h - y(v)}" rx="4" fill="var(--pigs)" opacity="${v == null ? 0.15 : 1}"/>`).join(""))}
    ${outline ? raw(outline.map((v, i) => `<rect x="${i * (w / n) + (w / n - bw) / 2 - 2}" y="${y(v)}" width="${bw + 4}" height="${h - y(v)}" rx="4" fill="none" stroke="var(--ink-3)" stroke-width="1.5" stroke-dasharray="3 3"/>`).join("")) : ""}
    ${target != null ? raw(`<path d="M0 ${y(target)}H${w}" stroke="var(--ink-3)" stroke-dasharray="4 4" stroke-width="1.5"/>`) : ""}
    ${raw(labels.map((l, i) => `<text x="${i * (w / n) + w / n / 2}" y="${h + 13}" text-anchor="middle">${esc(l)}</text>`).join(""))}</svg>`;
}
/** Two-line chart (e.g. FCR and DLWG per batch) scaled independently. */
export function lineChart(series, { labels = [] } = {}) {
  const w = 320, h = 90; const n = Math.max(1, labels.length - 1);
  const paths = series.map((s) => { const v = s.values.filter((x) => x != null); const max = Math.max(...v), min = Math.min(...v); const pts = s.values.map((x, i) => (x == null ? null : `${(i / n) * w} ${h - 6 - ((x - min) / (max - min || 1)) * (h - 14)}`)).filter(Boolean); return pts.length ? `<path d="M${pts.join("L")}" fill="none" stroke="${s.color}" stroke-width="2.5" ${s.dash ? 'stroke-dasharray="5 4"' : ""}/>` : ""; }).join("");
  return html`<svg class="pg-chart" viewBox="0 0 ${w} ${h + 16}" aria-hidden="true">${raw(paths)}${raw(labels.map((l, i) => `<text x="${(i / n) * w}" y="${h + 13}" text-anchor="${i === 0 ? "start" : i === labels.length - 1 ? "end" : "middle"}">${esc(l)}</text>`).join(""))}</svg>`;
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
  return `<div class="ph"><b>${esc(doc.title)}</b><span>${(doc.top || []).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join(" · ")}</span></div>
    <table><thead><tr>${doc.headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${doc.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${doc.headers.length}">Nothing recorded yet.</td></tr>`}</tbody></table>
    <div class="pf">${esc(doc.note || "")} Printed from Farm Ledger on ${new Date().toLocaleDateString("en-GB")}.</div>`;
}
export function csvDownload(doc) {
  const q = (s) => { s = String(s == null ? "" : s); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  download(`${doc.title.replace(/[^\w]+/g, "-").toLowerCase()}.csv`, [doc.headers, ...doc.rows].map((r) => r.map(q).join(",")).join("\n"), "text/csv");
}
/** Print / CSV buttons wired to a doc. */
export function docButtons(doc, { csv = true } = {}) {
  const node = el(html`<div class="pg-acts"><button type="button" class="btn secondary" data-print>${raw(icon("print"))}Print or PDF</button>${csv ? html`<button type="button" class="btn secondary" data-csv>${raw(icon("download"))}CSV</button>` : ""}</div>`);
  node.querySelector("[data-print]").onclick = () => printDoc(typeof doc === "function" ? doc() : doc);
  node.querySelector("[data-csv]")?.addEventListener("click", () => csvDownload(typeof doc === "function" ? doc() : doc));
  return node;
}
export { sowLabel, esc, rowHtml };
