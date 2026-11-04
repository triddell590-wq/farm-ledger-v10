// Health tab (design/14 §7): Inspector is here, then per house — mortality this week vs the packer
// trigger and the breed's expected losses, the red-mite trap map (signature), the Salmonella
// 15-week clock with the Class B lock, egg withdrawals, vaccinations due, feather and weights.
import { html, raw } from "../../../core/html.js";
import { icon } from "../../../ui/icons.js";
import { canWrite } from "../../../core/policy.js";
import { daysBetween } from "../../../core/dates.js";
import { largeTitle, groupLabel, emptyState } from "../../../screens/common.js";
import { liveScreen, segBar, remember, flowArg } from "./live.js";
import { trapMap, bars, tline, dm, n0, n1, pill, linkRow, okCard } from "../ui.js";
import { sortedHouses, flockIn, mortality, weekOfAge, dateAtWeek } from "../model/flock.js";
import { mite, trapIds, salmonella, eggWithheld } from "../model/health.js";

export default async function health(ctx) {
  return liveScreen(ctx, { title: "Health", depth: 0, paint, after: (node, snap, repaint) => {
    const s = node.querySelector("[data-mitehouse]"); if (!s) return;
    const hs = sortedHouses(snap.c).filter((h) => flockIn(snap.c, h.id));
    s.replaceWith(segBar("mh", hs.map((h) => [h.id, h.name]), pickMiteHouse(snap)?.id, (v) => { remember(snap.lid, "miteHouse", v); repaint(); }));
  } });
}
function pickMiteHouse(snap) { const hs = sortedHouses(snap.c).filter((h) => flockIn(snap.c, h.id)); const want = remember(snap.lid, "miteHouse"); return hs.find((h) => h.id === want) || hs.find((h) => mite(snap.c, h.id).over) || hs[0]; }

