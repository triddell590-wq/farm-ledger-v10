// AM / PM check (design/15 §4 — the most-used entry; the mockup flow). Two inspections a day,
// each a legal record (Sch. 5 para 8). Saving writes the para 10 house record: dead with cause,
// culled with cause, remaining. The summary bar updates as you tap.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { toast } from "../../../ui/toast.js";
import { stepper } from "../../../ui/form.js";
import { entrySheet, chipsField, nowHM, houseCrop } from "./common.js";
import { saveCheck, undoAdd } from "../actions.js";
import { aliveStart, deathsOn, cumMortPct, legalLine, cropDay, clearDayOf, listOf } from "../model/crop.js";
import { CULL_REASONS, HOUSE_CHECKS } from "../model/content.js";
import { plannedMax, densityNeeds } from "../model/density.js";
import { n0, pc } from "../ui.js";

const row = (name, label, value, { sub = "", step = 1, max = 99999 } = {}) => html`<div class="br-step"><span class="lab">${label}${sub ? html`<small>${sub}</small>` : ""}</span>${stepper(name, value, { step, max, label })}</div>`;
const SLOT = { am: "AM", pm: "PM" };

/** checkFlow(snap, { houseId, slot, date }) */
export async function checkFlow(snap, { houseId, cropId, slot, date } = {}) {
  const hc = await houseCrop(snap, { houseId, cropId, title: "Check which house?" }); if (!hc) return;
  const { house, crop } = hc; const d = date || snap.today;
  const done = listOf(snap.ix.checks, crop.id).filter((x) => x.date === d);
  const sl = slot || (done.some((x) => x.slot === "am") ? "pm" : "am");
  return checkSheet(snap, { house, crop, slot: sl, date: d });
}

