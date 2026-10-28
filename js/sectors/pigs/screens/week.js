// Pigs → Week, the home (design/13 §3). Title = the production week, never a date. Then the week
// strip (serve, scan, move, farrow, wean, ship), late alerts, "This week" tiles, the room board,
// To do today and one line of deaths. Finishing-only farms get §3.2 tiles; small herds §3.3.
import { html, raw } from "../../../core/html.js";
import { el, reduceMotion } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { openSheet } from "../../../ui/sheet.js";
import { taskList } from "../../../ui/tasks.js";
import { todaysTasks } from "../../../services/tasks.js";
import { canRead, canWrite } from "../../../core/policy.js";
import { addDays, daysBetween } from "../model/dates.js";
import { largeTitle, groupLabel, emptyState } from "../../../screens/common.js";
import { alertCard } from "../../../screens/overview-today.js";
import { bannerItems } from "../../../content/region-rules.js";
import { liveSnap } from "../data.js";
import { numTile, roomTile, dm, d2, n0, pctText, pounds, headRow, okCard, plural } from "../ui.js";
import { weekLabel, weekDates, isoWeek } from "../model/weeks.js";
import { weekEvents, breedingTiles, weekDeaths, VERB, cycles } from "../model/week.js";
import { roomFacts, binFacts } from "../model/facts.js";
import { preWeanMortality, aliveNow } from "../model/litters.js";
import { pigAlerts } from "../model/alerts.js";
import { todayTasks } from "../model/duties.js";
import { SYSTEMS } from "../model/settings.js";
import { tickGenerated } from "../actions.js";
import { dayName } from "../model/sows.js";
import { moneyFigures } from "../model/money.js";

const flow = (file, fn = "default") => async (snap, extra) => (await import(`../flows/${file}.js`))[fn](snap, extra);
const offsets = new Map(); // per ledger: week offset of the strip
const DN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function contextLine(snap) {
  const s = snap.s; const bf = [...snap.c.bf.values()].filter((f) => !f.final);
  const growing = bf.reduce((t, f) => t + f.onFarm, 0);
  const sows = snap.data.sows.filter((x) => x.type !== "boar" && !x.cull?.date && !x.died).length;
  return ["Pigs", s.herdMark ? `Herd mark ${s.herdMark}` : null, s.breeding ? `${s.interval === 1 ? "weekly" : s.interval + "-week"} batches` : SYSTEMS[s.system], s.breeding ? `${n0(sows)} sows` : null, `${n0(growing)} growing`].filter(Boolean).join(" · ");
}

export default async function week(ctx) {
  const body = el(html`<div class="pg-page"></div>`);
  const { first, stop } = liveSnap(ctx.ledger, (snap) => (snap.s.smallHerd ? paintSmall(body, snap) : paint(body, snap)));
  await first;
  return { el: body, title: "Week", destroy: stop };
}

function stripHtml(snap, off) {
  const iso = addDays(snap.today, off * 7); const { days, ev } = weekEvents(snap.c, iso);
  const w = isoWeek(days[0]).week;
  return html`<div class="pg-wk" data-strip>
    <div class="pg-wk-top"><b>${off === 0 ? "This week" : `Week ${w}`} · ${d2(days[0])} – ${d2(days[6])}</b><span>
      <button type="button" class="icon-btn" data-wk="-1" aria-label="Previous week">${raw(icon("left"))}</button>
      <button type="button" class="icon-btn" data-wk="1" aria-label="Next week">${raw(icon("right"))}</button></span></div>
    <div class="pg-wk-grid" data-grid>${days.map((d, i) => { const list = ev.get(d) || []; return html`<button type="button" class="pg-wd ${d === snap.today ? "today" : ""}" data-day="${d}" aria-label="${dm(d)}: ${list.length ? list.map((e) => `${VERB[e.v]} ${e.b}`).join(", ") : "nothing planned"}">
      <span class="dn">${DN[(i + snap.s.weekStart - 1) % 7]}</span><span class="dd">${+d.slice(8)}</span>
      ${list.slice(0, 3).map((e) => html`<span class="pg-ev ${e.v}">${e.v}<small>${e.b}</small></span>`)}${list.length > 3 ? html`<span class="pg-ev more">+${list.length - 3}</span>` : ""}</button>`; })}</div></div>`;
}

