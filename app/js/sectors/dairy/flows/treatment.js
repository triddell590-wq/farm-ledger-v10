// Treatment / mastitis (design/12 §6.1) — the most-used entry. Udder picker for mastitis,
// product from the store with milk withdrawal in hours, course → a job at each milking, and a
// live "Milk out of the tank until …" panel worked out from the farm's milking times.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { textField } from "../../../ui/form.js";
import { toast } from "../../../ui/toast.js";
import { todayStr } from "../../../core/dates.js";
import { cowPickRow, entrySheet, chipsField, nowHM } from "./common.js";
import { udderHtml, dIcon } from "../ui.js";
import { withdrawalFor, milkingsIn } from "../model/milking.js";
import { isDry } from "../model/cows.js";
import { saveTreatment, add, me } from "../actions.js";
import { photoStrip } from "../../../ui/photo-strip.js";
import { BTV_LICENCE_NOTE } from "../model/content.js";

const REASONS = ["Mastitis", "Lame", "Fresh cow", "Pneumonia", "BTV-3 vaccine", "Other"];
const MARKS = ["Red leg band", "Spray", "AMS flag", "Collar"];

export default function treatmentSheet(snap, { reason = "Mastitis", animalIds = [], quarters = [] } = {}) {
  const quarterSel = new Set(quarters);
  const store = snap.store.filter((p) => !p.deleted).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const cowRow = cowPickRow(snap, { label: reason === "BTV-3 vaccine" ? "Cows" : "Cow", multi: true, ids: animalIds, title: "Which cow?", onChange: () => setTimeout(update, 0) });
  const body = el(html`<form novalidate class="treat">
    <div class="form-group" data-cow></div>
    <div class="form-group">${chipsField("reason", "What for", REASONS, reason)}</div>
    <div data-mast><p class="form-label">Which quarters? (from behind the cow)</p><div class="form-group" style="padding:12px 0 16px" data-udder></div>
      <div class="form-group">${chipsField("severity", "Severity", [["Mild", "Mild (milk only)"], ["Moderate", "Moderate (udder)"], ["Severe", "Severe (cow sick)"]], null)}</div></div>
    <p class="form-label">Medicine</p>
    <div class="form-group">
      <div class="field"><label for="tr-prod">Product</label><select id="tr-prod" name="productId"><option value="">Choose…</option>${store.map((p) => html`<option value="${p.id}">${p.name}${p.wdMilkHours != null ? ` · milk ${p.wdMilkHours} h` : ""}</option>`)}<option value="__new">Add a product…</option></select></div>
      <div data-newprod hidden>${textField({ name: "newName", label: "Product name", placeholder: "Synulox LC" })}${chipsField("kind", "Type", ["Intramammary tube", "Dry cow tube", "Injection", "Vaccine", "Other"], "Intramammary tube")}</div>
      ${textField({ name: "wdMilkHours", label: "Milk withdrawal (hours)", inputmode: "numeric", placeholder: "84" })}
      ${textField({ name: "wdMeatDays", label: "Meat withdrawal (days)", inputmode: "numeric", placeholder: "7" })}
      ${textField({ name: "batch", label: "Batch", optional: true })}
      ${textField({ name: "expiry", label: "Expiry", optional: true, placeholder: "06/2027" })}
      ${textField({ name: "dose", label: "Dose", optional: true, placeholder: "1 tube per quarter" })}
      ${textField({ name: "doses", label: "Course (number of doses)", inputmode: "numeric", value: "1" })}
      ${chipsField("intervalH", "Every", [["12", "12 h (each milking)"], ["24", "24 h"], ["48", "48 h"]], "12")}
    </div>
    <p class="form-label">Who and when</p>
    <div class="form-group">${textField({ name: "givenBy", label: "Given by", value: me() })}
      <div class="field"><label>Date</label><input type="date" name="date" value="${todayStr()}"></div><div class="field"><label>Time</label><input type="time" name="time" value="${nowHM()}"></div></div>
    <div class="form-group" data-marks>${chipsField("marks", "Marked with", MARKS, [], { multi: true })}</div>
    <div data-btv hidden class="info-card" style="margin-top:12px">${raw(dIcon("info", 22))}<span>${BTV_LICENCE_NOTE}. No reporting deadline is set yet; the record exports as a list your vet can use.</span></div>
    <div data-panel></div>
  </form>`);
  body.querySelector("[data-cow]").appendChild(cowRow.node);
  const udder = body.querySelector("[data-udder]");
  const drawUdder = () => { udder.innerHTML = udderHtml(quarterSel).s; };
  drawUdder();
  udder.addEventListener("click", (e) => { const b = e.target.closest("[data-q]"); if (!b) return; const q = b.dataset.q; quarterSel.has(q) ? quarterSel.delete(q) : quarterSel.add(q); drawUdder(); setTimeout(update, 0); });

  const prod = () => store.find((p) => p.id === body.querySelector("[name=productId]").value) || null;
  body.querySelector("[name=productId]").addEventListener("change", () => {
    const p = prod(); const isNew = body.querySelector("[name=productId]").value === "__new";
    body.querySelector("[data-newprod]").hidden = !isNew;
    if (p) {
      const set = (n, v) => { const i = body.querySelector(`[name=${n}]`); if (v != null && v !== "") i.value = v; };
      set("wdMilkHours", p.wdMilkHours); set("wdMeatDays", p.wdMeatDays ?? p.wdMeat); set("batch", p.batch); set("expiry", p.expiry); set("dose", p.dose);
      if (p.course?.doses) { set("doses", p.course.doses); }
    }
  });
  const values = () => es.form.values();
  function update() {
    const v = values(); const r = v.reason;
    body.querySelector("[data-mast]").hidden = r !== "Mastitis";
    body.querySelector("[data-btv]").hidden = r !== "BTV-3 vaccine";
    const ids = cowRow.ids(); const dry = ids.length && ids.every((id) => isDry(snap.ix, snap.ix.byId.get(id)));
    const h = +v.wdMilkHours || 0; const panel = body.querySelector("[data-panel]");
    if (!ids.length || v.wdMilkHours === "") { panel.innerHTML = ""; es && es.refresh(); return; }
    const wd = withdrawalFor(snap.s, { date: v.date, time: v.time, doses: v.doses, intervalH: v.intervalH, wdMilkHours: h });
    const meat = +v.wdMeatDays ? `Meat: ${v.wdMeatDays} days` : "Meat: no withdrawal";
    panel.innerHTML = !h ? `<div class="withpanel none"><span class="inl">${dIcon("check", 20)}Milk can go in the tank</span><span class="t-callout">No milk withdrawal · ${meat}</span></div>`
      : dry ? `<div class="withpanel"><span class="inl">${dIcon("stop", 20)}Dry cow — milk out of the tank until</span><b>calving + ${milkingsIn(snap.s, h)}</b><span class="t-callout">${meat}</span></div>`
      : `<div class="withpanel" role="status"><span class="inl">${dIcon("stop", 20)}Milk out of the tank until</span><b>${wd.label}</b><span class="t-callout">Last dose + ${h} hours · ${meat}</span></div>`;
    es && es.refresh();
  }
  let es = null;
  // Photos (clots on the strip cup, a CMT paddle, the product label) go on the treatment record.
  const strip = photoStrip({ lid: snap.lid, role: snap.role, parent: { coll: "medicines", label: "Treatment" }, title: "Photos", hint: "Strip cup, CMT, label" });
  body.appendChild(strip.node);
  es = entrySheet({
    title: "Treatment", body, label: "Save treatment",
    missing: (v) => !cowRow.ids().length ? "Choose the cow to save" : !v.reason ? "Say what it's for" : v.reason === "Mastitis" && !quarterSel.size ? "Tap the quarter to save" : !v.productId || (v.productId === "__new" && !v.newName) ? "Choose the product to save" : v.wdMilkHours === "" ? "Add the milk withdrawal to save" : null,
    async save(v, sh) {
      let product = prod();
      if (v.productId === "__new") { const id = add(snap.lid, "medProducts", { name: v.newName, kind: v.kind, wdMilkHours: +v.wdMilkHours || 0, wdMeatDays: +v.wdMeatDays || 0, batch: v.batch, expiry: v.expiry, dose: v.dose }); product = { id, name: v.newName }; }
      const r = saveTreatment(snap, { ...v, animalIds: cowRow.ids(), quarters: v.reason === "Mastitis" ? [...quarterSel] : [], product, licence: v.reason === "BTV-3 vaccine" ? BTV_LICENCE_NOTE : null });
      strip.commit(r.medId, `${v.reason === "Mastitis" ? "Mastitis" : "Treatment"} · ${cowRow.ids().map((id) => snap.ix.byId.get(id)?.tag || "").filter(Boolean).slice(0, 3).join(", ")}`);
      sh.close(true, { force: true });
      toast(r.wd.okFrom ? `Saved. Milk out of the tank until ${r.wd.label}` : "Treatment saved");
      if (r.notes.length) setTimeout(() => toast(r.notes.join(" ")), 4200);
    },
  });
  es.form.onChange(() => setTimeout(update, 0));
  body.addEventListener("click", () => setTimeout(update, 0));
  update();
  return es.sheet.done;
}
