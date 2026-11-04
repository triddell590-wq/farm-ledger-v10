// Served (design/13 §7.2): sow number (typed, or one tap from "To serve") → date/time → AI batch
// or boar (from semen stock: boar, batch, doses left) → "+ another" insemination on the same
// card → Save. The sow joins the batch being served this week; semen doses −1 each.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { toast } from "../../../ui/toast.js";
import { entrySheet, chipsField, nowHM, sowPickRow, lawNote } from "./common.js";
import { recordService, undoAdd } from "../actions.js";
import { toServe, sowLabel, cycleOf } from "../model/sows.js";
import { weekIndex, weekNo } from "../model/weeks.js";
import { batchName } from "../model/batches.js";
import { d2 } from "../ui.js";

export function servedSheet(snap, { sowId = null } = {}) {
  const list = toServe(snap.s, snap.ix, snap.data.sows, snap.today).filter((x) => !snap.data.services.some((s) => s.sowId === x.sow.id && s.date >= snap.today));
  const stock = snap.data.semen.filter((x) => (+x.doses || 0) > 0 && (!x.expiry || x.expiry >= snap.today));
  const semOpts = [...stock.map((x) => [x.id, `Boar ${x.boar}${x.batch ? " · " + x.batch : ""} · ${x.doses} left`]), ["nat", "Natural service"], ["other", "Other AI"]];
  const ins = [{ time: nowHM(), semenId: stock[0]?.id || "nat" }];
  const body = el(html`<form novalidate>
    ${list.length ? html`<div class="form-group">${chipsField("quick", `To serve this week (${list.length})`, list.slice(0, 18).map((x) => [x.sow.id, `${sowLabel(x.sow)} · ${x.why}`]), sowId && list.some((x) => x.sow.id === sowId) ? sowId : null)}</div>` : ""}
    <div class="form-group" data-pr style="margin-top:12px"></div>
    <div class="form-group"><div class="field"><label>Date</label><input type="date" name="date" value="${snap.today}"></div></div>
    <p class="form-label">Inseminations</p><div data-ins></div>
    <button type="button" class="text-btn" data-more style="margin:4px 8px">${raw(icon("plus"))} Another insemination</button>
    <p class="pg-note" data-batch></p>
    ${lawNote("Semen and breeding-stock supplier records are kept 6 years (Red Tractor TI.7).")}
  </form>`);
  const pr = sowPickRow(snap, { label: "Sow number", id: sowId, title: "Which sow?", filter: (s, c) => s.type !== "boar" && c.status !== "farrowing" && c.status !== "suckling", onChange: () => { syncQuick(); paintBatch(); es.refresh(); } });
  body.querySelector("[data-pr]").append(pr.node);
  const paintIns = () => {
    body.querySelector("[data-ins]").replaceChildren(...ins.map((x, i) => el(html`<div class="form-group" data-i="${i}" style="margin-bottom:8px">
      <div class="field"><label>${i === 0 ? "1st" : i === 1 ? "2nd" : "3rd"} · time</label><input type="time" data-t="${i}" value="${x.time || ""}"></div>
      ${chipsField(`sem${i}`, "Semen / boar", semOpts, x.semenId)}
      ${x.semenId === "nat" || x.semenId === "other" ? html`<div class="field"><label>Boar</label><input data-b="${i}" value="${x.boar || ""}" placeholder="Boar number"></div>` : ""}
      ${i > 0 ? html`<div class="pg-ins"><span class="ink-2">Repeat insemination</span><button type="button" class="text-btn" data-rm="${i}">Remove</button></div>` : ""}</div>`)));
    body.querySelector("[data-more]").hidden = ins.length >= 3;
  };
  body.addEventListener("input", (e) => { const t = e.target.dataset.t, b = e.target.dataset.b; if (t != null) ins[+t].time = e.target.value; if (b != null) ins[+b].boar = e.target.value; });
  body.addEventListener("click", (e) => {
    const m = e.target.closest("[data-more]"); if (m) { ins.push({ time: nowHM(), semenId: ins[ins.length - 1].semenId, boar: ins[ins.length - 1].boar }); paintIns(); return; }
    const r = e.target.closest("[data-rm]"); if (r) { ins.splice(+r.dataset.rm, 1); paintIns(); return; }
    const ch = e.target.closest("[data-chips^=sem] .chip"); if (ch) { const i = +ch.parentElement.dataset.chips.slice(3); setTimeout(() => { ins[i].semenId = ch.dataset.value; paintIns(); }, 0); return; }
    const q = e.target.closest("[data-chips=quick] .chip"); if (q) setTimeout(() => { pr.set(q.dataset.value); paintBatch(); es.refresh(); }, 0);
  });
  const syncQuick = () => body.querySelectorAll("[data-chips=quick] .chip").forEach((c) => c.setAttribute("aria-checked", String(c.dataset.value === pr.id())));
  const paintBatch = () => {
    const v = es?.form.values() || {}; const date = v.date || snap.today; const s = pr.id() && snap.ix.byId.get(pr.id());
    const c = s && cycleOf(snap.s, snap.ix, s, date);
    const same = snap.data.batches.find((b) => b.serveDate && weekIndex(b.serveDate) === weekIndex(date));
    const repeat = c?.first && c.days <= 10;
    body.querySelector("[data-batch]").textContent = !s ? "" : repeat ? `Repeat service — stays in ${batchName(snap.ix.batches.get(c.first.batchId))} (first served ${d2(c.first.date)}).` : `Joins ${same ? batchName(same) : `B${Math.max(snap.c.nextNo, ...snap.data.batches.map((b) => +b.no + 1 || 0))} (new batch)`} — served week ${weekNo(date)}. Due ${d2(new Date(new Date(date + "T12:00Z").getTime() + snap.s.gestation * 864e5).toISOString().slice(0, 10))}.`;
  };
  paintIns();
  const es = entrySheet({ title: "Served", body, label: "Save service",
    missing: (v) => (!pr.id() ? "Choose the sow" : !v.date ? "Add the date" : ins.some((x) => (x.semenId === "nat" || x.semenId === "other") && !x.boar) ? "Add the boar number" : null),
    save(v, sh) {
      const sem = (x) => snap.data.semen.find((s) => s.id === x.semenId);
      const r = recordService(snap, { sowId: pr.id(), date: v.date, time: ins[0].time, inseminations: ins.map((x) => ({ time: x.time, kind: x.semenId === "nat" ? "Natural" : "AI", semenId: sem(x)?.id, boar: sem(x)?.boar || x.boar, semenBatch: sem(x)?.batch })) });
      sh.close(true, { force: true });
      const s = snap.ix.byId.get(pr.id());
      toast(`${sowLabel(s)} served · ${ins.length} insemination${ins.length > 1 ? "s" : ""}`, { action: "Undo", onAction: () => r.ids.forEach((id) => undoAdd(snap.lid, "services", id)) });
    } });
  es.form.onChange(() => paintBatch()); paintBatch(); syncQuick();
  return es.sheet.done;
}
