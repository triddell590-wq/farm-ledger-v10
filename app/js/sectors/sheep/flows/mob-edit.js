// Mobs: new, edit, count check (dated, reason required), split, merge, add an individual sheep
// (design/11 §5.1). Counts are never typed over — a count check is a dated record.
import { html } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { toast } from "../../../ui/toast.js";
import { textField, chipGroup, selectField } from "../../../ui/form.js";
import { todayStr } from "../../../core/dates.js";
import { go } from "../../../core/router.js";
import { entrySheet, mobPickRow, chipsField, opt, bigStepper, num } from "../ui.js";
import { CLASSES, activeMobs } from "../model/mobs.js";
import * as A from "../actions.js";

const classOpts = Object.entries(CLASSES).map(([value, label]) => ({ value, label }));
const years = (v) => String(v || "").split(/[\s,]+/).map((x) => +x).filter((x) => x > 1990 && x < 2100);

export function newMobSheet(snap) {
  const y = +snap.today.slice(0, 4);
  const body = el(html`<form novalidate><div class="form-group">${textField({ name: "name", label: "Mob name", placeholder: `Mule ewes ${y - 4}`, autofocus: true })}</div>
    ${chipsField("What's in it", chipGroup("cls", classOpts, "ewes", { multi: false }))}
    <p class="form-label">How many</p><div data-st></div>
    <div class="form-group">${textField({ name: "breed", label: "Breed", optional: true, placeholder: "e.g. Mule, Texel ×" })}${textField({ name: "years", label: "Born in (years)", optional: true, placeholder: `${y - 4}` })}${textField({ name: "field", label: "Field", optional: true })}${textField({ name: "date", label: "Counted on", type: "date", value: todayStr() })}</div></form>`);
  const st = bigStepper({ label: "How many", jumps: [10, 50] }); body.querySelector("[data-st]").append(st.node);
  const { refresh } = entrySheet({ title: "New mob", body, label: "Add mob", missing: (v) => (!v.name ? "Name the mob to save" : null),
    save: (v, sh) => { const id = A.createMob(snap.lid, { name: v.name, cls: v.cls, breed: v.breed, birthYears: years(v.years), fieldName: v.field, count: st.value(), date: v.date }); sh.close(true, { force: true }); toast(`${v.name} added (${st.value()})`); return id; } });
  st.onChange(refresh);
}
export function editMobSheet(snap, mob) {
  const body = el(html`<form novalidate><div class="form-group">${textField({ name: "name", label: "Mob name", value: mob.name })}</div>
    ${chipsField("What's in it", chipGroup("cls", classOpts, mob.class, { multi: false }))}
    <div class="form-group">${textField({ name: "breed", label: "Breed", optional: true, value: mob.breed || "" })}${textField({ name: "years", label: "Born in (years)", optional: true, value: (mob.birthYears || []).join(", ") })}${textField({ name: "note", label: "Note", optional: true, value: mob.note || "" })}</div></form>`);
  entrySheet({ title: "Edit mob", body, label: "Save", missing: (v) => (!v.name ? "Name the mob" : null), save: (v, sh) => { A.updateMob(snap.lid, mob, { name: v.name, class: v.cls, breed: v.breed, birthYears: years(v.years), note: v.note }); sh.close(true, { force: true }); toast("Mob saved"); } });
}
export function countCheckSheet(snap, mob) {
  const cur = snap.counts.get(mob.id) || 0;
  const body = el(html`<form novalidate><p class="t-callout ink-2" style="margin:0 4px 8px">The ledger says ${num(cur)}. Count them and put in what you found — the register keeps the trail.</p><div data-st></div>
    ${chipsField("Why it's different", chipGroup("reason", opt(["Miscount", "Strayed", "Found", "Other"]), [], { multi: false }))}
    <div class="form-group">${textField({ name: "date", label: "Counted on", type: "date", value: todayStr() })}</div></form>`);
  const st = bigStepper({ value: cur, label: "Counted", jumps: [5, 10] }); body.querySelector("[data-st]").append(st.node);
  const { refresh } = entrySheet({ title: `Count check · ${mob.name}`, body, label: "Save count check", missing: (v) => (st.value() !== cur && !v.reason ? "Say why it's different" : null),
    save: (v, sh) => { A.countCheck(snap.lid, mob, st.value(), v.reason || "Confirmed", v.date); sh.close(true, { force: true }); toast(`Count check saved: ${st.value()}`); } });
  st.onChange(refresh);
}
export function splitSheet(snap, mob) {
  const others = activeMobs(snap.data).filter((m) => m.id !== mob.id);
  const body = el(html`<form novalidate><p class="form-label">How many to move out</p><div data-st></div>
    <div class="form-group">${selectField({ name: "to", label: "Into", value: "_new", options: [{ value: "_new", label: "A new mob" }, ...others.map((m) => ({ value: m.id, label: m.name }))] })}${textField({ name: "name", label: "New mob name", value: `${mob.name} – split` })}${textField({ name: "date", label: "Date", type: "date", value: todayStr() })}</div></form>`);
  const max = snap.counts.get(mob.id) || 0;
  const st = bigStepper({ label: "How many", max, jumps: [5, 10] }); body.querySelector("[data-st]").append(st.node);
  const { refresh } = entrySheet({ title: `Split ${mob.name}`, body, label: "Split mob", missing: (v) => (!st.value() ? "Add how many" : v.to === "_new" && !v.name ? "Name the new mob" : null),
    save: (v, sh) => { const to = v.to === "_new" ? A.createMob(snap.lid, { name: v.name, cls: mob.class, breed: mob.breed, birthYears: mob.birthYears, fieldName: mob.fieldName, count: 0, date: v.date }) : v.to; A.splitMob(snap.lid, mob, st.value(), to, v.date); sh.close(true, { force: true }); toast(`${st.value()} moved out of ${mob.name}`); } });
  st.onChange(refresh);
}
export function mergeSheet(snap, mob) {
  const body = el(html`<form novalidate><div class="form-group" data-mob></div><p class="hint">All ${num(snap.counts.get(mob.id) || 0)} in ${mob.name} join the other mob. ${mob.name} is closed; its history stays.</p><div class="form-group">${textField({ name: "date", label: "Date", type: "date", value: todayStr() })}</div></form>`);
  const mp = mobPickRow(snap, { label: "Merge into", filter: (m) => m.id !== mob.id }); body.querySelector("[data-mob]").append(mp.node);
  entrySheet({ title: `Merge ${mob.name}`, body, label: "Merge", missing: () => (!mp.mob() ? "Choose the mob to merge into" : null),
    save: (v, sh) => { A.mergeMob(snap.lid, mob, mp.mob().id, v.date); sh.close(true, { force: true }); toast(`Merged into ${mp.mob().name}`); go(`/l/${snap.lid}/mob/${mp.mob().id}`, { replace: true }); } });
}
export function addSheepSheet(snap, { mob = null, cls = null } = {}) {
  const body = el(html`<form novalidate><div class="form-group">${textField({ name: "tag", label: "Tag number", placeholder: "XI 0654321 01234", autofocus: true })}${textField({ name: "eid", label: "EID number", optional: true, inputmode: "numeric" })}${textField({ name: "birthYear", label: "Born (year)", inputmode: "numeric", optional: true })}${textField({ name: "breed", label: "Breed", optional: true, value: mob?.breed || "" })}</div>
    ${chipsField("Sex", chipGroup("sex", opt([["F", "Ewe"], ["M", "Ram"]]), cls === "ram" || mob?.class === "rams" ? "M" : "F", { multi: false }))}
    ${chipsField("Species", chipGroup("species", opt([["sheep", "Sheep"], ["goat", "Goat"]]), mob?.class === "goats" ? "goat" : "sheep", { multi: false }))}
    <div class="form-group" data-mob></div><p class="hint">Tags: XI for sheep born from 30 June 2025; UK tags still accepted.</p></form>`);
  const mp = mobPickRow(snap, { mob }); body.querySelector("[data-mob]").append(mp.node);
  entrySheet({ title: cls === "ram" ? "Add a ram" : "Add a sheep", body, label: "Add", missing: (v) => (!v.tag && !v.eid ? "Add the tag or EID" : !mp.mob() ? "Choose the mob" : null),
    save: (v, sh) => { const id = A.addSheep(snap.lid, { ...v, birthYear: v.birthYear ? +v.birthYear : undefined, mobId: mp.mob().id, class: v.sex === "M" ? "ram" : "ewe", bornInFlock: false }); sh.close(true, { force: true }); toast(`${v.tag || v.eid} added`); return id; } });
}
