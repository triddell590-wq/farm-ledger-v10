// Shared Broilers UI pieces: the crop bar (signature), the house card, charts (weight vs objective,
// density with legal tiers, mortality with the legal line, EPEF history), number tiles, key/value
// rows, pills and print/CSV helpers. Styles: css/broilers.css (loaded once).
import { html, raw } from "../../core/html.js";
import { el } from "../../ui/dom.js";
import { icon, FL_ICONS } from "../../ui/icons.js";
import { download } from "../../ui/download.js";
import { dayLabel, whenLabel, timePart } from "./model/time.js";

Object.assign(FL_ICONS, {
  house: '<path d="M3.5 11 12 4.5l8.5 6.5"/><path d="M5.5 9.5V20h13V9.5"/><path d="M9 20v-6h6v6"/>',
  chart: '<path d="M4 20V4M4 20h16"/><path d="M7.5 15l3.5-4 3 2.5 5-6.5"/>',
  bell: '<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2h-14z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  bolt: '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/>',
});
for (const [k, v] of Object.entries({ phone: '<path d="M5 4.5h3.5l1.7 4.3-2.2 1.4a11 11 0 0 0 5.8 5.8l1.4-2.2 4.3 1.7V19a1.5 1.5 0 0 1-1.6 1.5A15.5 15.5 0 0 1 3.5 6.1 1.5 1.5 0 0 1 5 4.5z"/>', left: '<path d="M15 5l-7 7 7 7"/>', right: '<path d="m9 5 7 7-7 7"/>' })) if (!FL_ICONS[k]) FL_ICONS[k] = v;

let cssDone = false;
export function ensureCss() {
  if (cssDone || typeof document === "undefined") return; cssDone = true;
  const l = document.createElement("link"); l.rel = "stylesheet"; l.href = "css/broilers.css"; document.head.appendChild(l);
}
export const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const dm = dayLabel; export const when = whenLabel; export const hm = timePart;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const d2 = (iso) => (iso ? `${+iso.slice(8, 10)} ${MON[+iso.slice(5, 7) - 1]}` : "");
export const n0 = (n) => (n == null || Number.isNaN(+n) ? "—" : Math.round(+n).toLocaleString("en-GB"));
export const n1 = (n, dp = 1) => (n == null || Number.isNaN(+n) ? "—" : (+n).toFixed(dp));
export const pc = (n, dp = 1) => (n == null || Number.isNaN(+n) ? "—" : `${(+n).toFixed(dp)}%`);
export const pounds = (n, dp = 0) => (n == null || Number.isNaN(+n) ? "—" : `${+n < 0 ? "−" : ""}£${Math.abs(+n).toLocaleString("en-GB", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`);
export const plural = (n, one, many = one + "s") => `${n0(n)} ${+n === 1 ? one : many}`;

export function pill(level, text, iconName) {
  const ic = iconName || (level === "late" ? "alert" : level === "due" ? "clock" : level === "ok" ? "check" : null);
  return html`<span class="pill ${level}">${ic ? raw(icon(ic)) : ""}${text}</span>`;
}
export function tile({ label, value, delta = "", tone = "", formula = "", href = "" }) {
  const inner = html`<span class="label">${label}</span><span class="value ${tone}">${raw(String(value))}</span>${delta ? html`<span class="delta">${delta}</span>` : ""}`;
  if (href) return html`<a class="num-tile" href="${href}">${inner}</a>`;
  if (formula) return html`<button type="button" class="num-tile" data-f="${formula}">${inner}</button>`;
  return html`<div class="num-tile">${inner}</div>`;
}
export function kvRows(rows) {
  return html`<div class="list">${rows.filter(Boolean).map(([k, v, tone, href, sub]) => href
    ? html`<a class="row no-lead br-kv" href="${href}"><span class="main"><span class="primary">${k}</span>${sub ? html`<span class="secondary">${sub}</span>` : ""}</span><span class="v ${tone || ""}">${v}</span><span class="chev">${raw(icon("chevron"))}</span></a>`
    : html`<div class="row no-lead br-kv"><span class="main"><span class="primary">${k}</span>${sub ? html`<span class="secondary">${sub}</span>` : ""}</span><span class="v ${tone || ""}">${v}</span></div>`)}</div>`;
}
export const linkRow = (href, title, sub = "", right = "", ic = "") => html`<a class="row${ic ? "" : " no-lead"}" href="${href}">${ic ? html`<span class="tile">${raw(icon(ic))}</span>` : ""}<span class="main"><span class="primary">${title}</span>${sub ? html`<span class="secondary">${sub}</span>` : ""}</span>${right}<span class="chev">${raw(icon("chevron"))}</span></a>`;
export const okCard = (text) => html`<div class="card pad t-callout ink-2">${text}</div>`;
export const note = (text) => html`<p class="br-note">${text}</p>`;
export const lawNote = (text) => html`<p class="br-law">${text}</p>`;
export const warnCard = (text, level = "") => html`<div class="warn-card ${level}">${raw(icon("alert"))}<span>${text}</span></div>`;
/** Tap a [data-f] tile to show its formula with this crop's numbers in [data-formula]. */
export function wireFormulas(node) {
  const out = node.querySelector("[data-formula]"); if (!out) return;
  node.querySelectorAll("[data-f]").forEach((t) => (t.onclick = () => { const same = out.textContent === t.dataset.f && !out.hidden; out.hidden = same; out.textContent = t.dataset.f; }));
}

