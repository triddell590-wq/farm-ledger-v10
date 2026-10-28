// Flock tab (design/14 §5): the breed-curve chart per house — the flock's weekly line over the
// breed standard band by week of age, with daily dots faint — hen-housed eggs so far and the
// estimate at depop, the flock timeline, and links to weekly KPIs, the passport and samples.
// Also the push screen for #/l/<id>/flock/<flockId> and #/l/<id>/curve/<flockId>.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { canWrite } from "../../../core/policy.js";
import { largeTitle, backLink, groupLabel, emptyState } from "../../../screens/common.js";
import { liveScreen, segBar, remember, flowArg } from "./live.js";
import { curveChart, tline, dm, d3, n0, n1, linkRow, kvRows, pill } from "../ui.js";
import { sortedHouses, flockIn, plannedFlock, series, weekly, weekOfAge, henHoused, predictHHE, peakOf, timeline, aliveAt, mortality, hheStd } from "../model/flock.js";
import { standardFor, band, layBand, LINES, UNITS } from "../model/standards.js";
import { salmonella } from "../model/health.js";
import { daysBetween, addDays } from "../../../core/dates.js";

const LINE_KEYS = Object.keys(LINES);

export default async function flock(ctx) {
  const routed = ctx.match?.groups?.id; const isCurve = /^curve\//.test(ctx.match?.input || ctx.path || "");
  return liveScreen(ctx, { title: "Flock", depth: routed ? 1 : 0, tab: routed ? "flock" : null, paint: (snap) => paint(snap, routed, isCurve), after: wire });
}

function pickFlock(snap, routed) {
  const hs = sortedHouses(snap.c);
  const live = hs.map((h) => ({ h, f: flockIn(snap.c, h.id) })).filter((x) => x.f);
  if (routed) { const f = snap.data.flocks.find((x) => x.id === routed); return { f, h: f && snap.data.houses.find((h) => h.id === f.houseId), live }; }
  const want = remember(snap.lid, "flockHouse"); const pick = live.find((x) => x.h.id === want) || live[0];
  return { f: pick?.f || null, h: pick?.h || null, live };
}

