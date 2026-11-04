// Visitor sign-in (design/13 §8.2). The same fields as the QR gate form, filled in by the farmer
// (FAB → Visitor) or on the visitor's own phone (screens/gate.js). Collects only Research B's
// visitor fields. Last contact with pigs "Today" / "1–2 days" tells the farmer.
import { html } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { checkRow } from "../../../ui/form.js";
import { toast } from "../../../ui/toast.js";
import { entrySheet, chipsField, nowHM, lawNote } from "./common.js";
import { addVisitor, undoAdd } from "../actions.js";

export const REASONS = ["Vet", "Feed", "Haulier", "Engineer", "Other"];
export const CONTACT = [["today", "Today"], ["1-2", "1–2 days"], ["3+", "3+ days"], ["never", "Never"]];
export const CONTACT_WORD = Object.fromEntries(CONTACT);

export function visitorFields(v = {}) {
  return html`<div class="form-group"><div class="field"><label>Name</label><input name="name" value="${v.name || ""}" autocomplete="name" placeholder="Full name"></div>
      <div class="field"><label>Company</label><input name="company" value="${v.company || ""}" autocomplete="organization" placeholder="optional"></div>
      <div class="field"><label>Vehicle reg</label><input name="vehicle" value="${v.vehicle || ""}" placeholder="optional" autocapitalize="characters"></div></div>
    <div class="form-group">${chipsField("reason", "Reason for visit", REASONS, v.reason || null)}</div>
    <div class="form-group">${chipsField("lastPigContact", "Last contact with other pigs", CONTACT, v.lastPigContact || null)}</div>
    <div class="form-group">${checkRow("readRules", "I have read the biosecurity rules", !!v.readRules)}${checkRow("bootsChanged", "Boots and overalls changed or covered", !!v.bootsChanged)}</div>`;
}
export const visitorMissing = (v) => (!v.name ? "Add the name" : !v.reason ? "Choose the reason" : !v.lastPigContact ? "When were they last with pigs?" : !v.readRules ? "Tick the biosecurity rules" : !v.bootsChanged ? "Tick boots and overalls" : null);

export function visitorSheet(snap) {
  const body = el(html`<form novalidate>${visitorFields()}<div class="form-group"><div class="field"><label>Time in</label><input type="time" name="time" value="${nowHM()}"></div></div>
    ${lawNote("Visitor records are a Red Tractor requirement (BI.2). Covered by your farm's privacy notice.")}</form>`);
  entrySheet({ title: "Visitor", body, label: "Sign them in", missing: visitorMissing,
    save(v, sh) {
      const id = addVisitor(snap, { ...v, date: snap.today }, "self");
      sh.close(true, { force: true });
      const near = v.lastPigContact === "today" || v.lastPigContact === "1-2";
      toast(near ? `${v.name}${v.company ? ` (${v.company})` : ""} was with other pigs ${v.lastPigContact === "today" ? "today" : "in the last 2 days"} — your rule is ${snap.s.downtimeH} h` : `${v.name} signed in at ${v.time || nowHM()}`, { action: "Undo", onAction: () => undoAdd(snap.lid, "visitors", id), duration: near ? 7000 : undefined });
    } });
}
