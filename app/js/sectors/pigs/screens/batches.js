// Batches tab (design/13 §6.1): growing batches with room, day, pigs, est. weight and FCR
// (estimate); closed batches; "Compare closed batches"; Ready to ship; Kill sheet.
import { html, raw } from "../../../core/html.js";
import { icon } from "../../../ui/icons.js";
import { canWrite } from "../../../core/policy.js";
import { largeTitle, emptyState, groupLabel } from "../../../screens/common.js";
import { liveScreen } from "./live.js";
import { n0, d2, pctText, pill } from "../ui.js";
import { batchName } from "../model/batches.js";

const seg = new Map();

export default async function batches(ctx) {
  const lid = ctx.ledger.id; if (!seg.has(lid)) seg.set(lid, "growing");
  return liveScreen(ctx, { title: "Batches", depth: 0, paint: (snap) => {
    const all = snap.data.batches.filter((b) => b.numberIn != null || b.inDate).sort((a, b) => b.no - a.no);
    const growing = all.filter((b) => !b.closed); const closed = all.filter((b) => b.closed);
    const mode = seg.get(lid); const list = mode === "growing" ? growing : mode === "closed" ? closed : all;
    const can = canWrite(snap.role, "moves");
    if (!all.length) return html`<div>${largeTitle("Batches")}${emptyState({ sector: "pigs", title: "No batches yet", body: "A batch starts when you wean a room or bring pigs in.", action: can ? "Pigs in" : null, actAttr: 'data-flow="pigsIn"' })}</div>`;
    const ships = snap.data.tasks.filter((t) => t.pig?.kind === "ship" && !t.done).sort((a, b) => a.due.localeCompare(b.due));
    const ksDue = snap.data.tasks.filter((t) => t.pig?.kind === "killsheet" && !t.done);
    return html`<div>${largeTitle("Batches", `${growing.length} growing · ${n0(growing.reduce((t, b) => t + (snap.c.bf.get(b.id)?.onFarm || 0), 0))} pigs`)}
      <div class="segmented" role="radiogroup" data-seg="mode" style="margin-bottom:12px"><span class="thumb"></span>${[["growing", `Growing ${growing.length}`], ["closed", "Closed"], ["all", "All"]].map(([k, l]) => html`<button type="button" role="radio" data-m="${k}" aria-checked="${mode === k}">${l}</button>`)}</div>
      ${ships.length ? html`<div class="section">${groupLabel("Loads planned")}<div class="list">${ships.map((t) => html`<a class="row" href="#/l/${lid}/ship/${t.pig.batchId}"><span class="tile">${raw(icon("truck"))}</span><span class="main"><span class="primary">${t.title}</span><span class="secondary">${d2(t.due)}${t.note ? " · " + t.note : ""}</span></span><span class="chev">${raw(icon("chevron"))}</span></a>`)}</div></div>` : ""}
      ${ksDue.length ? html`<div class="section"><div class="list">${ksDue.map((t) => html`<button type="button" class="row" data-flow="killSheet" data-arg='${JSON.stringify({ batchId: t.pig.batchId })}'><span class="tile due">${raw(icon("document"))}</span><span class="main"><span class="primary">${t.title}</span><span class="secondary">Photo of the kill sheet → % in spec and margin per pig</span></span>${pill("due", "Add")}</button>`)}</div></div>` : ""}
      <div class="section"><div class="list">${list.length ? list.map((b) => { const f = snap.c.bf.get(b.id); const r = snap.ix.rooms.get(b.roomId); const scour = r && snap.data.roomChecks.filter((c) => c.roomId === r.id && c.date === snap.today).flatMap((c) => c.pens || []).filter((p) => (p.status || []).includes("Scour")).length;
        return html`<a class="row pg-batch-row" href="#/l/${lid}/batch/${b.id}"><span class="pg-no">${batchName(b)}</span><span class="main"><span class="primary">${b.closed ? `Closed ${d2(b.closed.date)}` : `${r?.name || b.stage} · day ${f?.days ?? "—"}`}</span>
          <span class="secondary">${b.closed ? `FCR ${b.closed.fcr ?? "—"} · ${b.closed.dlwg ?? "—"} g/day · mortality ${pctText(b.closed.mortPct)}` : `${n0(f?.onFarm)} pigs${b.stage !== "weaner" ? ` · est ${Math.round(f?.est || 0)} kg` : ""} · FCR ${f?.fcr ? f.fcr.toFixed(2) + " est" : "—"}${scour ? ` · scour ${scour} pen${scour > 1 ? "s" : ""}` : ""}`}</span>
          ${!b.closed && ((f?.withdrawalEnd && f.withdrawalEnd > snap.today) || (f && f.mortPct * 100 > f.targetMort)) ? html`<span class="pg-pills">${f?.withdrawalEnd && f.withdrawalEnd > snap.today ? pill("due", `Withdrawal to ${d2(f.withdrawalEnd)}`) : ""}${f.mortPct * 100 > f.targetMort ? pill("late", `Mortality ${pctText(f.mortPct)}`) : ""}</span>` : ""}</span><span class="chev">${raw(icon("chevron"))}</span></a>`; }) : html`<div class="row no-lead"><span class="main"><span class="secondary">No ${mode === "closed" ? "closed" : "growing"} batches.</span></span></div>`}</div></div>
      <div class="section"><div class="list">
        <a class="row" href="#/l/${lid}/compare"><span class="tile">${raw(icon("chart"))}</span><span class="main"><span class="primary">Compare closed batches</span><span class="secondary">FCR and growth per batch, last 10</span></span><span class="chev">${raw(icon("chevron"))}</span></a>
        ${growing.some((b) => b.stage !== "weaner") ? html`<a class="row" href="#/l/${lid}/ship/${growing.find((b) => b.stage !== "weaner").id}"><span class="tile">${raw(icon("truck"))}</span><span class="main"><span class="primary">Ready to ship</span><span class="secondary">Pens ranked against your weight band · plan a load</span></span><span class="chev">${raw(icon("chevron"))}</span></a>` : ""}
        ${can ? html`<button type="button" class="row" data-flow="killSheet"><span class="tile">${raw(icon("document"))}</span><span class="main"><span class="primary">Add a kill sheet</span><span class="secondary">Photo or paste → % in spec, price per pig</span></span></button>` : ""}</div></div>
      ${can ? html`<div class="pg-acts"><button type="button" class="btn secondary" data-flow="pigsIn">${raw(icon("truck"))}Pigs in</button><button type="button" class="btn secondary" data-flow="moveBatch">${raw(icon("house"))}Move a batch</button></div>` : ""}</div>`;
  }, after: (node, snap, repaint) => {
    node.querySelectorAll("[data-m]").forEach((b) => (b.onclick = () => { seg.set(lid, b.dataset.m); repaint(); }));
    placeThumb(node);
  } });
}
function placeThumb(node) { const g = node.querySelector("[data-seg]"); if (!g) return; requestAnimationFrame(() => { const on = g.querySelector("[aria-checked=true]"); const th = g.querySelector(".thumb"); if (on && th) { th.style.width = on.offsetWidth + "px"; th.style.transform = `translateX(${on.offsetLeft - 3}px)`; } }); }
