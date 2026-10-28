// Broilers → Crop, the home (design/15 §3). One countdown card per house — "Day 23 of 38", the
// crop bar to the thin and clear-out, weight against the breed objective, alive, deaths today,
// crop mortality and water, and the AM / PM check buttons. The crop stage is the mode: the card
// changes for placement, brooding, thin day, clear-out and turnaround. Then the mortality alarm,
// Coming up (next 3 milestones) and To do today. Deep link #/l/<id>/check/<house>/<date>/<slot>
// opens the check sheet over this screen.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { taskList } from "../../../ui/tasks.js";
import { todaysTasks } from "../../../services/tasks.js";
import { canWrite } from "../../../core/policy.js";
import { largeTitle, groupLabel, emptyState } from "../../../screens/common.js";
import { alertCard } from "../../../screens/overview-today.js";
import { bannerItems } from "../../../content/region-rules.js";
import { liveScreen, flowArg } from "./live.js";
import { cropBar, n0, pc, dm, when, hm, okCard, plural } from "../ui.js";
import { houseState, cropEvents, clearDayOf, aliveStart, aliveEnd, deathsOn, cumMortPct, waterChangePct, cropNo, listOf } from "../model/crop.js";
import { stdOf, estWeight, stdWt, daysUnder } from "../model/growth.js";
import { salmStatus, turnaroundDays, feedOffDefault } from "../model/paper.js";
import { broilerAlerts, checkState, mortalityAlarm } from "../model/alerts.js";
import { todayTasks, comingUp } from "../model/duties.js";
import { TURNAROUND_STEPS } from "../model/content.js";
import { tickGenerated } from "../actions.js";

export function contextLine(snap) {
  const s = snap.s; const n = snap.ix.houses.length;
  return ["Broilers", n ? plural(n, "house") : null, s.hybrid, s.processor ? `${s.processor} contract` : null].filter(Boolean).join(" · ");
}

export default async function crop(ctx) {
  const g = ctx.match?.groups || null;
  return liveScreen(ctx, {
    title: (snap) => (cropNo(snap.ix) ? `Crop ${cropNo(snap.ix)}` : "Crop"), tab: "crop", depth: g ? 1 : 0, paint,
    mounted: g ? async (snap) => { const m = await import("../flows/check.js"); m.checkFlow(snap, { houseId: g.houseId, slot: g.slot, date: g.date }); } : undefined,
    after: (node, snap) => taskSection(snap, node),
  });
}

async function taskSection(snap, node) {
  const tb = node.querySelector("[data-tasks]"); if (!tb) return;
  const gen = todayTasks(snap.c).filter((t) => t.kind !== "check").map((t) => ({ id: t.key, title: t.title, due: t.due, sub: t.sub, href: t.href, legal: t.legal, generated: true, done: false, ledger: snap.ledger, tick: (d) => tickGenerated(snap.lid, snap, t, d) }));
  const checks = todayTasks(snap.c).filter((t) => t.kind === "check").map((t) => ({ id: t.key, title: t.title, due: t.due, sub: t.sub, href: t.href, legal: true, generated: true, done: false, ledger: snap.ledger, tick: () => {} }));
  const stored = (await todaysTasks([snap.ledger])).filter((t) => !t.sourceRef || t.done);
  const tasks = [...checks, ...gen, ...stored].sort((a, b) => (a.done - b.done) || (b.legal ? 1 : 0) - (a.legal ? 1 : 0) || String(a.due).localeCompare(String(b.due)));
  tb.replaceChildren(el(groupLabel("To do today", tasks.filter((t) => !t.done).length || "")));
  const list = tasks.length ? taskList(tasks, { max: 10, onChange: () => {} }) : el(okCard("Nothing else to do today."));
  // AM / PM rows open the check sheet rather than being ticked off
  list.querySelectorAll(".task").forEach((r) => { const t = checks.find((x) => x.id === r.dataset.task); if (t) { const b = r.querySelector(".tick"); b.disabled = true; b.setAttribute("aria-label", `${t.title} — open the check`); } });
  tb.append(list);
}

