// Report a disease suspicion (design/11 §19): scab → flock Restricted until the vet's letter;
// bluetongue → holding restricted until results. Clearing needs the vet's letter date.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { toast } from "../../../ui/toast.js";
import { textField, chipGroup, checkRow } from "../../../ui/form.js";
import { todayStr } from "../../../core/dates.js";
import { entrySheet, chipsField } from "../ui.js";
import * as A from "../actions.js";
import { photoStrip } from "../../../ui/photo-strip.js";

export const DAERA_PHONE = "0300 200 7840";
export function reportSheet(snap, { disease = "scab" } = {}) {
  const body = el(html`<form novalidate>
    ${chipsField("Suspected", chipGroup("disease", [{ value: "scab", label: "Sheep scab" }, { value: "bluetongue", label: "Bluetongue" }, { value: "other", label: "Something else notifiable" }], disease, { multi: false }))}
    <div class="warn-card" style="margin:12px 0">${raw(icon("alert"))}<span>Suspected sheep scab and bluetongue must be reported to DAERA — it's an offence not to. Phone your DAERA Direct regional office (${DAERA_PHONE}).</span></div>
    <div class="form-group">${textField({ name: "date", label: "Reported on", type: "date", value: todayStr() })}${textField({ name: "ref", label: "DAERA reference", optional: true })}${textField({ name: "note", label: "Note", optional: true })}</div>
    <p class="hint">Saving marks the flock as Restricted: the movement builder is blocked until you add your vet's letter.</p></form>`);
  entrySheet({ title: "Report a disease suspicion", body, label: "Save report", missing: () => null,
    save: (v, sh) => { A.reportDisease(snap.lid, v); sh.close(true, { force: true }); toast(v.disease === "other" ? "Report saved" : "Report saved — flock restricted"); } });
}
export function clearSheet(snap, rep) {
  const body = el(html`<form novalidate><p class="t-callout" style="margin:0 4px 12px">Your vet must confirm in writing that the sheep were treated with a licensed product and all actions are done.</p>
    <div class="form-group">${textField({ name: "letterDate", label: "Date on the vet's letter", type: "date" })}${textField({ name: "vet", label: "Vet", optional: true })}</div>
    <div data-photos></div>
    ${checkRow("photo", "I have the letter (keep it with your records)", false, "Or add a photo of it above")}</form>`);
  // The vet's letter photo is kept on the disease report (saved straight away).
  let es = null;
  const strip = photoStrip({ lid: snap.lid, role: snap.role, parent: { coll: "diseaseReports", id: rep.id, label: `Vet's letter · ${rep.disease || "disease"} report` }, title: "Photo of the letter", onChange: () => es && es.refresh() });
  body.querySelector("[data-photos]").replaceWith(strip.node);
  es = entrySheet({ title: "Vet's letter", body, label: "Lift restriction", missing: (v) => (!v.letterDate ? "Add the letter's date" : !v.photo && !strip.count() ? "Photo the letter or tick that you have it" : null),
    save: (v, sh) => { A.clearDisease(snap.lid, rep, { letterDate: v.letterDate, vet: v.vet, date: todayStr(), letterPhotos: strip.count() }); sh.close(true, { force: true }); toast("Restriction lifted. History kept."); } });
  es.sheet.done.then(() => strip.destroy());
}