function dayList(snap, d) {
  const { ev } = weekEvents(snap.c, d); const list = ev.get(d) || [];
  const body = el(html`<div>${list.length ? html`<div class="list">${list.map((e) => html`<div class="row no-lead"><span class="main"><span class="primary">${VERB[e.v]} ${e.b}</span>${e.n > 1 ? html`<span class="secondary">${e.v === "Ship" || e.v === "In" ? plural(e.n, "pig") : plural(e.n, "sow")}</span>` : ""}</span></div>`)}</div>` : okCard("Nothing planned this day.")}</div>`);
  openSheet({ title: dm(d), body, size: "small" });
}

function tilesBreeding(snap) {
  const t = breedingTiles(snap.c); const L = (h) => `#/l/${snap.lid}/${h}`;
  const toWeanDay = t.toWeanSows.length ? addDays(t.toWeanSows.map((l) => l.farrowedAt.slice(0, 10)).sort()[0], snap.s.lactation) : null;
  const scanFrom = cycles(snap.c).filter((x) => x.c.status === "served" && x.c.dates).map((x) => x.c.dates.scanFrom).filter((d) => d >= weekDates(snap.today, snap.s.weekStart)[0]).sort()[0];
  const shipDay = t.ships.map((s) => s.due).sort()[0];
  const tiles = [
    { k: "farrow", label: "To farrow", value: n0(t.toFarrow), delta: t.toFarrow ? [t.farrowRoom, t.due[0] ? dayName(t.due.map((x) => x.c.dates.due).sort()[0]) : ""].filter(Boolean).join(" ") : "none this week", href: L("rooms"), soon: t.due.map((x) => x.c.dates.due).sort()[0] },
    t.serveWeek ? { k: "serve", label: "To serve", value: raw(`${t.served}<small>/ ${t.target}</small>`), delta: `target ${t.target}`, href: L("service"), soon: snap.today, tone: t.served >= t.target ? "ok" : "" }
      : { k: "serve", label: "Next service", value: t.nextServe ? `Wk ${isoWeek(t.nextServe).week}` : "—", delta: t.stillToServe.length ? `${t.stillToServe.length} waiting now` : `target ${t.target}`, href: L("service"), soon: t.nextServe || "9" },
    { k: "wean", label: "To wean", value: n0(t.toWean), delta: toWeanDay ? `${dayName(toWeanDay)} · ${t.toWean} litter${t.toWean === 1 ? "" : "s"}` : "none this week", href: L("rooms"), soon: toWeanDay },
    { k: "scan", label: "Scan", value: n0(t.scan), delta: scanFrom ? `from ${dayName(scanFrom)}` : "none due", href: L("sows"), soon: scanFrom },
    { k: "returns", label: "Returns", value: n0(t.returns), delta: t.returns ? "to watch" : "none to watch", href: L("sows"), soon: snap.today },
    { k: "ship", label: "Ship", value: n0(t.ship), delta: shipDay ? `${dayName(shipDay)}` : "no load planned", href: L("batches"), soon: shipDay },
  ];
  // the batch stage is the mode: tiles follow what happens soonest this week (§3.1)
  tiles.sort((a, b) => String(a.soon || "9").localeCompare(String(b.soon || "9")));
  return html`<div class="pg-tiles">${tiles.map((x) => numTile({ label: x.label, value: x.value, delta: x.delta, href: x.href, tone: x.tone || "" }))}</div>`;
}
function tilesFinishing(snap) {
  const bf = [...snap.c.bf.values()].filter((f) => !f.final); const on = bf.reduce((t, f) => t + f.onFarm, 0);
  const places = snap.s.finisherPlaces || snap.data.rooms.reduce((t, r) => t + (+r.places || 0), 0);
  const ships = snap.data.tasks.filter((t) => t.pig?.kind === "ship" && !t.done && t.due >= snap.today && t.due <= addDays(snap.today, 7));
  const days = weekDates(snap.today, snap.s.weekStart); const died = snap.data.deaths.filter((d) => d.date >= days[0] && d.date <= days[6]).reduce((t, d) => t + (+d.n || 0), 0);
  const low = binFacts(snap.c).filter((b) => b.daysLeft != null && b.daysLeft < 5);
  const L = (h) => `#/l/${snap.lid}/${h}`;
  return html`<div class="pg-tiles2">
    ${numTile({ label: "Pigs on farm", value: raw(`${n0(on)}<small>/ ${n0(places)} places</small>`), delta: `${bf.length} batch${bf.length === 1 ? "" : "es"}`, href: L("batches") })}
    ${numTile({ label: "Ship", value: n0(ships.reduce((t, s) => t + (+s.pig.n || 0), 0)), delta: ships.length ? dm(ships.map((s) => s.due).sort()[0]) : "no load planned", href: L("batches") })}
    ${numTile({ label: "Deaths this week", value: n0(died), delta: on ? pctText(died / (on + died)) : "", tone: died && on && died / (on + died) > 0.005 ? "due" : "", href: L("reg/mortality") })}
    ${numTile({ label: "Feed", value: low.length ? `${low.length} bin${low.length > 1 ? "s" : ""}` : "OK", delta: low.length ? "under 5 days" : "every bin 5 days +", tone: low.length ? "due" : "ok", href: L("tools/bins") })}</div>`;
}

