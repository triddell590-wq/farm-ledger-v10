// Small entry sheets: move to a field, death, dead lamb, rams in/out, weaning count, cull check,
// vet operations, feed deliveries, lost tags (design/11 §6.4, §6.7, §6.9, §9).
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { toast } from "../../../ui/toast.js";
import { textField, chipGroup, checkRow, selectField, segmented } from "../../../ui/form.js";
import { todayStr, daysBetween } from "../../../core/dates.js";
import { entrySheet, mobPickRow, chipsField, opt, bigStepper, short, num } from "../ui.js";
import { DEATH_CAUSES, LAMB_AGES } from "../model/lambing.js";
import { CULL_REASONS } from "../model/selling.js";
import { activeMobs } from "../model/mobs.js";
import * as A from "../actions.js";
import { photoStrip } from "../../../ui/photo-strip.js";

const fieldOptions = (snap) => [...new Set([...snap.fields.map((f) => f.name).filter(Boolean), ...activeMobs(snap.data).map((m) => m.fieldName).filter(Boolean)])];

export function fieldMoveSheet(snap, { mob = null } = {}) {
  const names = fieldOptions(snap);
  const body = el(html`<form novalidate><div class="form-group" data-mob></div>
    ${names.length ? chipsField("To field", chipGroup("pick", opt(names), [], { multi: false })) : ""}
    <div class="form-group">${textField({ name: "field", label: names.length ? "Or type a field name" : "To field", placeholder: "e.g. Far Hill" })}${textField({ name: "date", label: "Date", type: "date", value: todayStr() })}</div>
    <p class="hint">Moving off the farm? Use "Move off the farm" — it makes the movement document.</p></form>`);
  const mp = mobPickRow(snap, { mob }); body.querySelector("[data-mob]").append(mp.node);
  entrySheet({ title: "Move mob", body, label: "Save move", missing: (v) => (!mp.mob() ? "Choose the mob to save" : !(v.field || v.pick) ? "Choose the field" : null),
    save: (v, sh) => { const to = v.field || v.pick; A.moveField(snap.lid, [mp.mob().id], to, v.date, mp.mob().fieldName); sh.close(true, { force: true }); toast(`${mp.mob().name} moved to ${to}`); } });
}

export function deathSheet(snap, { mob = null, sheep = null } = {}) {
  const causes = ["Twin lamb", "Prolapse", "Mastitis", "Pneumonia", "Fluke", "Clostridial", "Misadventure", "Unknown", "Other"];
  const body = el(html`<form novalidate><div class="form-group" data-mob></div>
    <div class="form-group">${textField({ name: "number", label: "How many", inputmode: "numeric", value: "1" })}${textField({ name: "tag", label: "Tag", optional: true, value: sheep?.tag || "" })}${textField({ name: "date", label: "Date", type: "date", value: todayStr() })}</div>
    ${chipsField("Cause", chipGroup("cause", opt(causes), [], { multi: false }))}
    ${checkRow("found", "Found dead at inspection")}
    ${chipsField("Age", chipGroup("age", [{ value: "under", label: "Under 18 months" }, { value: "over", label: "Over 18 months" }], [], { multi: false }))}
    <p class="hint">Over 18 months = 2 or more permanent incisors.</p>
    <div data-tse></div>
    <div class="form-group">${selectField({ name: "disposal", label: "Disposal", value: "Knackery", options: opt(["Knackery", "Fallen stock scheme collection", "Hunt kennels", "Other approved"]) })}${textField({ name: "docket", label: "Docket number", optional: true })}</div></form>`);
  const mp = mobPickRow(snap, { mob }); body.querySelector("[data-mob]").append(mp.node);
  const strip = photoStrip({ lid: snap.lid, role: snap.role, parent: { coll: "deaths", label: "Death" }, title: "Photos", hint: "Docket, carcass, tag" });
  body.appendChild(strip.node);
  const { form } = entrySheet({ title: "Death", body, label: "Save death", missing: (v) => (!mp.mob() ? "Choose the mob to save" : !v.age ? "Choose the age" : !(+v.number > 0) ? "Add how many" : null),
    save: (v, sh) => { const deathId = A.death(snap.lid, { date: v.date, mobId: mp.mob().id, mobName: mp.mob().name, number: +v.number, tag: v.tag, sheepId: sheep?.id, cause: v.cause, found: v.found, over18m: v.age === "over", tagged: true, disposal: v.disposal, docket: v.docket }); strip.commit(deathId, `Death · ${mp.mob().name}${v.tag ? " · " + v.tag : ""}`); if (sheep) A.updateSheep(snap.lid, sheep, { status: "died", offDate: v.date }); sh.close(true, { force: true }); toast(v.age === "over" ? "Death saved. Phone the TSE sampling site within 24 hours." : "Death saved"); } });
  form.onChange(() => { body.querySelector("[data-tse]").innerHTML = form.values().age === "over" ? `<div class="field-error" role="alert">${icon("alert")}<span>Phone the TSE sampling site within 24 hours.</span></div>` : ""; });
}

