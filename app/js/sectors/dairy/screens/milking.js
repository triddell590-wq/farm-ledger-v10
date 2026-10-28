// Dairy → Milking, the home (design/12 §3): the withhold board first (always, when not empty),
// then today's fertility tiles, tank, milk quality, fresh cows, handover note and To do today.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { toast } from "../../../ui/toast.js";
import { taskList } from "../../../ui/tasks.js";
import { todaysTasks } from "../../../services/tasks.js";
import { canWrite } from "../../../core/policy.js";
import { addDays } from "../../../core/dates.js";
import { num } from "../../../ui/format.js";
import { largeTitle, groupLabel } from "../../../screens/common.js";
import { alertCard } from "../../../screens/overview-today.js";
import { liveSnap } from "../data.js";
import { numTile, dIcon, cowLabel, sectionOf } from "../ui.js";
import { onFarm, groupOf, dim, listOf } from "../model/cows.js";
import { actionLists, sixWeekInCalf, weeklyPregnancies } from "../model/fertility.js";
import { rolling, qualityStatus, latestTank, tankDue, overLimit } from "../model/quality.js";
import { partWord, quartersText, timePart, datePart, dayLabel } from "../model/milking.js";
import { dairyAlerts } from "../model/alerts.js";
import { todayTasks } from "../model/duties.js";
import { diseaseBanner } from "../model/content.js";
import { releaseWithhold, undoRelease, tickGenerated } from "../actions.js";
import { openParlour, parlourText } from "./parlour.js";

const flow = (name, fn = "default") => async (snap, extra) => (await import(`../flows/${name}.js`))[fn](snap, extra);

export function contextLine(snap) {
  const inMilk = snap.data.animals.filter((a) => onFarm(a) && groupOf(snap.ix, a, snap.today) === "milking").length;
  return [snap.ledger.name, snap.s.herdNo ? `Herd ${snap.s.herdNo}` : null, `${num(inMilk)} in milk`].filter(Boolean).join(" · ");
}

export default async function milking(ctx) {
  const body = el(html`<div class="dairy-page"></div>`);
  const { first, stop } = liveSnap(ctx.ledger, (snap) => paint(body, snap));
  await first;
  return { el: body, title: "Milking", destroy: stop };
}

