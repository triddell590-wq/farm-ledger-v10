// Houses and flocks (design/14 §5.4, §9.3, §12, §14, §19): add or edit a house (system, size for
// the space check, range, trap grid), place a flock (breed standard, hatch date, pullets in), edit
// the flock's plan (depop week, turnaround, next flock — the Salmonella and packer dates move
// with it), and depopulate (spent hens out).
import { html } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { textField, checkRow } from "../../../ui/form.js";
import { toast } from "../../../ui/toast.js";
import { canWrite } from "../../../core/policy.js";
import { addDays, daysBetween } from "../../../core/dates.js";
import { entrySheet, chipsField, numField, dateField, lawNote, warn } from "./common.js";
import { saveHouse, placeFlock, updateFlock, depopFlock } from "../actions.js";
import { BREED_STANDARDS, SYSTEMS, RULES } from "../model/content.js";
import { aliveAt, weekOfAge, dateAtWeek } from "../model/flock.js";
import { dm, n0 } from "../ui.js";

export const codeOk = (code, system) => { const m = String(code || "").replace(/\s/g, "").toUpperCase().match(/^([0-3])UK9-?(\d{2,})/); return !code ? null : !m ? "bad" : system != null && +m[1] !== +system ? "digit" : "ok"; };

export function houseSheet(snap, { id = null } = {}) {
  const h = id ? snap.data.houses.find((x) => x.id === id) : null; const o = snap.ledger.settings || {};
  const defSys = h?.system ?? SYSTEMS.find((s) => s.label === o.layerSystem)?.v ?? 1;
  const body = el(html`<form novalidate>
    <div class="form-group">${textField({ name: "name", label: "Name", value: h?.name || `House ${snap.data.houses.length + 1}` })}</div>
    ${chipsField("system", "System", SYSTEMS.map((s) => [String(s.v), `${s.v} · ${s.label}`]), String(defSys))}
    <div class="form-group" style="margin-top:12px">${textField({ name: "producerCode", label: "Producer code", value: h?.producerCode || snap.s.producerCode || "", placeholder: `${defSys}UK9-0412`, optional: true })}
      ${textField({ name: "establishmentNo", label: "Establishment no. (DAERA)", value: h?.establishmentNo || o.registerNo || "", optional: true })}
      ${numField("places", "Bird places", h?.places ?? (o.birdsPerHouse || ""), { step: 1, optional: true })}</div>
    <div data-code></div>
    <h2 class="group-label"><span>Space (for the space check)</span></h2>
    <div class="form-group">${numField("usableM2", "Usable area", h?.usableM2 ?? "", { unit: "m²", optional: true })}${numField("nests", "Individual nests", h?.nests ?? "", { step: 1, optional: true })}${numField("nestM2", "or group nest area", h?.nestM2 ?? "", { unit: "m²", optional: true })}${numField("perchM", "Perch", h?.perchM ?? "", { unit: "m", optional: true })}${numField("litterM2", "Litter area", h?.litterM2 ?? "", { unit: "m²", optional: true })}</div>
    <div data-range><h2 class="group-label"><span>Range</span></h2>
    <div class="form-group">${numField("rangeHa", "Range area", h?.rangeHa ?? "", { unit: "ha", optional: true })}${numField("rangeMaxM", "Furthest point from a pop-hole", h?.rangeMaxM ?? "", { unit: "m", optional: true })}${numField("sheltersPerHa", "Shelters per hectare", h?.sheltersPerHa ?? "", { optional: true })}</div></div>
    <h2 class="group-label"><span>Red-mite traps</span></h2>
    <div class="form-group">${numField("trapRows", "Rows of traps", h?.trapRows ?? 2, { step: 1 })}${numField("trapCols", "Traps per row", h?.trapCols ?? 6, { step: 1 })}</div>
    ${lawNote("Place traps at fixed points once (e.g. every 10 m along each side). Scores keep their place on the plan week to week.")}
  </form>`);
  const es = entrySheet({ title: h ? h.name : "Add a house", body, label: h ? "Save house" : "Add house", missing: (v) => (!v.name ? "Add the house name" : null),
    save(v, sh) { saveHouse(snap, { ...v, system: +v.system }, h); sh.close(true, { force: true }); toast(h ? `${v.name} saved` : `${v.name} added`); } });
  const paint = () => { const v = es.form.values(); const ok = codeOk(v.producerCode, v.system); body.querySelector("[data-range]").hidden = !["0", "1"].includes(String(v.system));
    body.querySelector("[data-code]").replaceChildren(ok === "bad" ? el(warn("A producer code looks like 1UK9-0412: system digit, UK9, then your site number.")) : ok === "digit" ? el(warn(`The first digit of the code is the system: ${v.system} for ${SYSTEMS[+v.system].label.toLowerCase()}. DAERA checks the house still meets it.`)) : document.createTextNode("")); };
  es.form.onChange(paint); paint(); es.rebase();
  return es.sheet.done;
}

