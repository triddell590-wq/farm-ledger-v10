// Moving sheep off the holding (movement document builder, design/11 §9.3), selling (§6.6) and
// buying in (§6.8). Checks run before Save: flock restriction, untagged lambs, 6-day standstill,
// withdrawal, distance.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { toast } from "../../../ui/toast.js";
import { textField, chipGroup, checkRow } from "../../../ui/form.js";
import { todayStr } from "../../../core/dates.js";
import { canRead } from "../../../core/policy.js";
import { go } from "../../../core/router.js";
import { entrySheet, mobPickRow, chipsField, opt, bigStepper, num } from "../ui.js";
import { DESTS, isCpr, nextSerial, movementChecks, cropTagging } from "../model/paperwork.js";
import { carcase } from "../model/selling.js";
import * as A from "../actions.js";

const ICON = { block: "alert", warn: "clock", info: "info" };
export const checksHtml = (list) => (list.length ? `<ul class="check-list">${list.map((c) => `<li class="${c.level}">${icon(ICON[c.level])}<span>${c.text.replace(/</g, "&lt;")}</span></li>`).join("")}</ul>` : "");

function moveForm(snap, { mob, count, sale = false, dest }) {
  const money = canRead(snap.role, "finance");
  const body = el(html`<form novalidate><div class="form-group" data-mob></div><p class="form-label">How many</p><div data-st></div>
    ${chipsField("Going to", chipGroup("dest", Object.entries(DESTS).filter(([k]) => !sale || ["abattoir", "market", "farm"].includes(k)).map(([value, label]) => ({ value, label })), dest || (sale ? "abattoir" : "farm"), { multi: false }))}
    <div class="form-group">${textField({ name: "date", label: "Date", type: "date", value: todayStr() })}${textField({ name: "otherName", label: "Name (farm, market or plant)", placeholder: sale ? "e.g. Linden Foods" : "" })}${textField({ name: "otherFlock", label: "Their flock / CPR number", optional: true })}${textField({ name: "otherAddress", label: "Address", optional: true })}
      ${textField({ name: "haulier", label: "Haulier", optional: true })}${textField({ name: "transporterNo", label: "Transporter authorisation no.", optional: true })}${textField({ name: "km", label: "Distance (km)", inputmode: "numeric", optional: true })}</div>
    <div data-tags>${checkRow("cprList", "CPR — tag list to follow", false, "The market or abattoir reads the tags; photo their list within 48 hours")}<div class="form-group" data-range>${textField({ name: "tagFrom", label: "First tag", optional: true })}${textField({ name: "tagTo", label: "Last tag", optional: true })}</div></div>
    ${sale ? html`<p class="form-label">Kill sheet / sale</p><div class="form-group">${textField({ name: "deadKg", label: "Total carcase (kg)", inputmode: "decimal", optional: true })}${textField({ name: "grade", label: "Grade (e.g. U3L)", optional: true })}
      ${money ? html`${textField({ name: "total", label: "Total price (£)", inputmode: "decimal", optional: true })}${textField({ name: "levy", label: "Levy (£)", inputmode: "decimal", optional: true })}${textField({ name: "haulage", label: "Haulage (£)", inputmode: "decimal", optional: true })}${textField({ name: "commission", label: "Commission (£)", inputmode: "decimal", optional: true })}` : ""}</div>${money ? "" : html`<p class="hint">Prices are added by the owner or manager.</p>`}` : ""}
    <div data-checks></div><div class="calc" data-serial></div></form>`);
  const st = bigStepper({ value: count || 0, label: "How many", jumps: [5, 10] });
  const mp = mobPickRow(snap, { mob, onChange: (m) => { if (!st.value()) st.set(snap.counts.get(m.id) || 0); } });
  body.querySelector("[data-mob]").append(mp.node); body.querySelector("[data-st]").append(st.node);
  if (mob && !count) st.set(snap.counts.get(mob.id) || 0);
  const untagged = cropTagging(snap.data, snap.cy, snap.s).untagged;
  const checks = (v) => movementChecks(snap.data, snap.cy, snap.s, { mob: mp.mob(), count: st.value(), date: v.date, dest: v.dest, km: v.km }, untagged);
  const serial = (v) => nextSerial(snap.data, snap.s.flockNo, v.date);
  return { body, st, mp, checks, serial, snap };
}
function moveMissing(f, v) {
  if (!f.mp.mob()) return "Choose the mob";
  if (!f.st.value()) return "Add how many";
  if (f.st.value() > (f.snap.counts.get(f.mp.mob().id) || 0)) return "More than are in the mob";
  const b = f.checks(v).find((c) => c.level === "block"); if (b) return b.key === "restricted" ? "Moves are stopped (flock restricted)" : b.key === "untagged" ? "Tag the lambs first" : b.key === "standstill" ? "Standstill — can't go yet" : "Can't move these yet";
  if (!v.otherName) return "Add where they're going";
  return null;
}
function wire(snap, f, form) {
  const upd = () => { const v = form.values(); f.body.querySelector("[data-range]").hidden = !!v.cprList; f.body.querySelector("[data-tags] [data-check=cprList]").hidden = !isCpr(v.dest); f.body.querySelector("[data-checks]").innerHTML = checksHtml(f.checks(v)); f.body.querySelector("[data-serial]").innerHTML = `Movement document <span class="serial">${f.serial(v)}</span><p class="hint">Notify NIFAIS within 7 days${isCpr(v.dest) ? "; the market or abattoir's tag list is your register record (keep its photo)" : ""}.</p>`; };
  form.onChange(upd); f.st.onChange(upd); f.body.addEventListener("click", () => setTimeout(upd, 0)); upd();
}

