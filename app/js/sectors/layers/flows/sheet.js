// The daily house sheet (design/14 §4 — the most-used entry, ~30 seconds a house). One sheet per
// house per day. Yesterday's values show greyed under every field; the summary bar works out lay %,
// seconds %, water per 1,000 birds and the water change as you type. Saving writes the producer
// daily record and the mortality-at-inspection record from the same entry.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { openSheet } from "../../../ui/sheet.js";
import { textField, stepper, wireForm, checkRow } from "../../../ui/form.js";
import { toast } from "../../../ui/toast.js";
import { entrySheet, chipsField, chooseHouse, numField, nowHM, warn } from "./common.js";
import { saveDay } from "../actions.js";
import { aliveAt, sheetFigures, series, weekOfAge, daysFor } from "../model/flock.js";
import { standardFor, layBand, vsBand } from "../model/standards.js";
import { eggWithheld, classB } from "../model/health.js";
import { isFreeRange, aiState } from "../model/house.js";
import { DEATH_CAUSES, CHECKS } from "../model/content.js";
import { dm, n0, n1 } from "../ui.js";

const isCull = (c) => /^Culled/.test(c);
const WHERE = ["Front left", "Front right", "Middle left", "Middle right", "Back left", "Back right"];

export async function sheetFlow(snap, { houseId = null, date = null } = {}) {
  const pick = await chooseHouse(snap, { title: "Daily sheet — which house?", houseId });
  if (!pick) return null;
  return daySheet(snap, pick.h, pick.f, date || snap.today);
}

function stepRow(name, label, value, { step = 1, sub = "", max = 1e9, min = 0 } = {}) {
  return html`<div class="field ly-step"><span class="label">${label}${sub ? html`<small>${sub}</small>` : ""}</span><span class="spacer"></span>${stepper(name, value, { step, label, max, min })}</div>`;
}

