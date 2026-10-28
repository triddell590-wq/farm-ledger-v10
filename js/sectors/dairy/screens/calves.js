// Dairy → More → Calves (design/12 §7.2, §4.2 calf card): calf shed board by pen, today's
// mixing sheet from the feeding plans, heifer growth vs % of mature weight, calf details
// (colostrum, disbudding with anaesthetic + pain relief, stage, weaning) and weighings.
import { viewPills } from "../../../ui/view-pills.js";
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { toast } from "../../../ui/toast.js";
import { textField, checkRow } from "../../../ui/form.js";
import { canWrite } from "../../../core/policy.js";
import { daysBetween } from "../../../core/dates.js";
import { num } from "../../../ui/format.js";
import { largeTitle, backLink, emptyState } from "../../../screens/common.js";
import { liveSnap } from "../data.js";
import { sectionOf, cowLabel, pill, kvRows } from "../ui.js";
import { entrySheet, chipsField, cowPickRow } from "../flows/common.js";
import { add, update, updateCow, softDelete } from "../actions.js";
import { onFarm, groupOf, listOf, sortByNo, ageMonths } from "../model/cows.js";
import { mixing, growthStatus, brixGood, MILESTONES } from "../model/calves.js";

const STAGES = ["Colostrum", "Milk", "Weaning", "Weaned"];
const isCalf = (snap, a) => onFarm(a) && groupOf(snap.ix, a, snap.today) === "calf";

export default async function calves(ctx) {
  const body = el(html`<div class="dairy-page"></div>`);
  const { first, stop } = liveSnap(ctx.ledger, (snap) => { const y = window.scrollY; body.replaceChildren(render(snap)); if (y) window.scrollTo(0, y); });
  await first;
  return { el: body, title: "Calves", tab: "cows", depth: 0, destroy: stop };
}

const age = (a, today) => { const d = daysBetween(a.dob, today); return d < 28 ? `${d} day${d === 1 ? "" : "s"}` : d < 120 ? `${Math.floor(d / 7)} wk` : `${Math.floor(d / 30.4)} mo`; };
const lastWeigh = (snap, a) => { const l = listOf(snap.ix.weights, a).filter((w) => +w.kg > 0); return l.length ? l[l.length - 1] : null; };

