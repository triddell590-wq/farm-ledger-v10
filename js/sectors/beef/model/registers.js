// Printable registers in DAERA column order (kept from v9.14) and the gap checks that feed
// the inspection checklist. Pure.
import { ddmmyy } from "../../../core/dates.js";
import { parseTag, breedCode, sexCode, colourCode } from "./tags.js";

export const MC3_HEADERS = ["1. Identification number (ear tag)", "2. Replacement tags / Retags", "3. Colour", "4. Breed Type", "5. Sex", "6. Date of Birth", "7. Dam's identification number (for animals born into herd)", "8. Date of movement onto holding", "9. Name and address of premises from which moved (and market lot No.)", "10. Date of movement off holding or date of death", "11(a). Name and address of premises to which moved OR Lost/Stolen OR if dead", "11(b). Manner and place of disposal of carcass"];
export const MED_HEADERS = ["Name of Veterinary Medicine", "Identity of Animal/Group Treated", "Person Administering Medicine", "First Date of Use", "Last Date of Use", "Withdrawal: Meat", "Withdrawal: Milk", "Withdrawal: Other", "Total Quantity Used", "Batch Number", "Source of the Medicine"];
export const MEDPUR_HEADERS = ["Date of Purchase", "Name of Veterinary Medicine and Quantity Purchased", "Batch Number", "Expiry Date", "Suppliers of Veterinary Medicine"];
export const DISP_HEADERS = ["Name of Veterinary Medicine", "Date of Disposal", "Quantity of product disposed", "How and where it was disposed of", "Batch Number"];

const retags = (a) => [a.retag, ...(a.replacementTags || []).map((r) => `${r.tag || ""}${r.date ? " " + ddmmyy(r.date) : ""}`.trim())].filter(Boolean).join("; ");
export function mc3Row(a) {
  return [a.tag || "", retags(a), colourCode(a.colour), breedCode(a.breed), sexCode(a.sex), ddmmyy(a.dob), a.damTag || "", ddmmyy(a.onDate),
    [a.fromText || "", a.lot ? `Lot ${a.lot}` : ""].filter(Boolean).join(" · "), ddmmyy(a.offDate), a.offTo || "", a.disposal || ""];
}
/** Animals in the register: everyone ever on the holding (moved-off and dead stay 10 years). */
export function registerAnimals(animals, { from, to, onFarmOnly } = {}) {
  return animals.filter((a) => !a.deleted && (!onFarmOnly || !a.offDate))
    .filter((a) => { const start = a.onDate || a.dob || ""; const end = a.offDate || "9999"; return (!to || start <= to) && (!from || end >= from); })
    .sort((x, y) => String(x.onDate || x.dob).localeCompare(String(y.onDate || y.dob)) || String(x.tag).localeCompare(String(y.tag)));
}
const wd = (days, end) => (end ? `${days != null && days !== "" ? days + " d, " : ""}ends ${ddmmyy(end)}` : days === 0 || days === "0" ? "Nil" : "");
export function medRow(m) {
  const ids = (m.animalTags || []).join(", ") + (m.brokenNeedle ? ` (BROKEN NEEDLE, site: ${m.injectionSite || "?"})` : m.injectionSite ? ` (site: ${m.injectionSite})` : "");
  return [m.productName || "", ids, m.administeredBy || "", ddmmyy(m.date), ddmmyy(m.lastDate || m.date), wd(m.withdrawalMeatDays, m.withdrawalEndDateMeat) || "Nil",
    wd(m.withdrawalMilkDays, m.withdrawalEndDateMilk) || "Nil", m.withdrawalOther || "Nil", `${m.quantity || ""}${m.quantity ? m.quantityUnit || "" : ""}`, m.batchNumber || "", m.source || ""];
}
export function medPurRow(p, firstUse) {
  const sup = p.supplier ? (firstUse && p.supplierAddress ? `${p.supplier}, ${p.supplierAddress}` : p.supplier) : "";
  return [ddmmyy(p.date), `${p.productName || ""}${p.quantity ? ", " + p.quantity : ""}`, p.batchNumber || "", ddmmyy(p.expiryDate), sup];
}
export const dispRow = (m) => [m.productName || "", ddmmyy(m.disposalDate || m.date), m.disposalQty || "", m.disposalMethod || "", m.batchNumber || ""];

export const useRecords = (meds) => meds.filter((m) => !m.deleted && !m.notUsed);
export const disposalRecords = (meds) => meds.filter((m) => !m.deleted && m.notUsed);
export const medPurchases = (purchases) => purchases.filter((p) => !p.deleted && p.kind === "medicine");
/** True when this purchase is the first from its supplier (DAERA wants the address once). */
export function isFirstUseOfSupplier(p, all) {
  const same = medPurchases(all).filter((x) => x.supplier && x.supplier === p.supplier).sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id)));
  return same[0] && same[0].id === p.id;
}

export function registerGaps(a) {
  const miss = [];
  if (!parseTag(a.tag)) miss.push("full ear tag");
  if (!a.colour) miss.push("colour");
  if (!breedCode(a.breed)) miss.push("breed");
  if (!sexCode(a.sex)) miss.push("sex");
  if (!a.dob) miss.push("date of birth");
  if (a.onDate && !a.fromText) miss.push("moved from");
  if (!a.onDate && !a.damTag) miss.push("dam's tag or date moved on");
  if (a.offDate && !a.offTo) miss.push("moved to / dead");
  if (a.offTo === "Dead" && !a.disposal) miss.push("carcass disposal");
  return miss;
}
export function medUseGaps(m) {
  const miss = [];
  if (!m.productName) miss.push("name");
  if (!(m.animalTags || []).length) miss.push("animal ID");
  if (!m.administeredBy) miss.push("person administering");
  if (!m.date) miss.push("first date");
  if (!m.quantity) miss.push("quantity");
  if (!m.batchNumber) miss.push("batch no.");
  if (!m.source) miss.push("source");
  if (m.brokenNeedle && !m.injectionSite) miss.push("injection site (broken needle)");
  return miss;
}
export function medPurGaps(p, all) {
  const miss = [];
  if (!p.productName) miss.push("name");
  if (!p.quantity) miss.push("quantity");
  if (!p.batchNumber) miss.push("batch no.");
  if (!p.expiryDate) miss.push("expiry date");
  if (!p.supplier) miss.push("supplier");
  else if (isFirstUseOfSupplier(p, all) && !p.supplierAddress) miss.push("supplier address (first time)");
  return miss;
}
/** CSV text (with BOM) for a register: { title, headers, rows, top? } */
export function toCsv(doc) {
  const q = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  const lines = [];
  if (doc.top) doc.top.forEach(([l, v]) => lines.push([q(l), q(v)].join(",")));
  lines.push(doc.headers.map(q).join(","));
  doc.rows.forEach((r) => lines.push(r.map(q).join(",")));
  return "﻿" + lines.join("\r\n");
}