function paint(snap, routed, isCurve) {
  const { lid } = snap; const L = (h) => `#/l/${lid}/${h}`;
  const { f, h, live } = pickFlock(snap, routed);
  const back = routed ? backLink(isCurve ? L("houses") : L("flock"), isCurve ? "Houses" : "Flock") : "";
  if (!f) {
    const anyHouse = snap.data.houses.length;
    return html`<div>${back}${largeTitle("Flock", "")}${emptyState({ sector: "layers", title: anyHouse ? "No flock in your houses" : "Add your first house", body: anyHouse ? "Add the flock you're placing: breed, hatch date and number of pullets." : "Tell us the house name, system and how many hens it holds. Your daily sheet starts from here.", action: canWrite(snap.role, "flocks") ? (anyHouse ? "Place a flock" : "Add a house") : null, actAttr: `data-flow="${anyHouse ? "place" : "house"}"` })}</div>`;
  }
  const c = snap.c; const std = standardFor(f.breedStdId); const T = snap.today;
  if (f.placedDate > T) return planned(snap, f, h, back);
  const gone = f.depopDate && f.depopDate < T; const at = gone ? f.depopDate : T;
  const wk = weekOfAge(f, at); const s = series(c, f); const wkRows = weekly(c, f);
  const line = remember(lid, "flockLine") || "lay";
  const ctxLine = `${h?.name || ""} · ${std.breed} · placed ${dm(f.placedDate)} · week ${wk}${gone ? " · depopulated" : ""}`;
  const sheets = s.filter((d) => !d.partial).length;
  const depopWk = f.plannedDepop ? weekOfAge(f, f.plannedDepop) : 76;
  const hhe = henHoused(c, f, at); const hheNow = hheStd(std, wk); const pred = gone ? null : predictHHE(c, f, depopWk);
  const pk = peakOf(c, f); const m = mortality(c, f, at); const sal = salmonella(c, f);
  const fromWk = Math.min(18, weekOfAge(f, f.placedDate)); const toWk = Math.min(100, Math.max(80, depopWk + 2, wk + 4));
  const chart = sheets < 7 ? null : chartFor(line, { c, f, std, s, wkRows, fromWk, toWk, wk: gone ? null : wk });
  return html`<div>${back}${largeTitle("Flock", ctxLine)}
    ${!routed && live.length > 1 ? html`<div data-houses></div>` : ""}
    ${sheets < 7 ? emptyState({ sector: "layers", title: "Your curve starts after a week", body: "Fill the daily sheet each day and the flock's line appears over the breed standard.", action: canWrite(snap.role, "days") && !gone ? "Fill today's sheet" : null, actAttr: `data-flow="sheet" data-arg='${flowArg({ houseId: f.houseId })}'` })
    : html`<div class="ly-segs" role="radiogroup" aria-label="Line">${LINE_KEYS.map((k) => html`<button type="button" class="chip" role="radio" aria-checked="${k === line}" data-line="${k}"><span class="chk">${raw(icon("check", { size: 18 }))}</span>${LINES[k]}</button>`)}</div>
      <div class="section" style="margin-top:12px"><div class="card ly-chartcard">${chart.svg}<p class="ly-cap">${chart.cap}</p></div></div>`}
    <div class="section"><div class="card" style="padding:0">
      <div class="ly-stat"><span class="k">Hen-housed eggs so far<small>standard ${n0(hheNow[0])}–${n0(hheNow[1])} at week ${wk}</small></span><span class="v">${n0(hhe)}</span></div>
      ${pred ? html`<div class="ly-stat"><span class="k">At depop, week ${depopWk} (estimate)<small>standard ${n0(pred.stdRange[0])}–${n0(pred.stdRange[1])} · laying at ${n0(pred.ratio)}% of standard lately</small></span><span class="v">${n0(pred.hhe)}</span></div>` : ""}
      ${pk ? html`<div class="ly-stat"><span class="k">Peak</span><span class="v">${n1(pk.henDay)}% · wk ${pk.wk}</span></div>` : ""}
      <div class="ly-stat"><span class="k">Mortality since placing<small>${m.stdCum != null ? `breed standard about ${n1(m.stdCum)}% by now` : ""}</small></span><span class="v ${m.stdCum != null && m.cum > m.stdCum ? "due" : ""}">${n1(m.cum)}%</span></div>
      <div class="ly-stat"><span class="k">Birds now<small>${n0(f.placed)} placed</small></span><span class="v">${n0(aliveAt(c, f, at, { end: true }))}</span></div>
    </div><p class="ly-cap">Standard: ${std.edition}.${std.derived ? " Weekly band after peak worked out from the breeder's totals (estimate)." : ""} Not approved by the breeder.</p></div>
    <div class="section">${groupLabel("Flock timeline")}<div class="card">${tline([...timeline(c, f).map((x) => ({ label: x.label, state: x.state, data: x.edit && canWrite(snap.role, "flocks") ? `data-flow="editFlock" data-arg='${flowArg({ id: f.id })}'` : null })), ...(sal.exempt ? [] : sal.plan.filter((p) => p.state !== "depop").slice(0, 6).map((p) => ({ label: `Salmonella wk ${p.wk}${p.state === "done" ? " ✓" : p.state === "pos" ? " +" : ""}`, state: p.state === "done" ? "done" : p.state === "pos" ? "pos" : p.state === "late" ? "late" : p.state === "due" ? "due" : "future", href: L(`salmonella/${f.id}`) })))])}</div>
      <p class="ly-cap">Tap the depop or next-flock date to move it — the Salmonella plan and packer dates follow.</p></div>
    <div class="section"><div class="list">
      ${linkRow(L(`weekly/${f.id}`), "Weekly figures", `${wkRows.length} weeks · lay, egg weight, feed, water, deaths`, "", "chart")}
      ${linkRow(L(`flock/${f.id}/passport`), "Flock passport", "Rearer, vaccinations, feed, medicines, moves, Salmonella", "", "document")}
      ${linkRow(L(`salmonella/${f.id}`), "Salmonella", sal.exempt ? "Not needed for a small flock" : `Next sample ${dm(sal.due)}`, sal.exempt ? "" : sal.level !== "ok" ? pill(sal.level, sal.level === "late" ? "Late" : "Due") : "", "syringe")}
      ${linkRow(L(`samples/${f.houseId}/weights`), "Body weight and uniformity", lastSample(snap, f, "weights"), "", "scale")}
      ${linkRow(L(`samples/${f.houseId}/eggs`), "Egg weight and size mix", lastSample(snap, f, "eggs"), "", "layers")}
      ${linkRow(L(`samples/${f.houseId}/feather`), "Feather score", lastSample(snap, f, "feather"), "", "check")}
    </div></div>
    ${canWrite(snap.role, "flocks") && !gone ? html`<div class="section ly-acts"><button type="button" class="btn secondary" data-flow="editFlock" data-arg='${flowArg({ id: f.id })}'>${raw(icon("edit"))}Edit flock</button><button type="button" class="btn secondary" data-flow="depop" data-arg='${flowArg({ id: f.id })}'>${raw(icon("truck"))}Depopulate</button></div>` : ""}
  </div>`;
}

function lastSample(snap, f, kind) {
  const x = snap.data.samples.filter((y) => y.flockId === f.id && y.kind === kind).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!x) return "None yet";
  if (kind === "weights") return `${dm(x.date)} · ${n0(x.mean)} g · uniformity ${n0(x.uniformity)}%`;
  if (kind === "eggs") return `${dm(x.date)} · ${n1(x.mean)} g average`;
  return `${dm(x.date)} · ${n0(x.good)}% good feather`;
}

