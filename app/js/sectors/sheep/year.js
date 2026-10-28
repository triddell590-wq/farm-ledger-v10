// Sheep → Sheep year (design/11 §5): the five stage boards in full, the lambing book with the
// pens board, and the funnel.
import { html, raw } from "../../core/html.js";
import { el } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { toast } from "../../ui/toast.js";
import { canWrite, canHardDelete } from "../../core/policy.js";
import { daysBetween, addDays } from "../../core/dates.js";
import { largeTitle, backLink, groupLabel, emptyState } from "../../screens/common.js";
import { liveScreen } from "./screen.js";
import { board } from "./boards.js";
import { short, num, funnelView, kvRows, pill, groupChip } from "./ui.js";
import { timeHM } from "../../ui/format.js";
import { STAGES, STAGE_NAMES, cycleFor } from "./model/year.js";
import { FLOCK_TYPES } from "./model/settings.js";
import { shownFunnel, pensInUse, toWatch, cropLambings, lambDate } from "./model/lambing.js";
import { rotation, WORMER_GROUPS } from "./model/health.js";
import * as A from "./actions.js";

const ICON = { tupping: "sheep", scanning: "search", lambing: "birth", grazing: "feed", weaning: "money" };
function stageLine(snap, st) {
  const c = snap.cy;
  return { tupping: `Rams in ${short(c.ramsIn)} – ${short(c.ramsOut)} · raddle board`, scanning: `From ${short(c.scanFrom)} · scan tally and feeding groups`, lambing: `${short(c.lambFrom)} – ${short(c.lambTo)} · lambing book and pens`, grazing: "Worm and fluke plan, lamb growth, lameness", weaning: `From ${short(c.weaning)} · draft lists, cull list, ram MOT` }[st];
}

