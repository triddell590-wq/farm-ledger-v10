// Paperwork sheets (design/13 §8): quarterly vet visit (QVR) with its actions, periodic checks
// (vermin quarterly, water test yearly, tail-biting risk assessment yearly), plans on file with
// sign-off dates, the 1 June pig inventory helper (§19–20) and closing a PM2 month.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { textField, checkRow } from "../../../ui/form.js";
import { toast } from "../../../ui/toast.js";
import { addDays } from "../model/dates.js";
import { entrySheet, chipsField, numField, dateField, lawNote } from "./common.js";
import { saveVetVisit, saveSiteCheck, savePlan, saveInventory, closePm2, undoAdd } from "../actions.js";
import { CHECK_KINDS, PLANS } from "../model/paperwork.js";
import { inventoryCounts } from "../model/inventory.js";
import { photoStrip } from "../../../ui/photo-strip.js";

export function vetVisitSheet(snap) {
  const vets = snap.contacts.filter((c) => c.kind === "Vet"); const acts = [{ text: "", due: addDays(snap.today, 28) }];
  const body = el(html`<form novalidate><div class="form-group">${dateField("date", "Visit date", snap.today)}${textField({ name: "vet", label: "Vet", value: vets[0]?.name || "", placeholder: "Name, MRCVS" })}
      ${chipsField("type", "Visit", [["QVR", "Quarterly vet visit (QVR)"], ["other", "Other visit"]], "QVR")}${textField({ name: "reportNote", label: "Report", placeholder: "Where the report is filed, or a summary", optional: true })}</div>
    <p class="form-label">Actions agreed</p><div data-acts></div><button type="button" class="text-btn" data-add style="margin:4px 8px">${raw(icon("plus"))} Another action</button>
    <div class="form-group" style="margin-top:12px">${checkRow("tailDockingApproved", "Tail-docking need reviewed by the vet", false, "Red Tractor HP.3 — only where the risk assessment shows it's needed")}${checkRow("prophylaxisReviewed", "Group prophylactic treatments reviewed", false)}</div>
    ${lawNote("Red Tractor AH.10.1: a vet visit every quarter, never more than 20 weeks apart. Each action becomes a job with a due date (AH.5.1).")}</form>`);
  const paint = () => body.querySelector("[data-acts]").replaceChildren(...acts.map((a, i) => el(html`<div class="form-group" style="margin-bottom:8px"><div class="field"><label>Action ${i + 1}</label><input data-at="${i}" value="${a.text}" placeholder="e.g. Raise water flow in weaners"></div><div class="field"><label>Due</label><input type="date" data-ad="${i}" value="${a.due}"></div></div>`)));
  paint();
  body.addEventListener("input", (e) => { const t = e.target.dataset.at, d = e.target.dataset.ad; if (t != null) acts[+t].text = e.target.value; if (d != null) acts[+d].due = e.target.value; });
  body.querySelector("[data-add]").onclick = () => { acts.push({ text: "", due: addDays(snap.today, 28) }); paint(); };
  const strip = photoStrip({ lid: snap.lid, role: snap.role, parent: { coll: "vetVisits", label: "Vet visit" }, title: "Report photos", hint: "QVR report pages" });
  body.querySelector("[data-acts]").before(strip.node);
  entrySheet({ title: "Vet visit", body, label: "Save vet visit", missing: (v) => (!v.vet ? "Add the vet's name" : !v.date ? "Add the date" : null),
    save(v, sh) { const id = saveVetVisit(snap, { ...v, actions: acts }); strip.commit(id, `Vet visit · ${v.type || "QVR"} · ${v.vet}`); sh.close(true, { force: true }); toast(`Vet visit saved${acts.filter((a) => a.text).length ? ` · ${acts.filter((a) => a.text).length} actions` : ""}`, { action: "Undo", onAction: () => undoAdd(snap.lid, "vetVisits", id) }); } });
}

