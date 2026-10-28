// Turnaround steps (design/15 §10): each step has a date, who, and its own details — Litter out
// carries the manure export record (tonnes, haulier, destination, docket) for the farm N & P
// balance and the 31 Jan litter export return. Also: planned next placement.
import { html } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { toast } from "../../../ui/toast.js";
import { entrySheet, chipsField, numField, textField, dateField, lawNote, pickHouse } from "./common.js";
import { turnaroundStep, updateTurnaround, me } from "../actions.js";
import { openTurnaround } from "../model/crop.js";
import { turnaroundDays } from "../model/paper.js";
import { TURNAROUND_STEPS } from "../model/content.js";
import { dm } from "../ui.js";
import { photoStrip } from "../../../ui/photo-strip.js";

const EXTRA = {
  litterOut: () => html`${numField("tonnes", "Litter out", "", { unit: "t" })}${textField("haulier", "Haulier", "")}${chipsField("dest", "Went to", ["AD plant", "Spread on own land", "Another farm", "Incinerator", "Other"], null)}${textField("docket", "Docket no.", "", { optional: true })}`,
  washed: () => html`${textField("who", "Washed by", "", { placeholder: "contractor or own staff" })}`,
  disinfected: () => html`${textField("product", "Disinfectant", "")}${textField("dilution", "Dilution", "", { placeholder: "e.g. 1:100" })}`,
  swabs: () => html`${chipsField("result", "Hygiene swab result", [["pass", "Pass"], ["fail", "Fail"], ["pending", "Waiting"]], "pending")}`,
  pest: () => html`${textField("note", "Bait points checked", "", { placeholder: "e.g. 12 points, 2 taken" })}`,
  waterLines: () => html`${textField("product", "Product", "", { optional: true })}`,
  rebedded: () => html`${chipsField("litterType", "Litter", ["Wood shavings", "Chopped straw", "Pellets", "Other"], "Wood shavings")}${numField("tonnes", "Tonnes", "", { unit: "t", optional: true })}`,
  preheat: () => html`${numField("note", "Litter temperature", "", { unit: "°C", optional: true })}`,
};

/** stepFlow(snap, { houseId, key }) */
export async function stepFlow(snap, { houseId, key } = {}) {
  const house = houseId ? snap.ix.houseById.get(houseId) : await pickHouse(snap, { withCrop: false, title: "Which house?", filter: (h) => !!openTurnaround(snap.ix, h.id) });
  if (!house) return; const ta = openTurnaround(snap.ix, house.id);
  if (!ta) { toast(`No turnaround running in ${house.name}. It starts when you clear the house.`); return; }
  const done = new Set((ta.steps || []).filter((x) => x.at).map((x) => x.key));
  const k = key || TURNAROUND_STEPS.find(([s]) => !done.has(s) && s !== "placed" && !(s === "swabs" && !ta.swabsRequired))?.[0] || "litterOut";
  const label = TURNAROUND_STEPS.find(([s]) => s === k)?.[1] || k;
  const old = (ta.steps || []).find((x) => x.key === k) || {};
  const body = el(html`<form novalidate>
    <p class="br-sub">${house.name} · cleared ${dm(ta.clearedDate)} · day ${turnaroundDays(ta, snap.today).days} empty</p>
    <div class="form-group">${dateField("at", "Done on", old.at || snap.today)}${textField("by", "By", old.by || me())}${EXTRA[k] ? EXTRA[k]() : ""}</div>
    ${k === "litterOut" ? lawNote("This is your manure export record: it feeds the farm's nitrogen and phosphorus balance and the litter export return due 31 January.") : ""}
  </form>`);
  // optional photo per step (clean house, disinfectant, litter docket) — saved at once on the turnaround
  const strip = photoStrip({ lid: snap.lid, role: snap.role, parent: { coll: "turnarounds", id: ta.id, label: `Turnaround · ${house.name}` }, title: "Photos", hint: "Optional" });
  body.querySelector(".form-group").after(strip.node);
  const es = entrySheet({ title: label, body, label: `Save · ${label}`, size: "large",
    missing: (v) => (!v.at ? "Add the date" : k === "litterOut" && !(+v.tonnes > 0) ? "Add the tonnes" : k === "litterOut" && !v.dest ? "Where did it go?" : k === "disinfected" && !v.product ? "Add the disinfectant" : null),
    save(v, sh) { turnaroundStep(snap, ta, k, v); sh.close(true, { force: true }); toast(`${label} ✓ · ${house.name}`); } });
  es.sheet.done.then(() => strip.destroy());
  return es.sheet.done;
}
export function planPlacementFlow(snap, { houseId }) {
  const ta = openTurnaround(snap.ix, houseId); if (!ta) return;
  const body = el(html`<form novalidate><div class="form-group">${dateField("nextPlacement", "Next chicks", ta.nextPlacement || "")}${numField("targetDensity", "Planned density", ta.targetDensity || snap.s.targetDensity, { unit: "kg/m²" })}</div>
    ${lawNote("Red Tractor needs at least 5 days between flocks for cleaning and disinfection.")}<div data-w></div></form>`);
  const es = entrySheet({ title: "Next placement", body, label: "Save", size: "small", missing: (v) => (!v.nextPlacement ? "Add the date" : null),
    save(v, sh) { updateTurnaround(snap, ta, { nextPlacement: v.nextPlacement, targetDensity: +v.targetDensity || undefined }); sh.close(true, { force: true }); toast(`Chicks planned ${dm(v.nextPlacement)}`); } });
  es.form.onChange(() => { const v = es.form.values(); const d = v.nextPlacement ? turnaroundDays({ ...ta, nextPlacement: v.nextPlacement }, snap.today) : null; body.querySelector("[data-w]").innerHTML = d?.short ? `<div class="warn-card due"><span>Only ${d.planned} days between flocks.</span></div>` : ""; });
  return es.sheet.done;
}
export function swabsRequiredToggle(snap, { houseId }) { const ta = openTurnaround(snap.ix, houseId); if (ta) updateTurnaround(snap, ta, { swabsRequired: !ta.swabsRequired }); }