function boardHtml(snap, write) {
  const { withheld, release, dryPending } = snap.brd;
  const row = (x, rel) => html`<div class="wh-row" data-wid="${x.w.id}"><span class="wh-no">${cowLabel(x.cow)}</span><div style="flex:1;min-width:0">
      <div class="ok">${rel ? "Withdrawal over — release?" : `OK from ${x.label}`}</div>
      <div class="meta">${[quartersText(x.w.quarters) || "All four", x.cow.name, (x.w.marks || []).join(", ")].filter(Boolean).join(" · ")}</div></div>
      ${rel && write ? html`<button type="button" class="btn secondary" data-release="${x.w.id}">Release</button>` : ""}</div>`;
  return html`${withheld.length ? html`<div class="wh" role="region" aria-label="Milk out of the tank"><div class="hd">${raw(dIcon("stop", 22))}<span>Milk out of the tank — ${withheld.length} cow${withheld.length > 1 ? "s" : ""}</span></div>
      ${withheld.map((x) => row(x, false))}
      <div class="wh-acts"><button type="button" class="btn" data-parlour style="flex:1;height:48px">Parlour sheet</button><button type="button" class="btn secondary" data-share style="flex:1">${raw(icon("share"))}Share</button></div></div>`
    : html`<div class="ok-line">${raw(icon("check"))}<span>All cows' milk can go in the tank.</span></div>`}
    ${release.length ? html`<div class="wh due" style="margin-top:12px"><div class="hd">${raw(icon("clock"))}<span>Ready to go back in the tank</span></div>${release.map((x) => row(x, true))}</div>` : ""}
    ${dryPending.length ? html`<p class="hint" style="margin:8px 4px 0">${dryPending.length} dry cow${dryPending.length > 1 ? "s" : ""} treated (${dryPending.map((x) => cowLabel(x.cow)).join(", ")}) — back on this board when ${dryPending.length > 1 ? "they calve" : "she calves"}.</p>` : ""}`;
}

function bannerLine(snap) {
  const s = snap.s;
  if (s.block && s.breedingStart) {
    const end = addDays(s.breedingStart, s.breedingWeeks * 7);
    if (snap.today >= s.breedingStart && snap.today <= end) { const r = sixWeekInCalf(s, snap.ix, snap.data, snap.today); return `Breeding week ${r.week} of ${s.breedingWeeks}${r.rate != null ? ` · 6-week in-calf rate so far ${Math.round(r.rate * 100)}% (target 78%)` : ""}`; }
    if (s.dryOffStart && snap.today < s.dryOffStart) return `Dry-off begins ${dayLabel(s.dryOffStart).slice(4)}`;
    return null;
  }
  const w = weeklyPregnancies(s, snap.ix, snap.data, snap.today);
  return w.preg ? `${w.rate.toFixed(1)} pregnancies per 100 cows a week (target above 1.5)` : null;
}

async function paint(body, snap) {
  const { lid, today, s } = snap; const L = (h) => `#/l/${lid}/${h}`; const write = canWrite(snap.role, "milkWithhold");
  const g = actionLists(s, snap.ix, snap.data, today, 0);
  const dryWk = actionLists(s, snap.ix, snap.data, today, 7);
  const fresh = snap.data.animals.filter((a) => onFarm(a) && dim(snap.ix, a, today) != null && dim(snap.ix, a, today) <= 21).sort((a, b) => dim(snap.ix, a, today) - dim(snap.ix, b, today));
  const freshDue = fresh.filter((a) => !listOf(snap.ix.fresh, a).some((f) => f.date === today));
  const tank = latestTank(snap.data.tankLog); const td = tankDue(s, snap.data.tankLog, snap.now);
  const q = snap.data.milkQuality; const scc = rolling(q, "scc"); const tbc = rolling(q, "tbc");
  const sccSt = qualityStatus("scc", scc?.value, s); const tbcSt = qualityStatus("tbc", tbc?.value, s);
  const notes = [...snap.data.handover].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 2);
  const all = dairyAlerts(snap.c).filter((a) => a.key !== "withheld" && !a.key.startsWith("release:") && a.level !== "info");
  const alerts = all.filter((a) => a.level === "late").slice(0, 3); const coming = all.filter((a) => a.level !== "late").slice(0, 3); // late ones stay under the board; the rest sit after the handover note
  const banner = bannerLine(snap); const disease = diseaseBanner(s.region);
  const gen = todayTasks(snap.c).filter((t) => !t.key.startsWith("release:")).map((t) => ({ id: t.key, title: t.title, due: t.due, sub: t.sub, href: t.href, legal: t.legal, generated: true, done: false, ledger: snap.ledger, tick: (d) => tickGenerated(lid, snap, t, d) }));
  const stored = (await todaysTasks([snap.ledger])).filter((t) => !t.sourceRef || t.done);
  const tasks = [...gen, ...stored].sort((a, b) => (a.done - b.done) || String(a.due).localeCompare(String(b.due)));
  const scrollY = window.scrollY;
  const tile = (label, n, href, delta = "") => numTile({ label, value: num(n), href, delta, tone: "" });
  const node = el(html`<div>
    ${largeTitle("Milking", contextLine(snap))}
    ${banner ? html`<div class="banner-line">${raw(icon("birth"))}<span>${banner}</span></div>` : ""}
    ${disease.map((d) => html`<div class="banner-line" style="background:var(--info-soft);color:var(--info-ink)">${raw(icon("info"))}<span>${d.text}</span></div>`)}
    ${snap.meta.settings?.restricted?.on ? html`<a class="banner-line" href="${L("tools/disease")}" style="background:var(--late-soft);color:var(--late-ink)">${raw(icon("alert"))}<span>Holding restricted since ${snap.meta.settings.restricted.from} — no moves off until the results clear it.</span></a>` : ""}
    <div class="section" data-board>${boardHtml(snap, write)}</div>
    ${alerts.length ? html`<div class="section">${alerts.map((a) => alertCard(a, false))}</div>` : ""}
    ${sectionOf("Today", html`<div class="tiles3">
      ${tile("Heats due", g.heats.length, L("fertility"))}${tile("To serve", g.serve.length, L("fertility"))}${tile("PD due", g.pd.length, L("fertility"))}
      ${tile("Dry off", dryWk.dryOff.filter((x) => x.date <= addDays(today, 7)).length, L("fertility"), "this week")}${tile("Calving", dryWk.calving.length, L("fertility"), "2 weeks")}${tile("Fresh cows", freshDue.length, "#fresh", freshDue.length ? "to check" : "checked")}</div>`)}
    <div class="section"><div class="minihead"><h2 class="group-label"><span>Tank</span></h2>${canWrite(snap.role, "tankLog") ? html`<button type="button" class="text-btn" data-tank>Log tank temp</button>` : ""}</div>
      <div class="list"><a class="row" href="${L("milk/tank")}"><span class="tile">${raw(icon("temp"))}</span><span class="main">
        <span class="primary">${tank ? `${(+tank.tempC).toFixed(1)} °C after ${partWord(tank.milking || "")} milking` : "No tank reading yet"}</span>
        <span class="secondary">${tank ? [tank.date !== today ? dayLabel(tank.date) : "Today", tank.time, tank.collected ? `collected${tank.litres ? " · " + num(tank.litres) + " litres" : ""}` : null].filter(Boolean).join(" · ") : "Log it after each milking (Red Tractor MP.6)"}${td ? ` · ${s.robot ? "today's check" : partWord(td.part) + " milking"} not logged` : ""}</span></span>
        ${tank ? html`<span class="pill ${overLimit(s, tank) ? "late" : "ok"}">${raw(icon(overLimit(s, tank) ? "alert" : "check"))}${overLimit(s, tank) ? `Over ${s.tankLimit} °C` : `Under ${s.tankLimit} °C`}</span>` : ""}</a></div></div>
    ${sectionOf("Milk quality · rolling averages", html`<div class="qual">
      ${numTile({ label: "SCC · 3 months", value: scc ? raw(`${scc.value}<small>k</small>`) : "—", delta: scc ? `Legal limit 400k · your band ${s.bands.sccWarn}k` : "Add results in Milk", tone: sccSt.level === "late" ? "late" : sccSt.level === "due" ? "due" : "", href: L("milk/quality") })}
      ${numTile({ label: "TBC · 2 months", value: tbc ? raw(`${tbc.value}<small>k</small>`) : "—", delta: tbc ? `${tbcSt.level === "ok" ? "✓ " : ""}Legal limit 100k` : "Add results in Milk", tone: tbcSt.level === "late" ? "late" : tbcSt.level === "due" ? "due" : "", href: L("milk/quality") })}</div>`)}
    <div class="section" id="fresh">${groupLabel("Fresh cows (0–21 days in milk)", fresh.length || "")}${fresh.length ? html`<div class="list">${fresh.map((a) => { const chk = listOf(snap.ix.fresh, a).find((f) => f.date === today); return html`<button type="button" class="row cow-row" data-fresh="${a.id}"><span class="cow-no">${cowLabel(a)}</span><span class="main"><span class="primary">${dim(snap.ix, a, today)} days in milk</span><span class="secondary">${chk ? `Checked today${chk.events?.length ? " · " + chk.events.join(", ") : " · all OK"}` : "Temperature · appetite · cleansing · ketones · BCS"}</span></span>${chk ? html`<span class="pill ${chk.events?.length ? "due" : "ok"}">${raw(icon(chk.events?.length ? "alert" : "check"))}${chk.events?.length ? "Watch" : "Done"}</span>` : html`<span class="pill neutral">Check</span>`}</button>`; })}</div>` : html`<div class="card pad t-callout ink-2">No cows calved in the last 3 weeks.</div>`}</div>
    <div class="section"><div class="minihead"><h2 class="group-label"><span>Handover note</span></h2>${canWrite(snap.role, "handover") ? html`<button type="button" class="text-btn" data-note>Add</button>` : ""}</div>
      ${notes.length ? notes.map((n) => html`<div class="note-card"><q>${n.text}</q><div class="by">${n.byName || ""}, ${datePart(n.at) === today ? timePart(n.at) : dayLabel(datePart(n.at)) + " " + timePart(n.at)}${canWrite(snap.role, "handover") ? html` · <button type="button" class="text-btn" data-reply="${n.id}" style="min-height:28px;padding:0">Reply</button>` : ""}</div>${(n.replies || []).map((r) => html`<div class="reply">${r.text} <span class="ink-2">— ${r.byName}, ${timePart(r.at)}</span></div>`)}</div>`) : html`<div class="card pad t-callout ink-2">No handover notes yet. Leave one for the next milker.</div>`}</div>
    ${coming.length ? html`<div class="section">${groupLabel("Coming up")}${coming.map((a) => alertCard(a, false))}</div>` : ""}
    <div class="section" data-tasks>${groupLabel("To do today", tasks.filter((t) => !t.done).length || "")}</div>
  </div>`);
  const tb = node.querySelector("[data-tasks]");
  tb.append(tasks.length ? taskList(tasks, { max: 12, onChange: () => {} }) : el(html`<div class="card pad t-callout ink-2">Nothing else to do today.</div>`));
  body.replaceChildren(node);
  if (scrollY) window.scrollTo(0, scrollY);
  const on = (sel, fn) => node.querySelectorAll(sel).forEach((b) => (b.onclick = (e) => { e.preventDefault(); fn(b); }));
  on("[data-parlour]", () => openParlour(snap));
  on("[data-share]", async () => { const text = parlourText(snap); try { if (navigator.share) { await navigator.share({ title: "Milk out of the tank", text }); return; } } catch (e) { if (e.name === "AbortError") return; } window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener"); });
  on("[data-release]", (b) => { const w = snap.data.milkWithhold.find((x) => x.id === b.dataset.release); if (!w) return; releaseWithhold(lid, w); toast(`${cowLabel(snap.ix.byId.get(w.animalId))} released — milk can go in the tank`, { action: "Undo", onAction: () => undoRelease(lid, w) }); });
  on("[data-tank]", () => flow("tank")(snap));
  on("[data-note]", () => flow("handover")(snap));
  on("[data-reply]", (b) => flow("handover")(snap, { reply: snap.data.handover.find((x) => x.id === b.dataset.reply) }));
  on("[data-fresh]", (b) => canWrite(snap.role, "freshChecks") && flow("fresh")(snap, { animalId: b.dataset.fresh }));
  node.querySelectorAll('a[href="#fresh"]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); node.querySelector("#fresh").scrollIntoView({ behavior: "smooth" }); }));
}
