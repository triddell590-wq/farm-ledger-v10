// Medicine purchase and disposal records (DAERA layouts kept from v9.14). The farm-wide
// medicine store (farm space) holds products; these are this ledger's legal register lines.
import { html } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { textField, selectField } from "../../../ui/form.js";
import { toast } from "../../../ui/toast.js";
import { todayStr } from "../../../core/dates.js";
import { entrySheet, opt } from "./common.js";
import { recordMedPurchase, recordDisposal } from "../actions.js";
import { isFirstUseOfSupplier } from "../model/registers.js";

export function medPurchaseSheet(snap) {
  const known = [...new Set(snap.data.purchases.filter((p) => p.kind === "medicine" && p.supplier).map((p) => p.supplier))];
  const body = el(html`<form novalidate data-sector="beef"><div class="form-group">
    ${textField({ name: "date", label: "Date bought", type: "date", value: todayStr() })}
    ${textField({ name: "productName", label: "Medicine", placeholder: "e.g. Ivomec Super" })}
    ${textField({ name: "quantity", label: "Quantity", placeholder: "e.g. 500 ml" })}
    ${textField({ name: "batchNumber", label: "Batch number" })}
    ${textField({ name: "expiryDate", label: "Expiry date", type: "date" })}
    ${known.length ? selectField({ name: "supplierPick", label: "Supplier", value: known[0], options: [...known.map((k) => ({ value: k, label: k })), { value: "", label: "Someone new" }] }) : ""}
    <div data-new ${known.length ? "hidden" : ""}>${textField({ name: "supplier", label: "Supplier name" })}${textField({ name: "supplierAddress", label: "Supplier address", placeholder: "Needed the first time" })}</div>
  </div></form>`);
  const { form } = entrySheet({
    title: "Medicine purchase", body, label: "Save purchase",
    missing: (v) => (!v.productName ? "Add the medicine to save" : !v.batchNumber ? "Add the batch number" : !v.expiryDate ? "Add the expiry date" : !(v.supplierPick || v.supplier) ? "Add the supplier" : null),
    save(v, sh) {
      const supplier = v.supplierPick || v.supplier; const rec = { date: v.date, productName: v.productName, quantity: v.quantity, batchNumber: v.batchNumber, expiryDate: v.expiryDate, supplier, supplierAddress: v.supplierAddress || "" };
      recordMedPurchase(snap.lid, rec); sh.close(true, { force: true });
      toast(!v.supplierPick && !v.supplierAddress && isFirstUseOfSupplier({ ...rec, id: "~" }, [...snap.data.purchases, { ...rec, kind: "medicine", id: "~" }]) ? "Saved — add the supplier's address, it's needed the first time" : "Medicine purchase saved");
    },
  });
  form.onChange((n) => { if (n === "supplierPick") body.querySelector("[data-new]").hidden = !!form.values().supplierPick; });
}

export function disposalSheet(snap) {
  const body = el(html`<form novalidate data-sector="beef"><div class="form-group">
    ${textField({ name: "productName", label: "Medicine" })}${textField({ name: "batchNumber", label: "Batch number" })}
    ${textField({ name: "disposalDate", label: "Date disposed", type: "date", value: todayStr() })}${textField({ name: "disposalQty", label: "Quantity", placeholder: "e.g. 200 ml" })}
    ${selectField({ name: "disposalMethod", label: "How and where", value: "Returned to vet practice", options: opt([["Returned to vet practice"], ["Licensed waste contractor"], ["Returned to supplier"], ["Other"]]) })}
  </div></form>`);
  entrySheet({ title: "Medicine disposal", body, label: "Save disposal", missing: (v) => (!v.productName ? "Add the medicine to save" : !v.disposalQty ? "Add the quantity" : null),
    save(v, sh) { recordDisposal(snap.lid, { productName: v.productName, batchNumber: v.batchNumber, disposalDate: v.disposalDate, disposalQty: v.disposalQty, disposalMethod: v.disposalMethod }); sh.close(true, { force: true }); toast("Disposal recorded"); } });
}
