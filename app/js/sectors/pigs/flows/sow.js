// Sow entry sheets: add / edit a breeding pig, scan result, return to heat, into the farrowing
// crate, gilt in heat, cull, lost tag (design/13 §4, §11 "Replace the mark within 28 days").
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { textField, checkRow } from "../../../ui/form.js";
import { toast } from "../../../ui/toast.js";
import { confirmSheet } from "../../../ui/sheet.js";
import { entrySheet, chipsField, numField, dateField, warn, lawNote } from "./common.js";
import { saveSow, recordScan, returnToHeat, moveToFarrowing, markInHeat, planCull, lostTag, undoAdd } from "../actions.js";
import { cycleOf, sowLabel, crateEntryCheck } from "../model/sows.js";
import { crateMap } from "./farrowing.js";
import { updateRecord } from "../../../services/records.js";
import { dm } from "../ui.js";

/** Add or edit a sow, gilt or boar. */
export function sowSheet(snap, { id } = {}) {
  const old = id ? snap.ix.byId.get(id) : null;
  const body = el(html`<form novalidate>
    <div class="form-group">${chipsField("type", "This is a", [["sow", "Sow"], ["gilt", "Gilt"], ["boar", "Boar"]], old?.type || "sow")}
      ${textField({ name: "sowNo", label: "Sow number", value: old?.sowNo || "", inputmode: "numeric", placeholder: "on the ear tag" })}
      ${textField({ name: "tag", label: "Full ear tag", value: old?.tag || (snap.s.herdMark ? snap.s.herdMark + " " : ""), placeholder: "UK NI1234 01187", optional: true })}
      ${textField({ name: "name", label: "Name", value: old?.name || "", optional: true })}
      ${textField({ name: "breed", label: "Breed / line", value: old?.breed || "", optional: true })}</div>
    <div class="form-group">${dateField("dob", "Born", old?.dob || "")}${dateField("entered", "Came into the herd", old?.entered || snap.today)}
      ${textField({ name: "source", label: "From (breeding company or farm)", value: old?.source || "", optional: true })}
      ${numField("parityAtEntry", "Litters before she came here", old?.parityAtEntry ?? "", { optional: true, step: 1 })}</div>
    ${lawNote("Breeding-stock supplier records are kept for 6 years (Red Tractor TI.7).")}
  </form>`);
  const dupe = (v) => snap.data.sows.some((s) => s.id !== old?.id && String(s.sowNo) === String(v.sowNo).trim() && !s.cull?.date && !s.died);
  entrySheet({ title: old ? `Edit ${sowLabel(old)}` : "Add a breeding pig", body, label: old ? "Save changes" : "Add to the herd",
    missing: (v) => (!String(v.sowNo || "").trim() ? "Add the sow number to save" : dupe(v) ? `${v.sowNo} is already in the herd` : null),
    save(v, sh) { const nid = saveSow(snap, v, old); sh.close(true, { force: true }); toast(old ? "Saved" : `${v.type === "boar" ? "Boar" : v.type === "gilt" ? "Gilt" : "Sow"} ${v.sowNo} added`, old ? {} : { action: "Undo", onAction: () => undoAdd(snap.lid, "sows", nid) }); } });
}

export function scanSheet(snap, { sowId }) {
  const s = snap.ix.byId.get(sowId); const c = cycleOf(snap.s, snap.ix, s, snap.today);
  const body = el(html`<form novalidate><p class="hint" style="margin:0 4px 12px">Sow <b>${sowLabel(s)}</b> · served ${c.days} days ago</p>
    <div class="form-group">${chipsField("result", "Scan result", [["+", "In pig (+)"], ["-", "Empty (−)"], ["recheck", "Recheck"]], null)}${dateField("date", "Date", snap.today)}</div></form>`);
  entrySheet({ title: "Scan result", body, label: "Save scan", missing: (v) => (v.result ? null : "Choose the result"),
    save(v, sh) { const id = recordScan(snap, { sowId, date: v.date || snap.today, result: v.result }); sh.close(true, { force: true }); toast(`${sowLabel(s)} scanned ${v.result === "+" ? "in pig" : v.result === "-" ? "empty" : "— recheck"}`, { action: "Undo", onAction: () => undoAdd(snap.lid, "scans", id) }); } });
}

