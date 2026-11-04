// Add / edit a money entry (used by every ledger's Money tab and the farm Money tab).
import { html, raw } from "../core/html.js";
import { el } from "./dom.js";
import { openSheet, confirmSheet } from "./sheet.js";
import { textField, selectField, segmented, checkRow, wireForm, guardButton } from "./form.js";
import { addRecord, updateRecord, softDelete } from "../services/records.js";
import { EXPENSE_CATEGORIES, REVENUE_CATEGORIES, vatSettings } from "../services/money.js";
import { RATE_OPTIONS, usualRate, vatOf, vatFields } from "../services/vat.js";
import { todayStr } from "../core/dates.js";
import { toast } from "./toast.js";
import { moneyText } from "./format.js";
import { photoStrip } from "./photo-strip.js";
import { isThisRight } from "./sanity.js";
import { checkMoney, checkDate } from "../core/sanity.js";

export function openMoneySheet(ledger, existing = null, { onSaved } = {}) {
  const r = existing || { kind: "expense", date: todayStr(), category: "Feed", amount: "", note: "" };
  // VAT (Tom, 3 Nov): the rate follows the category until the farmer picks one; older "No VAT" entries show as 0%
  const rateNow = r.vatRate ?? (r.vat === "none" ? 0 : usualRate(r.kind, r.category)); let ratePicked = r.vatRate != null;
  const cats = (k) => (k === "revenue" ? REVENUE_CATEGORIES : EXPENSE_CATEGORIES).map((c) => ({ value: c, label: c }));
  const body = el(html`<form novalidate>
    ${segmented("kind", [{ value: "expense", label: "Money out" }, { value: "revenue", label: "Money in" }], r.kind)}
    <div class="form-group" style="margin-top:16px">
      ${textField({ name: "amount", label: "Amount (£)", value: r.amount, inputmode: "decimal", placeholder: "e.g. 120.00", autofocus: !existing })}
      <div data-cat>${selectField({ name: "category", label: "Category", value: r.category, options: cats(r.kind) })}</div>
      ${textField({ name: "date", label: "Date", type: "date", value: r.date })}
      ${textField({ name: "note", label: "Note", value: r.note || "", optional: true })}
    </div>
    <div class="form-group" style="margin-top:12px" data-exp ${raw(r.kind === "revenue" ? "hidden" : "")}>
      ${textField({ name: "supplier", label: "Supplier", value: r.supplier || "", optional: true, placeholder: "e.g. Thompsons Feeds" })}
    </div>
    <div class="form-group" style="margin-top:12px" data-vatbox>
      <div class="field"><span class="label">The amount is</span><span style="flex:1"></span>${segmented("vat", [{ value: "inc", label: "Inc VAT" }, { value: "ex", label: "Ex VAT" }], r.vat === "ex" ? "ex" : "inc")}</div>
      <div data-rate>${selectField({ name: "vatRate", label: "VAT rate", value: String(rateNow), options: RATE_OPTIONS })}</div>
      ${checkRow("eu", "EU goods (e.g. Republic of Ireland)", !!r.eu, "Bought from or sold to the EU: goes in boxes 2, 8 and 9")}
    </div>
    <p class="hint" data-vatline style="margin:6px 4px 0"></p>
    ${existing ? html`<button type="button" class="text-btn danger" data-del style="margin-top:12px">Remove this entry</button>` : ""}
  </form>`);
  // Receipts, invoices, statements: money photos — seen only by owner, manager and accountant.
  const label = (v) => `Money · ${v.category || ""}${v.note ? " · " + v.note : ""}`;
  const strip = photoStrip({ lid: ledger.id, role: ledger.role, parent: { coll: "finance", id: existing?.id, label: label(r) }, title: "Receipt or invoice photos" });
  body.querySelector(".form-group").after(strip.node);
  const btn = el(html`<button type="button" class="btn">Save</button>`);
  const f = wireForm(body); const start = JSON.stringify(f.values());
  const missing = () => { const v = f.values(); const a = parseFloat(String(v.amount).replace(/[£,]/g, "")); if (!(a > 0)) return "Add the amount to save"; if (!v.date) return "Add the date to save"; return null; };
  const vatLine = () => { const v = f.values(); const a = parseFloat(String(v.amount).replace(/[£,]/g, "")); const x = vatOf({ kind: v.kind, category: v.category, amount: a > 0 ? a : 0, vat: v.vat, vatRate: v.vatRate, eu: v.eu });
    body.querySelector("[data-vatline]").textContent = !(a > 0) ? "" : x.vat ? `Net ${moneyText(x.net, true)} · VAT ${moneyText(x.vat, true)} · Total ${moneyText(x.gross, true)}` : v.eu && v.kind === "expense" && Number(v.vatRate) ? "No VAT on the invoice: the VAT return adds it in boxes 2 and 4" : "No VAT on this"; };
  const setRate = (k, c) => body.querySelector("[data-rate] select").value = String(usualRate(k, c));
  vatSettings(ledger).then((s) => { if (s.registered === "no") { body.querySelector("[data-vatbox]").hidden = true; body.querySelector("[data-vatline]").hidden = true; } }).catch(() => {});
  f.onChange((name) => {
    if (name === "vatRate") ratePicked = true;
    if (name === "category" && !ratePicked) setRate(f.values().kind, f.values().category);
    if (name === "kind") { const k = f.values().kind; body.querySelector("[data-exp]").hidden = k === "revenue"; body.querySelector("[data-cat]").replaceChildren(el(selectField({ name: "category", label: "Category", value: k === "revenue" ? "Livestock Sales" : "Feed", options: cats(k) }))); if (!ratePicked) setRate(k, f.values().category); }
    vatLine();
    guardButton(btn, "Save", missing);
  });
  guardButton(btn, "Save", missing); vatLine();
  const sh = openSheet({ title: existing ? "Money entry" : "Add money", body, footer: btn, isDirty: () => JSON.stringify(f.values()) !== start, discardTitle: "Discard this entry?" });
  sh.done.then(() => strip.destroy());
  btn.onclick = async () => {
    if (missing()) return;
    const v = f.values();
    if (!(await isThisRight([...checkMoney(v.amount), ...checkDate(v.date, todayStr(), { future: true, what: "The date" })]))) return; const data = { kind: v.kind, category: v.category, amount: Math.round(parseFloat(String(v.amount).replace(/[£,]/g, "")) * 100) / 100, date: v.date, note: v.note };
    if (v.kind === "expense") data.supplier = (v.supplier || "").trim();
    // VAT on money in and out: what was typed, plus net / VAT worked out for the return and the accountant
    data.vat = v.vat === "ex" ? "ex" : "inc"; data.eu = !!v.eu;
    Object.assign(data, vatFields({ ...data, vatRate: /^\d+$/.test(v.vatRate) ? +v.vatRate : v.vatRate }));
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

/** Open a money entry from a list (Tom, 3 Nov: money records must be editable). An entry made by a
 *  sale, milk statement or other record opens that record, so a change carries through to it; a
 *  plain entry opens the money form. */
export async function openMoneyEntry(ledger, rec, { onSaved } = {}) {
  if (rec.actionId || rec.source || rec.saleId || rec.cheque) {
    const { openRecord } = await import("./record-sheet.js");
    return openRecord({ ledger, coll: "finance", id: rec.id, onChange: onSaved });
  }
  return openMoneySheet(ledger, rec, { onSaved });
}