export default async function year(ctx) {
  const stage = ctx.match?.groups?.stage;
  if (!stage) return liveScreen(ctx, { title: "Sheep year", tab: "year", depth: 0, paint: (snap) => {
    const f = shownFunnel(snap.data, snap.cy, cycleFor(snap.s, addDays(snap.cy.ramsIn, -1), snap.data.events), snap.today).main;
    return html`<div>${largeTitle("Sheep year", `${snap.cy.crop} crop · ${FLOCK_TYPES[snap.s.flockType].toLowerCase()} · rams in ${short(snap.cy.ramsIn)}`)}
      <a class="btn ${snap.stage.stage === "lambing" ? "" : "secondary"}" href="#/l/${snap.lid}/shed" style="margin:8px 0 16px">${raw(icon("birth"))}Open the lambing shed</a>
      <div class="list">${STAGES.map((st, i) => html`<a class="row" href="#/l/${snap.lid}/year/${st}"><span class="tile">${raw(icon(ICON[st]))}</span><span class="main"><span class="primary">${STAGE_NAMES[st]}</span><span class="secondary">${stageLine(snap, st)}</span></span>${i === snap.stage.index ? pill("info", "Now") : ""}<span class="chev">${raw(icon("chevron"))}</span></a>`)}</div>
      <div class="section">${groupLabel(`Lamb funnel · ${f.crop}`, html`<a class="text-btn" href="#/l/${snap.lid}/funnel">Compare years</a>`)}${f.enough ? funnelView(f, { lid: snap.lid }) : emptyState({ sector: "sheep", title: "Not enough to show yet", body: "The funnel fills as you record rams in, scanning, lambing and weaning." })}</div></div>`;
  } });
  return liveScreen(ctx, { title: STAGE_NAMES[stage], tab: "year", paint: (snap) => html`<div>${backLink(`#/l/${snap.lid}/year`, "Sheep year")}${largeTitle(STAGE_NAMES[stage], stageLine(snap, stage))}
      ${board(stage, snap, { full: true })}
      ${stage === "lambing" ? lambingBook(snap) : ""}
      ${stage === "grazing" ? grazingExtra(snap) : ""}</div>`,
  after: (node, snap) => { if (stage === "lambing") wireBook(node, snap); } });
}

function lambingBook(snap) {
  const { data, now, today, lid } = snap; const pens = pensInUse(data, now); const watch = toWatch(data);
  const list = cropLambings(data, snap.cy).sort((a, b) => String(b.datetime).localeCompare(String(a.datetime)));
  const todays = list.filter((l) => lambDate(l) === today);
  const P = new Map(pens.map((p) => [p.pen, p])); const N = Math.max(+snap.s.pens || 12, ...pens.map((p) => p.pen));
  const write = canWrite(snap.role, "lambings");
  const line = (l) => `${(l.lambs || []).length} lamb${(l.lambs || []).length === 1 ? "" : "s"} (${(l.lambs || []).map((x) => `${x.sex === "M" ? "ram" : x.sex === "F" ? "ewe" : "?"}${x.alive ? "" : " dead"}`).join(", ")})${l.help && l.help !== "none" ? ` · ${l.help}` : ""}${l.pen ? ` · pen ${l.pen}` : ""}`;
  return html`<div class="section">${groupLabel("Pens", `${pens.length} in use`)}<div class="pens">${Array.from({ length: N }, (_, i) => i + 1).map((n) => { const p = P.get(n); return p ? html`<button type="button" class="pen ${p.turnOut ? "out" : p.ready ? "ready" : ""}" data-pen="${p.lambing.id}"><b>Pen ${n}</b><span>${p.lambing.eweTag || p.lambing.mobName || "Ewe"}</span><span>${(p.lambing.lambs || []).filter((x) => x.alive).length} lambs · ${p.hours} h</span><span>${p.turnOut ? "Turn out" : p.ready ? "Ready" : "In"}</span></button>` : html`<div class="pen free"><b>Pen ${n}</b><span>Free</span></div>`; })}</div>
      <p class="hint">Ready after 24 hours, turn out after 48. Tap a pen to turn it out.</p></div>
    <div class="section">${groupLabel("To watch", watch.length || "")}${watch.length ? html`<div class="list">${watch.map((l) => html`<div class="row no-lead"><span class="main"><span class="primary">${l.eweTag || l.mobName || "Ewe"}: ${(l.problems || []).join(", ")}</span><span class="secondary">${short(lambDate(l))} ${l.pen ? `· pen ${l.pen}` : ""}</span></span>${write ? html`<button type="button" class="text-btn" data-clear="${l.id}">OK now</button>` : ""}</div>`)}</div>` : html`<div class="card pad t-callout ink-2">No ewes to watch.</div>`}</div>
    <div class="section">${groupLabel("Lambing book", list.length || "")}
      <div class="field search-field card" style="display:flex;align-items:center;gap:8px;padding:0 14px;margin-bottom:8px">${raw(icon("search"))}<input type="search" placeholder="Search by ewe tag" aria-label="Search lambings by ewe tag" data-bq style="flex:1;border:0;background:transparent;font:inherit;min-height:48px;color:var(--ink);outline:none"></div>
      ${list.length ? html`<div class="list" data-book>${list.slice(0, 200).map((l) => html`<div class="row no-lead" data-tag="${String(l.eweTag || "").replace(/\s+/g, "")}"><span class="main"><span class="primary">${lambDate(l) === today ? "Today" : short(lambDate(l))} ${l.datetime ? timeHM(l.datetime) : ""} · ${l.eweTag || l.mobName || "Ewe"}</span><span class="secondary">${l.aborted ? "Aborted" : line(l)}</span></span>${write && (daysBetween(lambDate(l), today) <= 7 || canHardDelete(snap.role, "lambings")) ? html`<button type="button" class="icon-btn" aria-label="Edit" data-edit="${l.id}">${raw(icon("edit"))}</button>` : ""}</div>`)}</div>`
        : emptyState({ sector: "sheep", title: "No lambings yet", body: "Open the lambing shed when the first ewe lambs. It works with no signal.", action: write ? "Open lambing shed" : null, actAttr: 'data-flow="shed"' })}
      ${todays.length ? html`<p class="foot-note">Today: ${todays.length} ewes.</p>` : ""}</div>`;
}
function wireBook(node, snap) {
  const q = node.querySelector("[data-bq]"); if (q) q.oninput = () => { const s = q.value.replace(/\s+/g, "").toUpperCase(); node.querySelectorAll("[data-book] [data-tag]").forEach((r) => (r.hidden = !!s && !r.dataset.tag.toUpperCase().includes(s))); };
  node.addEventListener("click", async (e) => {
    const p = e.target.closest("[data-pen]"); if (p && canWrite(snap.role, "lambings")) { const l = snap.data.lambings.find((x) => x.id === p.dataset.pen); A.penOut(snap.lid, l); toast(`Pen ${l.pen} turned out`, { action: "Undo", onAction: () => A.editLambing(snap.lid, l, { penOut: null }) }); return; }
    const c = e.target.closest("[data-clear]"); if (c) { A.clearWatch(snap.lid, snap.data.lambings.find((x) => x.id === c.dataset.clear)); toast("Taken off the watch list"); return; }
    const ed = e.target.closest("[data-edit]"); if (ed) (await import("./shed.js")).editLambingSheet(snap, snap.data.lambings.find((x) => x.id === ed.dataset.edit));
  });
}
function grazingExtra(snap) {
  const rot = rotation(snap.data, snap.today.slice(0, 4)); const max = Math.max(1, ...Object.values(rot));
  return html`<div class="section">${groupLabel(`Wormer groups used in ${snap.today.slice(0, 4)}`, html`<a class="text-btn" href="#/l/${snap.lid}/worms">Worm plan</a>`)}<div class="card pad rot">${Object.keys(WORMER_GROUPS).map((g) => html`<div><span>${groupChip(g)}</span><i style="width:${(rot[g] / max) * 100}%;${rot[g] ? "" : "opacity:.15"}"></i><b>${rot[g]}</b></div>`)}</div></div>`;
}
export { num, kvRows, el };