export function deadLambSheet(snap) {
  const body = el(html`<form novalidate>
    ${chipsField("Cause", chipGroup("cause", opt(DEATH_CAUSES), [], { multi: false }))}
    ${chipsField("Age", chipGroup("age", Object.entries(LAMB_AGES).map(([value, label]) => ({ value, label })), "<48h", { multi: false }))}
    <div class="form-group">${textField({ name: "number", label: "How many", inputmode: "numeric", value: "1" })}${textField({ name: "date", label: "Date", type: "date", value: todayStr() })}${textField({ name: "tag", label: "Tag (if tagged)", optional: true })}</div>
    <div class="form-group" data-mob></div></form>`);
  const mp = mobPickRow(snap, { label: "Mob (if tagged)" }); body.querySelector("[data-mob]").append(mp.node);
  entrySheet({ title: "Dead lamb", body, label: "Save dead lamb", missing: (v) => (!v.cause ? "Choose the cause" : null),
    save: (v, sh) => { const tagged = !!v.tag && !!mp.mob(); A.death(snap.lid, { date: v.date, lamb: true, ageBand: v.age, cause: v.cause, number: +v.number || 1, tag: v.tag, tagged, mobId: tagged ? mp.mob().id : undefined, mobName: tagged ? mp.mob().name : undefined }); sh.close(true, { force: true }); toast("Dead lamb saved"); } });
}

export function ramsSheet(snap) {
  const rin = snap.cy.actual;
  const ewes = activeMobs(snap.data).filter((m) => m.class !== "rams" && m.class !== "lambs");
  const body = el(html`<form novalidate>${segmented("what", [{ value: "in", label: "Rams in" }, { value: "out", label: "Rams out" }], rin ? "out" : "in")}
    <div class="form-group" style="margin-top:16px">${textField({ name: "date", label: "Date", type: "date", value: todayStr() })}</div>
    <div data-ewes><p class="form-label">Ewe mobs going to the ram</p>${chipGroup("mobs", ewes.map((m) => ({ value: m.id, label: `${m.name} (${num(snap.counts.get(m.id) || 0)})` })), ewes.filter((m) => ["ewes", "ewesWithLambs"].includes(m.class)).map((m) => m.id))}</div>
    <p class="hint">Rams in sets the sheep year: raddle changes every 17 days and lambing dates by colour.</p></form>`);
  const { form } = entrySheet({ title: "Rams in / out", body, label: "Save", missing: (v) => (v.what === "in" && !(v.mobs || []).length ? "Pick the ewe mobs" : null),
    save: (v, sh) => { if (v.what === "in") A.ramsIn(snap.lid, v.mobs, v.date); else A.ramsOut(snap.lid, v.date); sh.close(true, { force: true }); toast(v.what === "in" ? `Rams in ${short(v.date)}` : `Rams out ${short(v.date)}`); } });
  const upd = () => { body.querySelector("[data-ewes]").hidden = form.values().what !== "in"; };
  form.onChange(upd); upd();
}

export function weanSheet(snap, { mob = null } = {}) {
  const body = el(html`<form novalidate><div class="form-group" data-mob></div><p class="form-label">Lambs weaned</p><div data-st></div><div class="form-group">${textField({ name: "date", label: "Date", type: "date", value: todayStr() })}</div></form>`);
  const st = bigStepper({ label: "Lambs weaned", jumps: [10, 50] });
  const mp = mobPickRow(snap, { mob, label: "Lamb mob", onChange: (m) => st.set(snap.counts.get(m.id) || 0) }); body.querySelector("[data-mob]").append(mp.node); body.querySelector("[data-st]").append(st.node);
  const { refresh } = entrySheet({ title: "Weaning count", body, label: "Save weaning count", missing: () => (!mp.mob() ? "Choose the lamb mob" : !st.value() ? "Count the lambs" : null),
    save: (v, sh) => { A.wean(snap.lid, mp.mob(), st.value(), v.date); sh.close(true, { force: true }); toast(`${st.value()} lambs weaned`); } });
  st.onChange(refresh);
}

export function cullSheet(snap, { mob = null } = {}) {
  const five = ["Teeth", "Toes", "Teats (udder)", "Tumours/lumps", "Tone (BCS)"];
  const c = Object.fromEntries(CULL_REASONS.map((r) => [r, 0]));
  const body = el(html`<div><div class="form-group" data-mob></div>
    <p class="form-label">Five Ts — tap once per ewe failing</p><div class="tally" data-t>${five.map((r) => html`<button type="button" data-k="${r}"><b data-n="${r}">0</b>${r.replace("/", "/\u200b")}</button>`)}</div>
    <p class="form-label">This year's flags</p><div class="tally" data-t2>${["Empty", "Repeat lame", "Prolapse", "Mastitis", "Bad mother", "No milk"].map((r) => html`<button type="button" data-k="${r}"><b data-n="${r}">0</b>${r}</button>`)}</div>
    <p class="tally-sum" data-sum></p><div class="form-group" style="margin-top:12px">${textField({ name: "date", label: "Date", type: "date", value: todayStr() })}</div></div>`);
  const mp = mobPickRow(snap, { mob, filter: (m) => m.class !== "lambs" }); body.querySelector("[data-mob]").append(mp.node);
  const total = () => Object.values(c).reduce((a, b) => a + b, 0);
  const { refresh } = entrySheet({ title: "Cull check", body, label: "Save cull check", missing: () => (!mp.mob() ? "Choose the mob" : !total() ? "Tap a reason for each cull" : null), dirty: () => total() > 0,
    save: (v, sh) => { A.cullCheck(snap.lid, mp.mob(), Object.fromEntries(Object.entries(c).filter(([, x]) => x)), v.date); sh.close(true, { force: true }); toast(`Cull check saved: ${total()} to cull`); } });
  body.addEventListener("click", (e) => { const b = e.target.closest("[data-k]"); if (!b) return; c[b.dataset.k]++; body.querySelector(`[data-n="${b.dataset.k}"]`).textContent = c[b.dataset.k]; body.querySelector("[data-sum]").textContent = `${total()} reasons recorded`; refresh(); });
}