function paint(snap) {
  const { ix, s, lid, today } = snap; const L = (h) => `#/l/${lid}/${h}`; const can = canWrite(snap.role, "checks");
  const title = cropNo(ix) ? `Crop ${cropNo(ix)}` : "Broilers";
  if (!ix.houses.length) return html`<div>${largeTitle(title, contextLine(snap))}${emptyState({ sector: "broilers", title: "Add your houses", body: "Each house needs its usable floor area — it drives the density planner.", action: canWrite(snap.role, "houses") ? "Add a house" : null, actAttr: `data-flow="house"` })}</div>`;
  const alerts = broilerAlerts(snap.c);
  const mort = alerts.filter((a) => a.kind === "mortality");
  const late = alerts.filter((a) => a.level === "late" && a.kind !== "mortality" && !a.key.startsWith("check:")).slice(0, 3);
  const banners = bannerItems(snap.ledger.region || "NI", ["broilers"]);
  const up = comingUp(snap.c, 3);
  return html`<div>
    ${largeTitle(title, contextLine(snap))}
    ${s.houseNote ? html`<div class="br-pin">${raw(icon("info"))}<span><b>House instructions</b>${s.houseNote}</span></div>` : ""}
    ${banners.map((b) => html`<div class="br-banner">${raw(icon("info"))}<span>${b.text}</span></div>`)}
    ${mort.length ? html`<div class="section">${mort.map((a) => mortCard(snap, a))}</div>` : ""}
    ${late.length ? html`<div class="section br-alerts">${late.map((a) => alertCard(a, false))}</div>` : ""}
    <div class="section br-houses">${ix.houses.map((h) => houseCard(snap, h, can, alerts))}</div>
    ${up.length ? html`<div class="section">${groupLabel("Coming up")}<div class="list">${up.map((x) => html`<a class="row" href="${x.href}"><span class="tile">${raw(icon(x.icon))}</span><span class="main"><span class="primary">${x.title}</span><span class="secondary">${x.sub}</span></span><span class="chev">${raw(icon("chevron"))}</span></a>`)}</div></div>` : ""}
    <div class="section" data-tasks></div>
  </div>`;
}

function mortCard(snap, a) {
  const tel = (n) => (n ? `tel:${String(n).replace(/[^\d+]/g, "")}` : null);
  const vet = tel(snap.s.vetPhone); const daera = tel(snap.s.daeraPhone || "0300 200 7840");
  return html`<div class="alert ${a.level} br-mort" role="alert"><span class="a-icon">${raw(icon("alert"))}</span><div style="flex:1;min-width:0">
    <div class="a-title">${a.title}</div><div class="a-body">${a.body}</div>
    <div class="br-acts">${vet ? html`<a class="btn secondary" href="${vet}">${raw(icon("phone"))}Call vet</a>` : html`<a class="btn secondary" href="#/l/${snap.lid}/br-settings">${raw(icon("phone"))}Add vet's number</a>`}<a class="btn secondary" href="${daera}">${raw(icon("phone"))}Call DAERA</a></div></div></div>`;
}

function salmBracket(snap, crop) {
  const x = salmStatus(snap.ix, crop, snap.s, snap.today).find((y) => !y.sample || y.state === "waiting"); if (!x) return null;
  const d0 = (iso) => Math.round((Date.parse(iso + "T12:00Z") - Date.parse(crop.placedDate + "T12:00Z")) / 864e5);
  return { from: Math.max(0, d0(x.window.from)), to: d0(x.window.to) };
}

function bar(snap, crop, day) {
  const evs = cropEvents(snap.ix, crop, snap.s); const clearDay = clearDayOf(snap.ix, crop, snap.s);
  const thin = evs.find((e) => e.kind === "thin");
  return cropBar({ day, clearDay, events: evs.map((e) => ({ day: e.day, kind: e.kind, done: e.done })), salm: salmBracket(snap, crop), weighDays: snap.s.weighDays, ariaLabel: `Day ${day} of ${clearDay}${thin ? `: thin on day ${thin.day}` : ""}, clear on day ${clearDay}` });
}

