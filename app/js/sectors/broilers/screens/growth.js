// Broilers → Growth (design/15 §6): weight against the breed objective (sample weighs with ±1 sd,
// the projection dotted to thin and clear — an estimate, and it says so), the other lines
// (daily gain, feed and water per bird, water:feed), a density summary that opens the planner,
// and the mortality chart with the 0.3 %/24 h line, the 5% crop tolerance and the legal line.
import { html, raw } from "../../../core/html.js";
import { icon } from "../../../ui/icons.js";
import { canWrite } from "../../../core/policy.js";
import { largeTitle, groupLabel, emptyState, backLink } from "../../../screens/common.js";
import { liveScreen, flowArg } from "./live.js";
import { growthChart, densityChart, mortChart, n0, n1, pc, dm, note, okCard } from "../ui.js";
import { currentCrop, cropDay, clearDayOf, cropEvents, dateOfDay, deathsByDate, aliveStart, cumMortPct, waterOn, listOf } from "../model/crop.js";
import { stdOf, stdWt, stdGain, stdFeed, estWeight, weighSessions, performance } from "../model/growth.js";
import { projection, farmLimit, crossDay, plannedMax, densityNeeds } from "../model/density.js";

const picked = new Map(); // ledger id -> crop id last viewed

/** The crop a Growth view shows: the route's, the last viewed, else the first house with a crop. */
export function pickCrop(snap, cropId) {
  const { ix } = snap; const cur = ix.houses.map((h) => currentCrop(ix, h.id)).filter((c) => c && c.placedDate <= snap.today);
  const id = cropId || picked.get(snap.lid);
  const c = (id && ix.cropById.get(id)) || cur[0] || ix.crops.slice(-1)[0] || null;
  if (c) picked.set(snap.lid, c.id);
  return { crop: c, current: cur };
}
export function houseChips(snap, crop, current, base = "growth") {
  if (current.length < 2) return "";
  return html`<div class="chips br-hchips">${current.map((c) => html`<a class="chip" role="radio" aria-checked="${c.id === crop.id}" href="#/l/${snap.lid}/${base}/${c.id}"><span class="chk">${raw(icon("check"))}</span>${snap.ix.houseById.get(c.houseId)?.name || ""}</a>`)}</div>`;
}

export default async function growth(ctx) {
  const cropId = ctx.match?.groups?.cropId; const isTab = !ctx.match;
  return liveScreen(ctx, {
    title: "Growth", tab: "growth", depth: isTab ? 0 : 1, paint: (snap) => paint(snap, cropId, isTab),
    after: (node, snap, repaint) => node.querySelectorAll("[data-line]").forEach((b) => (b.onclick = () => { lineSel.set(snap.lid, b.dataset.line); repaint(); })),
    mounted: ctx.open === "weigh" ? async (snap) => { const { crop } = pickCrop(snap, cropId); if (crop && !crop.clearedDate) (await import("../flows/growth.js")).weighFlow(snap, { cropId: crop.id }); } : undefined,
  });
}

const LINES = [["weight", "Weight"], ["gain", "Daily gain"], ["feed", "Feed g/bird/day"], ["water", "Water L/1,000"], ["ratio", "Water:feed"]];
const lineSel = new Map();

