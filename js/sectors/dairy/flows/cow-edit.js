// Add / edit a cow, and take animals off the farm (sold, died, culled).
import { html } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { textField, selectField, checkRow } from "../../../ui/form.js";
import { toast } from "../../../ui/toast.js";
import { todayStr, daysBetween, addDays } from "../../../core/dates.js";
import { regionRule } from "../../../content/region-rules.js";
import { cowPickRow, entrySheet, chipsField } from "./common.js";
import { addCow, updateCow, add } from "../actions.js";
import { parseTag, DAERA_BREEDS } from "../../beef/model/tags.js";
import { ageMonths, isFemale, onFarm, cowLabel } from "../model/cows.js";
import { bvdRuleState } from "../model/content.js";
import { rulesFor } from "../model/duties.js";

const breeds = DAERA_BREEDS.map(([c, n]) => ({ value: c, label: n }));

function cowForm(a = {}) {
  return el(html`<form novalidate><div class="form-group">${textField({ name: "cowNo", label: "Cow number", value: a.cowNo ?? "", inputmode: "numeric", placeholder: "214" })}${textField({ name: "name", label: "Name", value: a.name || "", optional: true })}
    ${textField({ name: "tag", label: "Ear tag", value: a.tag || "", placeholder: "UK9 223344 0214 1" })}<div class="field"><label>Born</label><input type="date" name="dob" value="${a.dob || ""}"></div>
    ${selectField({ name: "breed", label: "Breed", value: a.breed || "HOL", options: breeds })}${chipsField("sex", "Sex", ["Female", "Bull", "Steer"], a.sex && /bull/i.test(a.sex) ? "Bull" : a.sex && /steer/i.test(a.sex) ? "Steer" : "Female")}</div>
    <p class="form-label">Milking history (cows you already have)</p>
    <div class="form-group">${textField({ name: "lactationBase", label: "Lactations before this app", value: a.lactationBase ?? "", inputmode: "numeric", optional: true })}<div class="field"><label>Last calved</label><input type="date" name="calvedDateBase" value="${a.calvedDateBase || ""}"></div>
      ${textField({ name: "marks", label: "Freeze brand / collar no.", value: a.marks || "", optional: true })}</div>
    <div class="form-group">${chipsField("sirePlan", "Sire plan", ["Sexed dairy", "Conventional dairy", "Beef sire"], a.sirePlan || null)}${checkRow("doNotBreed", "Do not breed", !!a.doNotBreed)}${checkRow("cull", "On the cull list", !!a.cull?.on)}${textField({ name: "cullReason", label: "Cull reason", value: a.cull?.reason || "", optional: true })}</div></form>`);
}
const fromForm = (v) => ({ cowNo: v.cowNo, name: v.name, tag: parseTag(v.tag)?.formatted || v.tag, dob: v.dob, breed: v.breed, sex: v.sex, lactationBase: v.lactationBase === "" ? null : +v.lactationBase, calvedDateBase: v.calvedDateBase || null, marks: v.marks, sirePlan: v.sirePlan, doNotBreed: v.doNotBreed, cull: v.cull ? { on: true, reason: v.cullReason || "" } : null });
const checkTag = (v) => (v.tag && parseTag(v.tag) && !parseTag(v.tag).valid ? `Check digit should be ${parseTag(v.tag).expected}` : null);

export function addCowSheet(snap) {
  const body = cowForm();
  return entrySheet({ title: "Add a cow", body, label: "Save cow", missing: (v) => (!v.cowNo && !v.tag ? "Add the cow number or tag" : snap.ix.byNo.has(String(v.cowNo)) ? `Cow ${v.cowNo} is already in the herd` : checkTag(v)),
    save(v, sh) { addCow(snap.lid, { ...fromForm(v), onDate: todayStr() }); sh.close(true, { force: true }); toast(`Cow ${v.cowNo || v.tag} added`); } }).sheet.done;
}
export function editCowSheet(snap, a) {
  const body = cowForm(a);
  return entrySheet({ title: "Edit cow", body, label: "Save changes", missing: (v) => (!v.cowNo && !v.tag ? "Add the cow number or tag" : v.cowNo && String(v.cowNo) !== String(a.cowNo) && snap.ix.byNo.has(String(v.cowNo)) ? `Cow ${v.cowNo} is already in the herd` : checkTag(v)),
    save(v, sh) { updateCow(snap.lid, a, fromForm(v)); sh.close(true, { force: true }); toast("Saved"); } }).sheet.done;
}