// ---- the crop bar (signature, §3.1): a 6-week bar to today, thin and clear as rings, brooding
// tint, Salmonella window bracket above, milestones (7-day, weighs) as small rings ----
export function cropBar({ day, clearDay, events = [], salm = null, weighDays = [], ariaLabel = "" }) {
  const W = 320, end = Math.max(42, clearDay + 2); const x = (d) => 8 + (Math.max(0, Math.min(end, d)) / end) * (W - 16);
  const today = Math.max(0, Math.min(day, clearDay));
  const ev = events.filter((e) => e.day <= end);
  const labels = [[0, "0"], [7, "7"], [14, "14"]];
  if (day >= 0 && day <= clearDay) labels.push([day, "Today"]);
  for (const e of ev) labels.push([e.day, e.kind === "clear" ? "Clear" : "Thin"]);
  const used = []; const lab = labels.sort((a, b) => a[0] - b[0]).filter(([d, l]) => { if (l !== "Today" && used.some((u) => Math.abs(x(u) - x(d)) < 30)) return false; used.push(d); return true; });
  return html`<svg class="br-cropbar" viewBox="0 0 ${W} 60" role="img" aria-label="${ariaLabel}">${raw(`
    ${salm ? `<path d="M${x(salm.from)} 14V9H${x(salm.to)}V14" fill="none" stroke="var(--info)" stroke-width="1.5"/><text x="${(x(salm.from) + x(salm.to)) / 2}" y="6" text-anchor="middle" class="sw">Salmonella window</text>` : ""}
    <rect x="${x(0)}" y="19" width="${x(clearDay) - x(0)}" height="12" rx="6" fill="var(--surface-2)"/>
    <rect x="${x(0)}" y="19" width="${x(3) - x(0)}" height="12" rx="6" fill="var(--broilers-soft)"/>
    ${day > 0 ? `<rect class="fill" x="${x(0)}" y="19" width="${Math.max(12, x(today) - x(0))}" height="12" rx="6" fill="var(--broilers)"/>` : ""}
    ${weighDays.filter((d) => d < clearDay).map((d) => `<circle cx="${x(d)}" cy="25" r="3" fill="${d <= day ? "var(--surface)" : "var(--broilers-soft)"}" stroke="var(--broilers)" stroke-width="1.5"/>`).join("")}
    ${ev.map((e) => `<circle cx="${x(e.day)}" cy="25" r="7" fill="${e.done ? "var(--broilers)" : "var(--surface)"}" stroke="var(--broilers)" stroke-width="2.5"/>`).join("")}
    ${lab.map(([d, l]) => `<text x="${x(d)}" y="52" text-anchor="${d === 0 ? "start" : d >= clearDay ? "end" : "middle"}" class="${l === "Today" ? "now" : ""}">${esc(l)}</text>`).join("")}`)}</svg>`;
}

