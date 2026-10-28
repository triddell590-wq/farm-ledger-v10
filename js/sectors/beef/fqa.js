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

const LINK = { vetops: "paperwork/vetops", medpurchases: "paperwork/medpurchases", medicine: "paperwork/medicine", disposal: "paperwork/disposal", tb: "paperwork/tb", money: "money", register: "paperwork/register" };
const MARK = { ok: ["ok", "check", "Evidenced"], warn: ["due", "alert", "Check"], fail: ["late", "alert", "Gap"], todo: ["neutral", "clock", "Tick yourself"], na: ["neutral", "close", "Not applicable"] };

export default async function fqaScreen(ctx) {
  const body = el(html`<div class="beef-page"></div>`);
  const { first, stop } = liveSnap(ctx.ledger, (snap) => { const y = window.scrollY; body.replaceChildren(render(snap)); if (y) window.scrollTo(0, y); });
  await first;
  return { el: body, title: "Inspection ready?", depth: 1, tab: "paperwork", destroy: stop };
}

function render(snap) {
  const ticks = snap.meta.fqa?.items || {};
  const sc = fqaScore(snap.c, ticks); const can = canWriteMeta(snap.role, "fqa");
  const node = el(html`<div>${backLink(`#/l/${snap.lid}/paperwork`, "Paperwork")}${largeTitle("Inspection ready?", `${sc.ok} of ${sc.total} in place`)}
    <div class="num-tile hero"><span class="label">Score</span><span class="value">${sc.pct}%</span><span class="sub">${FQA_STANDARD.footer}</span><span class="source">${FQA_STANDARD.header}</span></div>
    ${FQA_SECTIONS.map(([n, name]) => { const items = sc.res.filter(({ it }) => it.s === n); const done = items.filter(({ r }) => r.status === "ok" || r.status === "na").length;
      return html`<div class="section">${groupLabel(`${n}. ${name}`, `${done}/${items.length}`)}<div class="list">${items.map(({ it, r }) => { const [lvl, ic, word] = MARK[r.status];
        return html`<div class="row fqa-item" data-id="${it.id}"><span class="main"><span class="primary">${it.t}${it.type === "auto" ? html` <span class="auto-tag">auto</span>` : ""}${it.optional ? html` <span class="ink-3" style="font-weight:400">(if it applies)</span>` : ""}</span>${r.detail ? html`<span class="secondary">${r.detail}</span>` : ""}
          <span class="row-actions">${r.link && LINK[r.link] ? html`<a class="text-btn" href="#/l/${snap.lid}/${LINK[r.link]}">Show me</a>` : ""}${can && (it.type !== "auto" || r.manualToo || it.dated || r.status === "todo") ? html`<button type="button" class="text-btn" data-tick>${ticks[it.id]?.done ? "Update" : "Tick"}</button>` : ""}</span></span>
          <span class="pill ${lvl}">${raw(icon(ic))}${word}</span></div>`; })}</div></div>`; })}
  </div>`);
  node.querySelectorAll("[data-tick]").forEach((b) => (b.onclick = () => tickSheet(snap, b.closest("[data-id]").dataset.id, ticks, b.closest("[data-id]").querySelector(".primary").textContent.replace(/\s+auto$/, "").trim())));
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