function deathsLine(snap) {
  const recent = snap.data.litters.filter((l) => daysBetween(l.farrowedAt.slice(0, 10), snap.today) <= 56);
  const pwm = preWeanMortality(recent);
  const open = [...snap.c.bf.entries()].filter(([id, f]) => !f.final && snap.ix.batches.get(id)?.stage !== "weaner");
  const nIn = open.reduce((t, [, f]) => t + f.numberIn, 0); const died = open.reduce((t, [, f]) => t + f.died, 0);
  const w = weekDeaths(snap.c);
  return html`<div class="list"><a class="row no-lead pg-kv" href="#/l/${snap.lid}/reg/mortality"><span class="main"><span class="primary">Deaths this week</span></span><span class="v">${n0(w.n)}</span><span class="chev">${raw(icon("chevron"))}</span></a>
    ${snap.s.breeding ? html`<div class="row no-lead pg-kv"><span class="main"><span class="primary">Pre-weaning mortality</span><span class="secondary">litters born in the last 8 weeks · target ${snap.s.targets.pwm}%</span></span><span class="v ${pwm != null && pwm * 100 > snap.s.targets.pwm ? "due" : ""}">${pctText(pwm)}</span></div>` : ""}
    ${snap.s.finishing ? html`<div class="row no-lead pg-kv"><span class="main"><span class="primary">Finishing mortality</span><span class="secondary">growing batches on farm · target ${snap.s.targets.mort}%</span></span><span class="v ${nIn && (died / nIn) * 100 > snap.s.targets.mort ? "due" : ""}">${nIn ? pctText(died / nIn) : "—"}</span></div>` : ""}</div>`;
}

async function taskSection(snap, node) {
  const gen = todayTasks(snap.c).map((t) => ({ id: t.key, title: t.title, due: t.due, sub: t.sub, href: t.href, legal: t.legal, generated: true, done: false, ledger: snap.ledger, tick: (d) => tickGenerated(snap.lid, snap, t, d) }));
  const stored = (await todaysTasks([snap.ledger])).filter((t) => !t.sourceRef || t.done);
  const tasks = [...gen, ...stored].sort((a, b) => (a.done - b.done) || (b.legal ? 1 : 0) - (a.legal ? 1 : 0) || String(a.due).localeCompare(String(b.due)));
  const tb = node.querySelector("[data-tasks]");
  tb.append(el(groupLabel("To do today", tasks.filter((t) => !t.done).length || "")));
  tb.append(tasks.length ? taskList(tasks, { max: 12, onChange: () => {} }) : el(okCard("Nothing else to do today.")));
}