function render(snap) {
  const { lid, s, today } = snap; const w = canWrite(snap.role, "animals");
  const kids = snap.data.animals.filter((a) => isCalf(snap, a)).sort((a, b) => String(b.dob).localeCompare(String(a.dob)));
  const pens = new Map(); for (const a of kids) { const p = a.calf?.pen || "No pen"; if (!pens.has(p)) pens.set(p, []); pens.get(p).push(a); }
  const plans = snap.data.calfFeeds.filter((p) => !p.deleted);
  const mixRows = plans.map((p) => { const n = (p.calfIds || []).filter((id) => { const a = snap.ix.byId.get(id); return a && onFarm(a); }).length; return { p, n, m: mixing({ calves: n, lPerFeed: p.lPerFeed, feedsPerDay: p.feedsPerDay, gPerL: p.gPerL }) }; });
  const tot = mixRows.reduce((t, x) => ({ L: t.L + x.m.litresDay, kg: t.kg + x.m.kgDay }), { L: 0, kg: 0 });
  const youngstock = snap.data.animals.filter((a) => onFarm(a) && ["calf", "heifer"].includes(groupOf(snap.ix, a, today)) && /f|heifer/i.test(a.sex || "F"));
  const growth = youngstock.map((a) => ({ a, g: growthStatus(a.dob, lastWeigh(snap, a), s.matureKg, s.birthKg) })).filter((x) => x.g);
  const behind = growth.filter((x) => x.g.behind).sort((x, y) => x.g.ratio - y.g.ratio);
  const calfRow = (a) => { const c = a.calf || {}; const col = c.colostrum; const brix = brixGood(col?.brix);
    return html`<button type="button" class="row cow-row" data-calf="${a.id}"><span class="cow-no" style="font-size:20px">${cowLabel(a)}</span><span class="main"><span class="primary">${age(a, today)} · ${/b|m|steer/i.test(a.sex || "") ? "bull calf" : "heifer calf"}${c.stage ? " · " + c.stage : ""}</span>
      <span class="secondary">${col?.litres ? `Colostrum ${col.litres} L${col.time ? " at " + col.time : ""}${col.brix ? ` · Brix ${col.brix}%` : ""}` : "Colostrum not recorded"}${c.disbud?.date ? ` · disbudded${c.disbud.anaesthetic && c.disbud.analgesic ? " ✓" : " (pain relief?)"}` : ""}${c.weanDate ? ` · weaned ${c.weanDate.slice(8)}/${c.weanDate.slice(5, 7)}` : ""}</span></span>
      ${!col?.litres ? pill("due", "Colostrum") : brix === false ? pill("due", "Low Brix") : c.destination === "Sell" ? pill("neutral", "To sell") : ""}</button>`; };
  const node = el(html`<div>${largeTitle("Calves", `${num(kids.length)} calves · ${num(pens.size)} pen${pens.size === 1 ? "" : "s"}`)}${viewPills(lid, [["cows", "All cows"], ["calves", "Calves"], ["scores", "Mobility & BCS"]], "calves", "Cow views")}
    ${sectionOf("Today's mixing sheet", mixRows.length ? html`<div class="card pad">${mixRows.map(({ p, n, m }) => html`<p class="t-callout" style="margin:0 0 8px"><b>${p.pen || "Pen"}:</b> ${n} calves × ${p.lPerFeed} L × ${p.feedsPerDay} feeds = <b>${num(m.litresDay, 1)} L</b> → <b>${num(m.kgDay, 1)} kg powder</b> (${p.gPerL} g/L)${w ? html` <button type="button" class="text-btn" data-plan="${p.id}" style="min-height:28px;padding:0 4px">Edit</button>` : ""}</p>`)}
        <p class="t-head" style="margin:4px 0 0">Whole shed: ${num(tot.L, 1)} L · ${num(tot.kg, 1)} kg a day</p><p class="formula">Calves × litres per feed × feeds a day; × grams per litre ÷ 1000. Per feed: ${num(tot.L / Math.max(1, s.calfPlan.feedsPerDay), 1)} L.</p></div>`
      : html`<p class="hint">Add a feeding plan per pen and the mixing sheet works itself out (e.g. 6 calves × 3 L × 2 feeds = 36 L → 5.4 kg at 150 g/L).</p>`)}
    ${w ? html`<button type="button" class="btn secondary" data-plan style="margin-top:8px">Add a feeding plan</button>` : ""}
    ${kids.length ? [...pens].map(([p, list]) => sectionOf(p === "No pen" ? "Not in a pen" : `Pen ${p}`, html`<div class="list">${list.map(calfRow)}</div>`, list.length))
      : emptyState({ sector: "dairy", title: "No calves yet", body: "Calves you record at calving appear here with colostrum, feeding and weaning." })}
    ${sectionOf("Heifer growth", html`<div class="card pad">${kvRows(MILESTONES.map((m) => [m.label, m.text || `${m.pct}% of mature (${m.key === "m6" ? Math.round(0.27 * s.matureKg) : m.key === "m12" ? Math.round(0.5 * s.matureKg) : m.key === "service" ? `${Math.round(0.55 * s.matureKg)}–${Math.round(0.6 * s.matureKg)}` : `${Math.round(0.85 * s.matureKg)}–${Math.round(0.9 * s.matureKg)}`} kg)`]))}
      <p class="formula">Mature cow weight ${s.matureKg} kg (Dairy settings). Aim for about 0.8 kg a day. "Behind" = under 90% of target at the last weighing. Source: CAFRE / AHDB heifer targets.</p></div>
      ${behind.length ? html`<p class="form-label">Heifers behind</p><div class="list">${behind.map(({ a, g }) => html`<a class="row cow-row" href="#/l/${lid}/cow/${a.id}"><span class="cow-no" style="font-size:20px">${cowLabel(a)}</span><span class="main"><span class="primary">${g.kg} kg at ${Math.floor(ageMonths(a, today))} mo</span><span class="secondary">target ${g.target} kg · ${Math.round(g.ratio * 100)}% of target</span></span>${pill("due", "Behind")}</a>`)}</div>`
        : html`<p class="hint">${growth.length ? `${growth.length} weighed — none behind.` : "Weigh (or tape) heifers to check them against the targets."}</p>`}
      ${w ? html`<div class="act-grid"><button type="button" class="btn secondary" data-weigh>Record a weight</button><a class="btn secondary" href="#/l/${lid}/tools/tape">Weigh tape table</a></div>` : ""}`)}
  </div>`);
  node.querySelectorAll("[data-calf]").forEach((b) => (b.onclick = () => (w ? calfSheet(snap, snap.ix.byId.get(b.dataset.calf)) : (location.hash = `#/l/${lid}/cow/${b.dataset.calf}`))));
  node.querySelectorAll("[data-plan]").forEach((b) => (b.onclick = () => planSheet(snap, plans.find((p) => p.id === b.dataset.plan))));
  const wb = node.querySelector("[data-weigh]"); if (wb) wb.onclick = () => weighSheet(snap);
  return node;
}

