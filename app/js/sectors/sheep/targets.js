// Targets and flock settings (design/11 §13). One date — rams in — drives the sheep year; the
// rest are targets and processor figures. Guesses are labelled. Owner and manager edit;
// everyone else reads. Saved to meta/settings (merged over the defaults in model/settings.js).
import { html } from "../../core/html.js";
import { el } from "../../ui/dom.js";
import { textField, selectField, checkRow, wireForm } from "../../ui/form.js";
import { toast } from "../../ui/toast.js";
import { canWriteMeta } from "../../core/policy.js";
import { backLink, largeTitle, groupLabel } from "../../screens/common.js";
import { loadSheep } from "./data.js";
import { short } from "./ui.js";
import { FLOCK_TYPES, RADDLE_COLOURS, SOURCES, RAMS_IN_BY_TYPE } from "./model/settings.js";
import { setMeta } from "../../services/records.js";

/** Turn the form's values into the settings patch (pure; tested). */
export function settingsPatch(v) {
  const n = (x, d = null) => (x === "" || x == null || isNaN(+x) ? d : +x);
  const md = (iso) => (iso && /^\d{4}-\d\d-\d\d$/.test(iso) ? iso.slice(5) : null);
  const order = String(v.raddleOrder || "").split(/[,>→\s]+/).map((c) => c.trim()).filter(Boolean).map((c) => c[0].toUpperCase() + c.slice(1).toLowerCase()).filter((c) => RADDLE_COLOURS[c]);
  const ramsIn = md(v.ramsIn); const ramsOut = md(v.ramsOut);
  let ramsOutDays = null;
  if (ramsIn && ramsOut) { const a = new Date(`2026-${ramsIn}T12:00:00Z`), b = new Date(`${ramsOut < ramsIn ? 2027 : 2026}-${ramsOut}T12:00:00Z`); ramsOutDays = Math.round((b - a) / 86400000); }
  return {
    flockNo: v.flockNo || "", flockType: FLOCK_TYPES[v.flockType] ? v.flockType : "lowland", ramsIn, ...(ramsOutDays ? { ramsOutDays } : {}),
    raddleOrder: order.length ? order : undefined, gestation: n(v.gestation, 147), weaningDays: n(v.weaningDays, 100), scanDate: v.scanDate || "",
    housedOrMilked: !!v.housedOrMilked, individualLambs: !!v.individualLambs, quarantineDays: n(v.quarantineDays, 28),
    fecThreshold: n(v.fecThreshold, 500), drenchCheckDays: Math.min(14, Math.max(7, n(v.drenchCheckDays, 10))),
    draftKg: n(v.draftKg, 42), koPct: n(v.koPct, 45), maxCarcase: n(v.maxCarcase, 21.5), lameTarget: n(v.lameTarget, 2), abortionTrigger: n(v.abortionTrigger, 2),
    inventoryDeadline: v.inventoryDeadline || "", shedNightFrom: /^\d\d:\d\d$/.test(v.shedNightFrom || "") ? v.shedNightFrom : "18:00", pens: n(v.pens, 12), targetEwes: n(v.targetEwes), mealPrice: n(v.mealPrice, 350),
  };
}

