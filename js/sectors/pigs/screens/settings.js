// Pig settings and targets (design/13 §13). Owner and manager edit (meta/settings); others read.
// Guesses made into settings are labelled: water-drop alert 15%, visitor downtime 48 h,
// feed intake table, rearing growth.
import { html, raw } from "../../../core/html.js";
import { icon } from "../../../ui/icons.js";
import { el } from "../../../ui/dom.js";
import { toast } from "../../../ui/toast.js";
import { wireForm, checkRow, chipGroup } from "../../../ui/form.js";
import { canWriteMeta } from "../../../core/policy.js";
import { largeTitle, backLink, groupLabel } from "../../../screens/common.js";
import { loadPigs } from "../data.js";
import { saveSettings } from "../actions.js";
import { SYSTEMS, DEFAULT_TARGETS } from "../model/settings.js";
import { DEFAULT_INTAKE } from "../model/bins.js";
import { opt } from "../flows/common.js";

const F = (name, label, value, { help = "", type = "number", step = "any" } = {}) => html`<div class="field"><label>${label}${help ? html`<br><small class="ink-2" style="font-weight:500">${help}</small>` : ""}</label><input name="${name}" type="${type}" ${type === "number" ? html`inputmode="decimal" step="${step}"` : ""} value="${value ?? ""}"></div>`;
const chips = (name, label, options, value) => html`<div class="field chips-field"><span class="label">${label}</span>${chipGroup(name, opt(options), value == null ? [] : [value], { multi: false })}</div>`;

