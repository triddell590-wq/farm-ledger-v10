// Fertility sub-screens (design/12 §5.1–5.3): vet visit list, sire plan + straws, KPIs.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { toast } from "../../../ui/toast.js";
import { openSheet } from "../../../ui/sheet.js";
import { canWrite } from "../../../core/policy.js";
import { addDays } from "../../../core/dates.js";
import { largeTitle } from "../../../screens/common.js";
import { liveSnap } from "../data.js";
import { cowRow, sectionOf, kvRows, barChart, printDoc, cowLabel, dm, pill } from "../ui.js";
import { actionLists, rates21, pctPregnantAtPd, weeklyPregnancies, sixWeekInCalf, calvingInterval, ageFirstCalving, strawsLeft, fertilityOf } from "../model/fertility.js";
import { onFarm, groupOf, sortByNo } from "../model/cows.js";
import { setVetList, recordPd, updateCow } from "../actions.js";

const TITLES = { vet: "Vet visit list", sires: "Sire plan and straws", kpis: "Fertility KPIs" };
export default async function fertMore(ctx) {
  const view = ctx.match.groups.view; const body = el(html`<div class="dairy-page"></div>`);
  const { first, stop } = liveSnap(ctx.ledger, (snap) => ({ vet, sires, kpis })[view](body, snap));
  await first;
  return { el: body, title: TITLES[view], destroy: stop, tab: "fertility" };
}
const back = (lid) => html`<a class="back-link" href="#/l/${lid}/fertility">${raw(icon("back"))}Fertility</a>`;