/** Off the farm: sold, died, culled. Writes movement / death records with NIFAIS jobs. */
export function offSheet(snap, { animalIds = [] } = {}) {
  const R = rulesFor(snap.s); const bvd = bvdRuleState(null, snap.today, snap.s.region); const minAge = bvd.rule?.minAgeMonths ?? Infinity;
  let repaint = null;
  const row = cowPickRow(snap, { label: "Animals", multi: true, ids: animalIds, filter: onFarm, title: "Which animals are leaving?", onChange: () => repaint && repaint() });
  const body = el(html`<form novalidate><div class="form-group" data-cow></div>
    <div class="form-group">${chipsField("why", "Why", ["Sold", "Culled to factory", "Died", "Moved to another herd of mine"], "Sold")}
      <div class="field"><label>Date</label><input type="date" name="date" value="${todayStr()}"></div>${textField({ name: "place", label: "To (mart, factory, herd no.)", optional: true })}
      <div data-death hidden>${textField({ name: "cause", label: "Cause of death", optional: true })}${textField({ name: "collector", label: "Collected by (NFSCo / knackery)", optional: true })}</div>
      ${chipsField("breeding", "Going for breeding?", [["no", "No"], ["yes", "Yes (in-calf / breeding)"]], "no")}</div>
    <div data-bvd hidden class="info-card" style="margin-top:12px"><span>${bvd.line} Source: DAERA, checked ${bvd.rule?.checkedOn || ""}.</span></div>
    <div data-stand hidden class="info-card" style="margin-top:12px"><span></span></div>
    <p class="hint">${R.mode === "nifais" ? "Record the move on NIFAIS on the day; deaths within 3 days." : `Enter in the herd register within 36 hours and notify NIFAIS within ${R.moveNifaisDays} days (deaths ${R.deathDays} days). Routes: ${R.routes}.`}</p></form>`);
  body.querySelector("[data-cow]").appendChild(row.node);
  const breedingFemales = () => row.ids().map((id) => snap.ix.byId.get(id)).filter((a) => a && isFemale(a) && (ageMonths(a, snap.today) ?? 0) >= minAge);
  const es = entrySheet({ title: "Off the farm", body, label: "Save", missing: (v) => (!row.ids().length ? "Choose the animals" : v.why !== "Died" && snap.meta.settings?.restricted?.on ? "Holding restricted — no moves off" : v.why !== "Died" && v.breeding === "yes" && bvd.inForce && snap.meta.settings?.bvdAffected && breedingFemales().length ? "BVD rules: these females can't move for breeding" : null),
    save(v, sh) {
      const ids = row.ids();
      if (v.why === "Died") for (const id of ids) { const a = snap.ix.byId.get(id); add(snap.lid, "deaths", { animalId: id, date: v.date, cause: v.cause, collector: v.collector, tse: a?.dob ? daysBetween(a.dob, v.date) / 30.4375 >= 48 : false }); }
      else add(snap.lid, "movements", { direction: "off", animalIds: ids, date: v.date, place: v.place, reason: v.why, breeding: v.breeding === "yes" });
      for (const id of ids) { const a = snap.ix.byId.get(id); if (a) updateCow(snap.lid, a, { offDate: v.date, offTo: v.why === "Died" ? "Dead" : v.place || v.why, offReason: v.why }); }
      sh.close(true, { force: true }); toast(`${ids.length} animal${ids.length > 1 ? "s" : ""} off the farm — NIFAIS job added to To do`);
    } });
  const standstill = () => { const sd = regionRule("marketStandstill", snap.s.region)?.days; if (!sd) return []; const v = es.form.values(); return row.ids().map((id) => snap.ix.byId.get(id)).filter((a) => a && a.onDate && !a.bornInHerd && daysBetween(a.onDate, v.date || snap.today) <= sd).map((a) => `${cowLabel(a)} came on ${a.onDate} — ${sd}-day standstill: no market until ${addDays(a.onDate, sd + 1)}.`); };
  const paintInfo = () => { const v = es.form.values(); body.querySelector("[data-death]").hidden = v.why !== "Died"; body.querySelector("[data-bvd]").hidden = !(v.breeding === "yes" && breedingFemales().length); const st = v.why === "Died" ? [] : standstill(); const box = body.querySelector("[data-stand]"); box.hidden = !st.length; box.firstElementChild.textContent = st.join(" "); };
  es.form.onChange(paintInfo); repaint = () => { paintInfo(); es.refresh(); };
  return es.sheet.done;
}
export default addCowSheet;