export default async function targets(ctx) {
  const snap = await loadSheep(ctx.ledger); const s = snap.s; const cy = snap.cy; const can = canWriteMeta(snap.role, "settings");
  const n = (name, label, value, help) => html`${textField({ name, label, value: value ?? "", inputmode: "decimal", optional: true })}${help ? html`<p class="source" style="margin:0 16px 8px">${help}</p>` : ""}`;
  const body = el(html`<div class="sheep-page">${backLink(`#/l/${snap.lid}/more/settings`, "Ledger settings")}${largeTitle("Targets and flock settings", can ? "Change anything that's different on your farm" : "Only the owner or a manager can change these")}
  <form novalidate>
    ${groupLabel("Flock")}<div class="form-group">${textField({ name: "flockNo", label: "Flock number", value: s.flockNo || "", inputmode: "numeric", optional: true })}${selectField({ name: "flockType", label: "Flock type", value: s.flockType, options: Object.entries(FLOCK_TYPES).map(([value, label]) => ({ value, label })) })}${n("targetEwes", "Ewes you aim to keep", s.targetEwes)}</div>
    ${groupLabel("The sheep year")}<p class="hint" style="margin:0 4px 8px">One date drives everything: raddle changes, scanning, lambing, weaning. Typical rams in: lowland ${short("2026-" + RAMS_IN_BY_TYPE.lowland)}, hill ${short("2026-" + RAMS_IN_BY_TYPE.hill)}, early lambing ${short("2026-" + RAMS_IN_BY_TYPE.early)}.</p>
    <div class="form-group">${textField({ name: "ramsIn", label: "Rams in", type: "date", value: cy.ramsIn })}${textField({ name: "ramsOut", label: "Rams out", type: "date", value: cy.ramsOut })}${textField({ name: "raddleOrder", label: "Raddle colours, in order", value: (s.raddleOrder || []).join(", "), placeholder: "Yellow, Red, Blue, Green, Black" })}
      ${n("gestation", "Gestation (days)", s.gestation, "147 days; prolific breeds 144, early-maturing meat breeds 145.")}${n("weaningDays", "Weaning (days after lambing starts)", s.weaningDays)}${textField({ name: "scanDate", label: "Scanning booked", type: "date", value: s.scanDate || "", optional: true })}</div>
    ${groupLabel("Tags and paperwork")}<div class="form-group">${checkRow("housedOrMilked", "Housed overnight or milked", !!s.housedOrMilked, "Lambs must then be tagged by 6 months, not 9.")}${checkRow("individualLambs", "Keep individual lamb records", !!s.individualLambs, "For EID users: a record per lamb when tagged.")}
      ${textField({ name: "inventoryDeadline", label: "Inventory return date (from DAERA's letter)", type: "date", value: s.inventoryDeadline || "", optional: true })}${n("quarantineDays", "Quarantine for bought-in sheep (days)", s.quarantineDays)}</div>
    ${groupLabel("Health")}<div class="form-group">${n("fecThreshold", "Dose above (strongyle eggs per gram)", s.fecThreshold, SOURCES.fecThreshold)}${n("drenchCheckDays", "Drench check after (days, 7–14)", s.drenchCheckDays)}${n("lameTarget", "Lameness target (%)", s.lameTarget)}${n("abortionTrigger", "Call the vet when abortions reach (%)", s.abortionTrigger, SOURCES.abortionTrigger)}</div>
    ${groupLabel("Selling (processor profile)")}<div class="form-group">${n("draftKg", "Draft at liveweight (kg)", s.draftKg)}${n("koPct", "Kill-out %", s.koPct, SOURCES.koPct)}${n("maxCarcase", "Processor maximum carcase (kg)", s.maxCarcase, SOURCES.maxCarcase)}${n("mealPrice", "Meal price (£ a tonne)", s.mealPrice)}</div>
    ${groupLabel("Lambing shed")}<div class="form-group">${textField({ name: "shedNightFrom", label: "Night total counts from", value: s.shedNightFrom, placeholder: "18:00" })}${n("pens", "Number of pens", s.pens)}</div>
  </form>${can ? html`<div class="sticky-foot"><button type="button" class="btn" data-save>Save targets</button></div>` : ""}</div>`);
  { const r = body.querySelector("[name=raddleOrder]"); r.closest(".field").classList.add("stacked"); r.style.textAlign = "left"; } // five colour names don't fit beside the label
  if (!can) body.querySelectorAll("input,select,button.check-row").forEach((i) => (i.disabled = true));
  const f = wireForm(body.querySelector("form"));
  body.querySelector("[data-save]")?.addEventListener("click", () => {
    const v = f.values(); const patch = settingsPatch(v);
    if (!patch.ramsIn) { toast("Add the rams-in date"); return; }
    if (v.raddleOrder && !patch.raddleOrder) { toast("Use colour names: Yellow, Red, Blue, Green, Black, Orange, Purple"); return; }
    Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);
    setMeta(snap.lid, "settings", patch);
    toast("Targets saved");
  });
  return { el: body, title: "Targets", depth: 1, tab: "more" };
}
