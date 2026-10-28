// Death (design/10 §6.7): cause, found at inspection, disposal, docket. 48 months or older:
// phone the TSE sampling site within 24 hours. NIFAIS job (7 days, or 3 with NIFAIS as register).
import { html } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { textField, selectField, checkRow, fieldError } from "../../../ui/form.js";
import { toast } from "../../../ui/toast.js";
import { todayStr, addDays, shortDate } from "../../../core/dates.js";
import { cattleRow, entrySheet, opt, nowHM } from "./common.js";
import { recordDeath } from "../actions.js";
import { ageMonths, onFarm } from "../model/animals.js";
import { nifaisDays } from "../model/duties.js";
import { photoStrip } from "../../../ui/photo-strip.js";

export const CAUSES = ["Calving", "Pneumonia", "Scour", "Accident", "Old age", "Unknown", "Other"];
export const DISPOSAL = ["NFSCO collection", "Knackery", "Renderer", "TSE sampling site"];

export default function deathSheet(snap, { animalId } = {}) {
  const body = el(html`<form novalidate data-sector="beef"><div class="form-group" data-who>
    ${textField({ name: "date", label: "Date", type: "date", value: todayStr() })}
    ${textField({ name: "time", label: "Found at", type: "time", value: nowHM() })}
    ${selectField({ name: "cause", label: "Cause", value: "", options: opt([["", "Choose"], ...CAUSES.map((c) => [c])]) })}
    <div data-other hidden>${textField({ name: "causeText", label: "What happened", optional: true })}</div>
    ${checkRow("found", "Found dead at inspection", false)}
    ${selectField({ name: "disposal", label: "Carcass went to", value: "", options: opt([["", "Choose"], ...DISPOSAL.map((d) => [d])]) })}
    ${textField({ name: "docketNo", label: "Docket number", optional: true })}
  </div><div data-tse style="margin-top:12px"></div></form>`);
  const who = cattleRow(snap, { label: "Animal", multi: false, ids: animalId ? [animalId] : [], filter: onFarm, title: "Which animal died?", onChange: () => { paint(); refresh(); } });
  body.querySelector("[data-who]").prepend(who.node);
  const strip = photoStrip({ lid: snap.lid, role: snap.role, parent: { coll: "deaths", label: "Death" }, title: "Photos", hint: "Docket, carcass, tag" });
  body.appendChild(strip.node);
  const missing = (v) => (!who.ids().length ? "Choose the animal to save" : !v.cause ? "Choose the cause to save" : !v.disposal ? "Choose where the carcass went" : null);
  const { form, refresh } = entrySheet({
    title: "Record a death", body, label: "Save death", missing, dirty: () => !!who.ids().length || strip.dirty(),
    save(v, sh) {
      const a = snap.ix.byId.get(who.ids()[0]);
      const deathId = recordDeath(snap.lid, snap, { animalId: a.id, date: v.date, cause: v.cause, causeText: v.causeText, foundAtInspection: !!v.found, disposal: v.disposal, docketNo: v.docketNo });
      strip.commit(deathId, `Death · ${a.tag}`);
      sh.close(true, { force: true });
      toast(`Death recorded · notify NIFAIS by ${shortDate(addDays(v.date, nifaisDays(snap.s).death))}`);
    },
  });
  const paint = () => {
    const v = form.values(); body.querySelector("[data-other]").hidden = v.cause !== "Other";
    const a = snap.ix.byId.get(who.ids()[0]); const box = body.querySelector("[data-tse]");
    if (a && (ageMonths(a, v.date || snap.today) ?? 0) >= 48) box.replaceChildren(el(html`<div class="alert late" role="alert"><div style="flex:1"><div class="a-title">Phone the TSE sampling site within 24 hours</div><div class="a-body">This animal is 48 months or older, so it must be tested for BSE. Phone by ${v.time || "this time"} tomorrow. It's on your Today list.</div></div></div>`));
    else box.replaceChildren();
  };
  form.onChange(paint); paint();
}
export { fieldError };