const RESULT = { vermin: [["clear", "No signs"], ["signs", "Signs found — baited"], ["contractor", "Contractor visit"]], water: [["pass", "Pass"], ["fail", "Fail — action taken"]], tailRisk: [["done", "Done — plan updated"]] };
export function siteCheckSheet(snap, { kind }) {
  const k = CHECK_KINDS[kind];
  const body = el(html`<form novalidate><div class="form-group">${dateField("date", "Date", snap.today)}${chipsField("result", "Result", RESULT[kind], RESULT[kind][0][0])}${textField({ name: "by", label: "Done by", placeholder: "you, or the contractor", optional: true })}${textField({ name: "note", label: "Note", optional: true })}</div></form>`);
  entrySheet({ title: k.label, body, label: "Save", missing: (v) => (v.date ? null : "Add the date"),
    save(v, sh) { const id = saveSiteCheck(snap, kind, v); sh.close(true, { force: true }); toast(`${k.label} saved`, { action: "Undo", onAction: () => undoAdd(snap.lid, "siteChecks", id) }); } });
}

export function planSheet(snap, { kind }) {
  const name = Object.fromEntries(PLANS)[kind] || "Plan";
  const body = el(html`<form novalidate><div class="form-group">${dateField("signedOn", "Signed off", snap.today)}${textField({ name: "by", label: "Signed by", placeholder: "you and/or your vet" })}${textField({ name: "note", label: "Where it's kept", placeholder: "e.g. office folder, vet portal", optional: true })}</div>
    <p class="hint">Keep the plan itself in Documents on your farm. Review it at least once a year.</p></form>`);
  entrySheet({ title: name, body, label: "Save sign-off", missing: (v) => (v.signedOn ? null : "Add the date"),
    save(v, sh) { savePlan(snap, kind, v); sh.close(true, { force: true }); toast(`${name} signed off`); } });
}

/** 1 June pig inventory (§19–20): pre-filled per category, one return per herd / establishment number. */
export function inventorySheet(snap, { date }) {
  const c = inventoryCounts(snap, date); const contract = snap.s.contract.on && snap.s.contract.integratorOwns;
  const body = el(html`<form novalidate><p class="hint" style="margin:0 4px 12px">Counted from your records for ${date}. Change any figure to what you count on the day.${contract ? " Pigs you rear for another business are left out." : ""}</p>
    <div class="form-group">${textField({ name: "establishment", label: "Establishment number (herd mark)", value: snap.s.herdMark || "" })}</div>
    <div class="form-group">${Object.entries(c.counts).map(([k, n]) => numField(k, k[0].toUpperCase() + k.slice(1), contract ? 0 : n, { step: 1 }))}</div>
    <div class="form-group">${dateField("submittedOn", "Sent to NISRA / DAERA on", "")}${textField({ name: "ref", label: "Reference", optional: true })}</div>
    ${lawNote("One return per herd / establishment number, even if you have no pigs on the day.")}</form>`);
  entrySheet({ title: "Pig inventory", body, label: "Save inventory", missing: (v) => (v.establishment ? null : "Add the establishment number"),
    save(v, sh) { const counts = Object.fromEntries(Object.keys(c.counts).map((k) => [k, +v[k] || 0])); saveInventory(snap, { date, establishment: v.establishment, counts, total: Object.values(counts).reduce((t, n) => t + n, 0), submittedOn: v.submittedOn, ref: v.ref, excludedContract: contract }); sh.close(true, { force: true }); toast("Inventory saved"); } });
}

export function pm2CloseSheet(snap, m) {
  const body = el(html`<form novalidate><p class="hint" style="margin:0 4px 12px">${m.month}: opening ${m.opening} + born ${m.born} + on ${m.on} − off ${m.off} − died ${m.died} = <b>${m.closing}</b></p>
    <div class="form-group">${numField("counted", "Pigs counted at month end", m.closing, { step: 1 })}${textField({ name: "note", label: "If it differs, why?", placeholder: "e.g. 2 found dead in the slurry channel", optional: true })}</div></form>`);
  entrySheet({ title: `Close ${m.month}`, body, label: "Close the month",
    missing: (v) => (+v.counted !== m.closing && !v.note ? `Count difference ${+v.counted - m.closing} — add a note` : null),
    save(v, sh) { closePm2(snap, m, v); sh.close(true, { force: true }); toast(`${m.month} closed`); } });
}