export function moveOffSheet(snap, { mob = null, dest } = {}) {
  const f = moveForm(snap, { mob, dest });
  const { form, refresh } = entrySheet({ title: "Move off the farm", body: f.body, label: "Make movement document", missing: (v) => moveMissing(f, v),
    save: (v, sh) => { const m = f.mp.mob(); const id = A.movement(snap.lid, { kind: "off", date: v.date, mobId: m.id, mobName: m.name, count: f.st.value(), lambs: ["lambs", "ewesWithLambs"].includes(m.class), crop: snap.cy.crop, dest: v.dest, otherName: v.otherName, otherFlock: v.otherFlock, otherAddress: v.otherAddress, haulier: v.haulier, transporterNo: v.transporterNo, km: v.km, cprList: isCpr(v.dest) && v.cprList, tagFrom: v.tagFrom, tagTo: v.tagTo, docSerial: f.serial(v) }); sh.close(true, { force: true }); toast("Movement document made"); go(`/l/${snap.lid}/movement/${id}`); } });
  f.st.onChange(refresh); wire(snap, f, form);
}

export function sellSheet(snap, { mob = null, count = 0, avgKg = 0 } = {}) {
  const f = moveForm(snap, { mob, count, sale: true });
  const money = canRead(snap.role, "finance");
  const { form, refresh } = entrySheet({ title: "Draft & sell", body: f.body, label: "Save sale", missing: (v) => moveMissing(f, v),
    save: (v, sh) => {
      const m = f.mp.mob(); const n = f.st.value(); const deadKg = +v.deadKg || (avgKg ? carcase(avgKg, snap.s.koPct) * n : 0);
      const r = A.sale(snap.lid, { date: v.date, mobId: m.id, mobName: m.name, count: n, lambs: ["lambs", "ewesWithLambs", "eweLambs"].includes(m.class), crop: snap.cy.crop, dest: v.dest, outlet: v.otherName, otherName: v.otherName, otherFlock: v.otherFlock, otherAddress: v.otherAddress, haulier: v.haulier, transporterNo: v.transporterNo, km: v.km, cprList: isCpr(v.dest) && v.cprList, tagFrom: v.tagFrom, tagTo: v.tagTo, docSerial: f.serial(v),
        outletType: v.dest, lines: [{ deadKg: deadKg || undefined, grade: v.grade || undefined, liveKg: avgKg ? Math.round(avgKg * n * 10) / 10 : undefined }], total: money ? +v.total || 0 : 0, deductions: money ? { levy: +v.levy || 0, haulage: +v.haulage || 0, commission: +v.commission || 0 } : undefined }, { money });
      sh.close(true, { force: true }); toast(`Sale saved: ${n} to ${v.otherName}`); go(`/l/${snap.lid}/movement/${r.mvId}`);
    } });
  f.st.onChange(refresh); wire(snap, f, form);
}

export function buyInSheet(snap) {
  const money = canRead(snap.role, "finance");
  const body = el(html`<form novalidate><div class="form-group">${textField({ name: "otherFlock", label: "Source flock number" })}${textField({ name: "otherName", label: "Seller / market" })}${textField({ name: "otherAddress", label: "Address", optional: true })}${textField({ name: "date", label: "Date", type: "date", value: todayStr() })}</div>
    <p class="form-label">How many</p><div data-st></div>
    <div class="form-group" data-mob></div><div class="form-group">${textField({ name: "newMob", label: "Or a new mob called", optional: true, placeholder: "e.g. Texel shearlings" })}${textField({ name: "tagFrom", label: "First tag", optional: true })}${textField({ name: "tagTo", label: "Last tag", optional: true })}${textField({ name: "docSerial", label: "Their movement document no.", optional: true })}
      ${money ? textField({ name: "price", label: "Price (£ total)", inputmode: "decimal", optional: true }) : ""}${textField({ name: "qdays", label: "Quarantine (days)", inputmode: "numeric", value: String(snap.s.quarantineDays) })}</div>
    ${checkRow("fromMarket", "Came through a market", false, "Starts the 6-day standstill for moves off")}${checkRow("fromGB", "Came from GB", false, "Re-tag with NI tags within 20 days")}</form>`);
  const st = bigStepper({ label: "How many", jumps: [5, 10] }); body.querySelector("[data-st]").append(st.node);
  const mp = mobPickRow(snap, { label: "Into mob" }); body.querySelector("[data-mob]").append(mp.node);
  const { refresh } = entrySheet({ title: "Buy in", body, label: "Save purchase", missing: (v) => (!v.otherFlock && !v.otherName ? "Add where they came from" : !st.value() ? "Add how many" : !mp.mob() && !v.newMob ? "Choose a mob or name a new one" : null),
    save: (v, sh) => {
      const mobId = v.newMob ? A.createMob(snap.lid, { name: v.newMob, cls: "ewes", count: 0, date: v.date }) : mp.mob().id;
      A.movement(snap.lid, { kind: "on", date: v.date, mobId, mobName: v.newMob || mp.mob().name, count: st.value(), otherFlock: v.otherFlock, otherName: v.otherName, otherAddress: v.otherAddress, tagFrom: v.tagFrom, tagTo: v.tagTo, docSerial: v.docSerial, fromMarket: v.fromMarket, fromGB: v.fromGB, quarantine: true, quarantineDays: +v.qdays || snap.s.quarantineDays, description: `${st.value()} from ${v.otherName || v.otherFlock}` });
      if (money && +v.price > 0) A.purchaseFinance(snap.lid, { amount: +v.price, date: v.date, note: `${st.value()} sheep from ${v.otherName || v.otherFlock}` });
      sh.close(true, { force: true }); toast(`${st.value()} bought in · quarantine ${+v.qdays || snap.s.quarantineDays} days`);
    } });
  st.onChange(refresh);
}
export { num, raw };
