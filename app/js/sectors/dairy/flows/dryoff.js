// Dry off (design/12 §6.4). Antibiotic dry-cow therapy needs the vet's reason for this cow
// (EU 2019/6 Art. 107: no routine prophylaxis). The SCC helper only suggests; the vet decides.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { textField } from "../../../ui/form.js";
import { toast } from "../../../ui/toast.js";
import { todayStr } from "../../../core/dates.js";
import { cowPickRow, entrySheet, chipsField } from "./common.js";
import { recordDryOff } from "../actions.js";
import { onFarm, groupOf } from "../model/cows.js";
import { fertilityOf, dm } from "../model/fertility.js";
import { sdctRow } from "../model/mastitis.js";
import { cowLabel } from "../ui.js";

export default function dryOffSheet(snap, { animalId = null } = {}) {
  const store = snap.store.filter((p) => !p.deleted).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const row = cowPickRow(snap, { label: "Cow", ids: animalId ? [animalId] : [], filter: (a) => onFarm(a) && groupOf(snap.ix, a, snap.today) === "milking", title: "Which cow are you drying off?", onChange: () => facts() });
  const body = el(html`<form novalidate><div class="form-group" data-cow></div><div data-facts></div>
    <div class="form-group"><div class="field"><label>Date</label><input type="date" name="date" value="${todayStr()}"></div>
      ${textField({ name: "lastScc", label: "Last SCC (thousands)", inputmode: "numeric", optional: true })}${chipsField("cmt", "CMT (optional)", ["Negative", "Trace", "Positive"], null)}</div>
    <div class="form-group">${chipsField("treatment", "Treatment", ["Antibiotic DCT + sealant", "Sealant only", "None"], null)}</div>
    <div data-ab hidden><div class="form-group">${textField({ name: "vetReason", label: "Vet's reason for antibiotic", placeholder: "SCC over 200k at last 3 tests" })}${textField({ name: "vet", label: "Vet" })}</div></div>
    <div data-prod hidden><div class="form-group"><div class="field"><label for="do-p">Product</label><select id="do-p" name="productId"><option value="">Choose…</option>${store.map((p) => html`<option value="${p.id}">${p.name}</option>`)}</select></div>
      ${textField({ name: "batch", label: "Batch", optional: true })}${textField({ name: "afterCalvingHours", label: "Milk withdrawal after calving (hours)", inputmode: "numeric", placeholder: "96" })}${textField({ name: "wdMeatDays", label: "Meat withdrawal (days)", inputmode: "numeric", optional: true })}</div></div>
    <div class="form-group">${textField({ name: "expectedCalving", label: "Expected calving", type: "date" })}</div></form>`);
  body.querySelector("[data-cow]").appendChild(row.node);
  function facts() {
    const id = row.ids()[0]; const box = body.querySelector("[data-facts]"); if (!id) { box.innerHTML = ""; return; }
    const a = snap.ix.byId.get(id); const f = fertilityOf(snap.s, snap.ix, a, snap.today); const r = sdctRow(snap.ix, a);
    if (f.due && !body.querySelector("[name=expectedCalving]").value) body.querySelector("[name=expectedCalving]").value = f.due;
    if (r.history.length && !body.querySelector("[name=lastScc]").value) body.querySelector("[name=lastScc]").value = r.history[r.history.length - 1].scc;
    box.innerHTML = el(html`<div class="info-card" style="margin-bottom:12px">${raw(icon("info"))}<span>${cowLabel(a)}: last SCCs ${r.history.length ? r.history.map((x) => x.scc + "k").join(", ") : "not recorded"} · ${r.cases} mastitis case${r.cases === 1 ? "" : "s"} this lactation${f.due ? ` · due ${dm(f.due)}` : ""}.${r.low ? " Low SCC (under 200k at all 3 tests, no cases) — candidate for sealant only. Your vet decides." : ""}</span></div>`).outerHTML;
  }
  facts();
  const es = entrySheet({ title: "Dry off", body, label: "Save dry off",
    missing: (v) => (!row.ids().length ? "Choose the cow to save" : !v.treatment ? "Choose the treatment" : v.treatment === "Antibiotic DCT + sealant" && !v.vetReason ? "Add the vet's reason to save" : v.treatment !== "None" && !v.productId ? "Choose the product to save" : null),
    save(v, sh) {
      const product = store.find((p) => p.id === v.productId) || null;
      recordDryOff(snap, { animalId: row.ids()[0], date: v.date, lastScc: v.lastScc === "" ? null : +v.lastScc, cmt: v.cmt, treatment: v.treatment, vetReason: v.vetReason, vet: v.vet, product, batch: v.batch, wdMilkHours: +v.afterCalvingHours || 0, afterCalvingHours: +v.afterCalvingHours || 0, wdMeatDays: +v.wdMeatDays || 0, expectedCalving: v.expectedCalving });
      sh.close(true, { force: true }); toast(`${cowLabel(snap.ix.byId.get(row.ids()[0]))} dried off${v.treatment !== "None" ? " — milk withheld until calving + withdrawal" : ""}`);
    } });
  es.form.onChange(() => { const v = es.form.values(); body.querySelector("[data-ab]").hidden = v.treatment !== "Antibiotic DCT + sealant"; body.querySelector("[data-prod]").hidden = !v.treatment || v.treatment === "None"; });
  return es.sheet.done;
}
