// Broilers → Crops (design/15 §9): the last cleared crop's results up top (EPEF, FCR,
// liveability, average weight — formula on tap), then history: EPEF bars with the FCR line,
// filtered by house or by winter / summer, crops a year and days empty, income per m² per year
// (money roles), and every crop with its results.
import { html, raw } from "../../../core/html.js";
import { icon } from "../../../ui/icons.js";
import { largeTitle, groupLabel, emptyState } from "../../../screens/common.js";
import { liveScreen } from "./live.js";
import { barChart, kvRows, n0, n1, pc, pounds, dm, d2, plural } from "../ui.js";
import { cropResults, incomePerM2 } from "../model/results.js";
import { cropDay, currentCrop } from "../model/crop.js";
import { addDays } from "../model/time.js";
import { resultsBlock } from "./result.js";

const filt = new Map();
const isWinter = (iso) => [10, 11, 12, 1, 2, 3].includes(+String(iso).slice(5, 7));

export default async function crops(ctx) {
  return liveScreen(ctx, { title: "Crops", tab: "crops", depth: 0, paint,
    after: (node, snap, repaint) => node.querySelectorAll("[data-filt]").forEach((b) => (b.onclick = () => { filt.set(snap.lid, b.dataset.filt); repaint(); })) });
}

function paint(snap) {
  const { ix, lid, today } = snap; const L = (h) => `#/l/${lid}/${h}`;
  const cleared = ix.crops.filter((c) => c.clearedDate);
  const growing = ix.houses.map((h) => currentCrop(ix, h.id)).filter(Boolean);
  const growingList = growing.length ? html`<div class="section">${groupLabel("Growing now")}<div class="list">${growing.map((c) => html`<a class="row" href="${L(`crop-result/${c.id}`)}"><span class="tile">${raw(icon("broilers"))}</span><span class="main"><span class="primary">Crop ${c.no || ""} · ${ix.houseById.get(c.houseId)?.name || ""}</span><span class="secondary">placed ${dm(c.placedDate)} · day ${cropDay(c, today)} · ${n0(c.placed)} chicks</span></span><span class="chev">${raw(icon("chevron"))}</span></a>`)}</div></div>` : "";
  if (!cleared.length) return html`<div>${largeTitle("Crops")}${emptyState({ sector: "broilers", title: "Your first crop results appear at clear-out", body: "FCR, liveability and EPEF are worked out for you from your checks and the processor's figures." })}${growingList}</div>`;
  const last = cleared.slice().sort((a, b) => a.clearedDate.localeCompare(b.clearedDate)).pop(); const lh = ix.houseById.get(last.houseId) || {};
  const f = filt.get(lid) || "all";
  const shown = cleared.filter((c) => f === "all" || (f === "winter" ? isWinter(c.placedDate) : f === "summer" ? !isWinter(c.placedDate) : c.houseId === f)).sort((a, b) => a.clearedDate.localeCompare(b.clearedDate));
  const res = shown.map((c) => ({ c, r: cropResults(ix, c) }));
  const recent = res.slice(-8);
  const yearAgo = addDays(today, -365); const yearCrops = cleared.filter((c) => c.clearedDate > yearAgo);
  const perHouse = ix.houses.map((h) => yearCrops.filter((c) => c.houseId === h.id).length);
  const emptyDays = res.map((x) => x.r.daysEmpty).filter((v) => v != null);
  const area = ix.houses.reduce((t, h) => t + (+h.usableM2 || 0), 0);
  const settles = (snap.finance || []).filter((x) => x.source === "settlement");
  const perM2 = snap.money ? incomePerM2(settles, area, today) : null;
  const avg = (k) => { const v = res.map((x) => x.r[k]).filter((y) => y != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  return html`<div>
    ${largeTitle(`Crop ${last.no || ""}`, `${lh.name || ""} · cleared ${dm(last.clearedDate)} · day ${cropDay(last, last.clearedDate)}`)}
    ${resultsBlock(snap, last, { compact: true })}
    <div class="section">${groupLabel("History")}
      <div class="chips br-lines" role="radiogroup">${[["all", "All"], ...ix.houses.map((h) => [h.id, h.name]), ["winter", "Winter"], ["summer", "Summer"]].map(([k, l]) => html`<button type="button" class="chip" role="radio" aria-checked="${k === f}" data-filt="${k}">${l}</button>`)}</div>
      ${recent.length ? html`<div class="card br-chartcard">${barChart(recent.map((x) => (x.r.epef ? Math.round(x.r.epef) : null)), { ref: 400, labels: recent.map((x) => (ix.houses.length > 1 && f === "all" ? `${x.c.no || ""}·H${(ix.houseById.get(x.c.houseId)?.name || "").replace(/\D+/g, "")}` : `C${x.c.no || ""}`)), min: Math.min(300, ...recent.map((x) => x.r.epef || 400)) - 20, line: recent.map((x) => x.r.fcr), fmt: (v) => `EPEF ${v}` })}
        <p class="br-cap">Bars: EPEF per crop. Dashed: 400 (the Aviagen "Ross 400 Club" mark — shown as a guide, not an endorsement). Line: FCR (lower is better).</p></div>` : html`<p class="br-quiet">No crops for this filter.</p>`}${recent.some((x) => x.r.footpad != null) ? html`<div class="card br-chartcard br-mt">${barChart(recent.map((x) => (x.r.footpad != null ? Math.round(x.r.footpad) : null)), { labels: recent.map((x) => (ix.houses.length > 1 && f === "all" ? `${x.c.no || ""}·H${(ix.houseById.get(x.c.houseId)?.name || "").replace(/\D+/g, "")}` : `C${x.c.no || ""}`)), fmt: (v) => `footpad ${v}` })}<p class="br-cap">Processor footpad score per crop (lower is better). Wet litter on the AM/PM checks usually comes before a high score.</p></div>` : ""}
      ${kvRows([["Average EPEF", avg("epef") ? n0(avg("epef")) : "—"], ["Average FCR", avg("fcr") ? avg("fcr").toFixed(2) : "—"], ["Average liveability", avg("liveability") ? pc(avg("liveability"), 1) : "—"],
        ["Crops in the last 12 months", ix.houses.length > 1 ? perHouse.map((n, i) => `${ix.houses[i].name.replace("House ", "H")} ${n}`).join(" · ") : String(perHouse[0] || 0)],
        ["Days empty between crops", emptyDays.length ? `avg ${n1(emptyDays.reduce((a, b) => a + b, 0) / emptyDays.length)} · shortest ${Math.min(...emptyDays)}` : "—", emptyDays.some((d) => d < 5) ? "due" : ""],
        snap.money ? ["Income per m² per year", perM2 != null && settles.length ? pounds(perM2, 2) : "—", "", null, "crop payments in the last 12 months ÷ usable area — compare contracts"] : null])}</div>
    ${growingList}
    <div class="section">${groupLabel("Every crop", plural(cleared.length, "crop"))}<div class="list">${cleared.slice().sort((a, b) => b.clearedDate.localeCompare(a.clearedDate)).map((c) => { const r = cropResults(ix, c); return html`<a class="row no-lead" href="${L(`crop-result/${c.id}`)}"><span class="main"><span class="primary">Crop ${c.no || ""} · ${ix.houseById.get(c.houseId)?.name || ""}</span><span class="secondary">${d2(c.placedDate)} – ${d2(c.clearedDate)} · FCR ${r.fcr ? r.fcr.toFixed(2) : "—"} · liveability ${pc(r.liveability, 1)}</span></span><span class="br-epef">${r.epef ? n0(r.epef) : "—"}<small>EPEF</small></span><span class="chev">${raw(icon("chevron"))}</span></a>`; })}</div></div>
  </div>`;
}