/** The chart for one line (§5.1). */
function chartFor(line, { c, f, std, s, wkRows, fromWk, toWk, wk }) {
  const w = [...wkRows].reverse(); let weeks = [], dots = [], bandAt, unit = UNITS[line], cap;
  if (line === "lay") { weeks = w.map((r) => ({ wk: r.wk, v: r.henDay })); dots = s.filter((d) => d.henDay != null).map((d) => ({ wk: weekOfAge(f, d.date) + ((daysBetween(f.hatchDate || d.date, d.date) % 7) / 7), v: d.henDay })); bandAt = (x) => layBand(std, x); cap = "Shaded: breed standard range by week of age. Line: this flock, weekly average. Dots: each day."; }
  else if (line === "eggWt") { weeks = sampleWeeks(c, f, "eggs"); bandAt = (x) => (x >= std.eggWt[0][0] ? band(std, "eggWt", x) : null); cap = "Egg weight samples (g) against the breed standard."; }
  else if (line === "feed") { weeks = w.map((r) => ({ wk: r.wk, v: r.feedG })); bandAt = (x) => band(std, "feed", x); cap = "Feed eaten, grams per bird per day, from deliveries and bin readings."; }
  else if (line === "bw") { weeks = sampleWeeks(c, f, "weights"); bandAt = (x) => band(std, "bw", x); cap = "Body weight samples (g) against the breed standard."; }
  else { weeks = w.map((r) => ({ wk: r.wk, v: r.cumMort })); bandAt = (x) => band(std, "mort", x); cap = "Cumulative mortality since placing (%) against the breed's expected losses."; }
  if (!weeks.some((x) => x.v != null)) cap = `No ${LINES[line].toLowerCase()} figures yet. ${line === "eggWt" || line === "bw" ? "Record a sample from the links below." : line === "feed" ? "Add feed deliveries or bin readings on the daily sheet." : ""}`;
  const svg = curveChart({ bandAt, weeks, dots, fromWk, toWk, todayWk: wk, unit: unit === "%" ? "%" : "", label: `${LINES[line]} by week of age against the breed standard` });
  return { svg, cap };
}
function sampleWeeks(c, f, kind) { return c.data.samples.filter((x) => x.flockId === f.id && x.kind === kind && x.mean).map((x) => ({ wk: weekOfAge(f, x.date), v: +x.mean })); }

function planned(snap, f, h, back) {
  const std = standardFor(f.breedStdId); const T = snap.today; const by = addDays(f.placedDate, -14); const left = daysBetween(T, f.placedDate);
  return html`<div>${back}${largeTitle("Next flock", `${h?.name || ""} · ${std.breed} · arrives ${dm(f.placedDate)}`)}
    <div class="section">${f.daeraNotified ? html`<div class="ly-banner ok">${raw(icon("check"))}<span>DAERA told on ${d3(f.daeraNotified)}.</span></div>` : html`<div class="ly-banner ${T > by ? "late" : "due"}">${raw(icon("clock"))}<span>Tell DAERA about this flock at least 2 weeks before it arrives — by ${dm(by)}. Give the date it arrives and the expected end of lay.</span></div>`}</div>
    <div class="section">${kvRows([["Arrives", `${dm(f.placedDate)} · in ${left} day${left === 1 ? "" : "s"}`], ["Pullets", n0(f.placed)], ["Age at placing", `${f.ageAtPlacement || "—"} weeks`], ["Rearer", f.rearer || "—"], ["Planned depop", f.plannedDepop ? `${dm(f.plannedDepop)} · wk ${weekOfAge(f, f.plannedDepop)}` : "—"]])}</div>
    ${canWrite(snap.role, "flocks") ? html`<div class="section ly-acts">${f.daeraNotified ? "" : html`<button type="button" class="btn" data-notified="${f.id}">I've told DAERA</button>`}<button type="button" class="btn secondary" data-flow="editFlock" data-arg='${flowArg({ id: f.id })}'>${raw(icon("edit"))}Edit flock</button></div>` : ""}</div>`;
}

function wire(node, snap, repaint) {
  const hs = node.querySelector("[data-houses]");
  if (hs) {
    const live = sortedHouses(snap.c).filter((h) => flockIn(snap.c, h.id));
    const cur = remember(snap.lid, "flockHouse") || live[0]?.id;
    hs.replaceWith(segBar("house", live.map((h) => [h.id, h.name]), cur, (v) => { remember(snap.lid, "flockHouse", v); repaint(); }));
  }
  node.querySelectorAll("[data-line]").forEach((b) => (b.onclick = () => { remember(snap.lid, "flockLine", b.dataset.line); repaint(); }));
  const n = node.querySelector("[data-notified]");
  if (n) n.onclick = async () => { const { updateFlock } = await import("../actions.js"); const f = snap.data.flocks.find((x) => x.id === n.dataset.notified); updateFlock(snap, f, { daeraNotified: snap.today }); };
}
export { plannedFlock };