function paint(snap) {
  const c = snap.c; const L = (h) => `#/l/${snap.lid}/${h}`; const T = snap.today;
  const live = sortedHouses(c).map((h) => ({ h, f: flockIn(c, h.id) })).filter((x) => x.f);
  const title = largeTitle("Health", live.length > 1 ? (live.length === 2 ? "Both houses" : `${live.length} houses`) : live[0]?.h.name || "");
  if (!live.length) return html`<div>${title}${emptyState({ sector: "layers", title: "No flock in your houses", body: "Health records start when a flock is placed: mortality, red mite, Salmonella and vaccinations.", action: canWrite(snap.role, "flocks") ? "Place a flock" : null, actAttr: 'data-flow="place"' })}</div>`;
  const mh = pickMiteHouse(snap); const mt = mite(c, mh.id); const grid = trapIds(mh);
  const scores = Object.fromEntries((mt.last?.traps || []).map((t) => [t.id, t.score]));
  const wds = live.map(({ h }) => ({ h, wd: eggWithheld(c, h.id) })).filter((x) => x.wd);
  const vaccDue = live.flatMap(({ h, f }) => snap.data.vaccinations.filter((v) => v.flockId === f.id && !v.date && v.plannedWk).map((v) => ({ h, f, v, at: dateAtWeek(f, +v.plannedWk) }))).sort((a, b) => a.at.localeCompare(b.at));
  const w = canWrite(snap.role, "miteScores");
  return html`<div>${title}
    <a class="btn" href="${L("inspect")}">${raw(icon("shield"))}Inspector is here</a>
    ${wds.length ? html`<div class="section">${wds.map(({ h, wd }) => html`<div class="ly-banner late" style="margin-bottom:8px">${raw(icon("alert"))}<span>Eggs withheld — ${h.name} until ${dm(wd.until)} (${wd.product || "treatment"}). Eggs go to "Not for sale".</span></div>`)}</div>` : ""}

    <div class="section">${groupLabel("Mortality this week", html`<a class="text-btn" href="${L("health/mortality")}">Causes</a>`)}<div class="list">
      ${live.map(({ h, f }) => { const m = mortality(c, f); const over = m.weekPct != null && m.weekPct > +snap.s.packerMortTrigger;
        return html`<a class="row no-lead ly-kv" href="${L("health/mortality")}"><span class="main"><span class="primary">${h.name}</span><span class="secondary">${m.weekDeaths} dead · ${n1(m.cum)}% since placing${m.stdCum != null ? ` (breed ${n1(m.stdCum)}%)` : ""}${over ? ` · over your packer's ${snap.s.packerMortTrigger}% trigger` : ""}</span></span><span class="v ${over ? "due" : ""}">${m.weekPct == null ? "—" : `${n1(m.weekPct, 2)}%`}</span><span class="chev">${raw(icon("chevron"))}</span></a>`; })}</div></div>

    <div class="section">${groupLabel(`Red mite · ${mh.name}${mt.last ? ` · ${daysBetween(mt.last.date, T) < 7 ? "this week" : dm(mt.last.date)}` : ""}`, `action level ${n1(snap.s.miteAction)}`)}
      ${live.length > 1 ? html`<div data-mitehouse></div>` : ""}
      ${mt.last ? html`<a href="${L(`mite/${mh.id}`)}" style="display:block;text-decoration:none">${trapMap(grid, scores, { action: snap.s.miteAction })}</a>
        <div class="card" style="padding:0;margin-top:8px"><div class="ly-stat"><span class="k">Average ${n1(mt.avg)} · action level ${n1(snap.s.miteAction)}<small>0 none · 1 few · 2 some · 3 many · 4 heavy</small></span><span>${bars(mt.trend, { max: 4, mark: +snap.s.miteAction })}</span></div></div>
        ${mt.over ? html`<div class="ly-banner due" style="margin-top:8px">${raw(icon("bug"))}<span>${mh.name} mite average ${n1(mt.avg)} — over your action level. Plan a treatment.</span></div>` : ""}`
      : html`<div class="card pad t-callout ink-2">No trap scores yet. Place traps at fixed points once, then score them each week in under a minute.</div>`}
      ${w ? html`<div class="ly-acts"><button type="button" class="btn" data-flow="mite" data-arg='${flowArg({ houseId: mh.id })}'>${raw(icon("bug"))}Score traps</button><button type="button" class="btn secondary" data-flow="mitetreat" data-arg='${flowArg({ houseId: mh.id })}'>Treatment</button></div>` : ""}</div>

    <div class="section">${groupLabel("Salmonella")}${live.map(({ h, f }) => salCard(snap, h, f))}</div>

    ${vaccDue.length ? html`<div class="section">${groupLabel("Vaccinations due")}<div class="list">${vaccDue.slice(0, 4).map(({ h, f, v, at }) => html`<button type="button" class="row no-lead" data-flow="vacc" data-arg='${flowArg({ flockId: f.id, id: v.id })}'><span class="main"><span class="primary">${h.name}: ${v.disease}${v.dose ? ` ${v.dose.toLowerCase()}` : ""}</span><span class="secondary">wk ${v.plannedWk} · ${dm(at)}${v.product ? ` · ${v.product}` : ""}</span></span>${at <= T ? pill("due", "Due") : ""}</button>`)}</div></div>` : ""}

    <div class="section">${groupLabel("More health records")}<div class="list">
      ${linkRow(L("health/vaccinations"), "Vaccinations", "Rearer certificate, vet plan, doses given", "", "syringe")}
      ${linkRow(L("health/treatments"), "Treatments", "Whole-house, egg withdrawal first", "", "syringe")}
      ${linkRow(L("health/samples"), "Feather and weights", "Uniformity, egg weights, feather scores", "", "scale")}
      ${linkRow(L("health/mortality"), "Mortality and causes", "Per house, cause bars, spikes", "", "chart")}
    </div></div>
    ${canWrite(snap.role, "medicines") ? html`<div class="ly-acts"><button type="button" class="btn secondary" data-flow="treat">${raw(icon("syringe"))}Record a treatment</button></div>` : ""}
  </div>`;
}

function salCard(snap, h, f) {
  const sal = salmonella(snap.c, f); const L = (x) => `#/l/${snap.lid}/${x}`;
  if (sal.exempt) return html`<div class="card pad t-callout ink-2" style="margin-bottom:8px">${h.name}: ${sal.reason}</div>`;
  const lv = sal.level; const last = sal.last;
  return html`<a class="card" href="${L(`salmonella/${f.id}`)}" style="display:block;text-decoration:none;color:inherit;margin-bottom:8px;padding:0">
    ${sal.classB ? html`<div class="ly-banner late" style="border-radius:var(--r-lg) var(--r-lg) 0 0">${raw(icon("alert"))}<span>${h.name}: Salmonella positive. Eggs are Class B — do not pack as Class A.</span></div>` : ""}
    <div class="row no-lead" style="background:none"><span class="main"><span class="primary">${h.name}: next boot swabs ${dm(sal.due)}</span><span class="secondary">Every 15 weeks${last ? ` · last ${dm(last.date)} · ${last.result.toLowerCase()}` : ` · first due by week 26 (${dm(sal.firstBy)})`}</span></span>${lv === "ok" ? "" : pill(lv, lv === "late" ? "Late" : "Due")}</div>
    ${tline(sal.plan.slice(0, 7).map((p) => ({ label: p.state === "depop" ? `wk ${p.wk} depop` : `wk ${p.wk}${p.state === "done" ? " ✓" : p.state === "pos" ? " positive" : p.state === "due" || p.state === "late" ? " due" : ""}`, state: p.state === "pos" ? "pos" : p.state === "late" ? "late" : p.state })))}</a>`;
}
export { okCard, weekOfAge, n0 };
