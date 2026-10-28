// Broiler settings and targets (design/15 §15). Owner and manager edit (meta/settings); others
// read. Defaults that are guesses or guidance say so beside the setting (model/settings.js SOURCES).
import { html } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { toast } from "../../../ui/toast.js";
import { wireForm, checkRow, chipGroup } from "../../../ui/form.js";
import { canWriteMeta } from "../../../core/policy.js";
import { largeTitle, backLink } from "../../../screens/common.js";
import { loadBroilers } from "../data.js";
import { ensureCss } from "../ui.js";
import { saveSettings } from "../actions.js";
import { SOURCES } from "../model/settings.js";
import { BREED_STANDARDS } from "../model/content.js";
import { opt } from "../flows/common.js";

const F = (name, label, value, { help = "", type = "number", step = "any" } = {}) => html`<div class="field"><label>${label}${help ? html`<br><small class="ink-2" style="font-weight:500">${help}</small>` : ""}</label><input name="${name}" type="${type}" ${type === "number" ? html`inputmode="decimal" step="${step}"` : ""} value="${value ?? ""}"></div>`;
const chips = (name, label, options, value) => html`<div class="field chips-field"><span class="label">${label}</span>${chipGroup(name, opt(options), value == null ? [] : [value], { multi: false })}</div>`;

