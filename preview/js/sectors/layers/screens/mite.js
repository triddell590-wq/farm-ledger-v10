// Red mite for one house (design/14 §7.2): the house plan with trap points coloured by the latest
// scores, the average against the action level, the 8-week trend, every session, treatments, and
// the buttons to score traps (trap by trap, big 0–4 buttons) or record a treatment.
import { html, raw } from "../../../core/html.js";
import { icon } from "../../../ui/icons.js";
import { canWrite } from "../../../core/policy.js";
import { largeTitle, backLink, groupLabel, emptyState } from "../../../screens/common.js";
import { liveScreen, flowArg } from "./live.js";
import { trapMap, bars, dm, n1, table } from "../ui.js";
import { mite, trapIds, miteAvg } from "../model/health.js";
import { MITE_SCORES } from "../model/content.js";

export default async function miteScreen(ctx) {
  const hid = ctx.match.groups.houseId;
  return liveScreen(ctx, { title: "Red mite", tab: "health", paint: (snap) => {
    const h = snap.data.houses.find((x) => x.id === hid); const back = backLink(`#/l/${snap.lid}/health`, "Health");
    if (!h) return html`<div>${back}${largeTitle("House not found")}</div>`;
    const mt = mite(snap.c, h.id); const grid = trapIds(h); const w = canWrite(snap.role, "miteScores");
    const list = snap.data.miteScores.filter((x) => x.houseId === h.id).sort((a, b) => b.date.localeCompare(a.date));
    const treats = snap.data.medicines.filter((m) => m.houseId === h.id && /mite/i.test(m.reason || "")).sort((a, b) => b.date.localeCompare(a.date));
    const acts = w ? html`<div class="ly-acts"><button type="button" class="btn" data-flow="mite" data-arg='${flowArg({ houseId: h.id })}'>${raw(icon("bug"))}Score traps</button>${canWrite(snap.role, "medicines") ? html`<button type="button" class="btn secondary" data-flow="mitetreat" data-arg='${flowArg({ houseId: h.id })}'>Treatment</button>` : ""}</div>` : "";
    if (!list.length) return html`<div>${back}${largeTitle("Red mite", h.name)}${emptyState({ sector: "layers", title: "No trap scores yet", body: `Place traps at fixed points once, then score them each week in under a minute. ${h.name} has ${grid.ids.length} trap points (${grid.rows} rows of ${grid.cols}).`, action: canWrite(snap.role, "houses") ? "Set up traps" : null, actAttr: `data-flow="house" data-arg='${flowArg({ id: h.id })}'` })}${acts}</div>`;
    const scores = Object.fromEntries(mt.last.traps.map((t) => [t.id, t.score]));
    return html`<div>${back}${largeTitle("Red mite", `${h.name} · scored ${dm(mt.last.date)} by ${(mt.last.byName || "").split(" ")[0]}`)}
      ${trapMap(grid, scores, { action: snap.s.miteAction })}
      <p class="ly-cap">Traps at the same points every week · ${MITE_SCORES.map((s, i) => `${i} ${s.toLowerCase()}`).join(" · ")}</p>
      <div class="section"><div class="card" style="padding:0">
        <div class="ly-stat"><span class="k">Average<small>action level ${n1(snap.s.miteAction)} (your setting)</small></span><span class="v ${mt.over ? "due" : "ok"}">${n1(mt.avg)}</span></div>
        <div class="ly-stat"><span class="k">Last 8 weeks</span><span>${bars(mt.trend, { max: 4, mark: +snap.s.miteAction })}</span></div></div>
        ${mt.over ? html`<div class="ly-banner due" style="margin-top:8px">${raw(icon("bug"))}<span>${h.name} mite average ${n1(mt.avg)} — over your action level.</span></div>` : ""}</div>
      ${acts}
      <div class="section">${groupLabel("Sessions")}${table([["Date"], ["Average", "n"], ["Highest", "n"], ["By"]], list.slice(0, 16).map((x) => { const a = miteAvg(x.traps); const hi = Math.max(...x.traps.map((t) => +t.score || 0)); return [dm(x.date), a >= +snap.s.miteAction ? html`<span class="due">${n1(a)}</span>` : n1(a), hi, (x.byName || "").split(" ")[0]]; }))}</div>
      ${treats.length ? html`<div class="section">${groupLabel("Treatments")}<div class="list">${treats.map((m) => html`<div class="row no-lead"><span class="main"><span class="primary">${dm(m.date)} · ${m.productName}</span><span class="secondary">${[m.method || m.route, m.contractor, m.eggsOkFrom ? `eggs OK from ${dm(m.eggsOkFrom)}` : "no egg withdrawal"].filter(Boolean).join(" · ")}</span></span></div>`)}</div></div>` : ""}
      <p class="ly-cap">The history prints into the clean-out plan at depop (Paperwork → Medicines).</p></div>`;
  } });
}