export function vetOpSheet(snap) {
  const body = el(html`<form novalidate><div class="form-group" data-mob></div>
    ${chipsField("Operation", chipGroup("operation", opt(["Castration", "Tail docking", "Both"]), "Both", { multi: false }))}
    ${chipsField("Method", chipGroup("method", opt(["Rubber ring", "Bloodless castrator", "Hot iron", "Other"]), "Rubber ring", { multi: false }))}
    <div class="form-group">${textField({ name: "number", label: "How many lambs", inputmode: "numeric" })}${textField({ name: "age", label: "Age (days)", inputmode: "numeric", value: "2" })}${textField({ name: "anaesthetic", label: "Anaesthetic / pain relief", optional: true })}${textField({ name: "by", label: "Done by", value: A.me() })}${textField({ name: "date", label: "Date", type: "date", value: todayStr() })}</div>
    <div data-warn></div></form>`);
  const mp = mobPickRow(snap, { label: "Mob (optional)" }); body.querySelector("[data-mob]").append(mp.node);
  const { form } = entrySheet({ title: "Castration and docking", body, label: "Save", missing: (v) => (!(+v.number > 0) ? "Add how many lambs" : null),
    save: (v, sh) => { A.vetOp(snap.lid, { ...v, mobId: mp.mob()?.id, mobName: mp.mob()?.name, ageDays: +v.age }); sh.close(true, { force: true }); toast("Saved to vet operations"); } });
  form.onChange(() => { const v = form.values(); body.querySelector("[data-warn]").innerHTML = v.method === "Rubber ring" && +v.age > 7 ? `<div class="field-error" role="alert">${icon("alert")}<span>Rubber rings are only allowed in the first week of life.</span></div>` : ""; });
}

export function feedSheet(snap) {
  const body = el(html`<form novalidate><div class="form-group">${textField({ name: "feed", label: "Feed", placeholder: "e.g. Ewe nuts 18%" })}${textField({ name: "supplier", label: "Supplier" })}${textField({ name: "batch", label: "Batch / docket", optional: true })}${textField({ name: "tonnes", label: "Tonnes", inputmode: "decimal", optional: true })}${textField({ name: "date", label: "Delivered", type: "date", value: todayStr() })}</div></form>`);
  entrySheet({ title: "Feed delivery", body, label: "Save feed record", missing: (v) => (!v.feed ? "Add the feed" : !v.supplier ? "Add the supplier" : null), save: (v, sh) => { A.feedRecord(snap.lid, v); sh.close(true, { force: true }); toast("Feed record saved"); } });
}

export function tagLostSheet(snap) {
  const body = el(html`<form novalidate><div class="form-group">${textField({ name: "tag", label: "Lost tag number", placeholder: "XI 0654321 01234" })}${textField({ name: "date", label: "Noticed", type: "date", value: todayStr() })}</div><p class="hint">NI: fit a replacement within 28 days. Red replacement tags if you can't match the number.</p><div class="form-group" data-mob></div></form>`);
  const mp = mobPickRow(snap, { label: "Mob (optional)" }); body.querySelector("[data-mob]").append(mp.node);
  entrySheet({ title: "Lost tag", body, label: "Save lost tag", missing: (v) => (!v.tag ? "Add the tag number" : null), save: (v, sh) => { A.tagLost(snap.lid, { tag: v.tag, date: v.date, mobId: mp.mob()?.id }); sh.close(true, { force: true }); toast("Saved — replacement due in 28 days"); } });
}
export function tagFittedSheet(snap, ev) {
  const body = el(html`<form novalidate><div class="form-group">${textField({ name: "newTag", label: "Replacement tag number", autofocus: true })}${textField({ name: "date", label: "Fitted", type: "date", value: todayStr() })}</div><p class="hint">Old tag: ${ev.tag}. The register shows old ↔ new.</p></form>`);
  entrySheet({ title: "Replacement fitted", body, label: "Save", missing: (v) => (!v.newTag ? "Add the new tag number" : null), save: (v, sh) => { A.tagFitted(snap.lid, ev, v.newTag, v.date); sh.close(true, { force: true }); toast("Replacement tag recorded"); } });
}
export { daysBetween, raw };