export function placeSheet(snap, { houseId = null } = {}) {
  const hs = snap.data.houses; if (!hs.length) { toast("Add a house first."); return null; }
  const money = canWrite(snap.role, "finance"); const hid = houseId || hs[0].id;
  const body = el(html`<form novalidate>
    ${hs.length > 1 ? chipsField("houseId", "House", hs.map((h) => [h.id, h.name]), hid) : ""}
    ${chipsField("breedStdId", "Breed standard", BREED_STANDARDS.map((b) => [b.id, b.breed]), BREED_STANDARDS[0].id, { hint: "The curve the flock is checked against. More breeds come as content." })}
    <div class="form-group" style="margin-top:12px">${dateField("placedDate", "Placed (pullets in)", snap.today)}${numField("placed", "Number of pullets", hs.find((h) => h.id === hid)?.places || "", { step: 1 })}
      ${dateField("hatchDate", "Hatch date", addDays(snap.today, -7 * 16))}
      ${textField({ name: "rearer", label: "Rearer", placeholder: "Rearing farm" })}${textField({ name: "rearerEst", label: "Rearer establishment no.", optional: true })}
      ${textField({ name: "feedSource", label: "Feed mill (UFAS)", optional: true })}</div>
    <h2 class="group-label"><span>Plan</span></h2>
    <div class="form-group">${numField("depopWk", "Depop at week of age", 76, { step: 1 })}${numField("turnaroundWeeks", "Turnaround weeks", 3, { step: 1 })}
      ${checkRow("daeraNotified", "DAERA told about this flock", false, "At least 2 weeks before it arrives (Salmonella NCP)")}
      ${money ? numField("pulletCost", "Pullet bill", "", { unit: "£", optional: true }) : ""}</div>
    <p class="ly-sumbar" data-sum></p>
  </form>`);
  const es = entrySheet({ title: "Place a flock", body, label: "Place flock", missing: (v) => (!+v.placed ? "Add the number of pullets" : !v.hatchDate ? "Add the hatch date" : null),
    save(v, sh) {
      const f0 = { hatchDate: v.hatchDate };
      const id = placeFlock(snap, { ...v, houseId: v.houseId || hid, ageAtPlacement: weekOfAge(f0, v.placedDate), plannedDepop: dateAtWeek(f0, +v.depopWk || 76), daeraNotified: v.daeraNotified ? snap.today : undefined });
      sh.close(true, { force: true }); toast(`${n0(v.placed)} pullets placed`); return id;
    } });
  const paint = () => { const v = es.form.values(); const f0 = { hatchDate: v.hatchDate }; const age = v.hatchDate && v.placedDate ? weekOfAge(f0, v.placedDate) : null;
    body.querySelector("[data-sum]").textContent = age != null ? `${age} weeks old at placing · depop week ${v.depopWk || 76} is ${dm(dateAtWeek(f0, +v.depopWk || 76))} · first boot swabs by ${dm(dateAtWeek(f0, RULES.salmonella.NI.firstByWk))}` : ""; };
  es.form.onChange(paint); paint(); es.rebase();
  return es.sheet.done;
}

