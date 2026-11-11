// Veterinary operations (design/10 §6.10, FQAS 1.2): castration and disbudding, with
// anaesthetic and analgesic. Guard copy is "regulation as recalled — flagged for checking".
import { html } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { textField, selectField, checkRow } from "../../../ui/form.js";
import { toast } from "../../../ui/toast.js";
import { todayStr, daysBetween } from "../../../core/dates.js";
import { cattleRow, entrySheet, me, opt } from "./common.js";
import { recordVetOp } from "../actions.js";
import { photoStrip } from "../../../ui/photo-strip.js";

export const OPS = [["ring", "Castration: rubber ring"], ["burdizzo", "Castration: burdizzo"], ["surgical", "Castration: surgical"], ["disbudding", "Disbudding"], ["dehorning", "Dehorning"], ["other", "Other"]];

export default function vetOpSheet(snap, { animalIds = [] } = {}) {
  const body = el(html`<form novalidate data-sector="beef"><div class="form-group" data-who>
    ${textField({ name: "date", label: "Date", type: "date", value: todayStr() })}
    ${selectField({ name: "op", label: "Operation", value: "", options: [{ value: "", label: "Choose" }, ...OPS.map(([value, label]) => ({ value, label }))] })}
    ${textField({ name: "operator", label: "Done by", value: me() })}
    ${textField({ name: "conditions", label: "Conditions / notes", optional: true })}
    ${checkRow("anaesthetic", "Local anaesthetic used")}${checkRow("analgesic", "Pain relief (analgesic) given")}
  </div><div data-warn style="margin-top:12px"></div></form>`);
  const who = cattleRow(snap, { label: "Cattle", ids: animalIds, onChange: () => { paint(); refresh(); } });
  body.querySelector("[data-who]").prepend(who.node);
  const strip = photoStrip({ lid: snap.lid, role: snap.role, parent: { coll: "vetOps", label: "Vet operation" }, title: "Photos", hint: "Vet's note, product" });
  body.appendChild(strip.node);
  const oldest = (v) => Math.max(0, ...who.ids().map((id) => snap.ix.byId.get(id)).filter((a) => a?.dob).map((a) => daysBetween(a.dob, v.date || snap.today)));
  const { form, refresh } = entrySheet({
    title: "Vet operation", body, label: "Save operation", missing: (v) => (!who.ids().length ? "Choose the cattle to save" : !v.op ? "Choose the operation to save" : null), dirty: () => !!who.ids().length || strip.dirty(),
    save(v, sh) {
      const opId = recordVetOp(snap.lid, { date: v.date, animalIds: who.ids(), animalTags: who.ids().map((id) => snap.ix.byId.get(id)?.tag), operation: OPS.find(([k]) => k === v.op)[1], opKey: v.op, ageDays: oldest(v), operator: v.operator, conditions: v.conditions, anaesthetic: !!v.anaesthetic, analgesic: !!v.analgesic });
      strip.commit(opId, `Vet operation · ${OPS.find(([k]) => k === v.op)[1]}`);
      sh.close(true, { force: true }); toast("Operation recorded");
    },
  });
  const paint = () => {
    const v = form.values(); const age = oldest(v); const w = [];
    if (v.op === "ring" && age > 7) w.push(`Rubber rings are only for calves in their first 7 days (oldest here is ${age} days).`);
    if ((v.op === "disbudding" || v.op === "dehorning") && !v.anaesthetic) w.push("Disbudding and dehorning need a local anaesthetic.");
    body.querySelector("[data-warn]").replaceChildren(el(html`<div>${w.map((t) => html`<div class="warn-card"><span>${t} <span class="ink-2">(Rule as we understand it — check with your vet.)</span></span></div>`)}</div>`));
  };
  form.onChange(paint); paint();
}
export { opt };
