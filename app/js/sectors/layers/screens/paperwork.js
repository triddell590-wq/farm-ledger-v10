// More → Paperwork and Lion (design/14 §9.1): inspection readiness against the British Lion Code
// (auto-evidenced), Inspector is here, then every register and log with its state. Each row
// opens the register screen (print / CSV) or the live log.
import { html, raw } from "../../../core/html.js";
import { icon } from "../../../ui/icons.js";
import { addDays, daysBetween } from "../../../core/dates.js";
import { largeTitle, backLink, groupLabel } from "../../../screens/common.js";
import { liveScreen } from "./live.js";
import { dm, d2 } from "../ui.js";
import { LION_ITEMS, RSPCA_ITEMS, evaluate, audits } from "../model/lion.js";
import { LION_HEADER } from "../model/content.js";
import { sortedHouses, flockIn } from "../model/flock.js";
import { salmonella } from "../model/health.js";
import { storeStatus } from "../model/eggs.js";
import { aiState, spaceCheck } from "../model/house.js";
import { birdCountDay } from "../model/content.js";
import { aliveAt } from "../model/flock.js";

export default async function paperwork(ctx) {
  return liveScreen(ctx, { title: "Paperwork", tab: "more", paint });
}

function paint(snap) {
  const L = (h) => `#/l/${snap.lid}/${h}`; const c = snap.c; const T = snap.today;
  const rows = evaluate(c, LION_ITEMS, snap.meta.lion || {}); const done = rows.filter((r) => r.ok).length;
  const au = audits(snap.meta.lion || {}, T);
  const live = sortedHouses(c).map((h) => ({ h, f: flockIn(c, h.id) })).filter((x) => x.f);
  const salLate = live.filter(({ f }) => { const s = salmonella(c, f); return !s.exempt && s.level === "late"; }).length;
  const salDue = live.filter(({ f }) => { const s = salmonella(c, f); return !s.exempt && s.level === "due"; }).length;
  const st = storeStatus(c);
  const alarmLate = live.filter(({ h }) => { const a = [...snap.data.alarmTests].filter((x) => !x.houseId || x.houseId === h.id).sort((x, y) => y.date.localeCompare(x.date))[0]; return !a || daysBetween(a.date, T) > +snap.s.alarmEveryDays; }).length;
  const visitorsWk = snap.data.visitors.filter((v) => v.date > addDays(T, -7)).length;
  const rodent = [...snap.data.rodentVisits].sort((a, b) => b.date.localeCompare(a.date))[0];
  const plan = [...snap.data.healthPlans].sort((a, b) => b.date.localeCompare(a.date))[0];
  const feed60 = snap.data.feedDeliveries.filter((x) => x.date > addDays(T, -60)); const noSample = feed60.filter((x) => !x.sample || !x.ufas).length;
  const spaceShort = live.filter(({ h, f }) => !spaceCheck(h, aliveAt(c, f, T)).ok).length;
  const yr = T.slice(0, 4); const regDate = `${yr}-${birdCountDay(c.region)}`; const regDone = snap.data.birdRegisterReturns.some((x) => String(x.year) === yr && x.submittedOn);
  const ai = aiState(c); const bioToday = snap.data.biosecurity.some((b) => b.date === T);
  const passOk = live.every(({ f }) => f.rearer && f.hatchDate);
  const R = (href, title, right = "", tone = "", ic = "", sub = "") => html`<a class="row${ic ? "" : " no-lead"}" href="${href}">${ic ? html`<span class="tile">${raw(icon(ic))}</span>` : ""}<span class="main"><span class="primary">${title}</span>${sub ? html`<span class="secondary">${sub}</span>` : ""}</span>${right ? html`<span class="ly-r ${tone ? "ly-ink-" + tone : ""}">${right}</span>` : ""}<span class="chev">${raw(icon("chevron"))}</span></a>`;
  return html`<div>${backLink(L("more"), "More")}${largeTitle("Paperwork and Lion", [snap.s.producerCode, "DAERA Egg Marketing · Salmonella NCP"].filter(Boolean).join(" · "))}
    <div class="list">${R(L("lion"), "Inspection ready? (Lion)", `${done} of ${rows.length}`, done === rows.length ? "ok" : "due", "check", au.internalLate ? `Internal audit due ${d2(au.internalDue)}` : au.independentDue ? `Independent audit by ${d2(au.independentDue)}` : "Record your last audits")}
      ${snap.s.rspca ? R(L("rspca"), "RSPCA Assured (optional)", `${evaluate(c, RSPCA_ITEMS, snap.meta.lion || {}).filter((r) => r.ok).length} of ${RSPCA_ITEMS.length}`, "", "check", "Edition to be confirmed") : ""}</div>
    <a class="btn" style="margin-top:12px" href="${L("inspect")}">${raw(icon("shield"))}Inspector is here</a>
    <p class="ly-note">${LION_HEADER}</p>
    <div class="section">${groupLabel("Eggs")}<div class="list">
      ${R(L("reg/production"), "Egg production register", "", "", "", "Producer daily records · Egg Marketing Inspectorate")}
      ${R(L("reg/collections"), "Packer collections", "", "", "", "Date, eggs, grades, docket, best before")}
      ${R(L("reg/store"), "Egg store temperatures", st.over.length ? `${st.over.length} over ${snap.s.storeMax} °C` : st.last ? `last ${d2(st.last.date)}` : "none yet", st.over.length ? "due" : "")}</div></div>
    <div class="section">${groupLabel("Flocks and health")}<div class="list">
      ${R(L("reg/passports"), "Flock passports", passOk ? "complete" : "details missing", passOk ? "ok" : "due")}
      ${R(L("reg/salmonella"), "Salmonella results (2 years)", salLate ? `${salLate} overdue` : salDue ? `${salDue} due` : "on time", salLate ? "late" : salDue ? "due" : "ok")}
      ${R(L("reg/mortality"), "Mortality at inspection (3 years)", "", "", "", "Daily inspection, deaths and culls")}
      ${R(L("reg/medicines"), "Medicines", "", "", "", "Whole-house treatments, egg withdrawal first")}
      ${R(L("reg/moves"), "Bird movements")}
      ${R(L("logs/healthPlan"), "Vet health and welfare plan", plan ? `reviewed ${d2(plan.date)}` : "none yet", plan && daysBetween(plan.date, T) <= 365 ? "ok" : "due")}
      ${R(L("reg/space"), "Space check", spaceShort ? `${spaceShort} short` : "within limits", spaceShort ? "due" : "ok")}</div></div>
    <div class="section">${groupLabel("Checks")}<div class="list">
      ${R(L("logs/alarm"), "Alarm tests (weekly)", alarmLate ? `${alarmLate} overdue` : "up to date", alarmLate ? "late" : "ok")}
      ${R(L("logs/visitors"), "Visitors", `${visitorsWk} this week`)}
      ${R(L("logs/rodent"), "Rodent control", rodent ? `last ${d2(rodent.date)}` : "none yet", rodent && daysBetween(rodent.date, T) <= 92 ? "" : "due")}
      ${R(L("logs/feed"), "Feed deliveries and samples (UFAS)", noSample ? `${noSample} without sample/UFAS` : feed60.length ? "all kept" : "none in 60 days", noSample ? "due" : "")}
      ${R(L("range/biosecurity"), "AI biosecurity log", ai.aipz ? (bioToday ? "done today" : "due today") : "no order in force", ai.aipz && !bioToday ? "due" : "")}</div></div>
    <div class="section">${groupLabel("Returns")}<div class="list">
      ${R(L("bird-register"), "Bird Register — 1 June", regDone ? "sent" : dm(regDate), regDone ? "ok" : T >= addDays(regDate, -7) ? "due" : "", "", "Birds per establishment number (NISRA)")}</div></div>
  </div>`;
}
