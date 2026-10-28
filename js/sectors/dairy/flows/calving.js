// Calving (design/12 §6.6): Beef's calving sheet with dairy defaults — tag within 36 hours,
// herd register 7 days, colostrum litres + time + Brix, calf destination, new lactation.
import { html } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { textField } from "../../../ui/form.js";
import { toast } from "../../../ui/toast.js";
import { todayStr } from "../../../core/dates.js";
import { cowPickRow, entrySheet, chipsField, nowHM } from "./common.js";
import { recordCalving } from "../actions.js";
import { isFemale, onFarm } from "../model/cows.js";
import { fertilityOf } from "../model/fertility.js";
import { rulesFor } from "../model/duties.js";
import { cowLabel } from "../ui.js";

export default function calvingSheet(snap, { animalId = null } = {}) {
  const R = rulesFor(snap.s);
  const row = cowPickRow(snap, { label: "Cow", ids: animalId ? [animalId] : [], filter: (a) => onFarm(a) && isFemale(a), title: "Which cow calved?", onChange: () => sire() });
  const calf = (i) => html`<div class="form-group" data-calf="${i}" ${i > 0 ? "hidden" : ""}>
    <div class="field"><span class="label" style="font-weight:700">Calf ${i + 1}</span></div>
    ${chipsField(`sex${i}`, "Sex", [["Heifer", "Heifer"], ["Bull", "Bull"]], null)}
    ${chipsField(`alive${i}`, "Born", [["yes", "Alive"], ["no", "Dead"]], "yes")}
    ${textField({ name: `tag${i}`, label: "Tag number", optional: true, placeholder: `Tag within ${R.tagHours} hours` })}
    ${chipsField(`dest${i}`, "Calf goes to", ["Rear as replacement", "Sell", "Beef calf"], "Rear as replacement")}</div>`;
  const body = el(html`<form novalidate><div class="form-group" data-cow></div>
    <div class="form-group"><div class="field"><label>Date</label><input type="date" name="date" value="${todayStr()}"></div><div class="field"><label>Time</label><input type="time" name="time" value="${nowHM()}"></div>
      ${chipsField("ease", "Calving", ["Unassisted", "Easy pull", "Hard pull", "Vet / caesarean"], "Unassisted")}
      ${chipsField("n", "Calves", [["1", "One"], ["2", "Twins"]], "1")}${textField({ name: "sireText", label: "Sire", optional: true })}</div>
    ${calf(0)}${calf(1)}
    <p class="form-label">Colostrum (first feed, aim 4 litres within 6 hours)</p>
    <div class="form-group">${textField({ name: "colL", label: "Litres", inputmode: "decimal", optional: true })}<div class="field"><label>Time fed</label><input type="time" name="colTime" value=""></div>${textField({ name: "brix", label: "Brix %", inputmode: "decimal", optional: true, placeholder: "22 or more is good" })}</div>
    <p class="hint">${R.mode === "nifais" ? `Tag within ${R.tagHours} hours and record on NIFAIS within ${R.birthNifaisDays} days.` : `Tag within ${R.tagHours} hours, enter in the herd register within ${R.birthRegisterDays} days, register on NIFAIS within ${R.birthNifaisDays} days.`} These go on your To do list.</p></form>`);
  body.querySelector("[data-cow]").appendChild(row.node);
  function sire() { const id = row.ids()[0]; const a = id && snap.ix.byId.get(id); const f = a && fertilityOf(snap.s, snap.ix, a, snap.today); const i = body.querySelector("[name=sireText]"); if (f?.lastServe?.sireText && !i.value) i.value = f.lastServe.sireText; }
  sire();
  const es = entrySheet({ title: "Calving", body, label: "Save calving",
    missing: (v) => (!row.ids().length ? "Choose the cow to save" : !v.sex0 || (v.n === "2" && !v.sex1) ? "Choose each calf's sex" : null),
    save(v, sh) {
      const n = v.n === "2" ? 2 : 1; const calves = [];
      for (let i = 0; i < n; i++) calves.push({ sex: v[`sex${i}`], alive: v[`alive${i}`] !== "no", tag: v[`tag${i}`], destination: v[`dest${i}`], breed: "" });
      recordCalving(snap, { damId: row.ids()[0], date: v.date, time: v.time, ease: v.ease, sireText: v.sireText, calves, colostrum: v.colL || v.colTime || v.brix ? { litres: v.colL, time: v.colTime, brix: v.brix } : null });
      sh.close(true, { force: true }); toast(`Calving saved for ${cowLabel(snap.ix.byId.get(row.ids()[0]))}. New lactation started — fresh cow checks for 21 days.`);
    } });
  es.form.onChange(() => { body.querySelector('[data-calf="1"]').hidden = es.form.values().n !== "2"; });
  return es.sheet.done;
}
