// Layers → Houses, the home (design/14 §3). AI banner (content-driven), mortality-spike and
// Salmonella Class B cards first, then one card per house — today's lay % big against the breed
// band, a 14-day mini curve, deaths · water · temperature, and the sheet button or its tick —
// then To do today. Empty houses show their turnaround; pre-lay flocks show first eggs and floor eggs.
import { html, raw } from "../../../core/html.js";
import { el, reduceMotion } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { taskList } from "../../../ui/tasks.js";
import { todaysTasks } from "../../../services/tasks.js";
import { canWrite } from "../../../core/policy.js";
import { largeTitle, groupLabel, emptyState } from "../../../screens/common.js";
import { alertCard } from "../../../screens/overview-today.js";
import { bannerItems } from "../../../content/region-rules.js";
import { liveSnap } from "../data.js";
import { wireFlows, flowArg } from "./live.js";
import { miniCurve, dm, d2, n0, n1, okCard } from "../ui.js";
import { sortedHouses, flockIn, aliveAt } from "../model/flock.js";
import { houseCard } from "../model/cards.js";
import { layerAlerts } from "../model/alerts.js";
import { todayTasks } from "../model/duties.js";
import { aiState, systemName } from "../model/house.js";
import { AI_STATUS, freeRangeText } from "../model/content.js";
import { tickGenerated, turnStage, TURN_STAGES } from "../actions.js";

export function contextLine(snap) {
  const hs = sortedHouses(snap.c); const hens = hs.reduce((t, h) => { const f = flockIn(snap.c, h.id); return t + (f ? aliveAt(snap.c, f, snap.today) : 0); }, 0);
  const systems = [...new Set(hs.map((h) => systemName(h.system).toLowerCase()).filter(Boolean))];
  return ["Layers", snap.s.producerCode || hs.find((h) => h.producerCode)?.producerCode, systems.join(" + ") || null, hens ? `${n0(hens)} hens` : null].filter(Boolean).join(" · ");
}

export default async function houses(ctx) {
  const body = el(html`<div class="ly-page"></div>`); let cur = null; let opened = false;
  wireFlows(body, () => cur);
  const { first, stop } = liveSnap(ctx.ledger, async (snap) => { cur = snap; await paint(body, snap); });
  await first;
  const want = ctx.match?.groups;
  const mounted = () => {
    if (want && !opened && cur) { opened = true; const h = cur.data.houses.find((x) => x.id === want.houseId);
      if (h && canWrite(cur.role, "days")) import("../flows/sheet.js").then((m) => { const f = flockIn(cur.c, h.id, want.date); if (f) m.daySheet(cur, h, f, want.date); }); }
  };
  if (want) setTimeout(mounted, 380);
  return { el: body, title: "Houses", destroy: stop, tab: want ? "houses" : undefined, depth: want ? 1 : 0 };
}

function aiBanner(snap) {
  const ai = aiState(snap.c);
  if (ai.on) {
    const bioDone = (snap.data.biosecurity || []).some((b) => b.date === snap.today);
    return html`<div class="alert ${ai.near ? "late" : "info"} ly-ai" role="status"><span class="a-icon">${raw(icon(ai.near ? "alert" : "info"))}</span>
      <div style="flex:1;min-width:0"><div class="a-title">Housing order in force since ${d2(ai.from)}</div>
      <div class="a-body">Day ${ai.daysHoused} housed · ${freeRangeText(snap.c.region)}.${ai.near ? " An outbreak is within 10 km — keep the unit locked down." : ""}</div>
      ${bioDone ? html`<div class="a-body">✓ Biosecurity check done today</div>` : canWrite(snap.role, "biosecurity") ? html`<div class="a-actions"><span>Biosecurity check today</span><button type="button" class="btn small" data-flow="log" data-arg="${flowArg({ kind: "biosecurity" })}">Do it</button></div>` : ""}</div></div>`;
  }
  const items = bannerItems(snap.ledger.region || "NI", ["layers"]);
  return html`<div class="alert info" role="status"><span class="a-icon">${raw(icon("info"))}</span><div style="flex:1;min-width:0"><div class="a-title">No housing order in Northern Ireland</div><div class="a-body">${AI_STATUS.liftedLine}</div>${items.length ? html`<div class="a-body ly-src">${items.map((b) => b.text).join(" ")} Checked ${d2(b0(items).checkedOn)}.</div>` : ""}</div></div>`;
}
const b0 = (a) => a[0] || {};