export function daySheet(snap, house, f, date) {
  const c = snap.c; const old = snap.data.days.find((d) => d.houseId === house.id && d.date === date) || null;
  const prior = daysFor(c, f.id).filter((d) => d.date < date && !d.partial); const y = prior[prior.length - 1] || null;
  const alive = aliveAt(c, f, date); const std = standardFor(f.breedStdId); const wk = weekOfAge(f, date); const band = layBand(std, wk);
  const ser = series(c, f).filter((d) => d.date < date); const prevWater = ser.map((d) => d.litres).filter((x) => x != null).slice(-3);
  const imp = (snap.data.imports || []).flatMap((i) => (i.rows || []).filter((r) => r.date === date && (r.houseId || i.houseId) === house.id)).pop() || null;
  const fr = isFreeRange(house); const ai = aiState(c, date);
  const wd = eggWithheld(c, house.id, date); const cb = classB(snap.data.salmSamples.filter((x) => x.flockId === f.id), f, date);
  const v0 = old || {};
  let deaths = (v0.deaths || []).map((x) => ({ ...x }));
  const feedKind = v0.feed?.kind || (imp?.feedKg != null ? "bin" : "skip");
  const ctl = (k) => (imp && imp[k] != null && v0[k] == null ? html`<small class="ly-ctl">from controller</small>` : "");
  const yv = (k, unit = "") => (y && y[k] != null && y[k] !== "" ? html`<small>yesterday ${n0(y[k])}${unit}</small>` : "");
  const keptOpts = [["Housing order", "Housing order"], ["Weather", "Weather"], ["Other", "Other"]];
  const body = el(html`<form novalidate class="ly-sheet">
    <p class="ly-sub">${std.breed} · week ${wk} · ${n0(alive)} hens this morning</p>
    ${wd ? warn(`Eggs withheld — ${wd.product || "treatment"}: eggs from ${house.name} can't be sold until ${dm(wd.until)}. They go to "Not for sale" in Production.`) : ""}
    ${cb.on ? warn(`${house.name}: Salmonella positive. Eggs are Class B — do not pack as Class A.`) : ""}
    <h2 class="group-label"><span>Eggs</span></h2>
    <div class="form-group">
      <div class="field ly-big"><label>Collected<small>${y ? `yesterday ${n0(y.eggsTotal)}` : "eggs today, every grade"}</small></label><input name="eggs" inputmode="numeric" value="${v0.eggsTotal || ""}" aria-label="Eggs collected" placeholder="0"><span class="ly-unit" data-unit>eggs</span></div>
      ${chipsField("unit", "Count in", [["eggs", "Eggs"], ["trays", "Trays of 30"]], "eggs")}
      ${stepRow("seconds", "Seconds", v0.seconds ?? (y ? y.seconds || 0 : 0), { step: 10, sub: "cracked or dirty · steps of 10" })}
      ${stepRow("floor", "Floor eggs", v0.floor ?? (y ? y.floor || 0 : 0), { sub: y ? `yesterday ${n0(y.floor || 0)}` : "" })}
    </div>
    ${snap.s.gradeOnFarm ? html`<h2 class="group-label"><span>Graded on farm</span></h2><div class="form-group">${["XL", "L", "M", "S"].map((g) => numField(`g${g}`, g, v0.graded?.[g] ?? "", { step: 1 }))}</div>` : ""}
    <h2 class="group-label"><span>Birds</span></h2>
    <div class="form-group">
      ${stepRow("dead", "Dead", v0.dead || 0, { sub: "tap Causes to say why" })}
      ${stepRow("culled", "Culled", v0.culled || 0)}
      <button type="button" class="field ly-causes" data-causes><span class="label">Causes</span><span class="ly-cv" data-cv></span>${raw(icon("chevron"))}</button>
    </div>
    <h2 class="group-label"><span>House</span></h2>
    <div class="form-group">
      <div class="field ly-big"><label>Water meter<small>${y?.waterMeter != null ? `yesterday ${n0(y.waterMeter)} L` : "the meter reading, in litres"}</small>${ctl("waterMeter")}</label><input name="waterMeter" inputmode="numeric" value="${v0.waterMeter ?? imp?.waterMeter ?? ""}" aria-label="Water meter" placeholder="${y?.waterMeter != null ? n0(y.waterMeter) : "0"}"><span class="ly-unit">L</span></div>
      ${chipsField("feedKind", "Feed", [["delivery", "Delivery"], ["bin", "Bin reading"], ["skip", "Skip"]], feedKind)}
      <div data-feedkg ${raw(feedKind === "skip" ? "hidden" : "")}>${numField("feedKg", "Kilograms", v0.feed?.kg ?? imp?.feedKg ?? "", { step: 10, unit: "kg" })}</div>
      ${stepRow("tMin", "Temp min", v0.tMin ?? imp?.tMin ?? y?.tMin ?? 18, { sub: "°C", max: 45, min: -10 })}
      ${stepRow("tMax", "Temp max", v0.tMax ?? imp?.tMax ?? y?.tMax ?? 24, { sub: "°C", max: 45, min: -10 })}
      ${fr ? html`<div class="field ly-pop"><label>Pop-holes<small>proof of range access</small></label><span class="ly-times"><input type="time" name="popOpen" value="${v0.popOpen || (ai.on ? "" : "")}" aria-label="Pop-holes opened"><span>–</span><input type="time" name="popClose" value="${v0.popClose || ""}" aria-label="Pop-holes closed"></span></div>
        ${chipsField("keptIn", "Kept in", keptOpts, v0.keptIn || (ai.on ? "Housing order" : null), { hint: ai.on ? `Housing order · day ${ai.daysHoused} housed` : "Only if the birds stayed in today" })}` : ""}
    </div>
    <h2 class="group-label"><span>Checks</span></h2>
    <div class="form-group">${chipsField("checks", "", CHECKS, v0.checks || CHECKS, { multi: true })}
      ${textField({ name: "notes", label: "Notes", value: v0.notes || "", optional: true })}</div>
  </form>`);
  const eggs = (v) => { const n = +String(v.eggs || "").replace(/[^\d]/g, ""); if (!v.eggs && v.eggs !== 0) return null; return v.unit === "trays" ? n * 30 : n; };
  const bar = el(html`<div class="ly-sumbar" aria-live="polite" data-sum></div>`);
  const es = entrySheet({ title: `${house.name} · ${dm(date)}`, body, label: `Save ${house.name}`, footerExtra: bar,
    missing: (v) => (eggs(v) == null ? "Add the eggs collected" : null),
    save(v, sh) {
      const graded = snap.s.gradeOnFarm ? Object.fromEntries(["XL", "L", "M", "S"].map((g) => [g, +v[`g${g}`] || 0])) : undefined;
      const out = saveDay(snap, house, f, date, { eggsTotal: eggs(v), seconds: v.seconds, floor: v.floor, dead: v.dead, culled: v.culled, deaths, waterMeter: v.waterMeter, feedKind: v.feedKind === "skip" ? null : v.feedKind, feedKg: v.feedKg, tMin: v.tMin, tMax: v.tMax, popOpen: v.popOpen, popClose: v.popClose, keptIn: v.keptIn, checks: v.checks, notes: v.notes, graded, source: imp ? "controller" : "manual" }, old);
      sh.close(true, { force: true });
      toast(`${house.name} saved${out.fig.henDay != null ? ` · lay ${n1(out.fig.henDay)}%` : ""}`);
    } });
  const paintCauses = () => {
    const given = deaths.reduce((t, x) => t + (+x.n || 0), 0); const v = es.form.values(); const total = (+v.dead || 0) + (+v.culled || 0);
    body.querySelector("[data-cv]").textContent = given ? deaths.filter((x) => +x.n).map((x) => `${x.cause.replace(" (unknown)", "")} ${x.n}`).join(" · ") + (total > given ? ` · ${total - given} not given` : "") : total ? `${total} not given a cause` : "None";
  };
  const paint = () => {
    const v = es.form.values(); const e = eggs(v);
    body.querySelector("[data-unit]").textContent = v.unit === "trays" ? "trays" : "eggs";
    body.querySelector("[data-feedkg]").hidden = v.feedKind === "skip" || !v.feedKind;
    const fig = sheetFigures(snap.s, { eggsTotal: e || 0, seconds: v.seconds, floor: v.floor, waterMeter: v.waterMeter, alive, prev: y ? { waterMeter: y.waterMeter, gap: Math.max(1, Math.round((new Date(date) - new Date(y.date)) / 86400000)) } : null, prevWater });
    const vs = vsBand(fig.henDay, band);
    const water = fig.waterPer1000 == null ? "" : html`<br>Water ${n0(fig.waterPer1000)} L per 1,000 birds${fig.waterChange == null ? "" : Math.abs(fig.waterChange) >= +snap.s.waterAlertPct ? html` <span class="warn">· ${fig.waterChange > 0 ? "+" : "−"}${Math.abs(Math.round(fig.waterChange))}% ⚠</span>` : ` · ${fig.waterChange > 0 ? "+" : fig.waterChange < 0 ? "−" : ""}${Math.abs(Math.round(fig.waterChange))}%`}`;
    bar.replaceChildren(el(html`<div>${fig.henDay == null ? html`Type the eggs collected to see lay %` : html`Today: lay <b>${n1(fig.henDay)}%</b> ${!band || band[1] === 0 ? "" : vs?.pos === "below" ? html`<span class="warn">· ${n1(vs.gap)} below standard</span>` : vs?.pos === "above" ? "· above standard" : "· in standard ✓"}<br>Seconds ${n1(fig.secondsPct)}%`}${water}</div>`));
    paintCauses();
  };
  es.form.onChange(paint); paint(); es.rebase();
  body.querySelector("[data-causes]").onclick = async () => {
    const r = await causesSheet(deaths, { dead: +es.form.values().dead || 0, culled: +es.form.values().culled || 0 });
    if (!r) return; deaths = r;
    const d = r.filter((x) => !isCull(x.cause)).reduce((t, x) => t + +x.n, 0); const cu = r.filter((x) => isCull(x.cause)).reduce((t, x) => t + +x.n, 0);
    const di = body.querySelector("[name=dead]"), ci = body.querySelector("[name=culled]");
    if (d > +di.value) di.value = d; if (cu > +ci.value) ci.value = cu;
    di.dispatchEvent(new Event("input", { bubbles: true })); paint();
  };
  return es.sheet.done;
}

/** Death cause chips with counts (§4.2). Smothered asks where/time/weather; Predator asks fence. */
export function causesSheet(deaths, { dead = 0, culled = 0 } = {}) {
  const get = (c) => deaths.find((x) => x.cause === c) || {};
  const sm = get("Smothered"); const pr = get("Predator");
  const body = el(html`<form novalidate>
    <p class="ly-sub">${dead} dead and ${culled} culled on the sheet. Counts here add to the totals if they're higher.</p>
    <div class="form-group">${DEATH_CAUSES.map((c) => stepRow(`c:${c}`, c, get(c).n || 0))}</div>
    <div data-sm ${raw(sm.n ? "" : "hidden")}><h2 class="group-label"><span>Smothering</span></h2><div class="form-group">
      ${chipsField("where", "Where in the house", WHERE, sm.where || null)}
      <div class="field"><label>Time found</label><input type="time" name="smTime" value="${sm.time || nowHM()}"></div>
      ${chipsField("weather", "Weather", ["Calm", "Wind", "Storm", "Hot", "Cold snap", "Thunder"], sm.weather || null)}</div></div>
    <div data-pr ${raw(pr.n ? "" : "hidden")}><div class="form-group">${checkRow("fence", "Fence checked", !!pr.fenceChecked, "Walk the range fence and close any gap")}</div></div>
  </form>`);
  const btn = el(html`<button type="button" class="btn">Done</button>`);
  const f = wireForm(body);
  f.onChange(() => { const v = f.values(); body.querySelector("[data-sm]").hidden = !+v["c:Smothered"]; body.querySelector("[data-pr]").hidden = !+v["c:Predator"]; });
  const sh = openSheet({ title: "Causes of death", body, footer: btn });
  btn.onclick = () => {
    const v = f.values();
    const out = DEATH_CAUSES.map((c) => ({ cause: c, n: +v[`c:${c}`] || 0 })).filter((x) => x.n > 0).map((x) => x.cause === "Smothered" ? { ...x, where: v.where || undefined, time: v.smTime || undefined, weather: v.weather || undefined } : x.cause === "Predator" ? { ...x, fenceChecked: !!v.fence } : x)
      .map((x) => Object.fromEntries(Object.entries(x).filter(([, val]) => val !== undefined)));
    sh.close(out, { force: true });
  };
  return sh.done.then((r) => (Array.isArray(r) ? r : null));
}
