// Dairy → More → Dairy settings (design/12 §12, §18). Everything a processor, vet or region
// decides is a setting with an editable default and its source shown (design/12 §17).
// Saved to meta "settings" (owner/manager). The milk price profile is money, so it is saved to
// the finance doc PRICE_PROFILE_ID and only shown to roles that can read finance.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { toast } from "../../../ui/toast.js";
import { textField, checkRow, wireForm } from "../../../ui/form.js";
import { canRead, canWrite, canWriteMeta } from "../../../core/policy.js";
import { largeTitle, backLink, groupLabel } from "../../../screens/common.js";
import { loadDairy } from "../data.js";
import { setMeta } from "../actions.js";
import { addRecord, updateRecord } from "../../../services/records.js";
import { chipsField } from "../flows/common.js";
import { SOURCES, PRICE_PROFILE_ID } from "../model/settings.js";
import { registerRules } from "../model/content.js";

const num = (v) => (v === "" || v == null || Number.isNaN(+v) ? null : +v);

export default async function settings(ctx) {
  const snap = await loadDairy(ctx.ledger); const s = snap.s; const ms = snap.meta.settings || {};
  const can = canWriteMeta(snap.role, "settings"); const money = canRead(snap.role, "finance"); const p = s.price;
  const n = (name, label, value, opt = true) => textField({ name, label, value: value == null ? "" : String(value), inputmode: "decimal", optional: opt });
  const R = registerRules(s.registerMode, s.region);
  const body = el(html`<div class="dairy-page">${backLink(`#/l/${snap.lid}/more`, "More")}${largeTitle("Dairy settings", can ? "Defaults are guides — change them to suit your herd" : "Only the owner or a manager can change these")}
    <div class="list" style="margin-bottom:8px"><a class="row" href="#/l/${snap.lid}/imports"><span class="tile">${raw(icon("download"))}</span><span class="main"><span class="primary">Imports</span><span class="secondary">Milk recording and robot files (CSV)</span></span><span class="chev">${raw(icon("chevron"))}</span></a></div>
    <form novalidate data-form ${raw(can ? "" : "inert")}>
    <div class="section">${groupLabel("Herd and paperwork")}<div class="form-group">${textField({ name: "herdNo", label: "Herd number", value: s.herdNo || "", inputmode: "numeric", optional: true })}
      ${chipsField("registerMode", "My herd register is", [["onfarm", "On-farm (this app)"], ["nifais", "NIFAIS Online"]], s.registerMode)}
      ${textField({ name: "tbLastDate", label: "Last TB herd test", type: "date", value: s.tbLastDate || "", optional: true })}${n("tbIntervalMonths", "TB test every (months)", s.tbIntervalMonths)}
      ${checkRow("bvdAffected", "Herd affected by BVD (moves restricted)", !!ms.bvdAffected)}${textField({ name: "johnes", label: "Johne's status / declaration note", value: ms.johnes || "", optional: true })}</div>
      <p class="source" data-reg>${s.registerMode === "nifais" ? `Births on NIFAIS within ${R.birthNifaisDays} days, moves on the day, deaths within ${R.deathDays} days.` : `First tag within ${R.tagHours} hours, register within ${R.birthRegisterDays} days, NIFAIS within ${R.birthNifaisDays} days.`} Keep records ${R.retentionYears} years.</p></div>
    <div class="section">${groupLabel("Milking and the tank")}<div class="form-group">${chipsField("milkingSystem", "Milking system", ["Parlour", "Robot"], s.milkingSystem)}
      ${textField({ name: "am", label: "Morning milking", type: "time", value: s.milkingTimes[0] || "06:00" })}${textField({ name: "pm", label: "Afternoon milking", type: "time", value: s.milkingTimes[1] || "16:30" })}
      ${chipsField("collection", "Tanker collects", [["daily", "Every day (≤ 8 °C)"], ["alternate", "Every other day (≤ 6 °C)"]], s.collection)}${checkRow("tankLogOn", "Remind me to log the tank after each milking", s.tankLogOn !== false)}</div>
      <p class="source">${SOURCES.tank}</p></div>
    <div class="section">${groupLabel("Breeding")}<div class="form-group">${chipsField("calvingPattern", "Calving pattern", ["Spring block", "Autumn block", "All year"], s.calvingPattern)}
      ${textField({ name: "breedingStart", label: "Breeding season starts (block herds)", type: "date", value: s.breedingStart || "", optional: true })}${n("breedingWeeks", "Breeding season (weeks)", s.breedingWeeks)}${textField({ name: "dryOffStart", label: "Dry-off begins (block herds)", type: "date", value: s.dryOffStart || "", optional: true })}
      ${n("vwp", "Voluntary waiting period (days)", s.vwp)}${n("dryPeriod", "Dry period (days)", s.dryPeriod)}${n("pdFrom", "PD from (days after serve)", s.pdFrom)}${n("pdTo", "PD to (days after serve)", s.pdTo)}${n("heiferServeMonths", "Serve heifers from (months)", s.heiferServeMonths)}</div>
      <p class="source">${SOURCES.vwp} · ${SOURCES.dryPeriod} · ${SOURCES.gestation}</p></div>
    <div class="section">${groupLabel("Milk quality bands")}<div class="form-group">${textField({ name: "processor", label: "Milk buyer", value: s.processor || "", optional: true, placeholder: "Dale Farm, Lakeland, Strathroy…" })}${n("sccWarn", "Warn when SCC is over (thousands)", s.bands.sccWarn)}${n("tbcWarn", "Warn when TBC is over (thousands)", s.bands.tbcWarn)}</div>
      <p class="source">${SOURCES.quality} · ${SOURCES.bands}</p></div>
    ${money ? html`<div class="section">${groupLabel("Milk price profile", "money roles only")}<div class="form-group">${n("basePpl", "Base price (p per litre)", p.basePpl)}${n("baseFat", "Base butterfat %", p.baseFat)}${n("baseProtein", "Base protein %", p.baseProtein)}
      ${n("fatPer01", "Pence per 0.1% fat over/under", p.fatPer01)}${n("proteinPer01", "Pence per 0.1% protein over/under", p.proteinPer01)}${n("sccOver", "SCC penalty band: over (thousands)", p.sccBands?.[0]?.over)}${n("sccPpl", "SCC penalty (p per litre, − for a cut)", p.sccBands?.[0]?.ppl)}
      ${n("tbcOver", "TBC penalty band: over (thousands)", p.tbcBands?.[0]?.over)}${n("tbcPpl", "TBC penalty (p per litre, − for a cut)", p.tbcBands?.[0]?.ppl)}${n("deductPpl", "Levies and deductions (p per litre)", p.deductPpl)}</div>
      <p class="source">From your processor's schedule — schedules differ and are not public, so nothing is built in.</p></div>` : ""}
    <div class="section">${groupLabel("Calves and heifers")}<div class="form-group">${n("lPerFeed", "Milk per feed (litres)", s.calfPlan.lPerFeed)}${n("feedsPerDay", "Feeds a day", s.calfPlan.feedsPerDay)}${n("gPerL", "Powder (g per litre)", s.calfPlan.gPerL)}${n("matureKg", "Mature cow weight (kg)", s.matureKg)}</div>
      <p class="source">${SOURCES.growth}</p></div>
    <div class="section">${groupLabel("Health")}<div class="form-group">${n("mobilityWeeks", "Mobility score every (weeks)", s.mobilityWeeks)}</div><p class="source">AHDB: every 4–8 weeks. Cull ranking weights are on Tools → Cull ranking.</p></div>
    </form>
    ${can ? html`<div class="section"><button type="button" class="btn" data-save>${raw(icon("check"))}Save settings</button></div>` : ""}</div>`);
  const form = body.querySelector("[data-form]"); const f = wireForm(form);
  f.onChange(() => { const v = f.values(); const r = registerRules(v.registerMode, s.region); body.querySelector("[data-reg]").textContent = v.registerMode === "nifais" ? `Births on NIFAIS within ${r.birthNifaisDays} days, moves on the day, deaths within ${r.deathDays} days. Keep records ${r.retentionYears} years.` : `First tag within ${r.tagHours} hours, register within ${r.birthRegisterDays} days, NIFAIS within ${r.birthNifaisDays} days. Keep records ${r.retentionYears} years.`; });
  const save = body.querySelector("[data-save]");
  if (save) save.onclick = () => {
    const v = f.values();
    setMeta(snap.lid, "settings", {
      herdNo: v.herdNo, registerMode: v.registerMode || "onfarm", tbLastDate: v.tbLastDate, tbIntervalMonths: num(v.tbIntervalMonths) ?? 12, bvdAffected: !!v.bvdAffected, johnes: v.johnes,
      milkingSystem: v.milkingSystem || "Parlour", milkingTimes: [v.am || "06:00", v.pm || "16:30"], collection: v.collection || "daily", tankLogOn: !!v.tankLogOn,
      calvingPattern: v.calvingPattern || "All year", breedingStart: v.breedingStart, breedingWeeks: num(v.breedingWeeks), dryOffStart: v.dryOffStart,
      vwp: num(v.vwp), dryPeriod: num(v.dryPeriod), pdFrom: num(v.pdFrom), pdTo: num(v.pdTo), heiferServeMonths: num(v.heiferServeMonths),
      processor: v.processor, bands: { ...s.bands, sccWarn: num(v.sccWarn) ?? 200, tbcWarn: num(v.tbcWarn) ?? 30 },
      calfPlan: { ...s.calfPlan, lPerFeed: num(v.lPerFeed) ?? 3, feedsPerDay: num(v.feedsPerDay) ?? 2, gPerL: num(v.gPerL) ?? 150 }, matureKg: num(v.matureKg), mobilityWeeks: num(v.mobilityWeeks),
    });
    if (money && canWrite(snap.role, "finance")) {
      const profile = { basePpl: num(v.basePpl), baseFat: num(v.baseFat) ?? 4, baseProtein: num(v.baseProtein) ?? 3.3, fatPer01: num(v.fatPer01) ?? 0, proteinPer01: num(v.proteinPer01) ?? 0,
        sccBands: num(v.sccOver) != null ? [{ over: num(v.sccOver), ppl: num(v.sccPpl) ?? 0 }] : [], tbcBands: num(v.tbcOver) != null ? [{ over: num(v.tbcOver), ppl: num(v.tbcPpl) ?? 0 }] : [], deductPpl: num(v.deductPpl) ?? 0 };
      const doc = { kind: "prices", category: "Milk price profile", date: snap.today, note: "Milk price profile (not a money entry)", profile };
      const old = snap.data.finance.find((r) => r.id === PRICE_PROFILE_ID);
      if (old) updateRecord(snap.lid, "finance", old, doc, { history: false }); else addRecord(snap.lid, "finance", doc, PRICE_PROFILE_ID);
    }
    toast("Dairy settings saved"); history.back();
  };
  return { el: body, title: "Dairy settings", tab: "more" };
}