function spikeCard(snap, k) {
  const tel = (n) => String(n || "").replace(/[^\d+]/g, "");
  return html`<div class="alert late ly-spike" role="alert"><span class="a-icon">${raw(icon("alert"))}</span><div style="flex:1;min-width:0">
    <div class="a-title">${k.h.name}: ${k.sp.n} dead ${k.today || !k.shown || k.shown.date === snap.today ? "today" : "yesterday"}${k.sp.times ? ` — ${k.sp.times}× normal` : ""}</div>
    <div class="a-body">A sudden rise can be the first sign of bird flu. Phone your vet now. If you suspect bird flu you must report it to DAERA.</div>
    <div class="ly-acts">${snap.s.vetPhone ? html`<a class="btn small" href="tel:${tel(snap.s.vetPhone)}">${raw(icon("phone"))}Call vet</a>` : html`<a class="btn small secondary" href="#/l/${snap.lid}/layers-settings">Add your vet's number</a>`}
      <a class="btn small secondary" href="tel:${tel(snap.s.daeraPhone)}">${raw(icon("phone"))}Call DAERA</a></div></div></div>`;
}

function card(snap, k, { compact = false } = {}) {
  const L = (h) => `#/l/${snap.lid}/${h}`; const can = canWrite(snap.role, "days");
  if (k.empty) {
    const done = new Set(k.stages.map((s) => s.stage));
    if (compact) return html`<a class="ly-hrow" href="${L(`house/${k.h.id}`)}"><b>${k.h.name}</b><span>Empty${k.day ? ` · day ${k.day} of clean-out` : ""}</span></a>`;
    return html`<div class="ly-hc ly-empty-h" data-house="${k.h.id}"><a class="t" href="${L(`house/${k.h.id}`)}">${k.h.name} <span>· ${systemName(k.h.system).toLowerCase()} · empty</span></a>
      <p class="ly-facts">${k.day ? html`Day <b>${k.day}</b> of clean-out` : "No flock in this house"}${k.nextDate ? html` · next flock placed <b>${dm(k.nextDate)}</b>` : ""}</p>
      ${k.last ? html`<div class="ly-stages">${TURN_STAGES.map((s) => html`<button type="button" class="chip" role="checkbox" aria-checked="${done.has(s)}" data-stage="${s}" data-fid="${k.last.id}" ${raw(can ? "" : "disabled")}><span class="chk">${raw(icon("check", { size: 18 }))}</span>${s}</button>`)}</div>` : ""}
      ${k.next ? html`<a class="btn secondary" href="${L(`flock/${k.next.id}`)}">Next flock · ${n0(k.next.placed)} pullets${k.next.daeraNotified ? " · DAERA told" : ""}</a>` : can ? html`<button type="button" class="btn ${k.last ? "secondary" : ""}" data-flow="place" data-arg="${flowArg({ houseId: k.h.id })}">Place a flock</button>` : ""}</div>`;
  }
  const below = k.vs?.pos === "below"; const tone = k.lay == null ? "" : below ? "due" : "ok";
  const vsText = k.prelay ? "" : k.lay == null || !k.band || !k.band[1] ? "" : below ? `▼ ${n1(k.vs.gap)} below standard${k.la?.days ? ` for ${k.la.days} days` : ""}` : k.vs?.pos === "above" ? `▲ above standard ${n0(k.band[0])}–${n0(k.band[1])}%` : `✓ in standard ${n0(k.band[0])}–${n0(k.band[1])}%`;
  const water = k.waterFlag ? html`<span class="w">${k.water > 0 ? "+" : "−"}${Math.abs(Math.round(k.water))}% ⚠</span>` : k.waterL != null ? html`<b>${n1(k.waterL / 1000)} k L</b>` : html`<b>—</b>`;
  if (compact) return html`<a class="ly-hrow ${k.edge}" href="${L(`house/${k.h.id}`)}"><b>${k.h.name}</b><span>wk ${k.wk} · ${k.lay != null ? `${n1(k.lay)}% lay ${k.label}` : "no sheet yet"}${k.done ? " · ✓ sheet" : ""}</span></a>`;
  return html`<div class="ly-hc ${k.edge}" data-house="${k.h.id}">
    <a class="t" href="${L(`house/${k.h.id}`)}">${k.h.name} <span>· ${k.std.breed} · week ${k.wk}</span></a>
    <div class="ly-facts" style="margin:2px 0 0">${n0(k.hens)} hens${k.classB ? html` · <span class="w">Class B</span>` : ""}${k.withheld ? html` · <span class="w">eggs withheld to ${d2(k.withheld.until)}</span>` : ""}</div>
    ${k.prelay ? html`<div class="ly-mid"><div><div class="ly-big">${k.prelay.firstEggsWk != null ? html`wk ${k.prelay.firstEggsWk}` : "—"}</div><div class="t-cap ink-2">first eggs${k.prelay.firstEggsWk == null ? ` · expect about wk ${k.prelay.expectWk}` : ""}</div></div>
      <div><div class="ly-big sm">${n0(k.prelay.floorToday)}</div><div class="t-cap ink-2">floor eggs ${k.label || "today"}</div><p class="ly-vs">Training to the nest matters most now</p></div></div>`
    : html`<div class="ly-mid"><div><div class="ly-big" data-lay>${k.lay != null ? html`${n1(k.lay)}<small>%</small>` : "—"}</div><div class="t-cap ink-2">${k.lay != null ? `lay ${k.label}` : "no sheet yet"}</div></div>
      <div>${miniCurve(k.pts, k.band)}<div class="ly-vs ${tone}">${vsText}</div></div></div>`}
    <div class="ly-facts">Deaths ${k.deadFlag ? html`<span class="w">${k.dead} ⚠</span>` : html`<b>${k.dead ?? "—"}</b>`} · Water ${water} · <b>${k.temp != null ? `${k.temp} °C` : "— °C"}</b></div>
    ${k.done ? html`<a class="ly-done" href="${L(`sheet/${k.h.id}/${snap.today}`)}">${raw(icon("check"))}Sheet done ${k.done.at}${k.done.by ? " " + k.done.by : ""}</a>`
      : can ? html`<button type="button" class="btn" data-sheet="${k.h.id}">Fill today's sheet</button>` : ""}</div>`;
}

