// Shared pieces for Broilers entry sheets: the honest Save button, chip fields, number/date
// fields, the house picker and "which crop" helpers.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { openSheet } from "../../../ui/sheet.js";
import { wireForm, guardButton, chipGroup } from "../../../ui/form.js";
import { toast } from "../../../ui/toast.js";
import { currentCrop, cropDay } from "../model/crop.js";

export const nowHM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
export const opt = (list) => list.map((x) => (Array.isArray(x) ? { value: x[0], label: x[1] ?? x[0] } : { value: x, label: x }));
export function chipsField(name, label, options, value, { multi = false, hint = "" } = {}) {
  return html`<div class="field chips-field"><span class="label">${label}</span>${chipGroup(name, opt(options), value == null ? [] : value, { multi })}${hint ? html`<span class="help">${hint}</span>` : ""}</div>`;
}
export const dateField = (name, label, value) => html`<div class="field"><label>${label}</label><input type="date" name="${name}" value="${value || ""}"></div>`;
export const timeField = (name, label, value) => html`<div class="field"><label>${label}</label><input type="time" name="${name}" value="${value || ""}"></div>`;
export const dtField = (name, label, value) => html`<div class="field"><label>${label}</label><input type="datetime-local" name="${name}" value="${value || ""}"></div>`;
export const numField = (name, label, value = "", { step = "any", placeholder = "", optional = false, unit = "" } = {}) => html`<div class="field"><label>${label}${optional ? html` <span class="opt">(optional)</span>` : ""}</label><input name="${name}" inputmode="decimal" type="number" step="${step}" value="${value ?? ""}" placeholder="${placeholder}">${unit ? html`<span class="br-unit">${unit}</span>` : ""}</div>`;
export const textField = (name, label, value = "", { placeholder = "", optional = false } = {}) => html`<div class="field"><label>${label}${optional ? html` <span class="opt">(optional)</span>` : ""}</label><input name="${name}" value="${value ?? ""}" placeholder="${placeholder}"></div>`;
export const warn = (text, level = "") => html`<div class="warn-card ${level}" style="margin-top:12px">${raw(icon("alert"))}<span>${text}</span></div>`;
export const lawNote = (text) => html`<p class="br-law">${text}</p>`;

/** Open an entry sheet: body (form), label, missing(values) -> reason|null, save(values, sheet). */
export function entrySheet({ title, body, label, missing = () => null, save, size, footerExtra }) {
  const btn = el(html`<button type="button" class="btn">${label}</button>`);
  const foot = footerExtra ? el(html`<div class="br-foot"></div>`) : btn;
  if (footerExtra) foot.append(footerExtra, btn);
  const f = wireForm(body);
  const lbl = () => (typeof label === "function" ? label(f.values()) : label);
  const refresh = () => guardButton(btn, lbl(), () => missing(f.values()));
  f.onChange(refresh); body.addEventListener("click", () => setTimeout(refresh, 0)); refresh();
  let start = JSON.stringify(f.values());
  const sh = openSheet({ title, body, footer: foot, size, isDirty: () => JSON.stringify(f.values()) !== start, discardTitle: `Discard this ${title.toLowerCase().replace(/ ·.*$/, "")}?` });
  btn.onclick = async () => { const v = f.values(); if (missing(v)) return; btn.disabled = true; try { await save(v, sh); } catch (e) { console.error(e); toast("Couldn't save that. Try again."); } finally { btn.disabled = false; } };
  const rebase = () => { start = JSON.stringify(f.values()); };
  return { sheet: sh, form: f, refresh, btn, rebase };
}

/** Pick a house (only houses with a crop when withCrop). Resolves the house or null. */
export async function pickHouse(snap, { title = "Which house?", withCrop = true, filter = () => true } = {}) {
  const hs = snap.ix.houses.filter((h) => (!withCrop || currentCrop(snap.ix, h.id)) && filter(h));
  if (!hs.length) { toast(withCrop ? "No crop in the houses. Start a crop when chicks are placed." : "Add a house first (More → Houses)."); return null; }
  if (hs.length === 1) return hs[0];
  const body = el(html`<div class="list">${hs.map((h) => { const c = currentCrop(snap.ix, h.id); return html`<button type="button" class="row" data-h="${h.id}"><span class="tile">${raw(icon("house"))}</span><span class="main"><span class="primary">${h.name}</span><span class="secondary">${c ? `Crop ${c.no || ""} · day ${cropDay(c, snap.today)}` : `${h.usableM2 ? h.usableM2.toLocaleString("en-GB") + " m²" : ""} · empty`}</span></span></button>`; })}</div>`);
  const sh = openSheet({ title, body, size: "small" });
  body.onclick = (e) => { const b = e.target.closest("[data-h]"); if (b) sh.close(b.dataset.h, { force: true }); };
  const id = await sh.done; return typeof id === "string" ? snap.ix.houseById.get(id) : null;
}
/** The house + its current crop (asking which house when there are several). */
export async function houseCrop(snap, { houseId, cropId, title } = {}) {
  if (cropId) { const crop = snap.ix.cropById.get(cropId); return crop ? { house: snap.ix.houseById.get(crop.houseId), crop } : null; }
  const house = houseId ? snap.ix.houseById.get(houseId) : await pickHouse(snap, { title });
  if (!house) return null; const crop = currentCrop(snap.ix, house.id);
  if (!crop) { toast(`No crop in ${house.name}.`); return null; }
  return { house, crop };
}