/** Calf details: pen, colostrum, stage, disbudding (both ticks: Red Tractor HP.1), weaning. */
export function calfSheet(snap, a) {
  const c = a.calf || {}; const col = c.colostrum || {}; const d = c.disbud || {};
  const body = el(html`<form novalidate><p class="hint" style="margin:0 4px 12px">${cowLabel(a)} · born ${a.dob}</p>
    <div class="form-group">${textField({ name: "pen", label: "Pen", value: c.pen || "" })}${chipsField("stage", "Feeding stage", STAGES, c.stage || "Milk")}${chipsField("destination", "Destination", ["Rear as replacement", "Sell", "Beef calf"], c.destination || "Rear as replacement")}</div>
    <p class="form-label">Colostrum (first feed)</p>
    <div class="form-group">${textField({ name: "colL", label: "Litres", value: col.litres ?? "", inputmode: "decimal" })}${textField({ name: "colTime", label: "Time", type: "time", value: col.time || "" })}${textField({ name: "brix", label: "Brix %", value: col.brix ?? "", inputmode: "decimal", optional: true })}</div>
    <p class="form-label">Disbudding</p>
    <div class="form-group">${textField({ name: "disbudDate", label: "Date", type: "date", value: d.date || "" })}${checkRow("anaesthetic", "Local anaesthetic given", !!d.anaesthetic)}${checkRow("analgesic", "Pain relief (NSAID) given", !!d.analgesic)}</div>
    <div class="form-group">${textField({ name: "vaccines", label: "Vaccinations", value: c.vaccines || "", optional: true, placeholder: "Rispoval IN 12 Oct" })}${textField({ name: "weanDate", label: "Weaned on", type: "date", value: c.weanDate || "" })}</div></form>`);
  return entrySheet({ title: "Calf details", body, label: "Save calf", missing: (v) => (v.disbudDate && (!v.anaesthetic || !v.analgesic) ? "Disbudding needs anaesthetic and pain relief ticked" : null),
    save(v, sh) {
      updateCow(snap.lid, a, { calf: { ...c, pen: v.pen, stage: v.stage, destination: v.destination, colostrum: v.colL || v.colTime || v.brix ? { litres: v.colL === "" ? null : +v.colL, time: v.colTime, brix: v.brix === "" ? null : +v.brix } : null, disbud: v.disbudDate ? { date: v.disbudDate, anaesthetic: v.anaesthetic, analgesic: v.analgesic } : null, vaccines: v.vaccines, weanDate: v.weanDate || null } });
      sh.close(true, { force: true }); toast("Calf saved");
    } }).sheet.done;
}

function planSheet(snap, p = null) {
  const pick = cowPickRow(snap, { label: "Calves", multi: true, ids: p?.calfIds || [], filter: (a) => isCalf(snap, a), title: "Calves on this plan" });
  const def = snap.s.calfPlan;
  const body = el(html`<form novalidate><div class="form-group">${textField({ name: "pen", label: "Pen", value: p?.pen || "" })}</div><div class="form-group" data-pick></div>
    <div class="form-group">${textField({ name: "lPerFeed", label: "Litres per feed", value: p?.lPerFeed ?? def.lPerFeed, inputmode: "decimal" })}${textField({ name: "feedsPerDay", label: "Feeds a day", value: p?.feedsPerDay ?? def.feedsPerDay, inputmode: "numeric" })}${textField({ name: "gPerL", label: "Grams of powder per litre", value: p?.gPerL ?? def.gPerL, inputmode: "numeric" })}</div>
    ${p ? html`<button type="button" class="text-btn danger" data-del>Remove this plan</button>` : ""}</form>`);
  body.querySelector("[data-pick]").append(pick.node);
  const es = entrySheet({ title: p ? "Feeding plan" : "Add a feeding plan", body, label: "Save plan", missing: (v) => (!v.pen ? "Name the pen" : !pick.ids().length ? "Choose the calves" : !(+v.lPerFeed > 0) ? "Add litres per feed" : null),
    save(v, sh) { const data = { pen: v.pen, calfIds: pick.ids(), lPerFeed: +v.lPerFeed, feedsPerDay: +v.feedsPerDay || 2, gPerL: +v.gPerL || 150, stage: "Milk" }; if (p) update(snap.lid, "calfFeeds", p, data); else add(snap.lid, "calfFeeds", data); sh.close(true, { force: true }); toast("Feeding plan saved"); } });
  const del = body.querySelector("[data-del]"); if (del) del.onclick = () => { softDelete(snap.lid, "calfFeeds", p.id); es.sheet.close(true, { force: true }); toast("Plan removed"); };
}

export function weighSheet(snap, { animalId = null } = {}) {
  const pick = cowPickRow(snap, { label: "Animal", ids: animalId ? [animalId] : [], filter: (a) => onFarm(a) && ["calf", "heifer"].includes(groupOf(snap.ix, a, snap.today)) });
  const body = el(html`<form novalidate><div class="form-group" data-pick></div><div class="form-group">${textField({ name: "kg", label: "Weight (kg)", inputmode: "decimal" })}${textField({ name: "date", label: "Date", type: "date", value: snap.today })}${chipsField("method", "How", ["Scales", "Weigh tape"], "Scales")}</div></form>`);
  body.querySelector("[data-pick]").append(pick.node);
  return entrySheet({ title: "Record a weight", body, label: "Save weight", missing: (v) => (!pick.ids().length ? "Choose the animal" : !(+v.kg > 0) ? "Add the weight" : null),
    save(v, sh) { add(snap.lid, "weighings", { animalId: pick.ids()[0], date: v.date, kg: +v.kg, method: v.method }); sh.close(true, { force: true }); toast("Weight saved"); } }).sheet.done;
}
void sortByNo;