async function paint(body, snap) {
  const { lid } = snap; const L = (h) => `#/l/${lid}/${h}`;
  const y0 = window.scrollY;
  const hs = sortedHouses(snap.c);
  if (!hs.length) {
    const can = canWrite(snap.role, "houses");
    body.replaceChildren(el(html`<div>${largeTitle("Houses", contextLine(snap))}${emptyState({ sector: "layers", title: "Add your first house", body: "Tell us the house name, system and how many hens it holds. Your daily sheet starts from here.", action: can ? "Add a house" : null, actAttr: 'data-flow="house"' })}</div>`));
    return;
  }
  const cards = hs.map((h) => houseCard(snap.c, h));
  const compact = cards.length >= 5;
  const alerts = layerAlerts(snap.c);
  const lateOther = alerts.filter((a) => a.level === "late" && !/^(spike|classb|alarm|sheet):/.test(a.key)).slice(0, 2);
  const classB = alerts.filter((a) => a.key.startsWith("classb:"));
  const node = el(html`<div>
    <div>${largeTitle("Houses", contextLine(snap))}</div>
    <div class="section">${aiBanner(snap)}</div>
    ${cards.filter((k) => k.sp).map((k) => html`<div class="section">${spikeCard(snap, k)}</div>`)}
    ${classB.length || lateOther.length ? html`<div class="section">${[...classB, ...lateOther].map((a) => alertCard(a, false))}</div>` : ""}
    <div class="section ${compact ? "ly-compact" : ""}">${cards.map((k) => card(snap, k, { compact }))}</div>
    <div class="section" data-tasks></div>
  </div>`);
  const gen = todayTasks(snap.c).map((t) => ({ id: t.key, title: t.title, due: t.due, sub: t.sub, href: t.href, legal: t.legal, generated: true, done: false, ledger: snap.ledger, tick: (d) => tickGenerated(lid, snap, t, d) }));
  const stored = (await todaysTasks([snap.ledger])).filter((t) => !t.sourceRef || t.done);
  const tasks = [...gen, ...stored].sort((a, b) => (a.done - b.done) || (b.legal ? 1 : 0) - (a.legal ? 1 : 0) || String(a.due).localeCompare(String(b.due)));
  const tb = node.querySelector("[data-tasks]");
  tb.append(el(groupLabel("To do today", tasks.filter((t) => !t.done).length || "")));
  tb.append(tasks.length ? taskList(tasks, { max: 12, onChange: () => {} }) : el(okCard("Nothing else to do today.")));
  const before = new Map([...body.querySelectorAll("[data-house]")].map((n) => [n.dataset.house, n.querySelector("[data-lay]")?.textContent]));
  body.replaceChildren(node); if (y0) window.scrollTo(0, y0);
  // a house whose lay figure just changed (sheet saved) flashes once
  if (!reduceMotion()) node.querySelectorAll("[data-house]").forEach((n) => { const b = before.get(n.dataset.house); const a = n.querySelector("[data-lay]")?.textContent; if (b != null && a && b !== a) n.animate([{ boxShadow: "0 0 0 3px var(--layers)" }, { boxShadow: "0 0 0 0 transparent" }], { duration: 900, easing: "ease-out" }); });
  node.querySelectorAll("[data-sheet]").forEach((b) => (b.onclick = () => import("../flows/sheet.js").then((m) => m.sheetFlow(snap, { houseId: b.dataset.sheet }))));
  node.querySelectorAll("[data-stage]").forEach((b) => (b.onclick = () => { const f = snap.data.flocks.find((x) => x.id === b.dataset.fid); if (f) turnStage(snap, f, b.dataset.stage, b.getAttribute("aria-checked") !== "true"); }));
}
