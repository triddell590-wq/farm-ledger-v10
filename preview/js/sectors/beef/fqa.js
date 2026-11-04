// Inspection ready? (design/10 §9.2): the FQAS-based self-check. Auto items check themselves
// from the records; the rest are ticked with a date (and an optional note), or marked n/a.
import { html, raw } from "../../core/html.js";
import { el } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { openSheet } from "../../ui/sheet.js";
import { textField, wireForm } from "../../ui/form.js";
import { toast } from "../../ui/toast.js";
import { canWriteMeta } from "../../core/policy.js";
import { backLink, largeTitle, groupLabel } from "../../screens/common.js";
import { auth } from "../../core/auth.js";
import { liveSnap } from "./data.js";
import { setMeta } from "./actions.js";
import { fqaScore, FQA_SECTIONS, FQA_STANDARD } from "./model/fqa.js";
import { photoStrip } from "../../ui/photo-strip.js";
import { readyScore, readyHero, readyLists, wireReady } from "../../ui/ready-check.js";

const LINK = { vetops: "paperwork/vetops", medpurchases: "paperwork/medpurchases", medicine: "paperwork/medicine", disposal: "paperwork/disposal", tb: "paperwork/tb", money: "money", register: "paperwork/register" };

export default async function fqaScreen(ctx) {
  const body = el(html`<div class="beef-page"></div>`);
  const { first, stop } = liveSnap(ctx.ledger, (snap) => { const y = window.scrollY; body.replaceChildren(render(snap)); if (y) window.scrollTo(0, y); });
  await first;
  return { el: body, title: "Inspection ready?", depth: 1, tab: "paperwork", destroy: stop };
}

const STATE = { ok: "ok", warn: "due", fail: "gap", todo: "open", na: "na" };
/** The FQAS items as ready-check rows (review A #14): auto items score; the rest are a plain checklist. */
export function fqaRows(snap, ticks) {
  const sc = fqaScore(snap.c, ticks); const sec = Object.fromEntries(FQA_SECTIONS);
  return sc.res.filter(({ it, r }) => !(it.optional && r.status === "todo" && it.type === "auto")).map(({ it, r }) => {
    const t = ticks[it.id] || {};
    if (it.type === "auto") return { id: it.id, text: it.t, sec: sec[it.s], auto: true, state: STATE[r.status], note: r.detail, link: r.link && LINK[r.link] ? `#/l/${snap.lid}/${LINK[r.link]}` : null, extra: r.manualToo || it.dated };
    return { id: it.id, text: it.t + (it.optional ? " (if it applies)" : ""), sec: sec[it.s], auto: false, state: r.status === "na" ? "na" : r.status === "ok" ? "ok" : "open", done: r.status === "ok", note: t.done || t.date ? [r.detail || (t.date ? `Ticked ${t.date}` : ""), t.note].filter(Boolean).join(" · ") : r.status === "warn" ? r.detail : "", extra: true };
  });
}
export const fqaHasData = (snap) => snap.data.animals.length > 0;

function render(snap) {
  const ticks = snap.meta.fqa?.items || {};
  const rows = fqaRows(snap, ticks); const sc = readyScore(rows, fqaHasData(snap)); const can = canWriteMeta(snap.role, "fqa");
  const node = el(html`<div>${backLink(`#/l/${snap.lid}/paperwork`, "Paperwork")}${largeTitle("Inspection ready?", sc.hasData ? `${sc.ok} of ${sc.n} checked from your records · ${sc.selfDone} of ${sc.selfN} ticked` : "Add your cattle and the app starts checking")}
    ${readyHero(sc, { footer: FQA_STANDARD.footer, source: FQA_STANDARD.header })}
    ${readyLists(rows, { can, actions: (r) => (can && r.extra ? html`<button type="button" class="text-btn" data-tick>${r.auto ? "Tick" : "Note or photo"}</button>` : "") })}
  </div>`);
  wireReady(node, (id, on) => { const t = ticks[id] || {}; const by = auth.user?.displayName || auth.user?.email || ""; setMeta(snap.lid, "fqa", { version: FQA_STANDARD.version, items: { ...ticks, [id]: on ? { ...t, done: true, na: false, date: snap.today, by } : { ...t, done: false, date: null } } }); toast(on ? "Ticked" : "Unticked"); });
  node.querySelectorAll("[data-tick]").forEach((b) => (b.onclick = () => tickSheet(snap, b.closest("[data-id]").dataset.id, ticks, b.closest("[data-id]").querySelector(".primary").textContent.trim())));
  return node;
}

function tickSheet(snap, id, ticks, label = "") {
  const t = ticks[id] || {};
  const body = el(html`<form novalidate><div class="form-group">${textField({ name: "date", label: "Checked on", type: "date", value: t.date || snap.today })}${textField({ name: "note", label: "Note", value: t.note || "", optional: true, placeholder: "Where it's kept, who signed it…" })}</div>
    <div class="act-grid"><button type="button" class="btn secondary" data-na>Doesn't apply to us</button>${t.done || t.na ? html`<button type="button" class="btn secondary" data-clear>Clear</button>` : ""}</div></form>`);
  const btn = el(html`<button type="button" class="btn">In place</button>`);
  // photo evidence (housing, sharps bin, isolation pen, signed plans…): saved at once on the item
  const strip = photoStrip({ lid: snap.lid, role: snap.role, parent: { coll: "checklist", id: `fqa.${id}`, label: `FQAS ${id}${label ? " · " + label.slice(0, 80) : ""}` }, title: "Photo evidence", hint: "Optional" });
  body.querySelector(".form-group").after(strip.node);
  const f = wireForm(body); const sh = openSheet({ title: "Tick this item", body, footer: btn });
  sh.done.then(() => strip.destroy());
  const save = (v) => { setMeta(snap.lid, "fqa", { version: FQA_STANDARD.version, items: { ...ticks, [id]: { ...v, photos: strip.count() } } }); sh.close(true, { force: true }); toast("Checklist updated"); };
  const by = auth.user?.displayName || auth.user?.email || "";
  btn.onclick = () => save({ done: true, date: f.values().date, note: f.values().note, by });
  body.querySelector("[data-na]").onclick = () => save({ na: true, date: snap.today, by });
  body.querySelector("[data-clear]")?.addEventListener("click", () => save({ done: false, na: false, date: null }));
}
