// Health sub-screens (design/14 §7.1, §7.4, §5.5): mortality per house with cause bars (never a
// pie, 00 §6.12) and spikes; vaccinations (rearer certificate + vet plan); whole-house treatments
// with egg withdrawal first; feather and weights per house.
import { html, raw } from "../../../core/html.js";
import { icon } from "../../../ui/icons.js";
import { canWrite } from "../../../core/policy.js";
import { addDays } from "../../../core/dates.js";
import { largeTitle, backLink, groupLabel } from "../../../screens/common.js";
import { liveScreen, flowArg } from "./live.js";
import { hbars, dm, d3, n0, n1, pill, table, linkRow, okCard } from "../ui.js";
import { sortedHouses, flockIn, mortality as flockMort, series, weekly, dateAtWeek } from "../model/flock.js";
import { spike } from "../model/alerts.js";

const TITLES = { mortality: "Mortality", vaccinations: "Vaccinations", treatments: "Treatments", samples: "Feather and weights" };

export default async function healthMore(ctx) {
  const sec = ctx.match.groups.section;
  return liveScreen(ctx, { title: TITLES[sec], tab: "health", paint: (snap) => {
    const back = backLink(`#/l/${snap.lid}/health`, "Health");
    return html`<div>${back}${{ mortality, vaccinations, treatments, samples }[sec](snap)}</div>`;
  } });
}

function liveFlocks(snap) { return sortedHouses(snap.c).map((h) => ({ h, f: flockIn(snap.c, h.id) })).filter((x) => x.f); }

function mortality(snap) {
  const c = snap.c; const live = liveFlocks(snap);
  return html`<div>${largeTitle("Mortality", `Packer trigger ${snap.s.packerMortTrigger}% a week · spike at ${snap.s.spikeMult}× normal and ${snap.s.spikeMin}+ birds`)}
    ${live.map(({ h, f }) => {
      const m = flockMort(c, f); const s = series(c, f); const wk = weekly(c, f).slice(0, 8);
      const spikes = s.map((d, i) => ({ d, sp: spike(snap.s, s, i) })).filter((x) => x.sp).slice(-3);
      const causes = Object.entries(m.byCause).sort((a, b) => b[1] - a[1]);
      const smoth = s.flatMap((d) => (d.deaths || []).filter((x) => x.cause === "Smothered").map((x) => ({ ...x, date: d.date })));
      return html`<div class="section">${groupLabel(h.name, `${n1(m.cum)}% since placing`)}
        <div class="card" style="padding:0"><div class="ly-stat"><span class="k">This week<small>${m.weekDeaths} dead and culled</small></span><span class="v ${m.weekPct > +snap.s.packerMortTrigger ? "due" : ""}">${m.weekPct == null ? "—" : `${n1(m.weekPct, 2)}%`}</span></div>
          <div class="ly-stat"><span class="k">Since placing<small>${m.stdCum != null ? `breed livability allows about ${n1(m.stdCum)}% by now` : ""}</small></span><span class="v ${m.stdCum != null && m.cum > m.stdCum ? "due" : ""}">${n1(m.cum)}%</span></div></div>
        ${m.weekPct > +snap.s.packerMortTrigger ? html`<div class="ly-banner due" style="margin-top:8px">${raw(icon("alert"))}<span>${h.name} weekly mortality ${n1(m.weekPct, 2)}% — over your packer's ${snap.s.packerMortTrigger}% trigger. Your packer may ask for a vet report.</span></div>` : ""}
        ${causes.length ? html`<p class="ly-cap" style="margin:12px 4px 6px">Causes since placing</p>${hbars(causes)}` : ""}
        ${smoth.length ? html`<p class="ly-cap">Smothering: ${smoth.map((x) => `${dm(x.date)} ${x.n} ${x.where ? `(${x.where.toLowerCase()}` : "("}${x.time ? `, ${x.time}` : ""}${x.weather ? `, ${x.weather.toLowerCase()}` : ""})`).join(" · ")}</p>` : ""}
        ${spikes.length ? html`<p class="ly-cap">Spikes: ${spikes.map((x) => `${dm(x.d.date)} ${x.sp.n} dead (${x.sp.times}× normal)`).join(" · ")}</p>` : ""}
        <div style="margin-top:8px">${table([["Wk"], ["Deaths", "n"], ["Cum %", "n"]], wk.map((r) => [r.wk, r.deaths, n1(r.cumMort)]))}</div></div>`;
    })}
    <div class="section"><div class="list">${linkRow(`#/l/${snap.lid}/reg/mortality`, "Mortality at inspection", "Daily inspection, deaths and culls — kept 3 years", "", "records")}</div></div></div>`;
}