/** Edit the flock's plan and passport facts (timeline markers are tapped to come here). */
export function flockSheet(snap, { id }) {
  const f = snap.data.flocks.find((x) => x.id === id); if (!f) return null;
  const body = el(html`<form novalidate><div class="form-group">
    ${dateField("plannedDepop", "Planned depop", f.plannedDepop || "")}${numField("turnaroundWeeks", "Turnaround weeks", f.turnaroundWeeks ?? 3, { step: 1 })}${dateField("nextPlacement", "Next flock placed", f.nextPlacement || "", { optional: true })}
    ${dateField("hatchDate", "Hatch date", f.hatchDate || "")}${textField({ name: "rearer", label: "Rearer", value: f.rearer || "" })}${textField({ name: "rearerEst", label: "Rearer establishment no.", value: f.rearerEst || "", optional: true })}${textField({ name: "feedSource", label: "Feed mill (UFAS)", value: f.feedSource || "", optional: true })}
    ${checkRow("depopBooked", "Depop booked (catching crew, buyer)", !!f.depopBooked)}</div>
    <p class="ly-sumbar" data-sum></p></form>`);
  const es = entrySheet({ title: "Flock plan", body, label: "Save", missing: () => null,
    save(v, sh) {
      const next = v.nextPlacement || (v.plannedDepop ? addDays(v.plannedDepop, 7 * (+v.turnaroundWeeks || 3)) : undefined);
      updateFlock(snap, f, { plannedDepop: v.plannedDepop, turnaroundWeeks: +v.turnaroundWeeks || undefined, nextPlacement: next, hatchDate: v.hatchDate, rearer: v.rearer, rearerEst: v.rearerEst, feedSource: v.feedSource, depopBooked: v.depopBooked ? f.depopBooked || snap.today : null });
      sh.close(true, { force: true }); toast("Flock plan saved");
    } });
  const paint = () => { const v = es.form.values(); body.querySelector("[data-sum]").textContent = v.plannedDepop ? `Depop week ${weekOfAge({ ...f, hatchDate: v.hatchDate }, v.plannedDepop)} · next flock ${dm(v.nextPlacement || addDays(v.plannedDepop, 7 * (+v.turnaroundWeeks || 3)))} · Salmonella samples stop at depop` : ""; };
  es.form.onChange(paint); paint(); es.rebase();
  return es.sheet.done;
}

export function depopSheet(snap, { id }) {
  const f = snap.data.flocks.find((x) => x.id === id); if (!f) return null;
  const money = canWrite(snap.role, "finance"); const alive = aliveAt(snap.c, f, snap.today, { end: true });
  const wd = (snap.data.medicines || []).filter((m) => m.flockId === f.id && m.meatOkFrom && m.meatOkFrom > snap.today).sort((a, b) => b.meatOkFrom.localeCompare(a.meatOkFrom))[0];
  const body = el(html`<form novalidate>
    ${wd ? warn(`${wd.productName}: spent hens can't go for meat until ${dm(wd.meatOkFrom)}.`) : ""}
    <div class="form-group">${dateField("date", "Depopulated", f.plannedDepop && f.plannedDepop <= snap.today ? f.plannedDepop : snap.today)}${numField("n", "Spent hens out", alive, { step: 1 })}
      ${textField({ name: "destination", label: "Going to", placeholder: "Processor or buyer" })}${textField({ name: "est", label: "Their establishment no.", optional: true })}
      ${checkRow("fci", "Food chain information sent (last Salmonella result)", false)}
      ${numField("turnaroundWeeks", "Turnaround weeks", f.turnaroundWeeks ?? 3, { step: 1 })}${dateField("nextPlacement", "Next flock placed", f.nextPlacement || "", { optional: true })}
      ${money ? numField("amount", "Spent hen cheque", "", { unit: "£", optional: true }) : ""}</div>
    ${lawNote("The house card shows the turnaround: clean-out stages, then the next flock. Keep the mite history for the clean-out plan.")}
  </form>`);
  entrySheet({ title: "Depopulate", body, label: "Save depop", missing: (v) => (!+v.n ? "Add the number of hens out" : null),
    save(v, sh) {
      if (wd && v.date < wd.meatOkFrom) { toast(`Spent hens are under withdrawal until ${dm(wd.meatOkFrom)}`); return; }
      depopFlock(snap, f, { ...v, nextPlacement: v.nextPlacement || addDays(v.date, 7 * (+v.turnaroundWeeks || 3)) });
      sh.close(true, { force: true }); toast(`${n0(v.n)} spent hens out · house now in turnaround`);
    } });
}
export { daysBetween };
