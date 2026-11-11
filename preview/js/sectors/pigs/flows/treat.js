// Treat a pen / batch (design/13 §7.7) — or one sow. Route first [In feed][In water][Injection],
// product from the farm medicine store (withdrawal), dose / inclusion, number of pigs, days,
// Reason (required). Antibiotic with no clinical signs recorded for the batch → "Is this
// prophylaxis?" with a required vet name. In feed → MFS prescription number (required). The
// withdrawal end lands on the batch and blocks "Plan a load" until clear.
import { html } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { textField, checkRow, stepper } from "../../../ui/form.js";
import { toast } from "../../../ui/toast.js";
import { addDays, daysBetween } from "../model/dates.js";
import { entrySheet, chipsField, numField, dateField, warn, lawNote, batchPickRow, sowPickRow } from "./common.js";
import { saveTreatment, me, undoAdd } from "../actions.js";
import { batchName } from "../model/batches.js";
import { sowLabel } from "../model/sows.js";
import { dm } from "../ui.js";

const ROUTES = ["In feed", "In water", "Injection"];
const REASONS = ["Respiratory", "Scour", "Strep / meningitis", "Lame / joints", "Tail-bite wounds", "Skin", "Worms / lice", "Vaccine", "BTV-3 vaccine", "Iron", "Other"];

/** Clinical signs in the batch's room in the last 7 days (room-check issues, deaths with a disease cause). */
function clinicalSigns(snap, batchId) {
  const b = snap.ix.batches.get(batchId); if (!b) return false; const from = addDays(snap.today, -7);
  const checks = snap.data.roomChecks.filter((c) => c.roomId === b.roomId && c.date >= from && (c.pens || []).some((p) => (p.status || []).some((s) => ["Scour", "Lame", "Tail bite", "To hospital"].includes(s))));
  const deaths = snap.data.deaths.filter((d) => d.batchId === batchId && d.date >= from && ["Scour", "Respiratory", "Lame"].includes(d.cause));
  return checks.length > 0 || deaths.length > 0;
}

