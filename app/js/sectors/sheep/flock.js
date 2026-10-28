// Sheep → Flock (the home, design/11 §3): year strip → alerts (max 3) → the stage board →
// To do today → compact lamb funnel → mob strip.
import { html, raw } from "../../core/html.js";
import { el } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { openSheet } from "../../ui/sheet.js";
import { radioGroup, wireForm } from "../../ui/form.js";
import { taskList } from "../../ui/tasks.js";
import { todaysTasks } from "../../services/tasks.js";
import { auth } from "../../core/auth.js";
import { canRead, canWrite } from "../../core/policy.js";
import { plural } from "../../ui/format.js";
import { largeTitle, groupLabel, emptyState } from "../../screens/common.js";
import { alertCard } from "../../screens/overview-today.js";
import { liveSnap } from "./data.js";
import { yearStrip, funnelView, banner, num, short } from "./ui.js";
import { board, wireFlows } from "./boards.js";
import { STAGES, STAGE_NAMES } from "./model/year.js";
import { sheepAlerts, todayTasks, nextTask, overnight } from "./model/duties.js";
import { shownFunnel } from "./model/lambing.js";
import { cycleFor } from "./model/year.js";
import { addDays } from "../../core/dates.js";
import { activeMobs } from "./model/mobs.js";
import { tickGenerated } from "./actions.js";

const LS = (lid) => `fl10-sheep-stage-${lid}`;
function savedStage(lid) { try { return localStorage.getItem(LS(lid)) || "auto"; } catch (e) { return "auto"; } }
export const stageFor = (snap) => { const m = savedStage(snap.lid); return m === "auto" ? snap.stage.stage : m; };
export function contextLine(snap) {
  const t = snap.totals;
  return ["Sheep", snap.s.flockNo ? `Flock ${snap.s.flockNo}` : null, plural(t.ewes, "ewe"), t.rams ? plural(t.rams, "ram") : null].filter(Boolean).join(" · ");
}

export default async function flock(ctx) {
  const body = el(html`<div class="sheep-page"></div>`);
  let cur = null;
  wireFlows(body, () => cur);
  const { first, stop } = liveSnap(ctx.ledger, (snap) => { cur = snap; return paint(body, snap); });
  await first;
  return { el: body, title: "Flock", destroy: stop };
}

