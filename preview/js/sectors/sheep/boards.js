// The five stage boards (design/11 §3.2–3.6). Compact on the Flock home, full in Sheep year.
// Buttons carry data-flow="<id>" and are wired by wireFlows().
import { html, raw } from "../../core/html.js";
import { icon } from "../../ui/icons.js";
import { addDays, daysBetween } from "../../core/dates.js";
import { canRead, canWrite } from "../../core/policy.js";
import { emptyState } from "../../screens/common.js";
import { moneyText } from "../../ui/format.js";
import { FLOWS } from "./quick-add.js";
import { numTile, colourChip, short, num, kvRows, miniHead, groupChip, pill, listDate } from "./ui.js";
import { raddleCycles } from "./model/year.js";
import { ewesToRam, ramSummary, ewesPerRam, activeMobs } from "./model/mobs.js";
import { scanTotals, scanPct, barrenPct, onDay, pensInUse, toWatch, cropLambings, sumLambs } from "./model/lambing.js";
import { mealPlan, feedingGroups, bcsSummary } from "./model/feeding.js";
import { BCS_TARGETS } from "./model/settings.js";
import { doses, lastLame, fecDue, repeatLame } from "./model/health.js";
import { draftSummary, cullList, replacementsNeeded, growth } from "./model/selling.js";
import { quarantines } from "./model/paperwork.js";
import { seasonalFor } from "./model/content.js";

const btn = (flow, label, extra = "", cls = "btn secondary") => html`<button type="button" class="${cls}" data-flow="${flow}" ${raw(extra)}>${label}</button>`;
export function wireFlows(node, getSnap) {
  node.addEventListener("click", (e) => {
    const b = e.target.closest("[data-flow]"); if (!b) return;
    const f = FLOWS[b.dataset.flow]; if (!f) return;
    let extra = {}; try { extra = b.dataset.extra ? JSON.parse(b.dataset.extra) : {}; } catch (er) { /* none */ }
    f.run(getSnap(), extra);
  });
}

export function board(stage, snap, opts = {}) {
  return { tupping, scanning, lambing, grazing, weaning }[stage](snap, opts);
}

