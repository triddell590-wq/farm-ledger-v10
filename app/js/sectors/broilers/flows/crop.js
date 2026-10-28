// Houses, starting a crop (chicks placed = day 0) and the density paperwork on a crop
// (DAERA notification date above 33 kg/m², approval reference above 39 — design/15 §6.2).
import { html } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { toast } from "../../../ui/toast.js";
import { go } from "../../../core/router.js";
import { entrySheet, chipsField, numField, textField, dateField, timeField, lawNote, pickHouse } from "./common.js";
import { saveHouse, startCrop, updateCrop, undoAdd } from "../actions.js";
import { currentCrop, nextCropNo, openTurnaround } from "../model/crop.js";
import { turnaroundDays } from "../model/paper.js";
import { BREED_STANDARDS } from "../model/content.js";
import { regionRule } from "../model/content.js";
import { workingDaysBefore } from "../model/time.js";
import { dm, n0 } from "../ui.js";
import { photoStrip } from "../../../ui/photo-strip.js";

export function houseSheet(snap, { houseId } = {}) {
  const old = houseId ? snap.ix.houseById.get(houseId) : null;
  const body = el(html`<form novalidate>
    <div class="form-group">${textField("name", "Name", old?.name || `House ${snap.ix.houses.length + 1}`)}${numField("usableM2", "Usable floor area", old?.usableM2 ?? "", { unit: "m²" })}
      ${chipsField("heating", "Heating", [["gas", "Gas / LPG"], ["biomass", "Biomass"], ["heatpump", "Heat pump"], ["other", "Other"]], old?.heating || null)}
      ${textField("establishmentNo", "Establishment number", old?.establishmentNo || "", { optional: true, placeholder: "old flock code" })}</div>
    ${lawNote("Usable area drives the density planner: the legal limits are kg of live bird per m² of usable floor.")}
  </form>`);
  const es = entrySheet({ title: old ? "Edit house" : "Add a house", body, label: old ? "Save house" : "Add house", size: "large",
    missing: (v) => (!v.name ? "Add a name" : !(+v.usableM2 > 0) ? "Add the usable floor area" : null),
    save(v, sh) { saveHouse(snap, v, old); sh.close(true, { force: true }); toast(old ? `${v.name} saved` : `${v.name} added`); } });
  return es.sheet.done;
}