export function checkSheet(snap, { house, crop, slot, date }) {
  const day = cropDay(crop, date); const aliveAm = aliveStart(snap.ix, crop, date);
  const old = listOf(snap.ix.checks, crop.id).find((x) => x.date === date && x.slot === slot) || null;
  const other = listOf(snap.ix.checks, crop.id).find((x) => x.date === date && x.slot !== slot) || null;
  const before = deathsOn(snap.ix, crop, date) - (old ? (+old.dead || 0) + Object.values(old.culls || {}).reduce((t, v) => t + (+v || 0), 0) : 0);
  const area = +house.usableM2 || 0; const needs = area ? densityNeeds(snap.ix, crop, snap.s, plannedMax(snap.ix, crop, snap.s, area, snap.today)) : null;
  const ctrl = (snap.data.controllerReadings || []).filter((r) => r.houseId === house.id && r.date === date).sort((a, b) => String(a.time).localeCompare(String(b.time))).pop() || null;
  const ref = other || null; const pre = old || {};
  const v0 = (k) => pre[k] ?? ctrl?.[k] ?? "";
  const meterSlot = snap.s.waterMeterSlot === "both" || snap.s.waterMeterSlot === slot;
  const greyed = (k, unit = "") => (ref && ref[k] != null && ref[k] !== "" ? html`<small>${SLOT[ref.slot]} ${ref[k]}${unit}</small>` : ctrl && ctrl[k] != null && !old ? html`<small class="ctrl">from controller</small>` : "");
  const body = el(html`<form novalidate class="br-check">
    <p class="br-sub">Day ${day} · ${n0(aliveAm)} alive this morning${before > 0 ? ` · ${before} out earlier today` : ""}</p>
    <h3 class="group-label"><span>Birds</span></h3>
    <div class="form-group br-big">${row("dead", "Found dead", pre.dead ?? 0, { sub: "cause in notes if known" })}</div>
    <h3 class="group-label"><span>Culled — why?</span></h3>
    <div class="form-group">${CULL_REASONS.map(([k, l]) => row(`cull_${k}`, l, pre.culls?.[k] ?? 0))}
      <div class="field"><label>Cause notes</label><input name="causeNote" value="${pre.causeNote || ""}" placeholder="e.g. smothering by the drinkers"></div></div>
    <h3 class="group-label"><span>House</span>${ctrl && !old ? html`<span class="br-ctrl">${raw(icon("download"))}Readings from controller ${ctrl.time || ""}</span>` : ""}</h3>
    <div class="form-group">
      <div class="field"><label>Temp °C ${greyed("tempC", "°")}</label><input name="tempC" type="number" inputmode="decimal" step="0.1" value="${v0("tempC")}" placeholder="24.5"></div>
      <div class="br-step"><span class="lab">Humidity %${greyed("rh", "%")}</span>${stepper("rh", v0("rh") === "" ? 60 : v0("rh"), { max: 100, label: "humidity" })}</div>
      <div class="br-step"><span class="lab">NH₃ ppm${needs && needs.tier !== "none" ? html`<small>required above 33 kg/m² · 20 or under</small>` : html`<small>20 or under</small>`}${greyed("nh3")}</span>${stepper("nh3", v0("nh3") === "" ? 0 : v0("nh3"), { max: 100, label: "ammonia" })}</div>
      <div class="br-step"><span class="lab">CO₂ ppm<small>3,000 or under</small>${greyed("co2")}</span>${stepper("co2", v0("co2") === "" ? 0 : v0("co2"), { max: 10000, step: 100, label: "CO2" })}</div>
      <div class="field"><label>Outside °C <span class="opt">(optional)</span></label><input name="outsideC" type="number" inputmode="decimal" step="0.5" value="${v0("outsideC")}"></div>
      ${meterSlot ? html`<div class="field"><label>Water meter</label><input name="waterMeter" type="number" inputmode="numeric" value="${v0("waterMeter")}" placeholder="litres"></div>` : ""}
      ${chipsField("litterFront", "Litter front (1 dry – 5 wet)", ["1", "2", "3", "4", "5"], pre.litter?.front ?? null)}
      ${chipsField("litterMiddle", "Litter middle", ["1", "2", "3", "4", "5"], pre.litter?.middle ?? null)}
      ${chipsField("litterBack", "Litter back", ["1", "2", "3", "4", "5"], pre.litter?.back ?? null)}
      ${chipsField("checks", "Checks", HOUSE_CHECKS, pre.checks || (old ? [] : HOUSE_CHECKS), { multi: true })}
      <div class="field"><label>Time</label><input type="time" name="time" value="${pre.time || nowHM()}"></div>
    </div>
    <div class="br-sum" data-sum></div>
  </form>`);
  const outNow = (v) => (+v.dead || 0) + CULL_REASONS.reduce((t, [k]) => t + (+v[`cull_${k}`] || 0), 0);
  const paintSum = (v) => {
    const out = outNow(v); const dayOut = before + out; const pct = aliveAm ? (dayOut / aliveAm) * 100 : 0;
    const cum = cumMortPct(snap.ix, crop, date) + ((out - (old ? outOld : 0)) / (+crop.placed || 1)) * 100;
    const legal = needs?.needsApproval ? legalLine(day) : null; const clearDay = clearDayOf(snap.ix, crop, snap.s);
    body.querySelector("[data-sum]").innerHTML = `<div>This check: <b>${out}</b> out · today ${dayOut} (${pct.toFixed(2)}%)${pct > snap.s.mortalitySpikePct ? ` <span class="warn">· over ${snap.s.mortalitySpikePct}% in 24 h</span>` : ""}</div><div>Crop so far ${pc(cum, 2)}${legal != null ? ` · legal line today ${pc(legal, 2)}${cum > legal ? ' <span class="warn">⚠</span>' : ""}` : ` · legal line at day ${clearDay}: ${pc(legalLine(clearDay), 2)}`}${+v.nh3 > 20 ? ' <span class="warn">· ammonia over 20 ppm</span>' : ""}${+v.co2 > 3000 ? ' <span class="warn">· CO₂ over 3,000 ppm</span>' : ""}</div>`;
  };
  const outOld = old ? (+old.dead || 0) + Object.values(old.culls || {}).reduce((t, x) => t + (+x || 0), 0) : 0;
  const label = `Save ${SLOT[slot]} check ${house.name}`;
  const es = entrySheet({ title: `${house.name} · ${SLOT[slot]} check · Day ${day}`, body, label, size: "large",
    save(v, sh) {
      const culls = {}; for (const [k] of CULL_REASONS) culls[k] = +v[`cull_${k}`] || 0;
      const id = saveCheck(snap, crop, { slot, date, time: v.time, dead: v.dead, culls, causeNote: v.causeNote, tempC: v.tempC, rh: v.rh, nh3: v.nh3 || (v.nh3 === 0 && !ctrl ? undefined : v.nh3), co2: v.co2 || undefined, outsideC: v.outsideC, waterMeter: v.waterMeter,
        litter: { front: v.litterFront, middle: v.litterMiddle, back: v.litterBack }, checks: v.checks, source: ctrl && !old ? "controller + manual" : "manual" });
      sh.close(true, { force: true });
      toast(`${SLOT[slot]} check saved · ${house.name}`, old ? {} : { action: "Undo", onAction: () => undoAdd(snap.lid, "checks", id) });
    } });
  es.form.onChange(() => paintSum(es.form.values())); paintSum(es.form.values()); es.rebase();
  return es.sheet.done;
}
