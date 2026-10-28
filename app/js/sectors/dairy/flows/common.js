// Shared pieces for Dairy entry sheets: the cow row (opens the picker), chip fields, the
// honest Save button, date/time defaults.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { openSheet } from "../../../ui/sheet.js";
import { wireForm, guardButton, chipGroup } from "../../../ui/form.js";
import { toast } from "../../../ui/toast.js";
import { pickCows, cowLabel } from "../ui.js";
import { onFarm, lactation, ordinal } from "../model/cows.js";
import { nowStr } from "../model/milking.js";

export const nowHM = () => nowStr().slice(11, 16);
export const opt = (list) => list.map((x) => (Array.isArray(x) ? { value: x[0], label: x[1] ?? x[0] } : { value: x, label: x }));
export function chipsField(name, label, options, value, { multi = false } = {}) {
  return html`<div class="field chips-field"><span class="label">${label}</span>${chipGroup(name, opt(options), value == null ? [] : value, { multi })}</div>`;
}

/** A row that opens the cow picker. Returns { node, ids(), set(ids) }. */
export function cowPickRow(snap, { label = "Cow", multi = false, filter = onFarm, ids = [], title, onChange } = {}) {
  let cur = [...ids];
  const node = el(html`<button type="button" class="field pick-row" data-pick><span class="label">${label}</span><span class="pick-val"></span>${raw(icon("chevron"))}</button>`);
  const name = (id) => { const a = snap.ix.byId.get(id); if (!a) return ""; const lac = lactation(snap.ix, a); return `${cowLabel(a)}${a.name ? " " + a.name : ""}${!multi && lac ? ` · ${ordinal(lac)} lact` : ""}`; };
  const paint = () => { node.querySelector(".pick-val").textContent = cur.length ? (cur.length > 3 ? `${cur.length} cows · ${cur.slice(0, 3).map(name).join(", ")}…` : cur.map(name).join(", ")) : "Choose"; node.classList.toggle("empty", !cur.length); };
  node.onclick = async () => { const r = await pickCows(snap, { title: title || (multi ? "Choose cows" : `Choose ${label.toLowerCase()}`), multi, filter, preselect: cur }); if (r) { cur = r; paint(); onChange && onChange(cur); node.dispatchEvent(new Event("change", { bubbles: true })); } }; // the change event lets the sheet re-check its Save button
  paint();
  return { node, ids: () => cur, set(v) { cur = [...v]; paint(); } };
}

/** Open an entry sheet: body (form), label, missing(values) -> reason|null, save(values, sheet). */
export function entrySheet({ title, body, label, missing, save, size }) {
  const btn = el(html`<button type="button" class="btn">${label}</button>`);
  const f = wireForm(body);
  const refresh = () => guardButton(btn, label, () => missing(f.values()));
  f.onChange(refresh); body.addEventListener("click", () => setTimeout(refresh, 0)); refresh();
  const start = JSON.stringify(f.values());
  const sh = openSheet({ title, body, footer: btn, size, isDirty: () => JSON.stringify(f.values()) !== start, discardTitle: `Discard this ${title.toLowerCase()}?` });
  btn.onclick = async () => { const v = f.values(); if (missing(v)) return; btn.disabled = true; try { await save(v, sh); } catch (e) { console.error(e); toast("Couldn't save that. Try again."); } finally { btn.disabled = false; } };
  return { sheet: sh, form: f, refresh, btn };
}
export const dateTimeFields = (date, time) => html`<div class="field"><label>Date</label><input type="date" name="date" value="${date}"></div><div class="field"><label>Time</label><input type="time" name="time" value="${time}"></div>`;