export default async function settings(ctx) {
  const snap = await loadPigs(ctx.ledger); const s = snap.s; const t = s.targets; const can = canWriteMeta(snap.role, "settings");
  const body = el(html`<div class="pg-page push">${backLink(`#/l/${snap.lid}/more`, "More")}${largeTitle("Pig settings and targets", can ? "Changes apply straight away" : "Only the owner or a manager can change these")}<div class="list" style="margin-bottom:8px"><a class="row" href="#/l/${snap.lid}/setup"><span class="tile">${raw(icon("house"))}</span><span class="main"><span class="primary">Rooms, bins and semen</span><span class="secondary">Houses, rooms, pens, crates, feed bins</span></span><span class="chev">${raw(icon("chevron"))}</span></a></div>
    <form novalidate ${can ? "" : "inert"}>
    <p class="form-label">The unit</p><div class="form-group">
      ${chips("system", "System", Object.entries(SYSTEMS), s.system)}
      ${checkRow("smallHerd", "Small herd mode", s.smallHerd, "Plain words, no week numbers or batches — same records underneath")}
      ${chips("interval", "Batch interval", [["1", "Weekly"], ["2", "2-weekly"], ["3", "3-weekly"], ["4", "4-weekly"], ["5", "5-weekly"]], String(s.interval))}
      ${chips("weekStart", "Production week starts", [["1", "Mon"], ["2", "Tue"], ["3", "Wed"], ["4", "Thu"], ["5", "Fri"], ["6", "Sat"], ["7", "Sun"]], String(s.weekStart))}
      ${F("herdMark", "Herd mark / establishment number", s.herdMark, { type: "text" })}
      ${F("farrowingPlaces", "Farrowing places (crates per batch)", s.farrowingPlaces, { step: 1 })}${F("finisherPlaces", "Finisher places", s.finisherPlaces, { step: 1 })}
      ${checkRow("mainsWater", "Mains water only", !!s.mainsWater, "Turns off the yearly water test")}</div>
    <p class="form-label">Breeding dates</p><div class="form-group">
      ${F("gestation", "Gestation (days)", s.gestation, { step: 1 })}${F("lactation", "Lactation length (days)", s.lactation, { step: 1, help: "Under 28 days needs specialised, cleaned housing" })}
      ${F("moveDays", "Move to farrowing (days before due)", s.moveDays, { step: 1, help: "5–7; never more than 7 (Red Tractor HF.9.2.a)" })}
      ${F("scanFrom", "Scan from (days)", s.scanFrom, { step: 1 })}${F("scanTo", "Scan to (days)", s.scanTo, { step: 1 })}${F("returnFrom", "Return check from (days)", s.returnFrom, { step: 1 })}${F("returnTo", "Return check to (days)", s.returnTo, { step: 1 })}</div>
    <p class="form-label">Selling</p><div class="form-group">
      ${F("killOut", "Kill-out %", s.killOut)}${F("bandMin", "Processor band — lightest (kg dw)", s.bandMin)}${F("bandMax", "Processor band — heaviest (kg dw)", s.bandMax)}${F("targetLive", "Target live weight (kg)", s.targetLive)}${F("feedWithdrawH", "Feed withdrawal before loading (h)", s.feedWithdrawH, { help: "No more than 8 h before transport" })}</div>
    <p class="form-label">Targets</p><div class="form-group">
      ${F("t_pwsy", "Pigs weaned / sow / year", t.pwsy)}${F("t_bornAlive", "Born alive / litter", t.bornAlive)}${F("t_pwm", "Pre-weaning mortality %", t.pwm)}${F("t_farrowRate", "Farrowing rate %", t.farrowRate)}
      ${F("t_fcr", "Finishing FCR", t.fcr)}${F("t_dlwg", "Finishing growth (g/day)", t.dlwg)}${F("t_mort", "Finishing mortality %", t.mort)}${F("t_feedDays", "Finishing days", t.feedDays)}
      ${F("t_rearFcr", "Rearing FCR", t.rearFcr)}${F("t_rearDlwg", "Rearing growth (g/day)", t.rearDlwg, { help: "Guess — set your own" })}${F("t_rearMort", "Rearing mortality %", t.rearMort)}</div>
    <p class="pg-note">Defaults are AHDB Agrosoft averages (finishing 35–110 kg: FCR ${DEFAULT_TARGETS.fcr}, ${DEFAULT_TARGETS.dlwg} g/day).</p>
    <p class="form-label">Alerts</p><div class="form-group">
      ${F("waterDrop", "Water-drop alert (%)", s.waterDrop, { help: "Guess made into a setting — 15% is a starting point" })}${F("checkBy", "Room-check reminder time", s.checkBy, { type: "time" })}${F("downtimeH", "Visitor pig-free time (hours)", s.downtimeH, { help: "Your farm's own rule — 48 h is a guess" })}${F("leadDays", "Feed delivery lead time (days)", s.leadDays, { step: 1 })}</div>
    <p class="form-label">Contract</p><div class="form-group">
      ${checkRow("c_on", "Contract finishing", s.contract.on, "You grow someone else's pigs")}${F("c_integrator", "Integrator", s.contract.integrator, { type: "text" })}
      ${chips("c_basis", "Paid", [["per pig place per week", "Per pig place per week"], ["per pig", "Per pig"], ["on performance", "On performance"]], s.contract.basis)}
      ${checkRow("c_owns", "Pigs and feed owned by the integrator", s.contract.integratorOwns, "Hides feed cost and pig value in Money and the batch report")}</div>
    <p class="form-label">Feed intake table</p><div class="form-group">${F("intake", "kg/day by weight (up to kg: kg/day, …)", (s.intake || DEFAULT_INTAKE).map((r) => `${r.upToKg >= 999 ? "999" : r.upToKg}:${r.kgDay}`).join(", "), { type: "text", help: s.intake ? "Your table" : "A guess until you enter your breeding company's table (JSR, PIC, Hermitage…)" })}</div>
    </form>${can ? html`<button type="button" class="btn" style="margin-top:16px" data-save>Save settings</button>` : ""}</div>`);
  const form = body.querySelector("form"); const f = wireForm(form);
  const btn = body.querySelector("[data-save]");
  if (btn) btn.onclick = () => {
    const v = f.values(); const n = (k) => (v[k] === "" || v[k] == null ? undefined : +v[k]);
    const targets = Object.fromEntries(Object.keys(DEFAULT_TARGETS).map((k) => [k, n("t_" + k) ?? DEFAULT_TARGETS[k]]));
    const intake = String(v.intake || "").split(",").map((x) => x.split(":").map((y) => +y.trim())).filter(([a, b]) => a > 0 && b > 0).map(([upToKg, kgDay]) => ({ upToKg, kgDay }));
    const same = JSON.stringify(intake) === JSON.stringify(DEFAULT_INTAKE);
    const moveDays = Math.min(7, n("moveDays") ?? 5);
    const patch = { system: v.system, smallHerd: !!v.smallHerd, interval: +v.interval || 3, weekStart: +v.weekStart || 1, herdMark: v.herdMark, farrowingPlaces: n("farrowingPlaces"), finisherPlaces: n("finisherPlaces"), mainsWater: !!v.mainsWater,
      gestation: n("gestation"), lactation: n("lactation"), moveDays, scanFrom: n("scanFrom"), scanTo: n("scanTo"), returnFrom: n("returnFrom"), returnTo: n("returnTo"),
      killOut: n("killOut"), bandMin: n("bandMin"), bandMax: n("bandMax"), targetLive: n("targetLive"), feedWithdrawH: Math.min(8, n("feedWithdrawH") ?? 8),
      targets, waterDrop: n("waterDrop"), checkBy: v.checkBy || "12:00", downtimeH: n("downtimeH"), leadDays: n("leadDays"),
      contract: { on: !!v.c_on, integrator: v.c_integrator || "", basis: v.c_basis || "per pig place per week", integratorOwns: !!v.c_owns }, intake: intake.length && !same ? intake : null };
    for (const k of Object.keys(patch)) if (patch[k] === undefined) delete patch[k];
    saveSettings(snap, patch); toast("Pig settings saved");
  };
  return { el: body, title: "Pig settings", depth: 1, tab: "more" };
}
export { groupLabel };
