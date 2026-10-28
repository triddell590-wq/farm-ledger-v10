// Shared pieces for Pigs entry sheets: the honest Save button, chip fields, pick rows that
// open the sow / room / batch pickers, date-time defaults.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { openSheet } from "../../../ui/sheet.js";
import { wireForm, guardButton, chipGroup } from "../../../ui/form.js";
import { toast } from "../../../ui/toast.js";
import { pickSow, pickRoom, pickBatch } from "../ui.js";
import { sowLabel } from "../model/sows.js";
import { batchName } from "../model/batches.js";
import { roomFacts } from "../model/facts.js";

export const nowHM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
export const opt = (list) => list.map((x) => (Array.isArray(x) ? { value: x[0], label: x[1] ?? x[0] } : { value: x, label: x }));
export function chipsField(name, label, options, value, { multi = false, hint = "" } = {}) {
  return html`<div class="field chips-field"><span class="label">${label}</span>${chipGroup(name, opt(options), value == null ? [] : value, { multi })}${hint ? html`<span class="help">${hint}</span>` : ""}</div>`;
}
export const dateField = (name, label, value) => html`<div class="field"><label>${label}</label><input type="date" name="${name}" value="${value || ""}"></div>`;
export const timeField = (name, label, value) => html`<div class="field"><label>${label}</label><input type="time" name="${name}" value="${value || ""}"></div>`;
export const numField = (name, label, value = "", { step = "any", placeholder = "", optional = false } = {}) => html`<div class="field"><label>${label}${optional ? html` <span class="opt">(optional)</span>` : ""}</label><input name="${name}" inputmode="decimal" type="number" step="${step}" value="${value ?? ""}" placeholder="${placeholder}"></div>`;

function pickRow(label, text, onPick) {
  const node = el(html`<button type="button" class="field pick-row"><span class="label">${label}</span><span class="pick-val"></span>${raw(icon("chevron"))}</button>`);
  const paint = (t) => { node.querySelector(".pick-val").textContent = t || "Choose"; node.classList.toggle("empty", !t); };
  paint(text); node.onclick = onPick;
  return { node, paint };
}
/** Row that opens the sow picker. Returns { node, id(), set(id) } */
export function sowPickRow(snap, { label = "Sow", id = null, title, filter, onChange } = {}) {
  let cur = id; const name = (x) => { const s = snap.ix.byId.get(x); return s ? `${sowLabel(s)}${s.tag ? " · " + s.tag : ""}` : ""; };
  const r = pickRow(label, name(cur), async () => { const v = await pickSow(snap, { title: title || "Choose a sow", filter }); if (v) { cur = v; r.paint(name(cur)); onChange && onChange(cur); } });
  return { node: r.node, id: () => cur, set(v) { cur = v; r.paint(name(v)); } };
}
export function roomPickRow(snap, { label = "Room", id = null, title, filter, onChange } = {}) {
  let cur = id; const name = (x) => snap.ix.rooms.get(x)?.name || "";
  const r = pickRow(label, name(cur), async () => { const v = await pickRoom(snap, { title: title || "Choose a room", filter, facts: roomFacts(snap.c) }); if (v) { cur = v; r.paint(name(cur)); onChange && onChange(cur); } });
  return { node: r.node, id: () => cur, set(v) { cur = v; r.paint(name(v)); } };
}
export function batchPickRow(snap, { label = "Batch", id = null, title, filter, onChange } = {}) {
  let cur = id; const name = (x) => { const b = snap.ix.batches.get(x); const r = b && snap.ix.rooms.get(b.roomId); return b ? `${batchName(b)}${r ? " · " + r.name : ""}` : ""; };
  const r = pickRow(label, name(cur), async () => { const v = await pickBatch(snap, { title: title || "Choose a batch", filter }); if (v) { cur = v; r.paint(name(cur)); onChange && onChange(cur); } });
  return { node: r.node, id: () => cur, set(v) { cur = v; r.paint(name(v)); } };
}

/** Open an entry sheet: body (form), label, missing(values) -> reason|null, save(values, sheet). */
export function entrySheet({ title, body, label, missing, save, size }) {
  const btn = el(html`<button type="button" class="btn">${label}</button>`);
  const f = wireForm(body);
  const refresh = () => guardButton(btn, label, () => missing(f.values()));
  f.onChange(refresh); body.addEventListener("click", () => setTimeout(refresh, 0)); refresh();
  let start = JSON.stringify(f.values());
  const sh = openSheet({ title, body, footer: btn, size, isDirty: () => JSON.stringify(f.values()) !== start, discardTitle: `Discard this ${title.toLowerCase()}?` });
  btn.onclick = async () => { const v = f.values(); if (missing(v)) return; btn.disabled = true; try { await save(v, sh); } catch (e) { console.error(e); toast("Couldn't save that. Try again."); } finally { btn.disabled = false; } };
  /** Call after filling defaults in code, so only the farmer's own changes count as unsaved. */
  const rebase = () => { start = JSON.stringify(f.values()); };
  return { sheet: sh, form: f, refresh, btn, rebase };
}
export const warn = (text) => html`<div class="warn-card" style="margin-top:12px">${raw(icon("alert"))}<span>${text}</span></div>`;
export const lawNote = (text) => html`<p class="pg-law">${text}</p>`;
