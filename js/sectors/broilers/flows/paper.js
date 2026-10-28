// Paperwork entry sheets (design/15 §11): Salmonella boot swabs (rules first) and result,
// medicine in water (withdrawal vs the planned catch; banned / last-resort antibiotics),
// generator / alarm tests, visitors, water tests, training certificates, the 1 June Bird Register.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { toast } from "../../../ui/toast.js";
import { openSheet } from "../../../ui/sheet.js";
import { checkRow } from "../../../ui/form.js";
import { entrySheet, chipsField, numField, textField, dateField, timeField, warn, lawNote, nowHM, houseCrop, pickHouse } from "./common.js";
import { saveSalm, salmResult, saveMedicine, saveAlarmTest, addVisitor, saveWaterTest, saveTraining, saveBirdReturn, undoAdd, me } from "../actions.js";
import { salmStatus, salmResultText, withdrawalEnd, salmPositive } from "../model/paper.js";
import { cropEvents, currentCrop, aliveEnd, cropDay } from "../model/crop.js";
import { antibioticFlag, SALM_RESULTS, regionRule } from "../model/content.js";
import { addDays } from "../model/time.js";
import { dm, n0 } from "../ui.js";

// ---- Salmonella ----
export async function salmFlow(snap, { cropId, houseId } = {}) {
  const hc = await houseCrop(snap, { cropId, houseId, title: "Boot swabs for which house?" }); if (!hc) return;
  const R = regionRule("broilerSalmonella");
  const rules = el(html`<div><div class="card pad br-rules"><b>Before you start</b><ul>
    <li>Moisten the boot swabs</li><li>Walk the whole house</li><li>No fresh litter in the ${R.noLitterDays} days before</li><li>Send to the lab the same day</li></ul></div>
    <button type="button" class="btn" data-ok style="margin-top:16px">Got it — record the sample</button></div>`);
  const sh = openSheet({ title: "Salmonella boot swabs", body: rules, size: "small" });
  rules.querySelector("[data-ok]").onclick = () => sh.close("ok", { force: true });
  if ((await sh.done) !== "ok") return;
  return salmSheet(snap, hc);
}
function salmSheet(snap, { house, crop }) {
  const st = salmStatus(snap.ix, crop, snap.s, snap.today).find((x) => !x.sample) || salmStatus(snap.ix, crop, snap.s, snap.today)[0];
  const R = regionRule("broilerSalmonella");
  const body = el(html`<form novalidate>
    ${st ? html`<p class="br-sub">${house.name} · for the ${st.ev.kind === "clear" ? "clear-out" : "thin"} ${dm(st.ev.date)} · window ${dm(st.window.from)} – ${dm(st.window.to)} · do by ${dm(st.window.doBy)}</p>` : ""}
    <div class="form-group">${dateField("date", "Sampled", snap.today)}${timeField("time", "Time", nowHM())}${numField("swabPairs", "Pairs of boot swabs", R.swabPairs, { step: "1" })}
      ${textField("sampler", "Sampled by", me())}${chipsField("lab", "Lab", snap.s.labs, snap.s.labs[0])}${dateField("sentToLab", "Sent to the lab", snap.today)}</div>
    ${lawNote(`At least ${R.swabPairs} pairs of boot swabs within ${R.windowDays} days before slaughter (${R.longWindowDays} days if slaughtered at ${R.longAgeDays} days or older, or organic). Keep results ${R.keepYears} years.`)}
  </form>`);
  const es = entrySheet({ title: `Boot swabs · ${house.name}`, body, label: "Save sample", size: "large",
    missing: (v) => (!v.date ? "Add the date" : !(+v.swabPairs >= R.swabPairs) ? `At least ${R.swabPairs} pairs` : !v.lab ? "Choose the lab" : null),
    save(v, sh2) { const id = saveSalm(snap, crop, { ...v, sentToLabAt: v.sentToLab }, st?.ev); sh2.close(true, { force: true }); toast(`Sample saved · result due from ${v.lab}`, { action: "Undo", onAction: () => undoAdd(snap.lid, "salmSamples", id) }); } });
  return es.sheet.done;
}
export function salmResultFlow(snap, { sampleId }) {
  const smp = (snap.data.salmSamples || []).find((x) => x.id === sampleId); if (!smp) return;
  const body = el(html`<form novalidate><div class="form-group">${chipsField("result", "Result", SALM_RESULTS.filter(([k]) => k !== "pending"), smp.result !== "pending" ? smp.result : null)}${dateField("date", "Result date", snap.today)}</div>
    <div data-pos></div></form>`);
  const es = entrySheet({ title: `Result · sampled ${dm(smp.date)}`, body, label: "Save result", size: "large", missing: (v) => (!v.result ? "Choose the result" : null),
    save(v, sh) { salmResult(snap, smp, v.result, v.date); sh.close(true, { force: true }); toast(salmPositive({ result: v.result }) ? "Positive recorded — tell the processor; C&D must be checked before restocking" : `Result saved · ${salmResultText(v.result)}`); } });
  es.form.onChange(() => { const r = es.form.values().result; body.querySelector("[data-pos]").innerHTML = salmPositive({ result: r }) ? `<div class="warn-card late" style="margin-top:12px"><span>Positive: the processor must be told; clean and check the house before restocking.</span></div>` : ""; });
  return es.sheet.done;
}