async function paint(body, snap) {
  const { lid, stage } = snap; const money = canRead(snap.role, "finance");
  const shown = stageFor(snap); const auto = savedStage(lid) === "auto";
  const all = sheepAlerts(snap.c, { money });
  const bannerA = all.filter((a) => a.banner); const restricted = all.find((a) => a.key === "restricted");
  const alerts = all.filter((a) => !a.banner && a.key !== "restricted");
  const by = { uid: auth.user?.uid, name: auth.user?.displayName || auth.user?.email };
  const gen = todayTasks(snap.c, snap.doneKeys).map((t) => ({ id: t.key, title: t.title, due: t.due, href: t.href, legal: t.legal, generated: true, done: false, ledger: snap.ledger, tick: (d) => tickGenerated(lid, snap, t, d, by) }));
  const stored = (await todaysTasks([snap.ledger])).filter((t) => !t.sourceRef || t.done);
  const tasks = [...gen, ...stored].sort((a, b) => (a.done - b.done) || String(a.due).localeCompare(String(b.due)));
  const f = shownFunnel(snap.data, snap.cy, cycleFor(snap.s, addDays(snap.cy.ramsIn, -1), snap.data.events), snap.today).main; const t = snap.totals; const mobs = activeMobs(snap.data);
  const morning = overnight(snap.c);
  const scrollY = window.scrollY;
  const node = el(html`<div>
    ${largeTitle("Flock", contextLine(snap))}
    ${yearStrip(snap)}
    <p class="ynote">Today: day ${stage.day} of ${STAGE_NAMES[stage.stage].toLowerCase()}${auto ? "" : ` · showing ${STAGE_NAMES[shown].toLowerCase()} (set by you)`}</p>
    <button type="button" class="stage-chip" data-stage>${raw(icon("clock"))}Stage: ${STAGE_NAMES[shown]} · change</button>
    ${restricted ? banner("late", restricted.title, restricted.body) : ""}
    ${bannerA.map((a) => banner("info", a.title, " " + a.body))}
    ${alerts.length ? html`<div class="section" data-alerts>${alerts.slice(0, 3).map((a) => alertCard(a, false))}${alerts.length > 3 ? html`<button type="button" class="text-btn" data-more-alerts style="margin-top:4px">${alerts.length - 3} more ${alerts.length - 3 === 1 ? "thing needs" : "things need"} attention ›</button>` : ""}</div>` : ""}
    <div class="section">${groupLabel(STAGE_NAMES[shown])}${board(shown, snap)}</div>
    <div class="section" data-tasks>${groupLabel("To do today", tasks.filter((x) => !x.done).length || "")}${morning ? html`<div class="info-card" style="margin-bottom:8px">${raw(icon("info"))}<span>${morning}</span></div>` : ""}</div>
    <div class="section">${groupLabel(`Lamb funnel · ${f.crop}`, html`<a class="text-btn" href="#/l/${lid}/funnel">Full funnel</a>`)}${f.enough ? funnelView(f, { compact: true }) : html`<div class="card pad t-callout ink-2">The funnel fills as you record rams in, scanning, lambing and weaning.</div>`}</div>
    <p class="mob-strip"><a href="#/l/${lid}/mobs">${plural(mobs.length, "mob")} · ${plural(t.ewes, "ewe")} · ${plural(t.rams, "ram")} · ${plural(t.lambs + t.eweLambs, "lamb")}${t.goats ? " · " + plural(t.goats, "goat") : ""}</a></p>
  </div>`);
  const tb = node.querySelector("[data-tasks]");
  if (tasks.length) tb.append(taskList(tasks, { max: 12, onChange: () => {} }));
  else if (!mobs.length) tb.append(el(emptyState({ sector: "sheep", title: "No sheep yet", body: "Start with your mobs — how many ewes, rams and lambs and where they are. Add tags later if you use EID.", action: canWrite(snap.role, "mobs") ? "Add a mob" : null, actAttr: 'data-flow="newMob"' })));
  else { const n = nextTask(snap.c, snap.doneKeys); tb.append(el(html`<div class="card pad t-callout ink-2">Nothing due today.${n ? ` Next: ${n.title.charAt(0).toLowerCase() + n.title.slice(1)} on ${short(n.show)}.` : ""}</div>`)); }
  body.replaceChildren(node);
  if (scrollY) window.scrollTo(0, scrollY);
  node.querySelector("[data-stage]").onclick = () => stageSheet(snap, () => paint(body, snap));
  const ma = node.querySelector("[data-more-alerts]"); if (ma) ma.onclick = () => openSheet({ title: "Needs attention", body: el(html`<div>${alerts.map((a) => alertCard(a, false))}</div>`), cancelText: "Done" });
}

function stageSheet(snap, after) {
  const cur = savedStage(snap.lid);
  const body = el(html`<div><p class="sheet-title-sm">Show on the Flock screen</p>${radioGroup("stage", [
    { value: "auto", label: "Automatic (by date)", help: `Rams in ${short(snap.cy.ramsIn)} · now ${STAGE_NAMES[snap.stage.stage]}` },
    ...STAGES.map((m) => ({ value: m, label: STAGE_NAMES[m] })),
  ], cur)}<p class="hint">The year strip and dates don't change. Change the rams-in date in Targets.</p></div>`);
  const f = wireForm(body);
  const sh = openSheet({ size: "small", body, label: "Stage", auto: true });
  f.onChange(() => { try { localStorage.setItem(LS(snap.lid), f.values().stage); } catch (e) { /* blocked */ } sh.close(true, { force: true }); after(); });
}
export { num };
