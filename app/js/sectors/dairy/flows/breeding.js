// Seen bulling / Served / PD (design/12 §6.2, §5.1). One tap from the fertility list opens these
// with the cow already chosen.
import { html } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { textField, selectField } from "../../../ui/form.js";
import { toast } from "../../../ui/toast.js";
import { todayStr, addDays } from "../../../core/dates.js";
import { cowPickRow, entrySheet, chipsField, nowHM } from "./common.js";
import { recordHeats, recordServe, recordPd, addStraw, me } from "../actions.js";
import { strawsLeft, dm } from "../model/fertility.js";
import { isFemale, onFarm } from "../model/cows.js";
import { cowLabel } from "../ui.js";
import { DAERA_BREEDS } from "../../beef/model/tags.js";

const females = (a) => onFarm(a) && isFemale(a);

export function heatSheet(snap, { animalIds = [] } = {}) {
  const row = cowPickRow(snap, { label: "Cows", multi: true, ids: animalIds, filter: females, title: "Which cows were bulling?" });
  const body = el(html`<form novalidate><div class="form-group" data-cow></div>
    <div class="form-group"><div class="field"><label>Date</label><input type="date" name="date" value="${todayStr()}"></div><div class="field"><label>Time</label><input type="time" name="time" value="${nowHM()}"></div></div>
    <div class="form-group">${chipsField("sign", "Sign", [["standing", "Standing to be mounted"], ["mounting", "Mounting others"], ["activity", "Activity alert (collar)"]], "standing")}</div></form>`);
  body.querySelector("[data-cow]").appendChild(row.node);
  return entrySheet({ title: "Seen bulling", body, label: "Save", missing: () => (!row.ids().length ? "Choose the cows to save" : null),
    save(v, sh) { recordHeats(snap.lid, row.ids(), v); sh.close(true, { force: true }); toast(`${row.ids().length > 1 ? row.ids().length + " cows" : cowLabel(snap.ix.byId.get(row.ids()[0]))} seen bulling — serve 12 hours after standing heat`); } }).sheet.done;
}

export function serveSheet(snap, { animalId = null } = {}) {
  const straws = strawsLeft(snap.data.straws, snap.data.services).filter((x) => x.left > 0);
  const row = cowPickRow(snap, { label: "Cow", ids: animalId ? [animalId] : [], filter: females, title: "Which cow was served?" });
  const sirePlan = animalId ? snap.ix.byId.get(animalId)?.sirePlan : null;
  const body = el(html`<form novalidate><div class="form-group" data-cow></div>
    ${sirePlan ? html`<p class="hint">Sire plan for this cow: ${sirePlan}</p>` : ""}
    <div class="form-group">${selectField({ name: "strawId", label: "Sire", value: "", options: [{ value: "", label: "Choose…" }, ...straws.map((s) => ({ value: s.id, label: `${s.bull}${s.sexed ? " (sexed)" : ""} · ${s.left} left` })), { value: "__bull", label: "Stock bull" }, { value: "__new", label: "Another sire…" }] })}
      <div data-new hidden>${textField({ name: "sireText", label: "Sire name / code" })}${selectField({ name: "sireBreed", label: "Sire breed", value: "HOL", options: DAERA_BREEDS.map(([c, n]) => ({ value: c, label: n })) })}${chipsField("sexed", "Semen", [["conv", "Conventional"], ["sexed", "Sexed"]], "conv")}</div></div>
    <div class="form-group">${chipsField("technician", "Served by", [["self", "Me (DIY AI)"], ["AI company", "AI company"], ["bull", "Bull"]], "self")}
      <div class="field"><label>Date</label><input type="date" name="date" value="${todayStr()}"></div><div class="field"><label>Time</label><input type="time" name="time" value="${nowHM()}"></div></div></form>`);
  body.querySelector("[data-cow]").appendChild(row.node);
  body.querySelector("[name=strawId]").addEventListener("change", (e) => { body.querySelector("[data-new]").hidden = e.target.value !== "__new"; });
  return entrySheet({ title: "Served", body, label: "Save serve", missing: (v) => (!row.ids().length ? "Choose the cow to save" : !v.strawId ? "Choose the sire to save" : v.strawId === "__new" && !v.sireText ? "Add the sire to save" : null),
    save(v, sh) {
      const st = straws.find((x) => x.id === v.strawId);
      const sire = st ? { strawId: st.id, sireText: st.bull, sireBreed: st.breed, sexed: st.sexed } : v.strawId === "__bull" ? { sireText: "Stock bull", sireBreed: "", kind: "bull" } : { sireText: v.sireText, sireBreed: v.sireBreed, sexed: v.sexed === "sexed" };
      recordServe(snap, { animalId: row.ids()[0], date: v.date, time: v.time, technician: v.technician === "self" ? me() : v.technician, kind: v.strawId === "__bull" ? "bull" : "AI", ...sire });
      sh.close(true, { force: true });
      toast(`Served. Due to repeat ${dm(addDays(v.date, 18))}–${dm(addDays(v.date, 24))}${st ? ` · ${st.left - 1} straws of ${st.bull} left` : ""}`);
    } }).sheet.done;
}

export function pdSheet(snap, { animalId = null, result = null } = {}) {
  const row = cowPickRow(snap, { label: "Cow", ids: animalId ? [animalId] : [], filter: females, title: "Which cow?" });
  const body = el(html`<form novalidate><div class="form-group" data-cow></div>
    <div class="form-group">${chipsField("result", "Result", [["+", "In calf (PD+)"], ["-", "Empty (PD−)"], ["recheck", "Recheck"]], result)}
      ${textField({ name: "daysPregnant", label: "Days pregnant", optional: true, inputmode: "numeric" })}${textField({ name: "vet", label: "Vet / scanner", optional: true })}
      <div class="field"><label>Date</label><input type="date" name="date" value="${todayStr()}"></div></div></form>`);
  body.querySelector("[data-cow]").appendChild(row.node);
  return entrySheet({ title: "PD result", body, label: "Save PD", missing: (v) => (!row.ids().length ? "Choose the cow to save" : !v.result ? "Choose the result to save" : null),
    save(v, sh) { recordPd(snap.lid, { ...v, animalId: row.ids()[0] }); sh.close(true, { force: true }); toast(v.result === "+" ? "PD+ saved — calving and dry-off dates worked out" : v.result === "-" ? "PD− saved — she's back on the heats list" : "Recheck saved"); } }).sheet.done;
}

/** Straw inventory: add a bull. */
export function strawSheet(snap) {
  const body = el(html`<form novalidate><div class="form-group">${textField({ name: "bull", label: "Bull", placeholder: "Peak Altamont" })}${textField({ name: "code", label: "Code", optional: true })}
    ${selectField({ name: "breed", label: "Breed", value: "HOL", options: DAERA_BREEDS.map(([c, n]) => ({ value: c, label: n })) })}${textField({ name: "count", label: "Straws", inputmode: "numeric" })}
    ${chipsField("sexed", "Semen", [["conv", "Conventional"], ["sexed", "Sexed"]], "conv")}</div></form>`);
  return entrySheet({ title: "Add straws", body, label: "Save straws", missing: (v) => (!v.bull ? "Add the bull to save" : !+v.count ? "Add the number of straws" : null),
    save(v, sh) { addStraw(snap.lid, { ...v, sexed: v.sexed === "sexed" }); sh.close(true, { force: true }); toast("Straws added"); } }).sheet.done;
}
export default heatSheet;
