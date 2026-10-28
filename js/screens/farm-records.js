// Farm-wide lists kept in the farm space (design/01 §7.5, §12): Medicine store, Documents, Contacts.
import { html, raw } from "../core/html.js";
import { el } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { openSheet, confirmSheet } from "../ui/sheet.js";
import { textField, selectField, wireForm, guardButton } from "../ui/form.js";
import { session } from "../services/session.js";
import { watchRecords, addRecord, updateRecord, softDelete } from "../services/records.js";
import { canRead, canWrite } from "../core/policy.js";
import { toast } from "../ui/toast.js";
import { recordDate, relDays } from "../ui/format.js";
import { todayStr, daysBetween } from "../core/dates.js";
import { makeScreen, largeTitle, backLink, emptyState, groupLabel } from "./common.js";
import { photoStrip } from "../ui/photo-strip.js";

const KINDS = {
  medicines: {
    coll: "medProducts", title: "Medicine store", icon: "syringe", one: "medicine",
    empty: ["No medicines in the store yet", "Add a product once — its withdrawal periods fill in every time you treat."],
    fields: [
      { key: "name", label: "Product", required: true }, { key: "unit", label: "Unit", kind: "select", options: ["ml", "g", "dose", "tablet", "bolus"] },
      { key: "wdMeat", label: "Meat withdrawal (days)", inputmode: "numeric" }, { key: "wdMilk", label: "Milk withdrawal (days)", inputmode: "numeric" },
      { key: "wdEggs", label: "Egg withdrawal (days)", inputmode: "numeric" }, { key: "source", label: "Supplier", optional: true },
      { key: "batch", label: "Batch number", optional: true }, { key: "expiry", label: "Expiry", type: "date", optional: true },
    ],
    line: (r) => [r.wdMeat != null && r.wdMeat !== "" ? `Meat ${r.wdMeat} days` : null, r.wdMilk ? `Milk ${r.wdMilk} days` : null, r.wdEggs ? `Eggs ${r.wdEggs} days` : null, r.batch ? `Batch ${r.batch}` : null].filter(Boolean).join(" · "),
    pill: (r) => (r.expiry ? (daysBetween(todayStr(), r.expiry) < 0 ? ["late", "Expired"] : daysBetween(todayStr(), r.expiry) <= 30 ? ["due", "Expires " + relDays(r.expiry)] : null) : null),
  },
  documents: {
    coll: "documents", title: "Documents", icon: "document", one: "document", photos: "Photos of the document",
    empty: ["No documents yet", "Keep certificates, health plans and vet letters here, with reminders before they run out."],
    fields: [
      { key: "title", label: "Title", required: true }, { key: "kind", label: "Type", kind: "select", options: ["Certificate", "Health plan", "Vet letter", "Inspection report", "Other"] },
      { key: "date", label: "Date", type: "date" }, { key: "expiry", label: "Runs out", type: "date", optional: true }, { key: "note", label: "Note", optional: true },
    ],
    line: (r) => [r.kind, r.date ? recordDate(r.date) : null].filter(Boolean).join(" · "),
    pill: (r) => (r.expiry ? (daysBetween(todayStr(), r.expiry) < 0 ? ["late", "Ran out"] : daysBetween(todayStr(), r.expiry) <= 60 ? ["due", "Runs out " + relDays(r.expiry)] : null) : null),
  },
  contacts: {
    coll: "contacts", title: "Contacts", icon: "people", one: "contact",
    empty: ["No contacts yet", "Your vet, haulier, mart, feed rep and processor — one tap to ring them."],
    fields: [
      { key: "name", label: "Name", required: true }, { key: "kind", label: "Who", kind: "select", options: ["Vet", "Haulier", "Mart", "Feed rep", "Processor", "Contractor", "Adviser", "Other"] },
      { key: "phone", label: "Phone", type: "tel", inputmode: "tel" }, { key: "email", label: "Email", type: "email", optional: true }, { key: "note", label: "Note", optional: true },
    ],
    line: (r) => [r.kind, r.phone].filter(Boolean).join(" · "),
  },
};

