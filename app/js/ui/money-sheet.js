// Add / edit a money entry (used by every ledger's Money tab and the farm Money tab).
import { html, raw } from "../core/html.js";
import { el } from "./dom.js";
import { openSheet, confirmSheet } from "./sheet.js";
import { textField, selectField, segmented, wireForm, guardButton } from "./form.js";
import { addRecord, updateRecord, softDelete } from "../services/records.js";
import { EXPENSE_CATEGORIES, REVENUE_CATEGORIES } from "../services/money.js";
import { todayStr } from "../core/dates.js";
import { toast } from "./toast.js";
import { moneyText } from "./format.js";
import { photoStrip } from "./photo-strip.js";

export function openMoneySheet(ledger, existing = null, { onSaved } = {}) {
  const r = existing || { kind: "expense", date: todayStr(), category: "Feed", amount: "", note: "" };
  const cats = (k) => (k === "revenue" ? REVENUE_CATEGORIES : EXPENSE_CATEGORIES).map((c) => ({ value: c, label: c }));
  const body = el(html`<form novalidate>
    ${segmented("kind", [{ value: "expense", label: "Money out" }, { value: "revenue", label: "Money in" }], r.kind)}
    <div class="form-group" style="margin-top:16px">
      ${textField({ name: "amount", label: "Amount (£)", value: r.amount, inputmode: "decimal", placeholder: "0.00", autofocus: !existing })}
      <div data-cat>${selectField({ name: "category", label: "Category", value: r.category, options: cats(r.kind) })}</div>
      ${textField({ name: "date", label: "Date", type: "date", value: r.date })}
      ${textField({ name: "note", label: "Note", value: r.note || "", optional: true })}
    </div>
    ${existing ? html`<button type="button" class="text-btn danger" data-del style="margin-top:12px">Remove this entry</button>` : ""}
  </form>`);
  // Receipts, invoices, statements: money photos — seen only by owner, manager and accountant.
  const label = (v) => `Money · ${v.category || ""}${v.note ? " · " + v.note : ""}`;
  const strip = photoStrip({ lid: ledger.id, role: ledger.role, parent: { coll: "finance", id: existing?.id, label: label(r) }, title: "Receipt or invoice photos" });
  body.querySelector(".form-group").after(strip.node);
  const btn = el(html`<button type="button" class="btn">Save</button>`);
  const f = wireForm(body); const start = JSON.stringify(f.values());
  const missing = () => { const v = f.values(); const a = parseFloat(String(v.amount).replace(/[£,]/g, "")); if (!(a > 0)) return "Add the amount to save"; if (!v.date) return "Add the date to save"; return null; };
  f.onChange((name) => {
    if (name === "kind") { const k = f.values().kind; body.querySelector("[data-cat]").replaceChildren(el(selectField({ name: "category", label: "Category", value: k === "revenue" ? "Livestock Sales" : "Feed", options: cats(k) }))); }
    guardButton(btn, "Save", missing);
  });
  guardButton(btn, "Save", missing);
  const sh = openSheet({ title: existing ? "Money entry" : "Add money", body, footer: btn, isDirty: () => JSON.stringify(f.values()) !== start, discardTitle: "Discard this entry?" });
  sh.done.then(() => strip.destroy());
  btn.onclick = () => {
    if (missing()) return;
    const v = f.values(); const data = { kind: v.kind, category: v.category, amount: Math.round(parseFloat(String(v.amount).replace(/[£,]/g, "")) * 100) / 100, date: v.date, note: v.note };
    if (existing) updateRecord(ledger.id, "finance", existing, data); else strip.commit(addRecord(ledger.id, "finance", data), label(data));
    sh.close(true, { force: true });
    toast(`${data.kind === "revenue" ? "Money in" : "Money out"} ${moneyText(data.amount, true)} saved`);
    onSaved && onSaved();
  };
  const del = body.querySelector("[data-del]");
  if (del) del.onclick = async () => {
    if (!(await confirmSheet({ title: "Remove this entry?", body: "It stays in the history so your books still add up.", confirm: "Remove", danger: true }))) return;
    softDelete(ledger.id, "finance", existing.id); sh.close(true, { force: true }); toast("Entry removed"); onSaved && onSaved();
  };
  return sh;
}
