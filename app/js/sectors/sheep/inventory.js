// Annual inventory wizard (design/11 §9.4): count date 1–5 December only, counts by category
// prefilled from mob counts, compared with the register; then the date it was sent to DAERA.
import { html } from "../../core/html.js";
import { el } from "../../ui/dom.js";
import { toast } from "../../ui/toast.js";
import { textField, wireForm, guardButton } from "../../ui/form.js";
import { canWrite } from "../../core/policy.js";
import { largeTitle, backLink, groupLabel } from "../../screens/common.js";
import { liveScreen } from "./screen.js";
import { short, num, kvRows } from "./ui.js";
import { inventoryWindow, inventoryPrefill, INVENTORY_CATS, validCountDate } from "./model/paperwork.js";
import { ruleRecord } from "./model/region.js";
import * as A from "./actions.js";

export default async function inventory(ctx) {
  return liveScreen(ctx, { title: "Annual inventory", tab: "paperwork", paint: (snap) => {
    const w = inventoryWindow(snap.today, snap.s); const rec = snap.data.inventories.find((i) => +i.year === w.year);
    const pre = inventoryPrefill(snap.data.mobs, snap.counts); const reg = Object.values(pre).reduce((a, b) => a + b, 0);
    const can = canWrite(snap.role, "inventories"); const src = ruleRecord("inventories");
    const dflt = snap.today >= w.from && snap.today <= w.to ? snap.today : w.from;
    return html`<div>${backLink(`#/l/${snap.lid}/paperwork`, "Paperwork")}${largeTitle("Annual inventory", `Count between ${short(w.from)} and ${short(w.to)} ${w.year}`)}
      <div class="info-card"><span>Return date: ${w.deadline ? short(w.deadline) + " (from DAERA's letter)" : "not set — add it from DAERA's November letter in Targets"}. Rule checked ${src?.checkedOn || ""} (${src?.source || "DAERA"}).</span></div>
      ${rec?.countDate ? html`<div class="section">${groupLabel("Counted")}${kvRows([["Count date", short(rec.countDate)], ...Object.entries(INVENTORY_CATS).map(([k, l]) => [l, num(rec.counts?.[k] || 0)]), ["Total", num(rec.total), "", rec.total !== rec.registerTotal ? `Register said ${rec.registerTotal}${rec.countCheckNote ? " · " + rec.countCheckNote : ""}` : "Matches your register ✓"], ["Sent to DAERA", rec.submittedOn ? short(rec.submittedOn) : "Not yet", rec.submittedOn ? "ok" : "due", rec.ref ? `Ref ${rec.ref}` : ""]])}</div>` : ""}
      ${can ? html`<form class="section" novalidate data-f>${groupLabel(rec?.countDate ? "Change the count" : "Count the flock")}
        <div class="form-group">${textField({ name: "countDate", label: "Count date (1–5 Dec)", type: "date", value: rec?.countDate || dflt })}${Object.entries(INVENTORY_CATS).map(([k, l]) => textField({ name: k, label: l, inputmode: "numeric", value: String(rec?.counts?.[k] ?? pre[k]) }))}</div>
        <p class="calc" data-cmp></p><button type="button" class="btn" data-save>Save count</button>
        ${rec?.countDate ? html`<div class="form-group" style="margin-top:16px">${textField({ name: "submittedOn", label: "Sent to DAERA on", type: "date", value: rec?.submittedOn || "" })}${textField({ name: "ref", label: "DAERA Online reference", optional: true, value: rec?.ref || "" })}</div><button type="button" class="btn secondary" data-sent style="margin-top:8px">Save sent date</button>` : ""}</form>` : ""}
      <p class="foot-note">Prefilled from your mob counts (register total ${num(reg)}). Do the return on DAERA Online, then record the date here — it becomes the inventory line in the flock register.</p></div>`;
  }, after: (node, snap) => {
    const form = node.querySelector("[data-f]"); if (!form) return;
    const w = inventoryWindow(snap.today, snap.s); const rec = snap.data.inventories.find((i) => +i.year === w.year);
    const pre = inventoryPrefill(snap.data.mobs, snap.counts); const reg = Object.values(pre).reduce((a, b) => a + b, 0);
    const f = wireForm(form); const btn = node.querySelector("[data-save]");
    const tot = (v) => Object.keys(INVENTORY_CATS).reduce((n, k) => n + (+v[k] || 0), 0);
    const miss = () => { const v = f.values(); return !validCountDate(v.countDate, snap.today, snap.s) ? "Pick a date between 1 and 5 December" : null; };
    const upd = () => { const t = tot(f.values()); node.querySelector("[data-cmp]").textContent = t === reg ? `Total ${t} — matches your register ✓` : `Register says ${reg}, you counted ${t} — a count check will be added to the mob it's in.`; guardButton(btn, "Save count", miss); };
    f.onChange(upd); upd();
    btn.onclick = () => { if (miss()) return; const v = f.values(); const counts = Object.fromEntries(Object.keys(INVENTORY_CATS).map((k) => [k, +v[k] || 0])); A.saveInventory(snap.lid, w.year, rec, { countDate: v.countDate, counts, total: tot(v), registerTotal: reg, countCheckNote: tot(v) !== reg ? "difference noted" : undefined }); toast("Inventory count saved"); };
    const s = node.querySelector("[data-sent]"); if (s) s.onclick = () => { const v = f.values(); if (!v.submittedOn) return toast("Add the date you sent it"); A.saveInventory(snap.lid, w.year, rec, { submittedOn: v.submittedOn, ref: v.ref }); toast("Sent date saved"); };
  } });
}
export { el };