export default async function farmRecords({ params }) {
  const K = KINDS[params.kind];
  const farm = session.farm(); const space = farm && farm.space;
  const body = el(html`<div>${backLink("#/farm/more", "More")}${largeTitle(K.title, farm?.farmName || "")}<div data-out></div></div>`);
  if (!space || !canRead(space.role, K.coll)) {
    body.querySelector("[data-out]").append(el(emptyState({ iconName: "lock", title: `Only the farm's owner and managers see the ${K.title.toLowerCase()}`, body: "Ask them if you need something from it." })));
    return makeScreen({ body, title: K.title, area: "farm", tab: "more", depth: 1, chrome: { tabs: (await import("./common.js")).farmTabs(), tab: "more" } });
  }
  const can = canWrite(space.role, K.coll);
  const open = (r = null) => {
    const b = el(html`<form novalidate><div class="form-group">${K.fields.map((f) => (f.kind === "select" ? selectField({ name: f.key, label: f.label, value: r?.[f.key] ?? f.options[0], options: f.options.map((o) => ({ value: o, label: o })) }) : textField({ name: f.key, label: f.label, value: r?.[f.key] ?? "", type: f.type || "text", inputmode: f.inputmode, optional: f.optional, autofocus: !r && f.required })))}</div>
      ${r && r.phone ? html`<a class="btn secondary" style="margin-top:16px" href="tel:${r.phone}">${raw(icon("message"))}Ring ${r.name.split(" ")[0]}</a>` : ""}
      ${r && can ? html`<button type="button" class="text-btn danger" data-del style="margin-top:12px">Remove this ${K.one}</button>` : ""}</form>`);
    if (!can) b.querySelectorAll("input,select").forEach((i) => (i.disabled = true));
    // Documents keep photos of the paper (certificates, vet letters, inspection reports).
    const label = (t) => `${K.one[0].toUpperCase() + K.one.slice(1)} · ${t || "untitled"}`;
    const strip = K.photos ? photoStrip({ lid: space.id, role: space.role, parent: { coll: K.coll, id: r?.id, label: label(r?.[K.fields[0].key]) }, title: K.photos }) : null;
    if (strip) b.querySelector(".form-group").after(strip.node);
    const btn = el(html`<button type="button" class="btn">Save</button>`);
    const f = wireForm(b); const req = K.fields.find((x) => x.required);
    const miss = () => (f.values()[req.key] ? null : `Add the ${req.label.toLowerCase()} to save`);
    f.onChange(() => guardButton(btn, "Save", miss)); guardButton(btn, "Save", miss);
    const start = JSON.stringify(f.values());
    const sh = openSheet({ title: r ? r[req.key] : `Add ${K.one}`, body: b, footer: can ? btn : null, cancelText: can ? "Cancel" : "Done", isDirty: () => can && (JSON.stringify(f.values()) !== start || (strip && strip.dirty())) });
    if (strip) sh.done.then(() => strip.destroy());
    btn.onclick = () => { const v = f.values(); if (r) updateRecord(space.id, K.coll, r, v); else { const id = addRecord(space.id, K.coll, v); if (strip) strip.commit(id, label(v[K.fields[0].key])); } sh.close(true, { force: true }); toast(`${K.one[0].toUpperCase() + K.one.slice(1)} saved`); };
    const d = b.querySelector("[data-del]");
    if (d) d.onclick = async () => { if (await confirmSheet({ title: `Remove this ${K.one}?`, confirm: "Remove", danger: true })) { softDelete(space.id, K.coll, r.id); sh.close(true, { force: true }); toast("Removed"); } };
  };
  const unsub = watchRecords(space.id, K.coll, {}, (list) => {
    const out = body.querySelector("[data-out]"); const key = K.fields[0].key;
    list.sort((a, b) => String(a[key]).localeCompare(String(b[key])));
    if (!list.length) { out.replaceChildren(el(emptyState({ iconName: K.icon, title: K.empty[0], body: K.empty[1], action: can ? `Add ${K.one}` : null, actAttr: "data-add" }))); const a = out.querySelector("[data-add]"); if (a) a.onclick = () => open(); return; }
    out.replaceChildren(el(html`<div>${groupLabel(K.title, list.length)}<div class="list">${list.map((r) => { const p = K.pill && K.pill(r); return html`<button type="button" class="row" data-id="${r.id}"><span class="tile neutral">${raw(icon(K.icon))}</span><span class="main"><span class="primary">${r[key]}</span><span class="secondary">${K.line(r)}</span></span>${p ? html`<span class="pill ${p[0]}">${raw(icon(p[0] === "late" ? "alert" : "clock"))}${p[1]}</span>` : ""}</button>`; })}</div></div>`));
    out.querySelectorAll("[data-id]").forEach((b) => (b.onclick = () => open(list.find((x) => x.id === b.dataset.id))));
  }, () => {});
  const { farmTabs } = await import("./common.js");
  return makeScreen({ body, title: K.title, area: "farm", tab: "more", depth: 1, chrome: { tabs: farmTabs(), tab: "more", fab: can ? () => open() : null }, destroy: unsub });
}
