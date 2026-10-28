// Shared pieces for Beef entry sheets: a "pick cattle" row, date/time defaults, the honest
// Save button, and who is signed in.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { openSheet } from "../../../ui/sheet.js";
import { wireForm, guardButton } from "../../../ui/form.js";
import { auth } from "../../../core/auth.js";
import { pickAnimals, namesOf } from "../ui.js";
import { onFarm } from "../model/animals.js";

export const me = () => auth.user?.displayName || auth.user?.email || "";
export const nowHM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

/** A row that opens the animal picker. Returns { node, ids(), set(ids) }. */
export function cattleRow(snap, { label = "Cattle", multi = true, filter = onFarm, ids = [], title, onChange } = {}) {
  let cur = [...ids];
  const node = el(html`<button type="button" class="field pick-row" data-pick><span class="label">${label}</span><span class="pick-val"></span>${raw(icon("chevron"))}</button>`);
  const paint = () => { node.querySelector(".pick-val").textContent = cur.length ? (cur.length > 1 ? `${cur.length} selected · ${namesOf(snap, cur, 2)}` : namesOf(snap, cur)) : "Choose"; node.classList.toggle("is-empty", !cur.length); };
  node.onclick = async () => { const r = await pickAnimals(snap, { title: title || `Choose ${multi ? "cattle" : label.toLowerCase()}`, multi, filter, preselect: cur }); if (r) { cur = r; paint(); onChange && onChange(cur); } };
  paint();
  return { node, ids: () => cur, set(v) { cur = [...v]; paint(); } };
}

/**
 * Open an entry sheet. body: Node (a <form>); label: Save label; missing(values) -> reason|null;
 * save(values) -> void. Extra pieces may call refresh() after changing things.
 */
export function entrySheet({ title, body, label, missing, save, dirty }) {
  const btn = el(html`<button type="button" class="btn">${label}</button>`);
  const f = wireForm(body);
  const refresh = () => guardButton(btn, label, () => missing(f.values()));
  f.onChange(refresh); body.addEventListener("click", () => setTimeout(refresh, 0)); refresh();
  const start = JSON.stringify(f.values());
  const sh = openSheet({ title, body, footer: btn, isDirty: dirty || (() => JSON.stringify(f.values()) !== start), discardTitle: `Discard this ${title.toLowerCase()}?` });
  btn.onclick = async () => { const v = f.values(); if (missing(v)) return; btn.disabled = true; try { await save(v, sh); } finally { btn.disabled = false; } };
  return { sheet: sh, form: f, refresh, btn };
}
export const opt = (pairs) => pairs.map(([value, label]) => ({ value, label: label ?? value }));
