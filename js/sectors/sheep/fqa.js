// Inspection ready? (design/11 §9.5): the FQAS-based self-check, sheep items. Auto items check
// themselves from the Sheep records; dated and manual items are ticked by the owner or manager.
// One membership per farm: ticks made in the Beef ledger on the same farm count here too
// (shown as "ticked in Beef"), so a mixed farm doesn't tick the same thing twice.
import { html, raw } from "../../core/html.js";
import { el } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { openSheet } from "../../ui/sheet.js";
import { textField, wireForm } from "../../ui/form.js";
import { toast } from "../../ui/toast.js";
import { canWriteMeta } from "../../core/policy.js";
import { getMeta } from "../../services/records.js";
import { session } from "../../services/session.js";
import { auth } from "../../core/auth.js";
import { largeTitle, backLink, groupLabel } from "../../screens/common.js";
import { liveScreen } from "./screen.js";
import { fqaStatus, FQA_SECTIONS, FQA_STANDARD } from "./model/fqa.js";
import * as A from "./actions.js";
import { evidenceStrip } from "../../ui/photo-strip.js";
import { readyScore, readyHero, readyLists, wireReady } from "../../ui/ready-check.js";


/** Ticks from the Beef ledger on the same farm (read-only here). */
async function beefTicks(ledger) {
  const b = (session.ledgers || []).find((l) => l.type === "beef" && l.farmId === ledger.farmId && ["owner", "manager", "worker", "viewer"].includes(l.role));
  if (!b) return {};
  const m = await getMeta(b.id, "fqa").catch(() => null);
  return m?.items || {};
}
/** Own ticks win; a Beef tick fills a gap. */
export function mergeTicks(own = {}, beef = {}) {
  const out = { ...own };
  for (const [k, v] of Object.entries(beef)) if (!out[k] || (!out[k].done && !out[k].date)) out[k] = { ...v, fromBeef: true };
  return out;
}

const STATE = { ok: "ok", warn: "due", fail: "gap" };
/** FQAS sheep items as ready-check rows (review A #14). */
export function sheepFqaRows(snap, ticks) {
  const st = fqaStatus(snap.c, ticks); const sec = Object.fromEntries(FQA_SECTIONS);
  return st.items.map((it) => it.type === "auto"
    ? { id: it.id, text: `${it.ref} ${it.t}`, sec: sec[it.s], auto: true, state: STATE[it.res.status] || "open", note: it.res.text, link: it.res.href ? `#/l/${snap.lid}/${it.res.href}` : null }
    : { id: it.id, text: `${it.ref} ${it.t}`, sec: sec[it.s], auto: false, state: "open", done: it.res.status === "ok", note: (ticks[it.id]?.done || ticks[it.id]?.date) ? `${it.res.text}${ticks[it.id]?.fromBeef ? " (ticked in Beef)" : ""}` : "" });
}
export const sheepHasData = (snap) => (snap.data.mobs || []).some((m) => !m.deleted);

export default async function fqa(ctx) {
  const beef = await beefTicks(ctx.ledger);
  return liveScreen(ctx, { title: "Inspection ready?", tab: "paperwork", paint: (snap) => {
    const ticks = mergeTicks(snap.meta.fqa?.items || {}, beef); const can = canWriteMeta(snap.role, "fqa");
    const rows = sheepFqaRows(snap, ticks); const sc = readyScore(rows, sheepHasData(snap));
    return html`<div>${backLink(`#/l/${snap.lid}/paperwork`, "Paperwork")}${largeTitle("Inspection ready?", sc.hasData ? `${sc.ok} of ${sc.n} checked from your records · ${sc.selfDone} of ${sc.selfN} ticked` : "Add your sheep and the app starts checking")}
      ${readyHero(sc, { footer: FQA_STANDARD.footer, source: FQA_STANDARD.header })}
      ${Object.keys(beef).length ? html`<p class="hint">Sheep and Beef on this farm share one FQAS membership — ticks from your Beef ledger count here.</p>` : ""}
      ${readyLists(rows, { can, actions: (r) => (can && !r.auto ? html`<button type="button" class="text-btn" data-tick>Note or photo</button>` : "") })}</div>`;
  }, after: (node, snap) => {
    const ticks = snap.meta.fqa?.items || {};
    wireReady(node, (id, on) => { const t = ticks[id] || {}; const by = auth.user?.displayName || auth.user?.email || ""; A.saveFqa(snap.lid, { ...ticks, [id]: on ? { ...t, done: true, date: snap.today, by } : { ...t, done: false, date: null } }); toast(on ? "Ticked" : "Unticked"); });
    node.querySelectorAll("[data-tick]").forEach((b) => (b.onclick = () => tickSheet(snap, b.closest("[data-id]").dataset.id, ticks)));
  } });
}

function tickSheet(snap, id, ticks) {
  const t = ticks[id] || {};
  const body = el(html`<form novalidate><div class="form-group">${textField({ name: "date", label: "Checked on", type: "date", value: t.date || snap.today })}${textField({ name: "note", label: "Note", value: t.note || "", optional: true, placeholder: "Where it's kept, who signed it…" })}</div>
    ${t.done || t.date ? html`<button type="button" class="btn secondary" data-clear>Clear this tick</button>` : ""}</form>`);
  const btn = el(html`<button type="button" class="btn">In place</button>`);
  const strip = evidenceStrip(body, { lid: snap.lid, role: snap.role, list: "fqa", itemId: id, label: `FQAS ${id}` });
  const f = wireForm(body); const sh = openSheet({ title: "Tick this item", body, footer: btn });
  sh.done.then(() => strip.destroy());
  const by = auth.user?.displayName || auth.user?.email || "";
  const save = (v) => { A.saveFqa(snap.lid, { ...ticks, [id]: { ...v, photos: strip.count() } }); sh.close(true, { force: true }); toast("Checklist updated"); };
  btn.onclick = () => save({ done: true, date: f.values().date, note: f.values().note, by });
  body.querySelector("[data-clear]")?.addEventListener("click", () => save({ done: false, date: null, note: "" }));
}