function paint(snap, cropId, isTab) {
  const { ix, s, today, lid } = snap; const L = (h) => `#/l/${lid}/${h}`;
  const { crop, current } = pickCrop(snap, cropId);
  if (!crop) return html`<div>${largeTitle("Growth")}${emptyState({ sector: "broilers", title: "No crop in the houses", body: "Start a crop when chicks are placed. Day 0 is placement day — the growth curve starts from there.", action: ix.houses.length && canWrite(snap.role, "crops") ? "Start a crop" : null, actAttr: `data-flow="startCrop"` })}</div>`;
  const house = ix.houseById.get(crop.houseId) || {}; const std = stdOf(crop, s);
  const asOf = crop.clearedDate || today; const day = Math.max(0, cropDay(crop, asOf)); const clearDay = clearDayOf(ix, crop, s);
  const evs = cropEvents(ix, crop, s); const thin = evs.find((e) => e.kind === "thin" && !e.done);
  const maxDay = Math.max(42, clearDay + 2);
  const stdPts = []; for (let d = 0; d <= maxDay; d++) stdPts.push({ d, g: stdWt(std, d) });
  const ws = weighSessions(ix, crop);
  const proj = []; if (!crop.clearedDate) for (let d = day; d <= clearDay; d++) proj.push({ d, g: estWeight(ix, crop, std, d, today) });
  const perf = performance(ix, crop, std, asOf);
  const estToday = estWeight(ix, crop, std, day, asOf); const vs = (estToday / stdWt(std, day) - 1) * 100;
  const area = +house.usableM2 || 0;
  const sel = lineSel.get(lid) || "weight";
  const back = isTab ? "" : backLink(L("growth"), "Growth");
  return html`<div>${back}
    ${largeTitle("Growth", `${house.name} · ${std.hybrid} · ${area ? n0(area) + " m² usable" : "add usable m²"}${crop.clearedDate ? ` · crop ${crop.no || ""} cleared ${dm(crop.clearedDate)}` : ""}`)}
    ${houseChips(snap, crop, current)}
    <div class="section">${groupLabel(`Weight vs ${std.hybrid} objective`)}
      <div class="chips br-lines" role="radiogroup">${LINES.map(([k, l]) => html`<button type="button" class="chip" role="radio" aria-checked="${k === sel}" data-line="${k}">${l}</button>`)}</div>
      <div class="card br-chartcard">${sel === "weight" ? growthChart({ std: stdPts, weighs: ws.map((w) => ({ d: w.day, g: w.mean, sd: w.mean && w.cv ? (w.cv / 100) * w.mean : 0 })), proj, maxDay, aria: `Sample weights against the ${std.hybrid} objective` }) : seriesChart(snap, crop, std, sel, maxDay)}
        <p class="br-cap">${sel === "weight" ? `Dots: your sample weighs (±1 sd). Dashed grey: ${std.edition}. Dotted: projection to clear-out — an estimate from the last ${perf.method === "gain" ? "weekly gain" : "weigh"}.` : seriesCaption(sel, std)}</p></div>
      ${sel === "weight" ? html`<div class="list br-kvs">
        <div class="row no-lead br-kv"><span class="main"><span class="primary">${crop.clearedDate ? `At clear-out (day ${day})` : "Today"} est.</span></span><span class="v ${vs < -s.weightAlertPct ? "due" : ""}">${n0(estToday)} g · ${vs >= 0 ? "+" : "−"}${Math.abs(vs).toFixed(0)}%</span></div>
        <div class="row no-lead br-kv"><span class="main"><span class="primary">${std.hybrid} at day ${day}</span></span><span class="v">${n0(stdWt(std, day))} g</span></div>
        ${!crop.clearedDate && thin ? html`<div class="row no-lead br-kv"><span class="main"><span class="primary">At thin (day ${thin.day})</span></span><span class="v">${n0(estWeight(ix, crop, std, thin.day, today))} g est.</span></div>` : ""}
        ${!crop.clearedDate ? html`<div class="row no-lead br-kv"><span class="main"><span class="primary">At clear (day ${clearDay})</span><span class="secondary">${std.hybrid} ${n0(stdWt(std, clearDay))} g</span></span><span class="v">${n0(estWeight(ix, crop, std, clearDay, today))} g est.</span></div>` : ""}</div>` : ""}
      ${!ws.length ? html`<div class="br-empty-line">${raw(icon("scale"))}<span><b>Weigh a sample to see the curve</b>Weigh 100 birds on day 7 and each week after. Your crop line appears over the ${std.hybrid} objective.</span></div>` : html`<div class="list" style="margin-top:12px">${ws.slice().reverse().slice(0, 6).map((w) => html`<div class="row no-lead br-kv"><span class="main"><span class="primary">Day ${w.day} · ${n0(w.mean)} g</span><span class="secondary">${w.n} birds${w.cv != null ? ` · CV ${n1(w.cv)}% · uniformity ${pc(w.uniformity, 0)}` : ""}${w.source === "weigher" ? " · weigher file" : ""}</span></span><span class="v ${w.mean / stdWt(std, w.day) < 1 - s.weightAlertPct / 100 ? "due" : ""}">${((w.mean / stdWt(std, w.day) - 1) * 100 >= 0 ? "+" : "−") + Math.abs((w.mean / stdWt(std, w.day) - 1) * 100).toFixed(0)}%</span></div>`)}</div>`}
      ${!crop.clearedDate && canWrite(snap.role, "weighs") ? html`<button type="button" class="btn secondary br-mt" data-flow="weigh" data-arg="${flowArg({ cropId: crop.id })}">${raw(icon("scale"))}Sample weigh</button>` : ""}
      ${note(`Standard: ${std.edition}. FCRs and weights are only compared with their own hybrid's objective.`)}</div>
    ${area && !crop.clearedDate ? densitySummary(snap, crop, area) : ""}
    <div class="section">${groupLabel("Mortality")}${mortalityCard(snap, crop, area)}</div>
  </div>`;
}

function densitySummary(snap, crop, area) {
  const { ix, s, today, lid } = snap; const lim = farmLimit(s, crop);
  const p = projection(ix, crop, s, area, today); const cross = crossDay(ix, crop, s, area, today, lim);
  const mx = plannedMax(ix, crop, s, area, today); const n = densityNeeds(ix, crop, s, mx);
  const thin = cropEvents(ix, crop, s).find((e) => e.kind === "thin" && !e.done);
  const overPlanned = p.some((x) => x.day >= cropDay(crop, today) && x.kg > lim);
  return html`<div class="section">${groupLabel("Density", `farm limit ${lim} kg/m²`)}
    <a class="card br-chartcard br-link" href="#/l/${lid}/density/${crop.id}">${densityChart({ points: p, limit: lim, thinDay: thin?.day ?? null, maxDay: Math.max(42, p.length + 1), aria: "Projected stocking density with the legal tiers" })}
      <p class="br-cap">${overPlanned && cross != null ? html`<b class="due">Crosses ${lim} kg/m² on day ${cross} — thin by day ${cross}.</b> ` : html`<b>Planned maximum ${n1(mx)} kg/m²</b>${n.tier === "none" ? " · no DAERA notice needed. " : n.notifyOk ? " · DAERA told. " : html` · <b class="due">tell DAERA by ${dm(n.notifyBy)}</b>. `}`}Open the density planner ${raw(icon("chevron"))}</p></a></div>`;
}

export function mortalityCard(snap, crop, area) {
  const { ix, s } = snap; const end = crop.clearedDate || snap.today; const n = Math.max(0, cropDay(crop, end));
  const deaths = deathsByDate(ix, crop); const days = [];
  for (let d = 0; d <= n; d++) { const date = dateOfDay(crop, d); const a = aliveStart(ix, crop, date); const t = deaths.get(date)?.total || 0; days.push({ day: d, pct: a ? (t / a) * 100 : 0, cum: cumMortPct(ix, crop, date) }); }
  const legal = area ? densityNeeds(ix, crop, s, plannedMax(ix, crop, s, area, end)).needsApproval : false;
  const cum = cumMortPct(ix, crop, end); const m7 = cumMortPct(ix, crop, dateOfDay(crop, Math.min(7, n)));
  return html`<div class="card br-chartcard">${mortChart({ days, maxDay: Math.max(42, clearDayOf(ix, crop, s) + 2), legal, aria: `Daily mortality bars and cumulative line; crop mortality ${cum.toFixed(2)}%` })}
    <p class="br-cap">Bars: dead + culled each day (red over ${s.mortalitySpikePct}% — Red Tractor investigate). Line: crop mortality, now <b>${pc(cum, 2)}</b>; 7-day ${pc(m7, 2)}. Dotted: ${s.cropTolerancePct}% crop tolerance.${legal ? " Red dashed: the legal line 1% + 0.06% × age (crops above 39 kg/m²)." : ""}</p></div>`;
}

// ---- other lines (§6.1) ----
function series(snap, crop, std, kind) {
  const { ix } = snap; const end = crop.clearedDate || snap.today; const n = Math.max(0, cropDay(crop, end)); const out = [];
  if (kind === "gain") { const ws = weighSessions(ix, crop); for (let i = 1; i < ws.length; i++) { const dd = ws[i].day - ws[i - 1].day; if (dd > 0) out.push({ d: ws[i].day, v: (ws[i].mean - ws[i - 1].mean) / dd, std: (stdWt(std, ws[i].day) - stdWt(std, ws[i - 1].day)) / dd }); } return out; }
  for (let d = 1; d <= n; d++) {
    const date = dateOfDay(crop, d); const alive = aliveStart(ix, crop, date); const w = waterOn(ix, crop, date);
    const feed = listOf(ix.checks, crop.id).filter((x) => x.date === date && x.feedKg != null && x.feedKg !== "").reduce((t, x) => t + +x.feedKg, 0) || null;
    if (kind === "water" && w != null && alive) out.push({ d, v: (w / alive) * 1000 });
    if (kind === "feed" && feed && alive) out.push({ d, v: (feed / alive) * 1000, std: stdFeed(std, d) });
    if (kind === "ratio" && w != null && feed) out.push({ d, v: w / feed });
  }
  return out;
}
function seriesChart(snap, crop, std, kind, maxDay) {
  const pts = series(snap, crop, std, kind);
  if (!pts.length) return okCard(kind === "water" ? "Read the water meter on the AM check to see water per 1,000 birds." : kind === "gain" ? "Two sample weighs a few days apart give the daily gain." : "Feed per day comes from the controller import (or the feed figure on a check).");
  const W = 330, H = 150; const vals = pts.flatMap((p) => [p.v, p.std].filter((x) => x != null)); const top = Math.max(...vals) * 1.1 || 1;
  const x = (d) => 30 + (d / maxDay) * (W - 38); const y = (v) => H - (v / top) * (H - 10);
  const line = (k) => pts.filter((p) => p[k] != null).map((p, i) => `${i ? "L" : "M"}${x(p.d).toFixed(1)} ${y(p[k]).toFixed(1)}`).join("");
  const band = kind === "ratio" ? `<rect x="30" y="${y(2)}" width="${W - 30}" height="${y(1.6) - y(2)}" fill="var(--ok-soft)"/>` : "";
  const grid = [0.25, 0.5, 0.75].map((f) => `<text x="0" y="${y(top * f) + 4}">${(top * f).toFixed(top < 5 ? 1 : 0)}</text>`).join("");
  return html`<svg class="br-chart" viewBox="0 0 ${W} ${H + 18}" role="img" aria-label="${LINES.find((l) => l[0] === kind)[1]} by day">${raw(`${band}${grid}${pts.some((p) => p.std != null) ? `<path d="${line("std")}" fill="none" stroke="var(--ink-3)" stroke-width="2" stroke-dasharray="5 4"/>` : ""}<path d="${line("v")}" fill="none" stroke="var(--broilers)" stroke-width="2.5"/>${pts.map((p) => `<circle cx="${x(p.d)}" cy="${y(p.v)}" r="3" fill="var(--broilers)"/>`).join("")}${[0, 7, 14, 21, 28, 35, 42].filter((d) => d <= maxDay).map((d) => `<text x="${x(d)}" y="${H + 14}" text-anchor="middle">${d}</text>`).join("")}`)}</svg>`;
}
function seriesCaption(kind, std) {
  return { gain: `Grams a day between sample weighs. Dashed: ${std.hybrid} objective gain.`, feed: `Grams of feed per bird per day (controller or check figures).${std.days.some((r) => r.feedG) ? ` Dashed: ${std.hybrid} objective.` : ""}`, water: "Litres per 1,000 birds per day from the water meter.", ratio: "Litres of water per kg of feed. The green band (1.6–2.0) is normal guidance — a change often comes before a problem." }[kind];
}
export { stdGain };
