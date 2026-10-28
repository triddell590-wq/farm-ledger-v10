// Fresh cow checks, 0–21 days in milk (design/12 §3.3): daily ticks and fresh-cow diseases.
import { html } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { textField } from "../../../ui/form.js";
import { toast } from "../../../ui/toast.js";
import { todayStr } from "../../../core/dates.js";
import { cowPickRow, entrySheet, chipsField } from "./common.js";
import { add } from "../actions.js";
import { onFarm, dim } from "../model/cows.js";
import { cowLabel } from "../ui.js";

export const FRESH_EVENTS = ["Milk fever", "Ketosis", "Displaced abomasum (DA)", "Retained cleansing", "Metritis"];

export default function freshSheet(snap, { animalId = null } = {}) {
  const fresh = (a) => onFarm(a) && dim(snap.ix, a, snap.today) != null && dim(snap.ix, a, snap.today) <= 21;
  const row = cowPickRow(snap, { label: "Cow", ids: animalId ? [animalId] : [], filter: fresh, title: "Fresh cows (0–21 days in milk)" });
  const body = el(html`<form novalidate><div class="form-group" data-cow></div>
    <div class="form-group">${textField({ name: "temp", label: "Temperature °C", inputmode: "decimal", optional: true, placeholder: "38.6" })}
      ${chipsField("appetite", "Appetite", ["Good", "Off"], "Good")}${chipsField("cleansing", "Cleansing", ["Clean", "Retained"], "Clean")}
      ${chipsField("ketones", "Ketones", ["Negative", "Positive", "Not tested"], "Not tested")}${chipsField("bcs", "BCS", ["2.5", "2.75", "3", "3.25", "3.5"], null)}</div>
    <div class="form-group">${chipsField("events", "Problems today", FRESH_EVENTS, [], { multi: true })}</div>
    <div class="form-group"><div class="field"><label>Date</label><input type="date" name="date" value="${todayStr()}"></div></div></form>`);
  body.querySelector("[data-cow]").appendChild(row.node);
  return entrySheet({ title: "Fresh cow check", body, label: "Save check", missing: () => (!row.ids().length ? "Choose the cow to save" : null),
    save(v, sh) {
      const id = row.ids()[0]; const temp = parseFloat(v.temp);
      add(snap.lid, "freshChecks", { animalId: id, date: v.date, temp: Number.isNaN(temp) ? null : temp, appetite: v.appetite, cleansing: v.cleansing, ketones: v.ketones, bcs: v.bcs, events: v.events });
      sh.close(true, { force: true });
      toast(v.events.length || temp >= 39.5 || v.appetite === "Off" ? `${cowLabel(snap.ix.byId.get(id))}: check saved — ${v.events.length ? v.events.join(", ").toLowerCase() : "watch her"}; call your vet if she's not right.` : "Fresh cow check saved");
    } }).sheet.done;
}