function tupping(snap, { full = false } = {}) {
  const { data, s, cy, today, lid } = snap; const write = canWrite(snap.role, "events");
  const rc = raddleCycles(cy, s, today);
  const anyRaddle = data.events.some((e) => e.kind === "raddle" && e.date >= cy.ramsIn && e.date < cy.nextRamsIn);
  if (!cy.actual && !anyRaddle && snap.stage.stage === "tupping") {
    return emptyState({ sector: "sheep", title: "Rams not in yet", body: `Set your rams-in date and we'll work out raddle changes and lambing dates. Planned: ${short(cy.ramsIn)}.`, action: write ? "Set rams-in date" : null, actAttr: 'data-flow="ramsIn"' });
  }
  const day = daysBetween(cy.ramsIn, today) + 1;
  const marked = {}; for (const e of data.events) if (e.kind === "raddle" && e.date >= cy.ramsIn && e.date < cy.nextRamsIn) marked[e.counts?.colour] = (marked[e.counts?.colour] || 0) + (+e.counts?.newlyMarked || 0);
  const ewes = ewesToRam(data, cy); const totalMarked = Object.values(marked).reduce((a, b) => a + b, 0);
  const rams = ramSummary(data); const epr = ewesPerRam(ewes, rams, s);
  const first = rc.cycles[0]; const firstPct = ewes ? Math.round(((marked[first?.colour] || 0) / ewes) * 100) : 0;
  const inTupping = today <= cy.ramsOut;
  return html`<div class="s-hero"><span class="k">Rams in ${short(cy.ramsIn)}${inTupping ? ` · day ${day}` : ` · out ${short(cy.ramsOut)}`}</span>
      ${rc.nextChange && inTupping ? html`<div class="big">${listDate(rc.nextChange)}</div><span class="sub">Next raddle change: ${colourChip(rc.current?.colour || first.colour)} now → ${colourChip(rc.next.colour)} next</span>`
        : html`<div class="big">${inTupping ? "Last cycle" : "Rams out"}</div><span class="sub">${inTupping ? `Rams out ${short(cy.ramsOut)}` : `Scanning from ${short(cy.scanFrom)}`}</span>`}</div>
    ${miniHead("Marked so far", write ? html`<button type="button" class="text-btn" data-flow="raddle">Raddle check</button>` : "")}
    <div class="list">${rc.cycles.map((c) => html`<div class="row no-lead"><span class="main"><span class="primary">${colourChip(c.colour)} · ${short(c.from)}–${short(c.to)}</span><span class="secondary">Lambing ${short(c.lambFrom)} – ${short(c.lambTo)}</span></span><span class="kv-v">${marked[c.colour] ? html`${num(marked[c.colour])}<small>ewes</small>` : "–"}</span></div>`)}
      <div class="row no-lead"><span class="main"><span class="primary">Not marked yet</span></span><span class="kv-v">${num(Math.max(0, ewes - totalMarked))}<small>ewes</small></span></div></div>
    <div class="s-tiles">${numTile({ label: "Ewes per ram", value: epr.ratio ?? "–", delta: rams.total ? `${rams.working} rams · ${epr.ok ? "on guide" : "over the guide"}` : "Add your rams", tone: epr.ratio && !epr.ok ? "due" : "", href: `#/l/${lid}/rams` })}
      ${numTile({ label: "First cycle", value: html`${firstPct}%<small>marked</small>`, delta: `target ${s.firstCycleTarget}%+ by day 17`, tone: day >= 17 && firstPct < s.firstCycleAlert ? "due" : "" })}</div>
    ${full ? html`${miniHead("By mob")}${kvRows(activeMobs(data).filter((m) => m.class !== "rams" && data.events.some((e) => e.kind === "raddle" && e.mobId === m.id && e.date >= cy.ramsIn)).map((m) => [m.name, data.events.filter((e) => e.kind === "raddle" && e.mobId === m.id && e.date >= cy.ramsIn).reduce((n, e) => n + (+e.counts?.newlyMarked || 0), 0), "", `${num(snap.counts.get(m.id) || 0)} in the mob`]))}
      ${write ? html`<div class="btn-col" style="margin-top:16px">${btn("raddle", "Raddle check", "", "btn")}${btn("ramsIn", cy.ramsOutActual ? "Rams in / out" : "Rams out")}</div>` : ""}` : ""}`;
}

function scanning(snap, { full = false } = {}) {
  const { data, s, cy, today, lid } = snap; const money = canRead(snap.role, "finance"); const write = canWrite(snap.role, "events");
  const t = scanTotals(data, cy); const ewes = ewesToRam(data, cy) || t.scanned;
  if (!t.scanned) return html`${emptyState({ sector: "sheep", title: "No scan results yet", body: `Record results as the scanner calls them — four big buttons, no typing. Scanning window ${short(cy.scanFrom)} – ${short(cy.scanTo)}.`, action: write ? "Record scan results" : null, actAttr: 'data-flow="scan"' })}${bcsTile(snap, "scanning")}`;
  const pct = scanPct(t.lambs, ewes); const b = barrenPct(t.empty, t.scanned);
  const plan = mealPlan({ single: t.single, twin: t.twin, triplet: t.triplet }, cy.lambFrom, s);
  const w = (k) => (t.scanned ? (t[k] / t.scanned) * 100 : 0);
  return html`<div class="s-hero"><span class="k">${num(t.scanned)} of ${num(ewes)} ewes scanned</span><div class="big">Scanning ${pct}%</div>
      <div class="sbar" role="img" aria-label="Empty ${t.empty}, single ${t.single}, twin ${t.twin}, triplet ${t.triplet}"><i style="width:${w("empty")}%"></i><i style="width:${w("single")}%"></i><i style="width:${w("twin")}%"></i><i style="width:${w("triplet")}%"></i></div>
      <div class="sbar-key"><span>Empty <b>${t.empty}</b></span><span>Single <b>${t.single}</b></span><span>Twin <b>${t.twin}</b></span><span>Triplet <b>${t.triplet}</b></span></div></div>
    <div class="s-tiles">${numTile({ label: "Barren", value: `${b}%`, delta: `target under ${s.barrenTarget}%`, tone: b > s.barrenTarget ? "due" : "ok" })}
      ${numTile({ label: "Meal needed", value: `${plan.tonnes} t`, delta: plan.start ? `from ${short(plan.start)}${money ? " · " + moneyText(plan.cost) : ""}` : "", href: `#/l/${lid}/tools/meal` })}
      ${numTile({ hero: true, label: "Feeding groups", value: feedingGroups(t).filter((g) => g.key !== "empty").map((g) => `${g.name} ${g.n}`).join(" · "), delta: `split by ${short(addDays(cy.lambFrom, -56))}` })}</div>
    ${bcsTile(snap, "scanning")}
    ${write ? html`<div class="btn-col" style="margin-top:16px">${btn("scan", "Record scan results")}</div>` : ""}
    ${full ? html`${miniHead("Scans recorded")}${kvRows(t.events.map((e) => [snap.data.mobs.find((m) => m.id === e.mobId)?.name || "Mob", `${scanPct((+e.counts.single || 0) + 2 * (+e.counts.twin || 0) + 3 * (+e.counts.triplet || 0), (+e.counts.empty || 0) + (+e.counts.single || 0) + (+e.counts.twin || 0) + (+e.counts.triplet || 0))}%`, "", `${short(e.date)} · E ${e.counts.empty || 0} · S ${e.counts.single || 0} · T ${e.counts.twin || 0} · Tr ${e.counts.triplet || 0}`]))}` : ""}`;
}

function lambing(snap, { full = false } = {}) {
  const { data, cy, today, now, lid, s } = snap; const write = canWrite(snap.role, "lambings");
  const d = onDay(data, today); const pens = pensInUse(data, now); const watch = toWatch(data);
  const season = sumLambs(cropLambings(data, cy)); const ewes = ewesToRam(data, cy);
  const rc = raddleCycles(cy, s, today);
  const dueNext = rc.cycles.filter((c) => c.lambTo >= today && c.lambFrom <= addDays(today, 7));
  const marked = (c) => data.events.filter((e) => e.kind === "raddle" && e.date >= cy.ramsIn && e.counts?.colour === c.colour).reduce((n, e) => n + (+e.counts?.newlyMarked || 0), 0);
  return html`${write ? html`<button type="button" class="btn" style="min-height:72px;font-size:19px" data-flow="shed">${raw(icon("birth"))} Open lambing shed</button>` : ""}
    <div class="s-tiles">${numTile({ label: "Lambed today", value: html`${num(d.ewes)}<small>ewes</small>` })}${numTile({ label: "Lambs alive", value: num(d.alive), delta: `${d.dead} dead` })}
      ${numTile({ label: "In pens", value: num(pens.length), delta: `${pens.filter((p) => p.ready).length} ready to turn out`, href: `#/l/${lid}/year/lambing` })}${numTile({ label: "To watch", value: html`${num(watch.length)}<small>ewes</small>`, delta: watch.length ? [...new Set(watch.flatMap((l) => l.problems))].slice(0, 2).join(", ").toLowerCase() : "none", tone: watch.length ? "due" : "", href: `#/l/${lid}/year/lambing` })}</div>
    ${dueNext.length ? html`<p class="foot-note">Due next 7 days by raddle colour: ${dueNext.map((c) => html`${colourChip(c.colour)} ${short(c.lambFrom)}–${short(c.lambTo)}${marked(c) ? ` · ${marked(c)} ewes` : ""} `)}</p>` : ""}
    <p class="foot-note">Season so far: ${num(season.ewes)}${ewes ? ` of ${num(ewes)}` : ""} ewes lambed · ${num(season.born)} lambs · ${season.perEwe} per ewe · ${season.deadPct}% dead</p>
    ${!season.ewes && !full ? "" : ""}`;
}

function grazing(snap, { full = false } = {}) {
  const { data, s, today, lid } = snap; const write = canWrite(snap.role, "medicines");
  const mobs = activeMobs(data);
  const fecMob = mobs.find((m) => fecDue(data, m.id, today) && m.class !== "rams");
  const last = fecMob ? doses(data, fecMob.id).find((x) => x.wormerGroup) : null;
  const nem = seasonalFor(today).find((x) => x.key === "nematodirus");
  const gw = data.events.filter((e) => e.kind === "weigh" && e.ageDays).sort((a, b) => b.date.localeCompare(a.date))[0];
  const gAvg = gw ? draftSummary((gw.counts?.weights || []).map((kg) => ({ kg })), s).avg : null; const g = gw && gAvg ? growth(gAvg, +gw.ageDays) : null;
  const lames = mobs.map((m) => lastLame(data, m.id)).filter(Boolean).sort((a, b) => b.date.localeCompare(a.date));
  return html`<div class="s-tiles">
    ${numTile({ hero: true, label: "Worms", value: fecMob ? `FEC due: ${fecMob.name}` : "No FEC due", delta: fecMob ? (last ? html`last dosed ${short(last.date)}, ${groupChip(last.wormerGroup)}` : "no wormer recorded yet") : "Test every 3–4 weeks in the grazing season", href: `#/l/${lid}/worms` })}
    ${nem ? numTile({ hero: true, label: "Nematodirus", value: "High hatch risk", delta: nem.text, tone: "due" }) : ""}
    ${numTile({ label: "Lamb growth", value: g ? `${g} g/day` : "–", delta: g ? `${gAvg} kg at ${Math.round(gw.ageDays / 7)} weeks · target ${s.growthTarget}` : "Weigh lambs at 8 weeks", tone: g && g < s.growthWeanBelow ? "late" : g && g < s.growthTarget ? "due" : "" })}
    ${numTile({ label: "Lame", value: lames[0] ? `${lames[0].pct}%` : "–", delta: lames[0] ? `last check ${short(lames[0].date)} · target under ${s.lameTarget}%` : "Count lame sheep at each gather", tone: lames[0] && lames[0].pct > s.lameTarget ? "due" : "" })}</div>
    ${write ? html`<div class="btn-col" style="margin-top:16px">${btn("treat", "Record a dose")}${full ? btn("fec", "FEC result") : ""}${full ? btn("lame", "Lame count") : ""}${full ? btn("weigh", "Weigh lambs (8-week check)") : ""}</div>` : ""}`;
}

function weaning(snap, { full = false } = {}) {
  const { data, s, cy, today, lid } = snap; const write = canWrite(snap.role, "events");
  const wEv = data.events.filter((e) => e.kind === "weigh" && e.date >= addDays(today, -21)).sort((a, b) => b.date.localeCompare(a.date))[0];
  const ds = wEv ? draftSummary((wEv.counts?.weights || []).map((kg) => ({ kg })), s) : null;
  const rl = repeatLame(data, today); const cl = cullList(data, cy, rl);
  const ewes = snap.totals.ewes; const deaths = data.deaths.filter((d) => !d.lamb && d.date >= cy.ramsIn).reduce((n, d) => n + (+d.number || 1), 0);
  const repl = replacementsNeeded({ ewes, culls: cl.total, deaths, target: s.targetEwes || ewes, eweLambsKept: snap.totals.eweLambs });
  const rams = ramSummary(data); const motBy = addDays(cy.nextRamsIn, -30);
  const q = quarantines(data, s, today).filter((x) => x.active);
  const reasons = Object.entries(cl.byReason).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(", ");
  return html`<div class="s-tiles">
    ${numTile({ label: "Draft list", value: ds ? html`${ds.now}<small>lambs</small>` : "–", delta: ds ? `ready at ${s.draftKg} kg+ · ${ds.soon} in 1–2 weeks` : "Weigh lambs to draft", href: "", attr: write ? 'data-flow="draft" role="button" tabindex="0"' : "" })}
    ${numTile({ label: "Cull list", value: html`${cl.total}<small>ewes</small>`, delta: reasons || "none flagged", tone: cl.total ? "due" : "" })}
    ${numTile({ label: "Replacements needed", value: num(repl), delta: `culls + deaths${s.targetEwes ? ` + target ${s.targetEwes}` : ""} − ewe lambs kept` })}
    ${numTile({ label: "Ram MOT", value: rams.lastMot && rams.lastMot >= addDays(cy.nextRamsIn, -75) ? "Done" : `${rams.total} rams`, delta: `teeth, toes, testicles, tone · before ${short(motBy)}`, href: `#/l/${lid}/rams` })}</div>
    ${q.map((x) => html`<div class="banner info">${raw(icon("info"))}<span><b>In quarantine: ${x.mv.mobName || x.mv.description || "bought-in sheep"}</b>Until ${short(x.until)}. Keep apart, dose with two wormer groups, treat for scab, footbath.</span></div>`)}
    ${bcsTile(snap, "weaning")}
    ${write ? html`<div class="btn-col" style="margin-top:16px">${btn("draft", "Draft & sell", "", "btn")}${btn("weigh", "Weigh lambs")}${btn("cull", "Cull check")}${full ? btn("wean", "Record weaning count", `data-extra='{}'`) : ""}</div>` : ""}
    ${full && cl.ewes.length ? html`${miniHead("Ewes flagged to cull", cl.ewes.length)}<div class="list">${cl.ewes.map((e) => html`<${raw(e.id ? "a" : "div")} class="row no-lead" ${raw(e.id ? `href="#/l/${lid}/sheep/${e.id}"` : "")}><span class="main"><span class="primary">${e.tag}</span><span class="secondary">${e.reasons.join(", ")}</span></span>${pill("due", "Cull")}</${raw(e.id ? "a" : "div")}>`)}</div>` : ""}`;
}

/** BCS tile when the stage calls for it (weaning, pre-tupping, scanning, pre-lambing). */
export function bcsTile(snap, stage) {
  const { data, s, lid } = snap; const target = (BCS_TARGETS[stage] || BCS_TARGETS.tupping)[s.flockType] || [3, 3.5];
  const last = data.events.filter((e) => e.kind === "bcs").sort((a, b) => b.date.localeCompare(a.date))[0];
  const sm = last ? bcsSummary(last.counts, target) : null;
  return html`<div class="s-tiles">${numTile({ hero: true, label: `Body condition (${stage === "weaning" ? "weaning" : stage})`, value: sm ? `${sm.onPct}% on target` : "Not scored yet", delta: `target ${target[0] === target[1] ? target[0] : target.join("–")}${sm ? ` · average ${sm.avg} · ${sm.thin} thin · ${short(last.date)}` : " · score at weaning, pre-tupping, scanning and pre-lambing"}`, attr: canWrite(snap.role, "events") ? 'data-flow="bcs" role="button" tabindex="0"' : "" })}</div>`;
}