async function paint(body, snap) {
  const { lid } = snap; const L = (h) => `#/l/${lid}/${h}`;
  const scrollY = window.scrollY;
  const off = offsets.get(lid) || 0;
  if (!snap.data.rooms.length) {
    body.replaceChildren(el(html`<div>${largeTitle(weekLabel(snap.today), contextLine(snap))}${emptyState({ sector: "pigs", title: "Set up your rooms", body: "Add your houses and rooms once. Then the week, the room board and every batch build from them.", action: canWrite(snap.role, "rooms") ? "Add rooms" : null, href: L("setup/rooms") })}</div>`));
    return;
  }
  const rf = roomFacts(snap.c);
  const alerts = pigAlerts(snap.c).filter((a) => a.level === "late").slice(0, 3);
  const board = [...rf].sort((a, b) => ({ late: 0, due: 1 }[a.tile.level] ?? 2) - ({ late: 0, due: 1 }[b.tile.level] ?? 2)).slice(0, 6);
  const allEmpty = rf.every((x) => !x.batch && !x.sowsIn.length && !x.litters.length);
  const banners = bannerItems(snap.ledger.region || "NI", ["pigs"]);
  const node = el(html`<div>
    <div data-title>${largeTitle(weekLabel(snap.today), contextLine(snap))}</div>
    ${snap.s.contract.on ? html`<p class="pg-line">Contract finishing${snap.s.contract.integrator ? ` for ${snap.s.contract.integrator}` : ""} · paid ${snap.s.contract.basis}</p>` : ""}
    ${banners.map((b) => html`<div class="pg-banner info">${raw(icon("info"))}<span>${b.text}</span></div>`)}
    <div class="section" data-strip-wrap>${stripHtml(snap, off)}</div>
    ${alerts.length ? html`<div class="section">${alerts.map((a) => alertCard(a, false))}</div>` : ""}
    <div class="section">${groupLabel("This week")}${snap.s.breeding ? tilesBreeding(snap) : tilesFinishing(snap)}</div>
    <div class="section">${headRow("Rooms", html`<a class="text-btn" href="${L("rooms")}">See all</a>`)}
      ${allEmpty ? html`<p class="pg-quiet">All rooms empty — record pigs in or a weaning to start.</p>` : ""}<div class="pg-rb">${board.map((x) => roomTile(lid, x))}</div></div>
    <div class="section" data-tasks></div>
    <div class="section">${deathsLine(snap)}</div>
  </div>`);
  await taskSection(snap, node);
  body.replaceChildren(node);
  if (scrollY) window.scrollTo(0, scrollY);
  wireStrip(node, snap);
  node.querySelector("[data-title] h1")?.addEventListener("click", () => weekPicker(snap, node));
  node.querySelectorAll(".alert .a-actions a").forEach((a) => {
    const m = a.getAttribute("href").match(/\/alarm\/(.+)$/);
    if (m && canWrite(snap.role, "alarmTests")) a.onclick = (e) => { e.preventDefault(); flow("alarm", "alarmSheet")(snap, { house: decodeURIComponent(m[1]) }); };
  });
}