function slotBtn(snap, house, crop, slot, st, can) {
  const x = st[slot]; const S = slot.toUpperCase();
  if (x.done) return html`<span class="br-done">${raw(icon("check"))}${S} ${x.check.time || ""}${x.check.byName ? " " + x.check.byName.split(" ")[0] : ""}</span>`;
  if (!can) return html`<span class="br-notdone ${x.level}">${S} not done</span>`;
  return html`<button type="button" class="btn${x.level === "late" ? " br-late" : ""}${slot === "pm" && !st.am.done ? " secondary" : ""}" data-flow="${slot}" data-arg="${flowArg({ houseId: house.id })}">${S} check</button>`;
}

function houseCard(snap, house, can, alerts) {
  const { ix, s, today, lid } = snap; const L = (h) => `#/l/${lid}/${h}`;
  const st = houseState(ix, house, s, today); const crop = st.crop;
  const edge = alerts.some((a) => a.houseId === house.id && a.level === "late" && a.kind === "mortality") ? "late" : alerts.some((a) => (a.houseId === house.id || a.href?.includes(crop?.id || "§")) && a.level === "due" && !a.key.startsWith("check:")) ? "due" : "";
  if (st.stage === "empty") return html`<div class="br-hc"><div class="t">${house.name}<span>${n0(house.usableM2)} m²</span></div>
    <p class="br-hc-big">${house.name} is ready for chicks</p><p class="br-hc-sub">Start a crop when chicks are placed. Day 0 is placement day.</p>
    ${canWrite(snap.role, "crops") ? html`<button type="button" class="btn" data-flow="startCrop" data-arg="${flowArg({ houseId: house.id })}">Start a crop</button>` : ""}</div>`;
  if (st.stage === "turnaround" || (st.stage === "placement" && !crop)) {
    const ta = st.turnaround; const td = turnaroundDays(ta, today); const done = new Set((ta.steps || []).filter((x) => x.at).map((x) => x.key));
    const steps = TURNAROUND_STEPS.filter(([k]) => k !== "placed" && (k !== "swabs" || ta.swabsRequired));
    const next = steps.find(([k]) => !done.has(k));
    return html`<a class="br-hc ${td.short ? "due" : ""}" href="${L(`turnaround/${house.id}`)}"><div class="t">${house.name}<span class="pill neutral">Turnaround</span></div>
      ${st.stage === "placement" ? html`<p class="br-hc-big">Chicks arrive ${dm(ta.nextPlacement)}</p><p class="br-hc-sub">Pre-heat on? Start it 24–48 hours before.</p>` : html`<div class="br-day"><b>Day ${td.days}</b><span>empty${td.planned != null ? ` of ${td.planned} planned` : ""}</span></div>`}
      <div class="br-steps">${steps.map(([k, l]) => html`<span class="${done.has(k) ? "on" : ""}" title="${l}"></span>`)}</div>
      <p class="br-hc-sub">${done.size ? `${[...done].filter((k) => k !== "placed").length} of ${steps.length} steps done` : "Cleared " + dm(ta.clearedDate)}${next ? ` · next: ${next[1]}` : " · ready for chicks"}</p></a>`;
  }
  if (st.stage === "placement") return html`<div class="br-hc"><div class="t">${house.name}<span class="pill info">Placement due</span></div><p class="br-hc-big">Chicks arrive ${dm(crop.placedDate)} ${crop.placedTime || ""}</p><p class="br-hc-sub">Pre-heat on? ${n0(crop.placed)} chicks · crop ${crop.no || ""}</p><a class="btn secondary" href="${L(`brooding/${crop.id}`)}">Brooding checklist</a></div>`;
  const day = st.day; const clearDay = clearDayOf(ix, crop, s); const std = stdOf(crop, s);
  const ck = checkState(snap.c, house, crop);
  const alive = aliveEnd(ix, crop, today); const dead = deathsOn(ix, crop, today); const cum = cumMortPct(ix, crop, today);
  const wc = waterChangePct(ix, crop, today); const m = mortalityAlarm(snap.c, crop);
  const top = html`<div class="t">${house.name}${st.stage === "brooding" ? html`<span class="pill info">Brooding</span>` : ""}</div>
    <div class="br-day"><b>Day ${day}</b><span>of ${clearDay}</span></div>${bar(snap, crop, day)}`;
  let mid;
  if (st.stage === "brooding") {
    const b = ix.brooding.get(crop.id) || {};
    const items = [["preheat", "Pre-heat", !!b.preheat], ["prep", "Ready for chicks", !!b.prep], ["arrived", "Chicks arrived", !!b.chicksArrived?.n], ["cropFill8h", `Crop-fill 8 h${b.cropFill8h != null ? ` ${b.cropFill8h}%` : ""}`, b.cropFill8h != null], ["cropFill24h", `Crop-fill 24 h${b.cropFill24h != null ? ` ${b.cropFill24h}%` : ""}`, b.cropFill24h != null], ["behaviour", "Chick behaviour", !!b.behaviour]];
    mid = html`<a class="br-brood" href="${L(`brooding/${crop.id}`)}"><span class="k">Brooding checklist · ${items.filter((x) => x[2]).length} of ${items.length}</span><span class="br-chips">${items.map(([, l, on]) => html`<span class="${on ? "on" : ""}">${on ? raw(icon("check")) : ""}${l}</span>`)}</span></a>`;
  } else if (st.stage === "thinning" || st.stage === "clear") {
    const ev = st.event || cropEvents(ix, crop, s).find((e) => e.kind === "clear"); const t = ev?.rec;
    mid = html`<div class="br-today"><b>${ev?.kind === "clear" ? "Clear-out" : "Thin"} today${t?.birds || ev?.birds ? ` · ${n0(t?.birds || ev.birds)} birds` : ""}</b>${t ? html`<span>catch ${hm(t.catchAt)} · feed off from ${hm(t.feedOffAt || feedOffDefault(t.catchAt, s))}</span>` : ""}
      ${canWrite(snap.role, "thins") ? html`<button type="button" class="btn" data-flow="${ev?.kind === "clear" ? "clear" : "thin"}" data-arg="${flowArg({ cropId: crop.id, thinId: t?.id })}">Record ${ev?.kind === "clear" ? "clear-out" : "thin"}</button>` : ""}</div>`;
  }
  const est = estWeight(ix, crop, std, day, today); const diff = (est / stdWt(std, day) - 1) * 100; const under = daysUnder(ix, crop, std, today, s.weightAlertPct);
  const weighed = listOf(ix.weighs, crop.id).length > 0;
  const wt = html`<a class="br-wt" href="${L(`growth/${crop.id}`)}">${n0(est)} g <span class="${diff < -s.weightAlertPct ? "due" : "ok"}">${diff >= 0 ? "▲" : "▼"} ${Math.abs(diff).toFixed(0)}% ${diff >= 0 ? "over" : "under"} ${std.hybrid}${under >= s.weightAlertDays ? " ⚠" : ""}</span>${weighed ? "" : html`<small>objective — weigh a sample</small>`}</a>`;
  const deadTxt = m ? html`<span class="w">${dead} ⚠</span>` : html`<b>${dead}</b>`;
  return html`<div class="br-hc ${edge}" data-house="${house.id}">${top}${mid || ""}
    ${st.stage === "brooding" ? "" : wt}
    <div class="br-facts"><b>${n0(alive)}</b> alive · deaths today ${deadTxt}<br>Crop mortality <b>${pc(cum, 1)}</b>${wc != null ? html` · water ${wc >= 0 ? "+" : "−"}${Math.abs(wc).toFixed(0)}%` : ""}</div>
    <div class="br-ampm">${slotBtn(snap, house, crop, "am", ck, can)}${slotBtn(snap, house, crop, "pm", ck, can)}</div></div>`;
}
export { aliveStart, when };
