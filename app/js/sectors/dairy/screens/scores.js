// Dairy → More → Mobility and BCS (design/12 §6.5): latest % lame and trend, the list for the
// foot trimmer, BCS sessions (Red Tractor FW.1: twice a year), foot-trimming records.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { canWrite } from "../../../core/policy.js";
import { daysBetween, addDays } from "../../../core/dates.js";
import { largeTitle, backLink } from "../../../screens/common.js";
import { liveSnap } from "../data.js";
import { sectionOf, numTile, barChart, cowRow, dm } from "../ui.js";
import { sessionSummary, mobilityTrend, trimmerList } from "../model/scores.js";

const flow = (fn) => async (snap, extra) => (await import("../flows/scores.js"))[fn](snap, extra);

export default async function scores(ctx) {
  const body = el(html`<div class="dairy-page"></div>`);
  const { first, stop } = liveSnap(ctx.ledger, (snap) => body.replaceChildren(render(snap)));
  await first;
  return { el: body, title: "Mobility and BCS", tab: "more", destroy: stop };
}

function render(snap) {
  const { lid, today } = snap; const ses = snap.data.scoreSessions.filter((x) => !x.deleted);
  const mob = ses.filter((x) => x.method !== "bcs").sort((a, b) => b.date.localeCompare(a.date)); const bcs = ses.filter((x) => x.method === "bcs").sort((a, b) => b.date.localeCompare(a.date));
  const last = mob[0]; const sm = last ? sessionSummary("mobility", last.scores.map((r) => r.score)) : null;
  const trend = mobilityTrend(ses); const trim = trimmerList(ses); const bcsYear = bcs.filter((x) => x.date >= addDays(today, -365)).length;
  const can = canWrite(snap.role, "scoreSessions");
  const age = last ? daysBetween(last.date, today) : null; const dueWk = snap.s.mobilityWeeks;
  const trims = snap.data.footTrims.filter((x) => !x.deleted).sort((a, b) => b.date.localeCompare(a.date));
  const cowOf = (r) => (r.animalId && snap.ix.byId.get(r.animalId)) || snap.ix.byNo.get(String(r.cowNo));
  const node = el(html`<div>${backLink(`#/l/${lid}/more`, "More")}${largeTitle("Mobility and BCS", last ? `Last mobility score ${dm(last.date)} (${age} days ago)` : "Not scored yet")}
    <div class="tiles2">${numTile({ label: "Lame (score 2–3)", value: sm ? `${sm.pct}%` : "—", delta: sm ? `${sm.lame} of ${sm.n} cows · ${sm.severe} severe` : "Score the herd to see it", tone: sm && sm.pct > 15 ? "late" : sm ? "ok" : "" })}
      ${numTile({ label: "Next mobility score", value: age == null ? "Due" : age > dueWk * 7 ? "Overdue" : `${dueWk * 7 - age} d`, delta: `every ${dueWk} weeks (setting)`, tone: age == null || age > dueWk * 7 ? "due" : "" })}</div>
    ${can ? html`<div class="act-grid" style="margin-top:12px"><button type="button" class="btn" data-mob>Mobility session</button><button type="button" class="btn secondary" data-bcs>BCS session</button><button type="button" class="btn secondary" data-trim>Foot trim</button></div>` : ""}
    ${trend.length > 1 ? sectionOf("Lameness trend", html`<div class="card pad">${barChart(trend.map((t) => t.pct), { labels: trend.map((t) => dm(t.date)), target: 10 })}<p class="formula">% of cows scored 2 or 3 at each session; dashed line 10% (common target, guide only).</p></div>`) : ""}
    ${sectionOf("For the foot trimmer", trim.cows.length ? html`<div class="list">${trim.cows.map((r) => { const a = cowOf(r); return a ? cowRow(snap, a, { extra: html`<span class="secondary">Mobility ${r.score} on ${dm(trim.date)}</span>` }) : html`<div class="row no-lead"><span class="cow-no">${r.cowNo}</span><span class="main"><span class="secondary">Mobility ${r.score}</span></span></div>`; })}</div>` : html`<p class="hint">${trim.date ? "No lame cows at the last session." : "Score the herd to build the list."}</p>`, trim.cows.length || "")}
    ${sectionOf("BCS sessions", html`${bcs.length ? html`<div class="list">${bcs.slice(0, 6).map((x) => html`<div class="row no-lead"><span class="main"><span class="primary">${dm(x.date)} ${x.date.slice(0, 4)}</span><span class="secondary">${sessionSummary("bcs", x.scores.map((r) => r.score)).line}${x.scorer ? " · " + x.scorer : ""}</span></span></div>`)}</div>` : ""}
      <p class="hint" style="margin:8px 4px 0">${bcsYear >= 2 ? `✓ ${bcsYear} BCS sessions in the last 12 months (Red Tractor FW.1 asks for twice a year).` : `${bcsYear} BCS session${bcsYear === 1 ? "" : "s"} in the last 12 months — Red Tractor FW.1 asks for twice a year.`}</p>`)}
    ${sectionOf("Mobility sessions", mob.length ? html`<div class="list">${mob.slice(0, 8).map((x) => html`<div class="row no-lead"><span class="main"><span class="primary">${dm(x.date)} ${x.date.slice(0, 4)}</span><span class="secondary">${sessionSummary("mobility", x.scores.map((r) => r.score)).line}${x.scorer ? " · " + x.scorer : ""}</span></span></div>`)}</div>` : html`<p class="hint">No sessions yet.</p>`)}
    ${sectionOf("Foot trimming", trims.length ? html`<div class="list">${trims.slice(0, 20).map((t) => { const a = snap.ix.byId.get(t.animalId); return a ? cowRow(snap, a, { extra: html`<span class="secondary">${dm(t.date)} · ${t.foot} · ${t.lesion || "trim"}${t.block ? " · block" : ""}</span>` }) : ""; })}</div>` : html`<p class="hint">No foot trims recorded.</p>`, trims.length || "")}
    <div class="section"><a class="btn secondary" href="#/l/${lid}/paperwork/scores">${raw(icon("print"))}Print the sessions register</a></div></div>`);
  const b = (sel, fn) => { const x = node.querySelector(sel); if (x) x.onclick = fn; };
  b("[data-mob]", () => flow("scoreSession")(snap, { method: "mobility" }));
  b("[data-bcs]", () => flow("scoreSession")(snap, { method: "bcs" }));
  b("[data-trim]", () => flow("footTrimSheet")(snap));
  return node;
}