function wireStrip(node, snap) {
  const wrap = node.querySelector("[data-strip-wrap]");
  const go = (d) => {
    const off = (offsets.get(snap.lid) || 0) + d; offsets.set(snap.lid, off);
    const grid = wrap.querySelector("[data-grid]");
    const swap = () => { wrap.replaceChildren(el(stripHtml(snap, off))); wire(); if (!reduceMotion()) wrap.querySelector("[data-grid]").animate([{ transform: `translateX(${d * 40}px)`, opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 240, easing: "cubic-bezier(.2,.8,.2,1)" }); };
    if (reduceMotion() || !grid.animate) return swap();
    grid.animate([{ transform: "none", opacity: 1 }, { transform: `translateX(${-d * 40}px)`, opacity: 0 }], { duration: 140, easing: "cubic-bezier(.4,0,1,1)" }).onfinish = swap;
  };
  const wire = () => {
    wrap.querySelectorAll("[data-wk]").forEach((b) => (b.onclick = () => go(+b.dataset.wk)));
    wrap.querySelectorAll("[data-day]").forEach((b) => (b.onclick = () => dayList(snap, b.dataset.day)));
    const c = wrap.querySelector("[data-strip]"); let x0 = null;
    c.onpointerdown = (e) => { x0 = e.clientX; };
    c.onpointerup = (e) => { if (x0 == null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); };
  };
  wire();
}
function weekPicker(snap, node) {
  const cur = offsets.get(snap.lid) || 0;
  const opts = Array.from({ length: 9 }, (_, i) => i - 4);
  const body = el(html`<div class="list">${opts.map((o) => { const d = weekDates(addDays(snap.today, o * 7), snap.s.weekStart); return html`<button type="button" class="row no-lead" data-o="${o}"><span class="main"><span class="primary">Week ${isoWeek(d[0]).week}${o === 0 ? " · this week" : ""}</span><span class="secondary">${d2(d[0])} – ${d2(d[6])}</span></span>${o === cur ? raw(icon("check")) : ""}</button>`; })}</div>`);
  const sh = openSheet({ title: "Go to a week", body, size: "small" });
  body.onclick = (e) => { const b = e.target.closest("[data-o]"); if (!b) return; offsets.set(snap.lid, +b.dataset.o); sh.close(undefined, { force: true }); const w = node.querySelector("[data-strip-wrap]"); w.replaceChildren(el(stripHtml(snap, +b.dataset.o))); wireStrip(node, snap); };
}

// ---- small herd (design/13 §3.3): plain words, no week numbers, batches or FCR ----
async function paintSmall(body, snap) {
  const { lid } = snap; const L = (h) => `#/l/${lid}/${h}`;
  const sows = snap.data.sows.filter((x) => x.type !== "boar" && !x.cull?.date && !x.died);
  const boars = snap.data.sows.filter((x) => x.type === "boar" && !x.cull?.date && !x.died);
  const growing = [...snap.c.bf.values()].filter((f) => !f.final).reduce((t, f) => t + f.onFarm, 0) + snap.data.litters.filter((l) => !l.weaned).reduce((t, l) => t + aliveNow(l), 0);
  const next = [];
  for (const { sow, c } of cycles(snap.c)) {
    if (c.dates && ["served", "inpig", "farrowing"].includes(c.status) && c.dates.due >= addDays(snap.today, -3)) next.push({ d: c.dates.due, t: `${sow.name || sow.sowNo} due to farrow` });
    if (c.status === "suckling") next.push({ d: addDays(c.last.farrowedAt.slice(0, 10), snap.s.lactation), t: `Litter of ${sow.name || sow.sowNo} wean` });
  }
  for (const t of snap.data.tasks.filter((x) => x.pig?.kind === "ship" && !x.done)) next.push({ d: t.due, t: `${t.pig.n} pigs to the abattoir` });
  next.sort((a, b) => a.d.localeCompare(b.d));
  const money = canRead(snap.role, "finance");
  const yr = snap.today.slice(0, 4); const fin = (snap.data.finance || []).filter((f) => f.date?.startsWith(yr));
  const mf = moneyFigures(fin); const pigsNow = growing || 1;
  const costs = (snap.data.finance || []).filter((f) => f.kind === "expense" && f.date >= addDays(snap.today, -183)).reduce((t, f) => t + (+f.amount || 0), 0);
  const node = el(html`<div>
    ${largeTitle("Pigs", `${plural(sows.length, "sow")} · ${plural(boars.length, "boar")} · ${n0(growing)} growing`)}
    <div class="section pg-next">${groupLabel("Next")}${next.length ? html`<div class="list">${next.slice(0, 3).map((x) => html`<div class="row no-lead"><span class="main"><span class="primary">${x.t}</span></span><span class="when">${dm(x.d)}</span></div>`)}</div>` : okCard("Nothing coming up. Record a service or a litter to see dates here.")}</div>
    ${money ? html`<div class="section"><div class="list">
      <div class="row no-lead pg-kv"><span class="main"><span class="primary">Cost per pig so far</span><span class="secondary">feed bags and other costs, last 6 months ÷ pigs</span></span><span class="v">${pounds(costs / pigsNow)}</span></div>
      <a class="row no-lead pg-kv" href="${L("sales")}"><span class="main"><span class="primary">Sold this year</span></span><span class="v">${pounds(mf.totalIn)}</span><span class="chev">${raw(icon("chevron"))}</span></a></div></div>` : ""}
    <div class="section" data-tasks></div>
  </div>`);
  await taskSection(snap, node);
  body.replaceChildren(node);
}