/** Chicks placed. Pre-fills from settings, the turnaround (planned placement) and last crop. */
export async function startCropFlow(snap, { houseId } = {}) {
  const house = houseId ? snap.ix.houseById.get(houseId) : await pickHouse(snap, { withCrop: false, title: "Chicks into which house?", filter: (h) => !currentCrop(snap.ix, h.id) });
  if (!house) return;
  if (currentCrop(snap.ix, house.id)) { toast(`${house.name} already has a crop. Clear it out first.`); return; }
  const ta = openTurnaround(snap.ix, house.id); const s = snap.s;
  const placedDate = ta?.nextPlacement && ta.nextPlacement >= snap.today ? ta.nextPlacement : snap.today;
  const R = regionRule("broilerDensity");
  const body = el(html`<form novalidate>
    <p class="br-sub">${house.name} · ${n0(house.usableM2)} m² usable · Day 0 is placement day.</p>
    <div class="form-group">${numField("no", "Crop number", nextCropNo(snap.ix, house.id), { step: "1" })}${dateField("placedDate", "Placed", placedDate)}${timeField("placedTime", "Chicks arrived", "06:00")}
      ${numField("placed", "Chicks on the delivery note", s.birdsPerCrop ? Math.round(s.birdsPerCrop / Math.max(1, s.housesPlanned)) : "", { step: "1" })}${numField("doa", "Dead on arrival", "", { step: "1", optional: true })}
      ${chipsField("breedStdId", "Hybrid", BREED_STANDARDS.map((b) => [b.id, b.hybrid]), s.breedStdId)}
      ${textField("hatchery", "Hatchery", "", { optional: true })}${textField("parentFlock", "Parent flock", "", { optional: true })}</div>
    <h3 class="group-label"><span>Crop plan</span></h3>
    <div class="form-group">${numField("thinDay", "Thin on day", s.plannedThinDay, { step: "1", optional: true })}${numField("thinBirds", "Birds to take at the thin", "", { step: "1", optional: true, placeholder: `about ${s.plannedThinBirdsPct}% if blank` })}${numField("clearDay", "Clear-out on day", s.plannedClearDay, { step: "1" })}${numField("targetDensity", "Planned density", s.targetDensity, { unit: "kg/m²" })}</div>
    <div data-notice></div>
    ${ta ? html`<div data-ta></div>` : ""}
  </form>`);
  let lastKey = null;
  const paint = (v) => {
    const by = v.placedDate ? workingDaysBefore(v.placedDate, R.notifyWorkingDays) : null;
    const key = `${+v.targetDensity > R.notifyAbove}|${+v.targetDensity > R.approvalAbove}|${by}`;
    if (key !== lastKey) { lastKey = key; const keep = { n: body.querySelector("[name=notifiedDaera]")?.value, a: body.querySelector("[name=approvalRef]")?.value };
    body.querySelector("[data-notice]").innerHTML = +v.targetDensity > R.notifyAbove ? `<div class="form-group"><div class="field"><label>Told DAERA on</label><input type="date" name="notifiedDaera" value="${ta?.notifiedDaera || ""}"></div>${+v.targetDensity > R.approvalAbove ? `<div class="field"><label>DAERA approval ref.</label><input name="approvalRef" value=""></div>` : ""}</div><p class="br-law">Above ${R.notifyAbove} kg/m², DAERA must be told ${R.notifyWorkingDays} working days before placement — by ${dm(by)}.${+v.targetDensity > R.approvalAbove ? ` Above ${R.approvalAbove} needs DAERA approval and 7 crops under the 1% + 0.06% × age line.` : ""}</p>` : "";
    if (keep.n && body.querySelector("[name=notifiedDaera]")) body.querySelector("[name=notifiedDaera]").value = keep.n;
    if (keep.a && body.querySelector("[name=approvalRef]")) body.querySelector("[name=approvalRef]").value = keep.a; }
    const t = body.querySelector("[data-ta]"); if (t && v.placedDate) { const d = turnaroundDays({ ...ta, nextPlacement: v.placedDate }, snap.today); t.innerHTML = d.planned < 5 ? `<div class="warn-card due" style="margin-top:12px"><span>Only ${d.planned} days since clear-out. Red Tractor needs at least 5 days between flocks for cleaning.</span></div>` : `<p class="br-law">${d.planned} days empty since clear-out ${dm(ta.clearedDate)}.</p>`; }
  };
  const strip = photoStrip({ lid: snap.lid, role: snap.role, parent: { coll: "crops", label: "Chicks placed" }, title: "Delivery note photos" });
  body.appendChild(strip.node);
  const es = entrySheet({ title: `Chicks placed · ${house.name}`, body, label: "Start crop", size: "large",
    missing: (v) => (!v.placedDate ? "Add the placement date" : !(+v.placed > 0) ? "Add the chicks placed" : !(+v.clearDay > 0) ? "Add the clear-out day" : null),
    save(v, sh) {
      const std = BREED_STANDARDS.find((b) => b.id === v.breedStdId);
      const id = startCrop(snap, house, { ...v, hybrid: std?.hybrid, notifiedDaera: body.querySelector("[name=notifiedDaera]")?.value, approvalRef: body.querySelector("[name=approvalRef]")?.value });
      strip.commit(id, `Chicks placed · ${house.name} crop ${v.no || ""}`.trim());
      sh.close(true, { force: true });
      toast(`Crop ${v.no} started · ${house.name} · ${n0(v.placed)} chicks`, { action: "Brooding", onAction: () => go(`/l/${snap.lid}/brooding/${id}`) });
    } });
  es.form.onChange(() => paint(es.form.values())); paint(es.form.values()); es.rebase();
  return es.sheet.done;
}

/** DAERA notice date / approval reference on a crop. */
export function densityNoticeSheet(snap, { cropId }) {
  const crop = snap.ix.cropById.get(cropId); if (!crop) return;
  const R = regionRule("broilerDensity"); const by = workingDaysBefore(crop.placedDate, R.notifyWorkingDays);
  const body = el(html`<form novalidate><div class="form-group">${dateField("notifiedDaera", "Told DAERA on", crop.notifiedDaera || "")}${textField("approvalRef", "Approval reference (above 39 kg/m²)", crop.approvalRef || "", { optional: true })}</div>
    ${lawNote(`Notice is due ${R.notifyWorkingDays} working days before placement: by ${dm(by)} for this crop (placed ${dm(crop.placedDate)}). NI bank holidays are not working days.`)}</form>`);
  const es = entrySheet({ title: "Density notice", body, label: "Save", size: "small", missing: (v) => (!v.notifiedDaera && !v.approvalRef ? "Add a date or reference" : null),
    save(v, sh) { updateCrop(snap, crop, { notifiedDaera: v.notifiedDaera, approvalRef: v.approvalRef }); sh.close(true, { force: true }); toast(v.notifiedDaera && v.notifiedDaera > by ? `Saved — the notice was late (due by ${dm(by)})` : "Density notice saved"); } });
  return es.sheet.done;
}
export { undoAdd };