// ---- charts ----
const axisDays = (W, H, x, maxDay) => [0, 7, 14, 21, 28, 35, 42].filter((d) => d <= maxDay).map((d) => `<text x="${x(d)}" y="${H + 14}" text-anchor="middle">${d}</text>`).join("");
/** Weight vs breed objective: standard (dashed), sample weighs (dots ± sd), projection (dotted). */
export function growthChart({ std, weighs = [], proj = [], maxDay = 42, aria = "" }) {
  const W = 330, H = 170, top = Math.max(...std.map((p) => p.g), ...proj.map((p) => p.g), 1000) * 1.06;
  const x = (d) => 30 + (d / maxDay) * (W - 38); const y = (g) => H - (g / top) * (H - 10);
  const line = (pts) => pts.map((p, i) => `${i ? "L" : "M"}${x(p.d).toFixed(1)} ${y(p.g).toFixed(1)}`).join("");
  const grid = [1000, 2000, 3000, 4000].filter((g) => g < top).map((g) => `<path d="M30 ${y(g)}H${W}" stroke="var(--hair)"/><text x="0" y="${y(g) + 4}">${g / 1000} kg</text>`).join("");
  const dots = weighs.map((w) => `${w.sd ? `<path d="M${x(w.d)} ${y(w.g - w.sd)}V${y(w.g + w.sd)}" stroke="var(--broilers)" stroke-width="1.5"/>` : ""}<circle cx="${x(w.d)}" cy="${y(w.g)}" r="4.5" fill="var(--broilers)"/>`).join("");
  return html`<svg class="br-chart" viewBox="0 0 ${W} ${H + 18}" role="img" aria-label="${aria}">${raw(`${grid}<path d="${line(std)}" fill="none" stroke="var(--ink-3)" stroke-width="2" stroke-dasharray="5 4"/>${proj.length ? `<path d="${line(proj)}" fill="none" stroke="var(--broilers)" stroke-width="2.5" stroke-dasharray="2 4" stroke-linecap="round"/>` : ""}${dots}${axisDays(W, H, x, maxDay)}`)}</svg>`;
}
/** Density by day with the legal tier lines (33 / 38 farm limit / 39 / 42). */
export function densityChart({ points, limit = 38, thinDay = null, maxDay = 42, aria = "" }) {
  const W = 330, H = 170, top = 46; const x = (d) => 30 + (d / maxDay) * (W - 38); const y = (v) => H - (v / top) * (H - 10);
  const tiers = [[33, "", "var(--ink-3)", 1.2, "4 4"], [limit, `${limit} farm limit`, "var(--due)", 2, ""], [39, "", "var(--ink-3)", 1.2, "4 4"], [42, "42 legal max", "var(--late)", 1.2, "4 4"]];
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.day).toFixed(1)} ${y(p.kg).toFixed(1)}`).join("");
  return html`<svg class="br-chart" viewBox="0 0 ${W} ${H + 18}" role="img" aria-label="${aria}">${raw(`${tiers.map(([v, l, c, w, dash]) => `<path d="M30 ${y(v)}H${W}" stroke="${c}" stroke-width="${w}" ${dash ? `stroke-dasharray="${dash}"` : ""}/>${l ? `<text x="${W - 2}" y="${v === limit ? y(v) + 13 : y(v) - 4}" text-anchor="end" style="fill:${c}">${l}</text>` : ""}`).join("")}${[10, 20, 30].map((v) => `<text x="0" y="${y(v) + 4}">${v}</text>`).join("")}<path d="${path}" fill="none" stroke="var(--broilers)" stroke-width="3" stroke-linejoin="round"/>${thinDay != null ? `<path d="M${x(thinDay)} ${y(0)}V${y(top)}" stroke="var(--broilers)" stroke-width="1" stroke-dasharray="2 3"/>` : ""}${axisDays(W, H, x, maxDay)}`)}</svg>`;
}
/** Mortality: daily bars, cumulative line, 0.3 %/24 h reference, legal line where relevant. */
export function mortChart({ days, maxDay = 42, legal = false, aria = "" }) {
  const W = 330, H = 140; const x = (d) => 30 + (d / maxDay) * (W - 38);
  const maxDaily = Math.max(0.35, ...days.map((d) => d.pct)); const yd = (v) => H - (v / (maxDaily * 1.15)) * (H - 10);
  const maxCum = Math.max(5.5, ...days.map((d) => d.cum), legal ? 1 + 0.06 * maxDay : 0); const yc = (v) => H - (v / maxCum) * (H - 10);
  const bw = Math.max(2, (W - 38) / maxDay - 2);
  const bars = days.map((d) => `<rect x="${x(d.day) - bw / 2}" y="${yd(d.pct)}" width="${bw}" height="${H - yd(d.pct)}" rx="1.5" fill="${d.pct > 0.3 ? "var(--late)" : "var(--broilers)"}" opacity=".75"/>`).join("");
  const cum = days.map((d, i) => `${i ? "L" : "M"}${x(d.day).toFixed(1)} ${yc(d.cum).toFixed(1)}`).join("");
  const lg = legal ? `<path d="M${x(0)} ${yc(1)}L${x(maxDay)} ${yc(1 + 0.06 * maxDay)}" stroke="var(--late)" stroke-width="1.5" stroke-dasharray="5 4"/><text x="${W - 2}" y="${yc(1 + 0.06 * maxDay) - 4}" text-anchor="end" style="fill:var(--late-ink)">1% + 0.06% × age</text>` : "";
  return html`<svg class="br-chart" viewBox="0 0 ${W} ${H + 18}" role="img" aria-label="${aria}">${raw(`<path d="M30 ${yd(0.3)}H${W}" stroke="var(--due)" stroke-dasharray="3 3"/><text x="32" y="${yd(0.3) - 4}" style="fill:var(--due-ink)">0.3% a day</text><path d="M30 ${yc(5)}H${W}" stroke="var(--ink-3)" stroke-dasharray="2 4"/><text x="${W - 2}" y="${yc(5) - 4}" text-anchor="end">5% crop</text>${bars}<path d="${cum}" fill="none" stroke="var(--ink)" stroke-width="2"/>${lg}${axisDays(W, H, x, maxDay)}`)}</svg>`;
}
/** Bars (e.g. EPEF per crop) with an optional dashed reference line and an optional second series line. */
export function barChart(values, { ref = null, labels = [], min = 0, line = null, fmt = (v) => v } = {}) {
  const W = 320, H = 100, n = values.length || 1; const vals = values.filter((v) => v != null);
  const top = Math.max(ref || 0, ...vals) * 1.06 || 1; const bot = Math.min(min, ...vals); const y = (v) => H - ((v - bot) / (top - bot || 1)) * H; const bw = (W / n) * 0.6;
  const ln = line && line.filter((v) => v != null).length > 1 ? (() => { const lv = line.filter((v) => v != null); const lt = Math.max(...lv) * 1.05, lb = Math.min(...lv) * 0.95; return `<path d="M${line.map((v, i) => (v == null ? null : `${i * (W / n) + W / n / 2} ${H - ((v - lb) / (lt - lb || 1)) * (H - 10) - 5}`)).filter(Boolean).join("L")}" fill="none" stroke="var(--ink)" stroke-width="2"/>`; })() : "";
  return html`<svg class="br-chart" viewBox="0 0 ${W} ${H + 16}" role="img" aria-label="${labels.map((l, i) => `${l}: ${values[i] == null ? "none" : fmt(values[i])}`).join(", ")}">${raw(`${values.map((v, i) => (v == null ? "" : `<rect x="${i * (W / n) + (W / n - bw) / 2}" y="${y(v)}" width="${bw}" height="${H - y(v)}" rx="5" fill="var(--broilers)"/>`)).join("")}${ref != null ? `<path d="M0 ${y(ref)}H${W}" stroke="var(--ink-3)" stroke-dasharray="4 4" stroke-width="1.5"/>` : ""}${ln}${labels.map((l, i) => `<text x="${i * (W / n) + W / n / 2}" y="${H + 13}" text-anchor="middle">${esc(l)}</text>`).join("")}`)}</svg>`;
}

// ---- print / CSV (design/00 §6.18) ----
export function printDoc(doc) {
  const w = document.createElement("div"); w.className = "print-view print-float"; w.innerHTML = doc.__html || toHtmlTable(doc);
  document.body.appendChild(w); document.body.classList.add("printing");
  const done = () => { w.remove(); document.body.classList.remove("printing"); removeEventListener("afterprint", done); };
  addEventListener("afterprint", done);
  setTimeout(() => { try { window.print(); } catch (e) { done(); } setTimeout(() => { if (w.isConnected && !matchMedia("print").matches) done(); }, 1500); }, 50);
}
export function toHtmlTable(doc) {
  return `<div class="ph"><b>${esc(doc.title)}</b><span>${(doc.top || []).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join(" · ")}</span></div>
    ${(doc.tables || [doc]).map((t) => `${t.sub ? `<h3>${esc(t.sub)}</h3>` : ""}<table><thead><tr>${t.headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${t.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${t.headers.length}">Nothing recorded yet.</td></tr>`}</tbody></table>`).join("")}
    <div class="pf">${esc(doc.note || "")} Printed from Farm Ledger on ${new Date().toLocaleDateString("en-GB")}.</div>`;
}
export function csvDownload(doc) {
  const q = (s) => { s = String(s == null ? "" : s); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const t = doc.tables ? doc.tables[0] : doc;
  download(`${doc.title.replace(/[^\w]+/g, "-").toLowerCase()}.csv`, [t.headers, ...t.rows].map((r) => r.map(q).join(",")).join("\n"), "text/csv");
}
export function docButtons(doc, { csv = true } = {}) {
  const node = el(html`<div class="br-acts"><button type="button" class="btn secondary" data-print>${raw(icon("print"))}Print or PDF</button>${csv ? html`<button type="button" class="btn secondary" data-csv>${raw(icon("download"))}CSV</button>` : ""}</div>`);
  node.querySelector("[data-print]").onclick = () => printDoc(typeof doc === "function" ? doc() : doc);
  node.querySelector("[data-csv]")?.addEventListener("click", () => csvDownload(typeof doc === "function" ? doc() : doc));
  return node;
}
/** Share text (Web Share where available, else copy to the clipboard). */
export async function shareText(title, text) {
  try { if (navigator.share) { await navigator.share({ title, text }); return "shared"; } } catch (e) { if (e?.name === "AbortError") return null; }
  try { await navigator.clipboard.writeText(text); return "copied"; } catch (e) { return null; }
}
