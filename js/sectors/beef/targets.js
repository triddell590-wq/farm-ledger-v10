// Targets and scheme rules (design/10 §15, §22): yearly scheme tables (shown, region pack),
// processor profile, gestation, DLWG targets, weigh interval, fodder and LU rates, calving
// season, herd-register mode (on-farm / NIFAIS Online), pedigree, calf checks, tag book,
// TB date, housing, restrictions. Owner and manager edit; everyone else reads.
import { nifaisOnlineText, usesNifaisRegister, bvdFemaleRule } from "./model/region.js";
import { ON_FARM } from "./model/rules.js";
import { html } from "../../core/html.js";
import { el } from "../../ui/dom.js";
import { textField, selectField, checkRow, radioGroup, wireForm } from "../../ui/form.js";
import { toast } from "../../ui/toast.js";
import { canWriteMeta } from "../../core/policy.js";
import { backLink, largeTitle, groupLabel } from "../../screens/common.js";
import { loadBeef } from "./data.js";
import { setMeta } from "./actions.js";
import { SC_INTERVAL, SC_HEIFER_MAX_MONTHS, BCRS_MONTHS, SOURCES, schemeYearLabel } from "./model/rules.js";
import { CLASS_NAMES } from "./model/animals.js";
import { parseTag } from "./model/tags.js";

/** Herd-register choice (design/10 §22). NIFAIS Online figures come from the region content rule. */
export function registerModes(s) {
  const farm = { value: "farm", label: "On-farm (this app)", help: `Births: register ${ON_FARM.registerBirth} days, NIFAIS ${ON_FARM.nifaisBirth} days. Moves: register 36 hours, NIFAIS ${ON_FARM.nifaisMove} days. Deaths ${ON_FARM.nifaisDeath} days.` };
  const t = nifaisOnlineText(s);
  return t ? [farm, { value: "nifais", label: "NIFAIS Online", help: `On NIFAIS: ${t}.` }] : [farm];
}

/** Read-only row (design/10 §23): the BVD breeding-female rule as the content says it today. */
function bvdRuleRow(s, today) {
  const r = bvdFemaleRule(s, today); if (!r) return "";
  const state = r.inForce ? `In force${r.fromText ? ` from ${r.fromText}` : ""}` : `${r.status === "delayed" ? "Delayed" : "Announced"}${r.fromText ? ` for ${r.fromText}` : ""} — not in force yet`;
  return html`<div class="card pad" style="margin-top:12px" data-bvd-rule><p style="margin:0"><b>BVD breeding-female rule</b> · ${state}</p><p class="hint" style="margin:4px 0 0">Females ${r.minAgeMonths} months and over in a BVD-affected herd can't move for breeding for ${r.restrictWeeks} weeks.</p><p class="source">${r.source} · checked ${r.checkedOn}</p></div>`;
}