// ---- medicine in water ----
export async function medicineFlow(snap, { houseId, cropId } = {}) {
  const hc = await houseCrop(snap, { houseId, cropId, title: "Treat which house?" }); if (!hc) return;
  const { house, crop } = hc;
  const products = (snap.store || []).filter((p) => !p.deleted && (!p.species || /poultry|chicken|bird/i.test(p.species)));
  const next = cropEvents(snap.ix, crop, snap.s).find((e) => !e.done);
  const body = el(html`<form novalidate>
    <p class="br-sub">${house.name} · day ${cropDay(crop, snap.today)} · ${n0(aliveEnd(snap.ix, crop, snap.today))} birds · in the water</p>
    <div class="form-group">${textField("product", "Product", "")}${products.length ? chipsField("pick", "From the medicine store", products.slice(0, 8).map((p) => [p.id, p.name]), null) : ""}
      ${textField("active", "Active substance", "", { optional: true })}${textField("reason", "Reason", "")}${dateField("date", "First day", snap.today)}${numField("days", "Days in the water", 1, { step: "1" })}
      ${textField("dose", "Dose", "", { optional: true, placeholder: "e.g. 1 ml per litre" })}${numField("wdDays", "Meat withdrawal", "", { step: "1", unit: "days" })}${textField("vet", "Prescribing vet", snap.s.vetName || "", { optional: true })}</div>
    <div data-flag></div>
  </form>`);
  const flagOf = (v) => antibioticFlag(`${v.product} ${v.active}`);
  const paint = (v) => {
    const f = flagOf(v); const end = v.date ? withdrawalEnd({ date: v.date, days: +v.days || 1, wdDays: +v.wdDays || 0 }) : null;
    body.querySelector("[data-flag]").innerHTML = `${f ? `<div class="warn-card ${f.level}" style="margin-top:12px"><span>${f.text}</span></div>${f.level === "due" ? `<div class="form-group" style="margin-top:12px"><div class="field"><label>Vet's last-resort reason</label><input name="vetReason" value="${body.querySelector("[name=vetReason]")?.value || ""}"></div></div>` : ""}` : ""}
      ${end && v.wdDays !== "" ? `<div class="br-sum"><div>Withdrawal ends <b>${dm(end)}</b></div>${next ? `<div>${end > next.date ? `<span class="warn">After the planned ${next.kind === "clear" ? "clear-out" : "thin"} ${dm(next.date)} — the birds can't go until it ends. Talk to your vet and the processor.</span>` : `Before the ${next.kind === "clear" ? "clear-out" : "thin"} ${dm(next.date)} ✓`}</div>` : ""}</div>` : ""}`;
  };
  let lastFlag = "";
  const es = entrySheet({ title: `Medicine in water · ${house.name}`, body, label: "Save treatment", size: "large",
    missing: (v) => { const f = flagOf(v); if (!v.product) return "Add the product"; if (v.wdDays === "") return "Add the withdrawal days (0 if none)"; if (f?.level === "late") return "Not allowed under Red Tractor"; if (f?.level === "due" && !body.querySelector("[name=vetReason]")?.value) return "Add the vet's reason"; return null; },
    save(v, sh) {
      const id = saveMedicine(snap, crop, { ...v, vetReason: body.querySelector("[name=vetReason]")?.value });
      sh.close(true, { force: true }); toast(`Treatment saved · withdrawal ends ${dm(withdrawalEnd({ date: v.date, days: +v.days || 1, wdDays: +v.wdDays || 0 }))}`, { action: "Undo", onAction: () => undoAdd(snap.lid, "medicines", id) });
    } });
  es.form.onChange((name) => {
    const v = es.form.values();
    if (name === "pick" && v.pick) { const p = products.find((x) => x.id === v.pick); if (p) { body.querySelector("[name=product]").value = p.name; if (p.active) body.querySelector("[name=active]").value = p.active; if (p.wdMeat != null) body.querySelector("[name=wdDays]").value = p.wdMeat; } }
    const key = `${flagOf(es.form.values())?.level}|${v.date}|${v.days}|${v.wdDays}`; if (key !== lastFlag || name !== "vetReason") { if (name !== "vetReason") paint(es.form.values()); lastFlag = key; }
    es.refresh();
  });
  paint(es.form.values()); es.rebase();
  return es.sheet.done;
}

// ---- generator / alarm tests (weekly, Red Tractor; back-up and alarm every 7 days) ----
export function alarmFlow(snap, { kind } = {}) {
  const body = el(html`<form novalidate>
    <div class="form-group">${chipsField("kind", "Test", [["generator", "Generator on load"], ["alarm", "Alarm"], ["both", "Both"]], kind || "both")}
      ${chipsField("ok", "Result", [["yes", "Worked ✓"], ["no", "Did not work"]], null)}
      ${numField("onLoadMinutes", "Generator ran on load", "", { unit: "min", optional: true })}</div>
    <div class="form-group" data-what hidden>${textField("action", "What did you do?", "", { placeholder: "e.g. engineer called" })}</div>
    <div class="form-group">${dateField("date", "Date", snap.today)}${timeField("time", "Time", nowHM())}${textField("by", "Tested by", me())}</div>
    ${lawNote("Test the generator on load and the alarms every week (Red Tractor). Where ventilation is mechanical the alarm and back-up must be tested at least every 7 days.")}
  </form>`);
  const es = entrySheet({ title: "Generator and alarm test", body, label: "Save test", size: "large",
    missing: (v) => (!v.ok ? "Did it work?" : v.ok === "no" && !v.action ? "Say what you did" : null),
    save(v, sh) { const id = saveAlarmTest(snap, { ...v, ok: v.ok === "yes", houseIds: snap.ix.houses.map((h) => h.id) }); sh.close(true, { force: true }); toast(v.ok === "yes" ? `Test saved · next due ${dm(addDays(v.date, 7))}` : "Saved — test again once it's fixed", { action: "Undo", onAction: () => undoAdd(snap.lid, "alarmTests", id) }); } });
  es.form.onChange(() => { body.querySelector("[data-what]").hidden = es.form.values().ok !== "no"; });
  return es.sheet.done;
}

export function visitorFlow(snap) {
  const body = el(html`<form novalidate><div class="form-group">${textField("name", "Name", "")}${textField("company", "Company", "", { optional: true })}${textField("reason", "Reason", "", { placeholder: "e.g. feed rep, catching crew, vet" })}
    ${dateField("lastPoultryContact", "Last contact with other poultry", "")}${textField("vehicle", "Vehicle reg.", "", { optional: true })}${timeField("time", "Time in", nowHM())}</div>
    <div class="form-group">${checkRow("readRules", "Read the biosecurity rules", true)}${checkRow("bootsChanged", "Boots and overalls changed", true)}</div></form>`);
  const es = entrySheet({ title: "Visitor", body, label: "Save visitor", size: "large", missing: (v) => (!v.name ? "Add the visitor's name" : null),
    save(v, sh) { const id = addVisitor(snap, v); sh.close(true, { force: true }); toast(`${v.name} signed in`, { action: "Undo", onAction: () => undoAdd(snap.lid, "visitors", id) }); } });
  return es.sheet.done;
}
export function waterTestFlow(snap) {
  const body = el(html`<form novalidate><div class="form-group">${dateField("date", "Sampled", snap.today)}${textField("lab", "Lab", "")}${chipsField("result", "Result", [["pass", "Pass"], ["fail", "Fail"], ["pending", "Waiting"]], "pending")}${textField("note", "Note", "", { optional: true })}</div>
    ${lawNote("Red Tractor: water not from the mains must be tested every 6 months.")}</form>`);
  const es = entrySheet({ title: "Water test", body, label: "Save water test", size: "large", missing: (v) => (!v.date ? "Add the date" : null),
    save(v, sh) { saveWaterTest(snap, v); sh.close(true, { force: true }); toast("Water test saved"); } });
  return es.sheet.done;
}
export function trainingFlow(snap) {
  const body = el(html`<form novalidate><div class="form-group">${textField("person", "Person", me())}${chipsField("course", "Course", ["Meat chicken welfare certificate", "Induction", "Medicines", "Catching", "Other"], "Meat chicken welfare certificate")}${dateField("date", "Date", "")}${dateField("expires", "Expires", "")}${textField("ref", "Certificate no.", "", { optional: true })}</div>
    ${lawNote("The keeper must hold a DAERA-recognised meat chicken welfare certificate (Sch. 5 para 2).")}</form>`);
  const es = entrySheet({ title: "Training record", body, label: "Save training", size: "large", missing: (v) => (!v.person ? "Add the person" : !v.course ? "Choose the course" : null),
    save(v, sh) { saveTraining(snap, v); sh.close(true, { force: true }); toast("Training saved"); } });
  return es.sheet.done;
}
/** 1 June NI Bird Register return (design/15 §21). */
export function birdReturnFlow(snap, { year, birds, byHouse, establishmentNo } = {}) {
  const body = el(html`<form novalidate><div class="form-group">${textField("establishmentNo", "Establishment number", establishmentNo || snap.s.establishmentNo || "")}${numField("birds", "Birds on 1 June", birds ?? 0, { step: "1" })}${dateField("submittedOn", "Sent on", snap.today)}</div></form>`);
  const es = entrySheet({ title: `Bird Register · 1 June ${year}`, body, label: "Mark as sent", size: "small", missing: (v) => (!v.submittedOn ? "Add the date sent" : null),
    save(v, sh) { saveBirdReturn(snap, { ...v, year, countDate: `${year}-06-01`, byHouse }); sh.close(true, { force: true }); toast("Bird Register return recorded"); } });
  return es.sheet.done;
}
export { raw, icon, warn, pickHouse, currentCrop };
