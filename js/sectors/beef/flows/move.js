// Internal moves (design/10 §6.6): to a management group / shed / field. No NIFAIS. Housing
// is a move to a shed with a date (sets the housed date used for the NAP housing period).
// Also: add or edit a group.
import { html } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { textField, selectField } from "../../../ui/form.js";
import { toast } from "../../../ui/toast.js";
import { todayStr } from "../../../core/dates.js";
import { cattleRow, entrySheet, opt } from "./common.js";
import { recordMove, addGroup, softDelete } from "../actions.js";
import { updateRecord } from "../../../services/records.js";
import { CLASS_NAMES } from "../model/animals.js";

export default function moveSheet(snap, { animalIds = [], housing = false } = {}) {
  const groups = [...snap.ix.groups.values()];
  const body = el(html`<form novalidate data-sector="beef"><div class="form-group" data-who>
    ${selectField({ name: "groupId", label: housing ? "Into shed / group" : "To group", value: groups[0]?.id || "__new", options: [...groups.map((g) => ({ value: g.id, label: `${g.name}${g.shed ? ` · ${g.shed}` : ""}` })), { value: "__new", label: "+ New group" }] })}
    <div data-new ${groups.length ? "hidden" : ""}>${textField({ name: "newName", label: "Group name", placeholder: housing ? "e.g. Shed 2 finishers" : "e.g. Far Hill cows" })}</div>
    ${textField({ name: "date", label: housing ? "Housed on" : "Date", type: "date", value: todayStr() })}
    ${textField({ name: "note", label: "Note", optional: true })}
  </div><p class="hint">${housing ? "Housing dates set the slurry storage period on the farm." : "Moves between your own groups and fields don't need a NIFAIS notification."}</p></form>`);
  const who = cattleRow(snap, { label: "Cattle", ids: animalIds, onChange: () => refresh() });
  body.querySelector("[data-who]").prepend(who.node);
  const missing = (v) => (!who.ids().length ? "Choose the cattle to save" : v.groupId === "__new" && !v.newName ? "Name the group to save" : null);
  const { form, refresh } = entrySheet({
    title: housing ? "Housing" : "Move", body, label: housing ? "Save housing" : "Save move", missing, dirty: () => !!who.ids().length,
    save(v, sh) {
      let gid = v.groupId;
      if (gid === "__new") { gid = addGroup(snap.lid, { name: v.newName, shed: housing ? v.newName : "" }); snap.ix.groups.set(gid, { id: gid, name: v.newName }); }
      recordMove(snap.lid, snap, { animalIds: who.ids(), groupId: gid, date: v.date, housing, note: v.note });
      sh.close(true, { force: true }); toast(`${who.ids().length} moved to ${snap.ix.groups.get(gid)?.name || v.newName}`);
    },
  });
  form.onChange((n) => { if (n === "groupId") body.querySelector("[data-new]").hidden = form.values().groupId !== "__new"; });
}
export const housingSheet = (snap, o = {}) => moveSheet(snap, { ...o, housing: true });

/** Add / edit a management group. */
export function groupSheet(snap, g = null) {
  const body = el(html`<form novalidate data-sector="beef"><div class="form-group">
    ${textField({ name: "name", label: "Name", value: g?.name || "", placeholder: "e.g. Shed 2 finishers" })}
    ${selectField({ name: "cls", label: "Kind of cattle", value: g?.class || "", options: opt([["", "Mixed / work it out"], ...Object.entries(CLASS_NAMES).map(([k, v]) => [k, v])]) })}
    ${textField({ name: "shed", label: "Shed or field", value: g?.shed || "", optional: true })}
    ${textField({ name: "spaces", label: "Spaces", value: g?.spaces || "", inputmode: "numeric", optional: true })}
  </div><p class="hint">Putting cattle in a “Finishing” group shows their BCRS and spec deadlines in the finishing planner.</p></form>`);
  entrySheet({
    title: g ? "Edit group" : "New group", body, label: "Save group", missing: (v) => (!v.name ? "Name the group to save" : null),
    save(v, sh) {
      const data = { name: v.name, class: v.cls || null, shed: v.shed, spaces: +v.spaces || null };
      if (g) updateRecord(snap.lid, "groups", g, data); else addGroup(snap.lid, { name: v.name, cls: v.cls, shed: v.shed });
      sh.close(true, { force: true }); toast("Group saved");
    },
  });
}
export const removeGroup = (snap, g) => softDelete(snap.lid, "groups", g.id);