export default async function targets(ctx) {
  const snap = await loadBeef(ctx.ledger); const s = snap.s; const can = canWriteMeta(snap.role, "settings"); const ms = snap.meta.settings || {};
  const n = (name, label, value, opt = true) => textField({ name, label, value: value ?? "", inputmode: "decimal", optional: opt });
  const body = el(html`<div class="beef-page">${backLink(`#/l/${snap.lid}/more/settings`, "Ledger settings")}${largeTitle("Targets and scheme rules", can ? "Change anything that's different on your farm" : "Only the owner or a manager can change these")}
  <form novalidate>
    ${groupLabel("Paperwork")}<p class="form-label">My herd register is</p>${radioGroup("registerMode", registerModes(s), usesNifaisRegister(s) ? "nifais" : "farm")}
    <p class="hint">It changes your reminder deadlines and the line printed on the herd register. Keep records 10 years either way.</p>
    <div class="form-group" style="margin-top:12px">${textField({ name: "nextTag", label: "Next tag in the tag book", value: s.nextTag || "", placeholder: "XI 9 012345 0023 1" })}${textField({ name: "tbNextDue", label: "Next TB test (if the vet set one)", type: "date", value: s.tbNextDue || "" })}</div>
    <div id="status"></div>${groupLabel("Herd status")}<div class="form-group">${selectField({ name: "tbStatus", label: "TB", value: ms.tbStatus || "", options: [{ value: "", label: "Not restricted (OTF)" }, { value: "restricted", label: "Restricted" }] })}${checkRow("bvdRestricted", "Herd restricted for BVD", !!ms.bvdRestricted)}${textField({ name: "johnes", label: "Johne's", value: ms.johnes || "", placeholder: "e.g. Voluntary · last screen 2025", optional: true })}</div>
    ${bvdRuleRow(s, snap.today)}
    ${groupLabel("Season")}<div class="form-group">${selectField({ name: "calvingSeason", label: "Calving season", value: s.calvingSeason, options: ["Spring", "Autumn", "All year"].map((v) => ({ value: v, label: v })) })}${textField({ name: "housingDate", label: "Housing planned", type: "date", value: ms.housingDate || "" })}${n("shedSpaces", "Shed spaces", ms.shedSpaces)}</div>
    ${groupLabel("Processor spec")}<div class="form-group">${textField({ name: "pname", label: "Processor", value: s.processor.name })}${n("maxAgeMonths", "Max age (months)", s.processor.maxAgeMonths, false)}${n("minCarcase", "Min carcase (kg)", s.processor.minCarcase)}${n("maxCarcase", "Max carcase (kg)", s.processor.maxCarcase)}${n("maxMoves", "Max farm moves", s.processor.maxMoves)}${n("koSteer", "Kill-out % steers", s.processor.ko.Steer)}${n("koHeifer", "Kill-out % heifers", s.processor.ko.Heifer)}${n("koBull", "Kill-out % young bulls", s.processor.ko.Bull)}${n("targetCarcaseKg", "Target carcase (kg)", s.targetCarcaseKg)}</div>
    ${groupLabel("Scheme rules (NI)")}<div class="card pad scheme-table"><p style="margin:0"><b>Suckler Cow Scheme</b> · £100 a calving · calving interval at least 271 days</p>
      <p class="hint" style="margin:4px 0 0">Interval limit: ${Object.entries(SC_INTERVAL).map(([y, d]) => `${schemeYearLabel(+y)} ${d} d`).join(" · ")}<br>Heifer first calving: 21 months to ${Object.entries(SC_HEIFER_MAX_MONTHS).map(([y, m]) => `${schemeYearLabel(+y)} ${m}`).join(" · ")} months</p><p class="source">${SOURCES.sc}</p>
      <p style="margin:12px 0 0"><b>BCRS</b> · £75 · 60 of the last 100 days with you</p><p class="hint" style="margin:4px 0 0">Max age at slaughter: ${Object.entries(BCRS_MONTHS).map(([y, m]) => `${y} ${m}`).join(" · ")}${"+"} months</p><p class="source">${SOURCES.bcrs}</p></div>
    <div class="form-group" style="margin-top:12px">${n("bcrsMonths", "Override BCRS months (leave empty)", s.bcrsMonths)}</div>
    ${groupLabel("Gestation (days) by sire breed")}<div class="form-group">${Object.entries(s.gestation).map(([k, v]) => n(`g_${k}`, k === "other" ? "Other breeds" : k, v, false))}</div><p class="source">${SOURCES.gestation}</p>
    ${groupLabel("Daily gain targets (kg/day)")}<div class="form-group">${Object.entries(s.dlwgTarget).map(([k, v]) => n(`d_${k}`, CLASS_NAMES[k] || k, v, false))}${n("weighEveryDays", "Weigh every (days)", s.weighEveryDays, false)}${n("heiferServeKg", "Heifer weight to serve (kg)", s.heiferServeKg, false)}</div><p class="source">${SOURCES.dlwg}</p>
    <div id="fodder"></div>${groupLabel("Silage eaten (t a head a month)")}<div class="form-group">${Object.entries(s.fodderRates).map(([k, v]) => n(`f_${k}`, CLASS_NAMES[k] || k, v, false))}</div><p class="source">${SOURCES.fodder}</p>
    ${groupLabel("Livestock units (for splitting costs)")}<div class="form-group">${Object.entries(s.luRates).map(([k, v]) => n(`l_${k}`, CLASS_NAMES[k] || k, v, false))}</div><p class="source">${SOURCES.lu}</p>
    ${groupLabel("Extras")}<div class="form-group">${checkRow("pedigree", "Pedigree herd", !!s.pedigree, "Herd book, EBVs, DNA, society registration and sale sheets.")}${textField({ name: "society", label: "Breed society", value: s.society || "", optional: true, placeholder: "e.g. Charolais Cattle Society" })}${checkRow("calfChecks", "Log twice-daily calf checks", !!s.calfChecks)}${checkRow("navelPrompt", "Ask about navel treatment after a calving", !!s.navelPrompt)}</div>
  </form>${can ? html`<div class="sticky-foot"><button type="button" class="btn" data-save>Save targets</button></div>` : ""}</div>`);
  if (!can) body.querySelectorAll("input,select,button.radio-row,button.check-row").forEach((i) => (i.disabled = true));
  const f = wireForm(body.querySelector("form"));
  body.querySelector("[data-save]")?.addEventListener("click", () => {
    const v = f.values(); const pick = (p) => Object.fromEntries(Object.entries(v).filter(([k]) => k.startsWith(p)).map(([k, x]) => [k.slice(2), +x]));
    if (v.nextTag && parseTag(v.nextTag) && !parseTag(v.nextTag).valid) { toast("Check the next tag's last digit"); return; }
    setMeta(snap.lid, "settings", {
      registerMode: v.registerMode === "nifais" ? "nifais" : "farm", nextTag: v.nextTag, tbNextDue: v.tbNextDue, tbStatus: v.tbStatus, bvdRestricted: !!v.bvdRestricted, johnes: v.johnes,
      calvingSeason: v.calvingSeason, housingDate: v.housingDate, shedSpaces: +v.shedSpaces || null,
      processor: { name: v.pname, maxAgeMonths: +v.maxAgeMonths || 30, minCarcase: +v.minCarcase || null, maxCarcase: +v.maxCarcase || null, maxMoves: +v.maxMoves || 4, ko: { Steer: +v.koSteer || 55, Heifer: +v.koHeifer || 56, Bull: +v.koBull || 57, Cow: s.processor.ko.Cow } },
      targetCarcaseKg: +v.targetCarcaseKg || 360, bcrsMonths: +v.bcrsMonths || null, gestation: pick("g_"), dlwgTarget: pick("d_"), fodderRates: pick("f_"), luRates: pick("l_"),
      weighEveryDays: +v.weighEveryDays || 42, heiferServeKg: +v.heiferServeKg || 400, pedigree: !!v.pedigree, society: v.society, calfChecks: !!v.calfChecks, navelPrompt: !!v.navelPrompt,
    });
    toast("Targets saved");
  });
  return { el: body, title: "Targets", depth: 1, tab: "more" };
}