function vaccinations(snap) {
  const w = canWrite(snap.role, "vaccinations"); const T = snap.today;
  return html`<div>${largeTitle("Vaccinations", "From the rearer's certificate and your vet plan")}
    ${liveFlocks(snap).map(({ h, f }) => {
      const list = snap.data.vaccinations.filter((v) => v.flockId === f.id).sort((a, b) => (a.date || dateAtWeek(f, +a.plannedWk || 0)).localeCompare(b.date || dateAtWeek(f, +b.plannedWk || 0)));
      const se = list.some((v) => v.date && /enteritidis/i.test(v.disease)); const st = list.some((v) => v.date && /typhimurium/i.test(v.disease));
      return html`<div class="section">${groupLabel(h.name, se && st ? "S.E. + S.T. ✓" : "S.E./S.T. missing")}
        ${!(se && st) ? html`<div class="ly-banner due" style="margin-bottom:8px">${raw(icon("alert"))}<span>Lion needs hens vaccinated against S. Enteritidis and S. Typhimurium — add the doses from the rearer's certificate.</span></div>` : ""}
        ${list.length ? html`<div class="list">${list.map((v) => { const at = v.date || dateAtWeek(f, +v.plannedWk); return html`<button type="button" class="row no-lead" ${raw(w ? `data-flow="vacc" data-arg='${flowArg({ flockId: f.id, id: v.id })}'` : "")}><span class="main"><span class="primary">${v.disease}${v.dose ? ` · ${v.dose}` : ""}</span><span class="secondary">${[v.product, v.date ? d3(v.date) : `planned wk ${v.plannedWk} · ${dm(at)}`, v.batch ? `batch ${v.batch}` : null, v.source === "rearer" ? "rearer" : "on farm"].filter(Boolean).join(" · ")}</span></span>${v.date ? "" : pill(at <= T ? "due" : "info", at <= T ? "Due" : "Planned")}</button>`; })}</div>` : okCard("No vaccinations recorded.")}
        ${w ? html`<button type="button" class="btn secondary" style="margin-top:8px" data-flow="vacc" data-arg='${flowArg({ flockId: f.id })}'>${raw(icon("plus"))}Add a vaccination or plan</button>` : ""}</div>`;
    })}</div>`;
}

function treatments(snap) {
  const T = snap.today; const list = [...snap.data.medicines].sort((a, b) => b.date.localeCompare(a.date)); const hn = (id) => snap.data.houses.find((h) => h.id === id)?.name || "";
  return html`<div>${largeTitle("Treatments", "Whole-house · egg withdrawal first, meat (spent hens) second")}
    ${canWrite(snap.role, "medicines") ? html`<button type="button" class="btn" data-flow="treat">${raw(icon("syringe"))}Record a treatment</button>` : ""}
    <div class="section">${list.length ? html`<div class="list">${list.slice(0, 30).map((m) => { const egg = m.eggsOkFrom && m.eggsOkFrom > T; const meat = m.meatOkFrom && m.meatOkFrom > T;
      return html`<div class="row no-lead"><span class="main"><span class="primary">${hn(m.houseId)} · ${m.productName}</span><span class="secondary">${[d3(m.date), m.reason, m.eggsOkFrom ? `eggs OK from ${dm(m.eggsOkFrom)}` : "no egg withdrawal", m.meatOkFrom ? `meat OK from ${dm(m.meatOkFrom)}` : null, m.vet].filter(Boolean).join(" · ")}</span></span>${egg ? pill("late", "Eggs withheld") : meat ? pill("due", "Meat withdrawal") : ""}</div>`; })}</div>` : okCard("No treatments recorded.")}</div>
    <div class="section"><div class="list">${linkRow(`#/l/${snap.lid}/reg/medicines`, "Medicines record", "Print or CSV", "", "records")}</div></div></div>`;
}

function samples(snap) {
  const L = (x) => `#/l/${snap.lid}/${x}`; const last = (h, k) => snap.data.samples.filter((x) => x.houseId === h.id && x.kind === k).sort((a, b) => b.date.localeCompare(a.date))[0];
  return html`<div>${largeTitle("Feather and weights", `Weigh every ${snap.s.weighEveryDays} days · feather score every ${snap.s.featherEveryDays} days`)}
    ${liveFlocks(snap).map(({ h }) => { const w = last(h, "weights"), e = last(h, "eggs"), fe = last(h, "feather");
      return html`<div class="section">${groupLabel(h.name)}<div class="list">
        ${linkRow(L(`samples/${h.id}/weights`), "Body weight and uniformity", w ? `${dm(w.date)} · ${n0(w.mean)} g · ${n0(w.uniformity)}% uniform` : "None yet", w && w.date < addDays(snap.today, -snap.s.weighEveryDays) ? pill("due", "Due") : "", "scale")}
        ${linkRow(L(`samples/${h.id}/eggs`), "Egg weight", e ? `${dm(e.date)} · ${n1(e.mean)} g` : "None yet", "", "layers")}
        ${linkRow(L(`samples/${h.id}/feather`), "Feather score", fe ? `${dm(fe.date)} · ${n0(fe.good)}% good${fe.enrichment ? ` · ${fe.enrichment}` : ""}` : "None yet", fe && fe.date < addDays(snap.today, -snap.s.featherEveryDays) ? pill("due", "Due") : "", "check")}</div></div>`; })}</div>`;
}