export default function treatSheet(snap, { batchId = null, roomId = null, sowId = null, sow = false } = {}) {
  const forSow = sow || !!sowId || !snap.data.batches.some((b) => !b.closed && (b.numberIn != null || b.inDate));
  let bid = batchId || (roomId && snap.ix.rooms.get(roomId)?.batchId) || null;
  const products = [...snap.store].filter((p) => p.name).sort((a, b) => a.name.localeCompare(b.name));
  const vets = snap.contacts.filter((c) => c.kind === "Vet");
  const room = bid && snap.ix.rooms.get(snap.ix.batches.get(bid)?.roomId);
  const body = el(html`<form novalidate>
    <div class="form-group" data-who></div>
    ${!forSow && room?.pens?.length ? html`<div class="form-group">${chipsField("pens", "Pens (leave blank for the whole room)", room.pens.map((p) => [String(p.no), String(p.no)]), [], { multi: true })}</div>` : ""}
    <div class="form-group">${chipsField("route", "Route", forSow ? ["Injection", "In feed", "In water"] : ROUTES, forSow ? "Injection" : null)}</div>
    <div class="form-group">${chipsField("product", "Product", [...products.slice(0, 16).map((p) => [p.id, p.name]), ["__new", "Not in the store"]], null)}
      <div data-np hidden>${textField({ name: "productName", label: "Product name" })}${numField("wdNew", "Meat withdrawal (days)", "", { step: 1 })}</div>
      ${textField({ name: "activeIngredient", label: "Active ingredient", optional: true })}
      ${checkRow("antibiotic", "This is an antibiotic", false, "Antibiotics go in the eMB-Pigs quarterly upload")}</div>
    <div class="form-group">${textField({ name: "dose", label: "Dose / inclusion rate", placeholder: "e.g. 1 ml per 10 kg · 2 kg/t" })}${numField("quantity", "Quantity used", "", { optional: true })}${chipsField("quantityUnit", "Unit", ["ml", "g", "kg", "doses"], "ml")}
      ${forSow ? "" : html`<div class="field stepper-field"><span class="label">Number of pigs</span><span class="spacer"></span>${stepper("pigs", 0, { min: 0, max: 5000, step: 10, label: "Number of pigs" })}</div>`}
      <div class="field stepper-field"><span class="label">Days</span><span class="spacer"></span>${stepper("days", 1, { min: 1, max: 28, label: "Days" })}</div>${dateField("date", "Start", snap.today)}</div>
    <div class="form-group">${chipsField("reason", "Reason", REASONS, null)}</div>
    <div class="form-group" data-mfs hidden>${textField({ name: "mfsNo", label: "MFS prescription number" })}</div>
    <div class="form-group" data-pro hidden><p class="pg-note" style="margin:10px 16px 0">No clinical signs are recorded for this batch this week. Is this prophylaxis? Red Tractor allows it only in exceptional circumstances, reviewed at the next quarterly vet visit.</p>${checkRow("prophylaxis", "Yes — prophylaxis, prescribed by the vet", false)}
      ${textField({ name: "vet", label: "Vet's name", value: vets[0]?.name || "" })}</div>
    <div class="form-group">${textField({ name: "medBatch", label: "Medicine batch no.", optional: true })}${textField({ name: "givenBy", label: "Given by", value: me() })}</div>
    <p class="pg-note" data-wd></p><div data-w></div>
    ${lawNote("Medicine records are kept 5 years. Antibiotic use is uploaded to eMB-Pigs each quarter.")}</form>`);
  const who = forSow ? sowPickRow(snap, { label: "Sow", id: sowId, title: "Which sow?", onChange: () => es.refresh() }) : batchPickRow(snap, { label: "Batch", id: bid, title: "Which batch?", onChange: (v) => { bid = v; paint(); es.refresh(); } });
  body.querySelector("[data-who]").append(who.node);
  const prodOf = (v) => products.find((p) => p.id === v.product);
  const wd = (v) => { const p = prodOf(v); return p ? (p.wdMeat !== "" && p.wdMeat != null ? +p.wdMeat : null) : v.wdNew !== "" ? +v.wdNew : null; };
  const isAb = (v) => v.antibiotic || /cillin|mycin|cycline|sulfa|trimeth|florfenicol|tiamulin|enrofloxacin|ceftiofur|colistin/i.test(prodOf(v)?.name || v.productName || "");
  const paint = () => {
    const v = es.form.values();
    body.querySelector("[data-np]").hidden = v.product !== "__new";
    body.querySelector("[data-mfs]").hidden = v.route !== "In feed";
    body.querySelector("[data-pro]").hidden = forSow || !isAb(v) || !bid || clinicalSigns(snap, bid);
    const d = wd(v); const end = d ? addDays(v.date || snap.today, Math.max(0, (+v.days || 1) - 1) + d) : null;
    body.querySelector("[data-wd]").textContent = d == null ? "" : d === 0 ? "No meat withdrawal." : `Meat withdrawal ${d} days → not for slaughter before ${dm(end)}.`;
    const ship = bid && snap.data.tasks.find((t) => t.pig?.kind === "ship" && !t.done && t.pig.batchId === bid);
    body.querySelector("[data-w]").replaceChildren(...(ship && end && ship.due < end ? [el(warn(`${batchName(snap.ix.batches.get(bid))} has a load planned ${dm(ship.due)} — inside this withdrawal.`))] : []));
    if (isAb(v) && !v.antibiotic) { const c = body.querySelector("[data-check=antibiotic]"); c.setAttribute("aria-checked", "true"); }
  };
  const es = entrySheet({ title: forSow ? "Treat a sow" : "Treat a pen", body, label: "Save treatment",
    missing: (v) => {
      if (forSow ? !who.id() : !bid) return forSow ? "Choose the sow" : "Choose the batch";
      if (!v.route) return "Choose the route"; if (!v.product || (v.product === "__new" && !v.productName)) return "Choose the product";
      if (!v.reason) return "Choose the reason"; if (v.route === "In feed" && !v.mfsNo) return "Add the MFS prescription number";
      if (!forSow && isAb(v) && !clinicalSigns(snap, bid) && (!v.prophylaxis || !v.vet)) return "Prophylaxis: tick and add the vet";
      return null;
    },
    save(v, sh) {
      const p = prodOf(v);
      const id = saveTreatment(snap, { ...v, product: p ? { id: p.id, name: p.name, active: v.activeIngredient } : null, productName: p ? p.name : v.productName, antibiotic: isAb(v), wdMeatDays: wd(v), batchId: forSow ? undefined : bid, sowId: forSow ? who.id() : undefined, pens: (v.pens || []).map(Number), pigs: forSow ? 1 : v.pigs || undefined, prophylaxis: v.prophylaxis || undefined });
      sh.close(true, { force: true });
      toast(`${p?.name || v.productName} saved · ${forSow ? "sow " + sowLabel(snap.ix.byId.get(who.id())) : batchName(snap.ix.batches.get(bid))}`, { action: "Undo", onAction: () => undoAdd(snap.lid, "medicines", id) });
    } });
  es.form.onChange(paint); paint();
  return es.sheet.done;
}
export { daysBetween };