function vet(body, snap) {
  const { lid } = snap; const w = canWrite(snap.role, "pds");
  const g = actionLists(snap.s, snap.ix, snap.data, snap.today, 3);
  const listed = snap.data.animals.filter((a) => onFarm(a) && a.vetCheck).sort(sortByNo);
  const pds = g.pd.filter((x) => !x.a.vetCheck); const nsb = g.notSeen.filter((x) => !x.a.vetCheck);
  const rows = [...pds.map((x) => [x.a, "PD", x.why]), ...listed.map((a) => [a, a.vetCheck.reason, `added ${dm(a.vetCheck.added)}`])];
  const node = el(html`<div>${back(lid)}${largeTitle("Vet visit list", `${rows.length} cows for the fertility visit`)}
    ${rows.length ? html`<div class="list">${rows.map(([a, why, sub]) => cowRow(snap, a, { extra: html`<span class="secondary">${why} · ${sub}</span>`, action: w && a.vetCheck ? html`<button type="button" class="btn secondary" data-off="${a.id}">Remove</button>` : "" }))}</div>` : html`<div class="card pad t-callout ink-2">Nobody on the list. Cows due a PD join it by themselves; add others from the cow card or the "Not seen bulling" list.</div>`}
    ${nsb.length && w ? html`<div class="section"><button type="button" class="btn secondary" data-nsb>Add ${nsb.length} not seen bulling</button></div>` : ""}
    <div class="section" style="display:flex;gap:8px"><button type="button" class="btn secondary" data-print>Print the list</button>${w && rows.length ? html`<button type="button" class="btn" data-results>Enter the vet's results</button>` : ""}</div></div>`);
  body.replaceChildren(node);
  const q = (s) => node.querySelector(s);
  node.querySelectorAll("[data-off]").forEach((b) => (b.onclick = () => setVetList(lid, snap.ix.byId.get(b.dataset.off), null)));
  if (q("[data-nsb]")) q("[data-nsb]").onclick = () => { nsb.forEach((x) => setVetList(lid, x.a, "Not seen bulling")); toast(`${nsb.length} added to the vet list`); };
  q("[data-print]").onclick = () => printDoc({ title: "Vet fertility visit", top: [["Herd", snap.s.herdNo || ""], ["Date", snap.today]], headers: ["Cow", "Name", "Why", "Detail", "Result"], rows: rows.map(([a, why, sub]) => [cowLabel(a), a.name || "", why, sub, ""]) });
  if (q("[data-results]")) q("[data-results]").onclick = () => resultsSheet(snap, rows.map((r) => r[0]));
}

function resultsSheet(snap, cows) {
  const res = new Map();
  const body = el(html`<div><p class="hint" style="margin:0 4px 12px">Tap a result for each cow the vet saw. Cows left blank stay on the list.</p><div class="list">${cows.map((a) => html`<div class="row cow-row"><span class="cow-no">${cowLabel(a)}</span><span class="main"><span class="secondary">${a.vetCheck?.reason || "PD"}</span></span><span class="chips" data-cow="${a.id}" style="flex-wrap:nowrap">${["+", "−", "OK"].map((r) => html`<button type="button" class="chip" data-r="${r}" aria-pressed="false" style="min-width:48px;justify-content:center">${r === "+" ? "PD+" : r === "−" ? "PD−" : "Seen"}</button>`)}</span></div>`)}</div></div>`);
  body.addEventListener("click", (e) => { const b = e.target.closest("[data-r]"); if (!b) return; const id = b.parentElement.dataset.cow; b.parentElement.querySelectorAll("[data-r]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); res.set(id, b.dataset.r); });
  const btn = el(html`<button type="button" class="btn">Save results</button>`);
  const sh = openSheet({ title: "Vet's results", body, footer: btn });
  btn.onclick = () => {
    for (const [id, r] of res) { const a = snap.ix.byId.get(id); if (r !== "OK") recordPd(snap.lid, { animalId: id, date: snap.today, result: r === "+" ? "+" : "-", vet: "Fertility visit" }); if (a.vetCheck) setVetList(snap.lid, a, null); }
    sh.close(true, { force: true }); toast(`${res.size} result${res.size === 1 ? "" : "s"} saved`);
  };
}

function sires(body, snap) {
  const { lid } = snap; const w = canWrite(snap.role, "straws");
  const st = strawsLeft(snap.data.straws, snap.data.services);
  const females = snap.data.animals.filter((a) => onFarm(a) && ["milking", "heifer"].includes(groupOf(snap.ix, a, snap.today)) && !fertilityOf(snap.s, snap.ix, a, snap.today).pregnant).sort(sortByNo);
  const by = (p) => females.filter((a) => a.sirePlan === p).length;
  const seasonStart = addDays(snap.today, -120);
  const beefServes = snap.data.services.filter((x) => x.date >= seasonStart && /^(AA|HER|LIM|CH|BB|SIM|SAL|DAQ)$/i.test(x.sireBreed || "")).length;
  const node = el(html`<div>${back(lid)}${largeTitle("Sire plan and straws", `${by("Beef sire")} cows planned to a beef sire`)}
    ${beefServes ? html`<div class="banner-line">${raw(icon("info"))}<span>Beef sire on ${beefServes} cow${beefServes === 1 ? "" : "s"} this season — fewer dairy bull calves.</span></div>` : ""}
    ${sectionOf("Straws in the flask", html`${st.length ? html`<div class="list">${st.map((x) => html`<div class="row no-lead"><span class="main"><span class="primary">${x.bull}${x.sexed ? " (sexed)" : ""}</span><span class="secondary">${[x.code, x.breed].filter(Boolean).join(" · ")}</span></span>${pill(x.left <= 2 ? "due" : "neutral", `${x.left} left`)}</div>`)}</div>` : html`<p class="hint">No straws recorded.</p>`}${w ? html`<button type="button" class="btn secondary" data-straw style="margin-top:8px">Add straws</button>` : ""}`)}
    ${sectionOf("Plan per cow", html`<p class="hint" style="margin:0 4px 8px">Sexed: ${by("Sexed dairy")} · Conventional: ${by("Conventional dairy")} · Beef: ${by("Beef sire")} · Not set: ${females.length - by("Sexed dairy") - by("Conventional dairy") - by("Beef sire")}</p>
      <div class="list">${females.map((a) => cowRow(snap, a, { action: w ? " " : "", extra: !w ? "" : html`<span class="chips" data-plan="${a.id}" style="margin-top:8px">${[["Sexed dairy", "Sexed"], ["Conventional dairy", "Conventional"], ["Beef sire", "Beef sire"]].map(([v, l]) => html`<button type="button" class="chip" data-v="${v}" aria-pressed="${a.sirePlan === v}" style="height:36px;padding:0 10px">${l}</button>`)}</span>` }))}</div>`)}</div>`);
  body.replaceChildren(node);
  const sb = node.querySelector("[data-straw]"); if (sb) sb.onclick = async () => (await import("../flows/breeding.js")).strawSheet(snap);
  node.querySelectorAll("[data-plan] [data-v]").forEach((b) => (b.onclick = () => { const a = snap.ix.byId.get(b.parentElement.dataset.plan); updateCow(lid, a, { sirePlan: a.sirePlan === b.dataset.v ? null : b.dataset.v }); }));
}

function kpis(body, snap) {
  const s = snap.s; const r = rates21(s, snap.ix, snap.data, snap.today, 6); const last = r[r.length - 1];
  const pd = pctPregnantAtPd(snap.ix, snap.data, snap.today); const wk = weeklyPregnancies(s, snap.ix, snap.data, snap.today);
  const six = sixWeekInCalf(s, snap.ix, snap.data, snap.today); const sixH = sixWeekInCalf(s, snap.ix, snap.data, snap.today, { heifers: true });
  const ci = calvingInterval(snap.ix, snap.data, snap.today); const afc = ageFirstCalving(snap.ix, snap.data, snap.today);
  const pct = (x) => (x == null ? "—" : `${Math.round(x * 100)}%`);
  const kpi = (name, value, target, formula, tone = "") => html`<div class="card pad" style="margin-top:12px"><div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline"><span class="t-strong">${name}</span><span class="big-fig ${tone}">${value}</span></div><p class="hint" style="margin:2px 0 0">Target: ${target}</p><p class="formula">${formula}</p></div>`;
  const node = el(html`<div>${back(snap.lid)}${largeTitle("Fertility KPIs", "Different software gives different numbers — the formula is under each one")}
    ${sectionOf("21-day pregnancy rate", html`<div class="card pad"><p class="t-callout">Last complete 21 days: <b>${pct(last.prRate)}</b> · target above 21%</p>${barChart(r.map((x) => (x.prRate == null ? null : x.prRate * 100)), { target: 21, max: 50, labels: r.map((x) => dm(x.start)) })}<p class="formula">Pregnancies ÷ eligible cows in each 21 days (eligible: past ${s.vwp}-day waiting period, not pregnant, not "do not breed"). The last ${s.pdTo} days are left out until PDs are done.</p></div>`)}
    ${kpi("21-day submission rate", pct(last.subRate), "60–65%", "Cows served ÷ eligible cows in the last complete 21 days.")}
    ${kpi("% pregnant at PD", pd.n ? pct(pd.rate) : pd.all ? `${pct(pd.allRate)}*` : "—", "above 70%", `PD+ ÷ PDs done 32–39 days after service (${pd.n} PDs, last 12 months).${!pd.n && pd.all ? " *No PDs in that window — all PDs shown." : ""} Low = poor heat detection.`)}
    ${s.block ? kpi("6-week in-calf rate", six ? pct(six.rate) : "Set breeding start", "78% (heifers 90%)", `In calf to services in the first 42 days of the breeding season ÷ cows (${six ? `${six.inCalf} of ${six.cows}` : "—"})${sixH && sixH.cows ? ` · heifers ${pct(sixH.rate)}` : ""}.`)
      : kpi("Weekly pregnancies", wk.rate != null ? wk.rate.toFixed(1) : "—", "above 1.5 per 100 cows", `Pregnancies in the 4 weeks before the last ${s.pdTo} days ÷ 4, per 100 cows in the herd (${wk.preg} pregnancies, ${wk.cows} cows).`)}
    ${kpi("Calving interval", ci.days ? `${ci.days} d` : "—", "365–380 days", `Mean days between calvings for cows calved in the last 12 months (${ci.n}). A "rear-view mirror" figure: it tells you about fertility a year ago.`, ci.days > 400 ? "late-ink" : "")}
    ${kpi("Age at first calving", afc.months ? `${afc.months} mo` : "—", "24 months", `Mean age of heifers calving for the first time in the last 12 months (${afc.n}).`)}
  </div>`);
  body.replaceChildren(node);
  void kvRows;
}
