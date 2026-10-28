// Shared pieces for Layers entry sheets: the honest Save button, chip fields, number fields,
// the house picker, the live summary bar.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { openSheet } from "../../../ui/sheet.js";
import { wireForm, guardButton, chipGroup } from "../../../ui/form.js";
import { toast } from "../../../ui/toast.js";
import { sortedHouses, flockIn } from "../model/flock.js";
import { pickFrom, n0 } from "../ui.js";
import { standardFor } from "../model/standards.js";

export const nowHM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
export const opt = (list) => list.map((x) => (Array.isArray(x) ? { value: x[0], label: x[1] ?? x[0] } : { value: x, label: x }));
export function chipsField(name, label, options, value, { multi = false, hint = "" } = {}) {
  return html`<div class="field chips-field ly-chips"><span class="label">${label}</span>${chipGroup(name, opt(options), value == null ? [] : value, { multi })}${hint ? html`<span class="help">${hint}</span>` : ""}</div>`;
}
export const dateField = (name, label, value, { optional = false } = {}) => html`<div class="field"><label>${label}${optional ? html` <span class="opt">(optional)</span>` : ""}</label><input type="date" name="${name}" value="${value || ""}"></div>`;
export const timeField = (name, label, value, { optional = false } = {}) => html`<div class="field"><label>${label}${optional ? html` <span class="opt">(optional)</span>` : ""}</label><input type="time" name="${name}" value="${value || ""}"></div>`;
export const numField = (name, label, value = "", { step = "any", placeholder = "", optional = false, unit = "" } = {}) => html`<div class="field"><label>${label}${optional ? html` <span class="opt">(optional)</span>` : ""}</label><input name="${name}" inputmode="decimal" type="number" step="${step}" value="${value ?? ""}" placeholder="${placeholder}">${unit ? html`<span class="ly-unit">${unit}</span>` : ""}</div>`;
export const warn = (text) => html`<div class="warn-card" style="margin-top:12px">${raw(icon("alert"))}<span>${text}</span></div>`;
export const lawNote = (text) => html`<p class="ly-law">${text}</p>`;

/** Houses with their flock today (for pickers). */
export function liveHouses(snap, date = snap.today) { return sortedHouses(snap.c).map((h) => ({ h, f: flockIn(snap.c, h.id, date) })); }
/** Ask which house if there is more than one with a flock. Resolves { h, f } or null. */
export async function chooseHouse(snap, { title = "Which house?", houseId = null, needFlock = true } = {}) {
  const list = liveHouses(snap).filter((x) => !needFlock || x.f);
  if (houseId) return list.find((x) => x.h.id === houseId) || null;
  if (!list.length) { toast(needFlock ? "No house has a flock in it. Place a flock first (More → Houses and flocks)." : "Add a house first."); return null; }
  if (list.length === 1) return list[0];
  const id = await pickFrom({ title, items: list.map(({ h, f }) => ({ id: h.id, title: h.name, sub: f ? `${standardFor(f.breedStdId).breed} · ${n0(f.placed)} placed` : "Empty" })) });
  return id ? list.find((x) => x.h.id === id) : null;
}

/** Open an entry sheet: body (form), label, missing(values) -> reason|null, save(values, sheet). */
export function entrySheet({ title, body, label, missing, save, size, footerExtra }) {
  const btn = el(html`<button type="button" class="btn">${label}</button>`);
  const foot = footerExtra ? el(html`<div class="ly-foot"></div>`) : btn;
  if (footerExtra) foot.append(footerExtra, btn);
  const f = wireForm(body);
  const refresh = () => guardButton(btn, label, () => missing(f.values()));
  f.onChange(refresh); body.addEventListener("click", () => setTimeout(refresh, 0)); refresh();
  let start = JSON.stringify(f.values());
  const sh = openSheet({ title, body, footer: foot, size, isDirty: () => JSON.stringify(f.values()) !== start, discardTitle: `Discard this ${title.toLowerCase().replace(/ ·.*$/, "")}?` });
  btn.onclick = async () => { const v = f.values(); if (missing(v)) return; btn.disabled = true; try { await save(v, sh); } catch (e) { console.error(e); toast("Couldn't save that. Try again."); } finally { btn.disabled = false; } };
  const rebase = () => { start = JSON.stringify(f.values()); };
  return { sheet: sh, form: f, refresh, btn, rebase };
}
