// Paperwork (design/13 §8.1): a tab on finishing and small-herd farms, More → Paperwork on
// breeding farms. Inspection readiness (Red Tractor Pigs v5.2), Inspector is here, registers,
// periodic checks and returns, each row with its state.
import { html, raw } from "../../../core/html.js";
import { icon } from "../../../ui/icons.js";
import { largeTitle, backLink, groupLabel } from "../../../screens/common.js";
import { liveScreen } from "./live.js";
import { d2 } from "../ui.js";
import { evaluate, summary, HEADER } from "../model/checklist.js";
import { notifyState, qvrState, embDue, inventoryDue, checkState } from "../model/paperwork.js";
import { houses, alarmState } from "../model/rooms.js";
import { weekDates } from "../model/weeks.js";
import { pm2Series } from "../model/inventory.js";

export default async function paperwork(ctx) {
  const isTab = ctx.tabId === "paperwork";
  return liveScreen(ctx, { title: "Paperwork", depth: isTab ? 0 : 1, tab: isTab ? null : "more", paint: (snap) => {
    const lid = snap.lid; const L = (h) => `#/l/${lid}/${h}`; const T = snap.today;
    const rows = evaluate(snap.c, snap.meta.rtChecklist || {}); const sm = summary(rows);
    const toNotify = snap.data.moves.filter((m) => ["due", "late", "info"].includes(notifyState(m, T).level) && m.direction === "off" && !m.notified).length;
    const pm2 = pm2Series(snap, 1)[0];
    const alarmsLate = houses(snap.data.rooms.filter((r) => r.mechVent !== false)).filter((h) => alarmState(snap.data.alarmTests, h, T).level === "late").length;
    const wk = weekDates(T, snap.s.weekStart); const visitors = snap.data.visitors.filter((v) => v.date >= wk[0] && v.date <= wk[6]).length;
    const q = qvrState(snap.data.vetVisits, T); const e = embDue(T, snap.data.embUploads); const inv = inventoryDue(T, snap.ledger.region || "NI");
    const ver = checkState(snap.data.siteChecks, "vermin", T); const wat = checkState(snap.data.siteChecks, "water", T);
    const plansOn = new Set(snap.data.plans.map((p) => p.kind)).size;
    const R = (href, title, right = "", tone = "", ic = "", sub = "") => html`<a class="row${ic ? "" : " no-lead"}" href="${href}">${ic ? html`<span class="tile">${raw(icon(ic))}</span>` : ""}<span class="main"><span class="primary">${title}</span>${sub ? html`<span class="secondary">${sub}</span>` : ""}</span>${right ? html`<span class="pg-r ${tone ? "pg-ink-" + tone : ""}">${right}</span>` : ""}<span class="chev">${raw(icon("chevron"))}</span></a>`;
    return html`<div>${isTab ? "" : backLink(L("more"), "More")}${largeTitle("Paperwork", "Red Tractor Pigs · NIFAIS · DAERA")}
      <div class="list">${R(L("rt"), "Inspection ready?", `${sm.done} of ${sm.n}`, sm.keyGaps ? "due" : "ok", "check", sm.keyGaps ? `${sm.keyGaps} key standard${sm.keyGaps > 1 ? "s" : ""} open` : "Key standards covered")}</div>
      <a class="btn" style="margin-top:12px" href="${L("inspect")}">${raw(icon("shield"))}Inspector is here</a>
      <p class="pg-note">${HEADER}</p>
      <div class="section">${groupLabel("Registers")}<div class="list">
        ${R(L("reg/pm1"), "Movement book (PM1)", toNotify ? `${toNotify} to notify` : "", toNotify ? "due" : "")}
        ${R(L("reg/pm2"), "Holding register (PM2)", `${pm2.month.slice(5)}/${pm2.month.slice(2, 4)} ${pm2.saved ? "closed" : "open"}`)}
        ${snap.s.breeding ? R(L("reg/herd"), "Breeding herd register") : ""}
        ${R(L("reg/medicines"), "Medicines (use, purchase, disposal)")}
        ${R(L("reg/mortality"), "Mortality and fallen stock")}
        ${R(L("reg/tailbites"), "Tail biting and injurious behaviour")}
        ${R(L("reg/enrichment"), "Enrichment")}
        ${R(L("reg/feed"), "Feed deliveries")}</div></div>
      <div class="section">${groupLabel("Checks")}<div class="list">
        ${R(L("reg/alarms"), "Alarm tests", alarmsLate ? `${alarmsLate} overdue` : "up to date", alarmsLate ? "late" : "ok")}
        ${R(L("gate"), "Visitors (gate log)", `${visitors} this week`)}
        ${R(L("qvr"), "Vet visits (QVR)", q.last ? `${q.weeks} wk${q.level !== "ok" ? " · due" : ""}` : "none yet", q.level === "late" ? "late" : q.level === "due" ? "due" : "")}
        ${R(L("reg/vermin"), "Vermin (quarterly)", ver.last ? `next ${d2(ver.due)}` : "none yet", ver.level === "late" ? "late" : ver.level === "due" ? "due" : "")}
        ${snap.s.mainsWater ? "" : R(L("reg/water"), "Water test (yearly, non-mains)", wat.last ? `next ${d2(wat.due)}` : "none yet", wat.level === "late" ? "late" : wat.level === "due" ? "due" : "")}
        ${R(L("reg/wash"), "Wash and disinfection")}</div></div>
      <div class="section">${groupLabel("Returns")}<div class="list">
        ${R(L("emb"), `eMB-Pigs ${e.label.split(" ")[0]} antibiotics`, e.done ? "uploaded" : `by ${d2(e.due)}`, e.done ? "ok" : e.level === "late" ? "late" : e.level === "due" ? "due" : "")}
        ${R(L("inventory"), "Pig inventory (1 June)", snap.data.inventories.some((x) => x.date === inv.date) ? "done" : d2(inv.date), inv.level === "due" ? "due" : "")}
        ${R(L("plans"), "Plans: health, tail-biting, emergency, extreme weather, biosecurity", `${plansOn} of 6`)}</div></div></div>`;
  } });
}