export async function returnedSheet(snap, { sowId }) {
  const s = snap.ix.byId.get(sowId);
  if (await confirmSheet({ title: `${sowLabel(s)} returned to heat?`, body: "Her services this cycle are closed. She goes on the list to serve again.", confirm: "Returned" })) { returnToHeat(snap, s); toast(`${sowLabel(s)} marked returned — serve her again`); }
}
export function heatNow(snap, { sowId }) { const s = snap.ix.byId.get(sowId); markInHeat(snap, s); toast(`${sowLabel(s)} in heat — on the list to serve`); }
export function lostTagToggle(snap, { sowId }) {
  const s = snap.ix.byId.get(sowId); const replacing = s.lostTag && !s.lostTag.replaced;
  lostTag(snap, s, replacing); toast(replacing ? `Mark replaced on ${sowLabel(s)}` : `Tag lost on ${sowLabel(s)} — replace within 28 days`);
}

/** Cull: planned (on the cull list) or gone today (moves off via Pigs out). */
export function cullSheet(snap, { sowId }) {
  const s = snap.ix.byId.get(sowId);
  const body = el(html`<form novalidate><div class="form-group">${chipsField("reason", "Reason", ["Age / parity", "Not in pig", "Repeat returns", "Lame", "Poor litters", "Shoulder sores", "Udder", "Other"], s.cull?.reason || null)}
    ${chipsField("when", "When", [["plan", "Put on the cull list"], ["gone", "Left the farm today"]], "plan")}${dateField("date", "Date", snap.today)}</div>
    <p class="hint">When she leaves, record the move in Pigs out so it reaches the movement book.</p></form>`);
  entrySheet({ title: `Cull ${sowLabel(s)}`, body, label: "Save", missing: (v) => (v.reason ? null : "Choose a reason"),
    save(v, sh) { if (v.when === "gone") updateRecord(snap.lid, "sows", s, { cull: { planned: true, reason: v.reason, on: s.cull?.on || snap.today, date: v.date || snap.today }, location: null }); else planCull(snap, s, v.reason); sh.close(true, { force: true }); toast(v.when === "gone" ? `${sowLabel(s)} culled` : `${sowLabel(s)} on the cull list`); } });
}

/** Into the farrowing crate (§4.2 move = due − 5; never more than 7 days before due). */
export function intoCrateSheet(snap, { sowId }) {
  const s = snap.ix.byId.get(sowId); const c = cycleOf(snap.s, snap.ix, s, snap.today);
  const rooms = snap.data.rooms.filter((r) => r.kind === "farrowing");
  if (!rooms.length) { toast("Add a farrowing room first (More → Rooms, bins and semen)."); return; }
  const opts = []; for (const r of rooms) for (const x of crateMap(snap, r)) if (x.state === "free") opts.push([`${r.id}|${x.no}`, `${r.name} C${x.no}`]);
  const body = el(html`<form novalidate><p class="hint" style="margin:0 4px 12px">Sow <b>${sowLabel(s)}</b>${c.dates ? ` · due ${dm(c.dates.due)}` : ""}</p>
    <div class="form-group">${opts.length ? chipsField("crate", "Crate", opts.slice(0, 48), null) : html`<div class="field"><span class="label">No free crates</span></div>`}${dateField("date", "Moved in", snap.today)}</div><div data-w></div></form>`);
  const es = entrySheet({ title: "Into farrowing", body, label: "Move her in", missing: (v) => (v.crate ? null : "Choose a crate"),
    save(v, sh) { const [roomId, crate] = v.crate.split("|"); moveToFarrowing(snap, [{ sowId, roomId, crate: +crate }], v.date || snap.today); sh.close(true, { force: true }); toast(`${sowLabel(s)} into ${snap.ix.rooms.get(roomId).name} C${crate}`); } });
  const chk = () => { const v = es.form.values(); const r = c.dates ? crateEntryCheck(v.date || snap.today, c.dates.due) : { ok: true }; body.querySelector("[data-w]").replaceChildren(...(r.ok ? [] : [el(warn(`She ${r.text}.`))])); };
  es.form.onChange(chk); chk();
}
export { raw, checkRow };