export default async function settings(ctx) {
  ensureCss();
  const snap = await loadBroilers(ctx.ledger); const s = snap.s; const can = canWriteMeta(snap.role, "settings");
  const body = el(html`<div class="br-page push">${backLink(`#/l/${snap.lid}/more`, "More")}${largeTitle("Broiler settings and targets", can ? "Changes apply straight away" : "Only the owner or a manager can change these")}
    <form novalidate ${can ? "" : "inert"}>
    <p class="form-label">Birds and crop plan</p><div class="form-group">
      ${chips("breedStdId", "Hybrid and breed objective", BREED_STANDARDS.map((b) => [b.id, b.hybrid]), s.breedStdId)}
      <p class="br-note" style="margin:0 16px 8px">${BREED_STANDARDS.find((b) => b.id === s.breedStdId)?.edition || ""}</p>
      ${F("plannedThinDay", "Thin on day", s.plannedThinDay, { step: 1 })}${F("plannedThinBirdsPct", "Birds taken at the thin (%)", s.plannedThinBirdsPct)}${F("plannedClearDay", "Clear-out on day", s.plannedClearDay, { step: 1 })}
      ${F("targetDensity", "Planned density for new crops (kg/m²)", s.targetDensity)}${F("farmLimitKgM2", "Farm density limit (kg/m²)", s.farmLimitKgM2, { help: SOURCES.farmLimitKgM2 })}
      ${F("weighDays", "Sample weigh days", (s.weighDays || []).join(", "), { type: "text", help: "Comma separated, e.g. 7, 14, 21, 28, 35" })}
      ${checkRow("organic", "Organic", !!s.organic, "Salmonella window becomes 6 weeks")}${checkRow("longLife", "Slaughter at 82 days or older", !!s.longLife, "Salmonella window becomes 6 weeks")}
      ${checkRow("freeRange", "Free-range", !!s.freeRange, "Log range access (at least 8 hours a day)")}</div>
    <p class="form-label">Checks and alerts</p><div class="form-group">
      ${F("ck_am", "AM check by", s.checkTimes.am, { type: "time" })}${F("ck_pm", "PM check by", s.checkTimes.pm, { type: "time" })}${F("lateAfterHours", "Late after (hours)", s.lateAfterHours)}
      ${F("mortalitySpikePct", "Mortality in 24 hours to investigate (%)", s.mortalitySpikePct, { help: SOURCES.mortalitySpikePct })}
      ${F("mortalityMultiple", "Early warning: deaths × the 3-day average", s.mortalityMultiple, { help: SOURCES.mortalityMultiple })}
      ${F("cropTolerancePct", "Crop mortality tolerance (%)", s.cropTolerancePct)}${F("mort7TargetPct", "7-day mortality target (%)", s.mort7TargetPct)}
      ${F("weightAlertPct", "Weight under the objective by (%)", s.weightAlertPct, { help: SOURCES.weightAlertPct })}${F("weightAlertDays", "…for this many days", s.weightAlertDays, { step: 1 })}
      ${F("waterAlertPct", "Water change vs 3-day average (%)", s.waterAlertPct, { help: SOURCES.waterAlertPct })}
      ${chips("waterMeterSlot", "Read the water meter on", [["am", "AM check"], ["pm", "PM check"], ["both", "Both"]], s.waterMeterSlot)}
      ${F("litterScoreHigh", "Wet litter from score", s.litterScoreHigh, { step: 1 })}</div>
    <p class="form-label">Brooding</p><div class="form-group">
      ${F("cropFill8h", "Crop-fill at 8 hours (%)", s.cropFill8h, { help: SOURCES.cropFill })}${F("cropFill24h", "Crop-fill at 24 hours (%)", s.cropFill24h)}</div>
    <p class="form-label">Catching and paperwork</p><div class="form-group">
      ${F("feedOffHours", "Feed off before catching (hours)", s.feedOffHours, { help: SOURCES.feedOffHours })}${F("arrivalHoursAfterCatch", "Catch to the plant (hours)", s.arrivalHoursAfterCatch, { help: "FCI is due 24 hours before arrival" })}
      ${F("crewName", "Catching crew", s.crewName, { type: "text" })}${F("crewGlaa", "Crew GLAA licence no.", s.crewGlaa, { type: "text" })}
      ${F("registerNo", "Bird Register number", s.registerNo, { type: "text" })}${F("establishmentNo", "Establishment number (if one for all houses)", s.establishmentNo, { type: "text" })}${F("holdingNo", "Holding number", s.holdingNo, { type: "text" })}
      ${F("labs", "Salmonella labs", (s.labs || []).join(", "), { type: "text", help: "Comma separated. Check the lab is DAERA-approved." })}
      ${checkRow("salmDerogation", "Salmonella derogation (one flock per round)", !!s.salmDerogation, "Only with DAERA permission")}${F("salmDerogationDate", "DAERA permission date", s.salmDerogationDate, { type: "date" })}
      ${checkRow("nonMainsWater", "Non-mains water (borehole or spring)", !!s.nonMainsWater, "Red Tractor: test every 6 months")}</div>
    <p class="form-label">People to call</p><div class="form-group">
      ${F("vetName", "Vet", s.vetName, { type: "text" })}${F("vetAddress", "Vet's address (goes on the FCI)", s.vetAddress, { type: "text" })}${F("vetPhone", "Vet's phone", s.vetPhone, { type: "tel" })}${F("daeraPhone", "DAERA phone", s.daeraPhone, { type: "tel", help: "Leave blank for the DAERA helpline 0300 200 7840" })}</div>
    <p class="form-label">Energy</p><div class="form-group">${checkRow("rhi", "On the NI RHI scheme", !!s.rhi, "Keep heat meter readings as your scheme log")}</div>
    <p class="form-label">House instructions</p><div class="form-group"><div class="field stacked"><label>Pinned on the Crop screen for whoever is covering</label><textarea name="houseNote" rows="3" placeholder="e.g. Generator switch is behind the door in House 2">${s.houseNote || ""}</textarea></div></div>
    </form>${can ? html`<button type="button" class="btn" style="margin-top:16px" data-save>Save settings</button>` : ""}</div>`);
  const f = wireForm(body.querySelector("form"));
  const btn = body.querySelector("[data-save]");
  if (btn) btn.onclick = () => {
    const v = f.values(); const n = (k) => (v[k] === "" || v[k] == null ? undefined : +v[k]);
    const std = BREED_STANDARDS.find((b) => b.id === v.breedStdId);
    const patch = { breedStdId: v.breedStdId, hybrid: std?.hybrid, plannedThinDay: n("plannedThinDay"), plannedThinBirdsPct: n("plannedThinBirdsPct"), plannedClearDay: n("plannedClearDay"), targetDensity: n("targetDensity"), farmLimitKgM2: Math.min(42, n("farmLimitKgM2") ?? 38),
      weighDays: String(v.weighDays || "").split(/[^\d]+/).map(Number).filter((x) => x > 0), organic: !!v.organic, longLife: !!v.longLife, freeRange: !!v.freeRange,
      checkTimes: { am: v.ck_am || "10:00", pm: v.ck_pm || "20:00" }, lateAfterHours: n("lateAfterHours"), mortalitySpikePct: n("mortalitySpikePct"), mortalityMultiple: n("mortalityMultiple"), cropTolerancePct: n("cropTolerancePct"), mort7TargetPct: n("mort7TargetPct"),
      weightAlertPct: n("weightAlertPct"), weightAlertDays: n("weightAlertDays"), waterAlertPct: n("waterAlertPct"), waterMeterSlot: v.waterMeterSlot || "am", litterScoreHigh: n("litterScoreHigh"), cropFill8h: n("cropFill8h"), cropFill24h: n("cropFill24h"),
      feedOffHours: Math.min(12, n("feedOffHours") ?? 9), arrivalHoursAfterCatch: n("arrivalHoursAfterCatch"), crewName: v.crewName, crewGlaa: v.crewGlaa, registerNo: v.registerNo, establishmentNo: v.establishmentNo, holdingNo: v.holdingNo,
      labs: String(v.labs || "").split(",").map((x) => x.trim()).filter(Boolean), salmDerogation: !!v.salmDerogation, salmDerogationDate: v.salmDerogationDate || "", nonMainsWater: !!v.nonMainsWater,
      vetName: v.vetName, vetAddress: v.vetAddress, vetPhone: v.vetPhone, daeraPhone: v.daeraPhone, rhi: !!v.rhi, houseNote: v.houseNote || "" };
    for (const k of Object.keys(patch)) if (patch[k] === undefined) delete patch[k];
    saveSettings(snap, patch); toast("Broiler settings saved");
  };
  return { el: body, title: "Broiler settings", depth: 1, tab: "more" };
}
