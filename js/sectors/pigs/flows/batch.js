// Batch sheets (design/13 §6): weigh a sample, move the batch to another room, plan a load
// (ship task + feed-withdrawal time, §6.3), the kill sheet (§6.4: photo/paste → % in spec, price
// per pig, margin over feed; one finance record) and close the batch (§6.5 summary).
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { textField, checkRow, stepper } from "../../../ui/form.js";
import { toast } from "../../../ui/toast.js";
import { canWrite, canRead } from "../../../core/policy.js";
import { entrySheet, chipsField, numField, dateField, timeField, warn, lawNote, roomPickRow, batchPickRow } from "./common.js";
import { weighSample, moveBatch, planLoad, saveKillSheet, closeBatch } from "../actions.js";
import { batchName, shipBlocked, closeSummary } from "../model/batches.js";
import { killSheetResults } from "../model/money.js";
import { parsePigKillSheet } from "../model/killsheet.js";
import { canFill } from "../model/rooms.js";
import { dm, d2, n0, n1, pctText, pounds } from "../ui.js";
import { photoStrip } from "../../../ui/photo-strip.js";

export function weighSheet(snap, { batchId }) {
  const b = snap.ix.batches.get(batchId); const f = snap.c.bf.get(batchId); const room = snap.ix.rooms.get(b.roomId);
  const body = el(html`<form novalidate><p class="hint" style="margin:0 4px 12px">${batchName(b)} · day ${f?.days ?? "—"} · estimate now ${f ? Math.round(f.est) : "—"} kg</p>
    <div class="form-group">${dateField("date", "Weighed", snap.today)}<div class="field stepper-field"><span class="label">Pigs weighed</span><span class="spacer"></span>${stepper("n", 20, { min: 1, max: 500, label: "Pigs weighed" })}</div>
      ${numField("avgKg", "Average weight (kg)", "")}${numField("totalKg", "or total weight (kg)", "", { optional: true })}
      ${room?.pens?.length ? chipsField("pen", "Pen (optional)", room.pens.map((p) => [String(p.no), String(p.no)]), null) : ""}</div>
    <p class="pg-note">A sample of 10–20 pigs from different pens gives a fair average. It replaces the target growth in the batch estimate.</p></form>`);
  const avg = (v) => (+v.avgKg > 0 ? +v.avgKg : +v.totalKg > 0 && +v.n ? +v.totalKg / +v.n : 0);
  entrySheet({ title: `Weigh sample · ${batchName(b)}`, body, label: "Save weights", missing: (v) => (avg(v) ? null : "Add the average or total weight"),
    save(v, sh) { weighSample(snap, b, { date: v.date || snap.today, n: v.n, avgKg: +avg(v).toFixed(1), pen: v.pen }); sh.close(true, { force: true }); toast(`${batchName(b)} weighed · ${n1(avg(v))} kg average`); } });
}

export function moveBatchSheet(snap, { batchId = null, toRoomId = null } = {}) {
  let bid = batchId, rid = toRoomId;
  const body = el(html`<form novalidate><div class="form-group" data-b></div><div class="form-group" data-r></div>
    <div class="form-group">${dateField("date", "Moved", snap.today)}${numField("avgKg", "Average weight at the move (kg)", "", { optional: true })}<div class="field stepper-field"><span class="label">Pigs weighed</span><span class="spacer"></span>${stepper("weighed", 0, { min: 0, max: 500, label: "Pigs weighed" })}</div></div>
    <div data-fill hidden class="form-group">${checkRow("fillAnyway", "Fill anyway", false, "The room isn't through its wash — recorded as an exception")}</div>
    <p class="pg-note">The weaner phase closes with its own FCR and growth; the batch keeps its number in the new room.</p></form>`);
  const bp = batchPickRow(snap, { label: "Batch", id: bid, onChange: (v) => { bid = v; es.refresh(); } });
  const rp = roomPickRow(snap, { label: "To room", id: rid, title: "To which room?", filter: (r) => !r.batchId && r.kind !== "farrowing", onChange: (v) => { rid = v; paint(); es.refresh(); } });
  body.querySelector("[data-b]").append(bp.node); body.querySelector("[data-r]").append(rp.node);
  const paint = () => { const r = rid && snap.ix.rooms.get(rid); body.querySelector("[data-fill]").hidden = !r || canFill(r, snap.today); };
  const es = entrySheet({ title: "Move a batch", body, label: "Move the batch",
    missing: (v) => (!bid ? "Choose the batch" : !rid ? "Choose the room" : !canFill(snap.ix.rooms.get(rid), snap.today) && !v.fillAnyway ? "Room isn't ready — tick Fill anyway" : null),
    save(v, sh) { const b = snap.ix.batches.get(bid); moveBatch(snap, b, { toRoomId: rid, date: v.date || snap.today, avgKg: v.avgKg, weighed: v.weighed, fillAnyway: v.fillAnyway }); sh.close(true, { force: true }); toast(`${batchName(b)} moved to ${snap.ix.rooms.get(rid).name}`); } });
  es.form.onChange(paint); paint();
}

/** Plan a load (§6.3): number, pens, date/time → ship task with "withdraw feed from …". */
export function planLoadSheet(snap, { batchId, pens = [], n = null }) {
  const b = snap.ix.batches.get(batchId); const f = snap.c.bf.get(batchId);
  const body = el(html`<form novalidate><p class="hint" style="margin:0 4px 12px">${batchName(b)} · ${f?.onFarm ?? 0} pigs on farm${pens.length ? ` · pens ${pens.join(", ")}` : ""}</p>
    <div class="form-group"><div class="field stepper-field"><span class="label">Pigs on the load</span><span class="spacer"></span>${stepper("n", n || Math.min(f?.onFarm || 0, 180), { min: 1, max: 5000, label: "Pigs on the load" })}</div>
      ${dateField("date", "Load day", f?.shipDate && f.shipDate > snap.today ? f.shipDate : snap.today)}${timeField("time", "Loading time", "06:00")}</div>
    <div data-w></div><p class="pg-note" data-wd></p>
    ${lawNote(`Feed is withdrawn no more than ${snap.s.feedWithdrawH} h before loading and 12 h before arrival (Red Tractor LT.4.0).`)}</form>`);
  const paint = () => {
    const v = es.form.values(); const blk = shipBlocked(b, snap.data.medicines, v.date || snap.today);
    body.querySelector("[data-w]").replaceChildren(...(blk.blocked ? [el(warn(`${batchName(b)} can't go for slaughter before ${dm(blk.until)} — withdrawal`))] : []));
    if (v.time && v.date) { const w = new Date(new Date(`${v.date}T${v.time}`) - snap.s.feedWithdrawH * 3600000); body.querySelector("[data-wd]").textContent = `Withdraw feed from ${String(w.getHours()).padStart(2, "0")}:${String(w.getMinutes()).padStart(2, "0")} ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][w.getDay()]}. A pre-filled movement is waiting in Pigs out on the day.`; }
  };
  const es = entrySheet({ title: "Plan a load", body, label: "Plan the load",
    missing: (v) => (!v.date ? "Choose the day" : shipBlocked(b, snap.data.medicines, v.date).blocked ? "Withdrawal — pick a later day" : null),
    save(v, sh) { planLoad(snap, { batchId, roomId: b.roomId, n: v.n, date: v.date, time: v.time, pens }); sh.close(true, { force: true }); toast(`Load planned · ${v.n} pigs ${dm(v.date)}`); } });
  es.form.onChange(paint); paint();
}

/** Kill sheet (§6.4). */
export async function killSheetSheet(snap, { batchId = null } = {}) {
  const { readTextSheet } = await import("../../beef/flows/read-text.js");
  const photos = [];
  const text = await readTextSheet({ title: "Kill sheet", hint: "Take a photo of the kill sheet (or paste the text from the abattoir's email). You can check and change everything on the next screen.", onPhoto: (f) => photos.push(f) });
  const parsed = parsePigKillSheet(text || "");
  return killSheetForm(snap, { batchId, parsed, photos });
}
export function killSheetForm(snap, { batchId = null, parsed = { pigs: [], header: {} }, photos = [] }) {
  let bid = batchId || snap.data.tasks.find((t) => t.pig?.kind === "killsheet" && !t.done)?.pig.batchId || null;
  const money = canWrite(snap.role, "finance"); const h = parsed.header || {}; const pigs = parsed.pigs || [];
  const moveOf = (id) => snap.data.moves.filter((m) => m.batchId === id && m.direction === "off" && m.toSlaughter && !snap.data.killSheets.some((k) => k.moveId === m.id)).sort((a, b) => b.date.localeCompare(a.date))[0];
  const body = el(html`<form novalidate><div class="form-group" data-b></div>
    <div class="form-group">${dateField("date", "Kill date", h.date || moveOf(bid)?.date || snap.today)}${textField({ name: "abattoir", label: "Abattoir", value: h.abattoir || moveOf(bid)?.toName || "" })}
      ${numField("count", "Pigs killed", h.count || pigs.length || moveOf(bid)?.n || "", { step: 1 })}${numField("totalDwKg", "Total deadweight (kg)", h.totalDwKg || (pigs.length ? pigs.reduce((t, p) => t + p.dwKg, 0).toFixed(1) : ""))}
      ${money ? numField("totalPounds", "Total paid £ (after deductions)", "", { optional: true }) : ""}</div>
    <div class="form-group">${numField("doa", "Dead on arrival", h.doa || 0, { step: 1 })}${numField("condemned", "Condemned", h.condemned || 0, { step: 1 })}${numField("tailDamage", "Tail damage noted", h.tailDamage || 0, { step: 1 })}</div>
    ${pigs.length ? html`<p class="form-label">${pigs.length} pigs read from the sheet</p><div class="card pad"><table class="pg-tbl"><thead><tr><th>Slap</th><th class="r">dw kg</th><th class="r">P2</th><th>Grade</th>${money ? html`<th class="r">p/kg</th>` : ""}</tr></thead><tbody>${pigs.slice(0, 40).map((p) => html`<tr class="${p.dwKg < snap.s.bandMin || p.dwKg > snap.s.bandMax ? "late" : ""}"><td>${p.slap || ""}</td><td class="r">${n1(p.dwKg)}</td><td class="r">${p.p2 ?? ""}</td><td>${p.grade || ""}</td>${money ? html`<td class="r">${p.ppk ?? ""}</td>` : ""}</tr>`)}</tbody></table>${pigs.length > 40 ? html`<p class="pg-note">…and ${pigs.length - 40} more.</p>` : ""}</div>` : ""}
    <div class="card pad" data-res style="margin-top:12px"></div>
    ${lawNote("Tail damage on the kill sheet feeds Red Tractor AH.2.g. The £ goes to Money only (owner, manager, accountant).")}</form>`);
  const strip = photoStrip({ lid: snap.lid, role: snap.role, parent: { coll: "killSheets", label: "Kill sheet" }, title: "Kill sheet photos" });
  body.querySelector("[data-res]").after(strip.node);
  if (photos.length) strip.addFiles(photos);
  const bp = batchPickRow(snap, { label: "Batch", id: bid, filter: () => true, onChange: (v) => { bid = v; paint(); es.refresh(); } });
  body.querySelector("[data-b]").append(bp.node);
  const results = (v) => killSheetResults(pigs, snap.s, { count: +v.count || null, totalDwKg: +v.totalDwKg || null, totalPounds: money && +v.totalPounds ? +v.totalPounds : undefined });
  const paint = () => {
    const v = es.form.values(); const r = results(v); const f = bid && snap.c.bf.get(bid);
    const feedPP = f?.feedPerPig; const margin = r.perPig != null && feedPP != null ? r.perPig - feedPP : null;
    body.querySelector("[data-res]").replaceChildren(el(html`<div><div class="pg-bt">
      <div class="num-tile"><span class="label">In spec</span><span class="value">${r.inSpecPct != null ? pctText(r.inSpecPct, 0) : "—"}</span><span class="delta">${snap.s.bandMin}–${snap.s.bandMax} kg dw</span></div>
      <div class="num-tile"><span class="label">Average dw</span><span class="value">${r.avgDw ? n1(r.avgDw) : "—"}<small> kg</small></span><span class="delta">${n0(r.pigs)} pigs</span></div>
      ${money ? html`<div class="num-tile"><span class="label">Price per pig</span><span class="value">${r.perPig != null ? pounds(r.perPig) : "—"}</span><span class="delta">${r.ppk ? n1(r.ppk) + "p/kg" : "add £ paid"}</span></div>
      <div class="num-tile"><span class="label">Margin over feed</span><span class="value">${margin != null ? pounds(margin) : "—"}</span><span class="delta">${feedPP != null ? `feed ${pounds(feedPP)}/pig` : "no feed £ yet"}</span></div>` : ""}</div></div>`));
  };
  const es = entrySheet({ title: "Kill sheet", body, label: "Save kill sheet",
    missing: (v) => (!bid ? "Choose the batch" : !+v.count ? "Add the number of pigs" : !+v.totalDwKg && !pigs.length ? "Add the total deadweight" : null),
    save(v, sh) { const r = results(v); const ksId = saveKillSheet(snap, { batchId: bid, date: v.date || snap.today, abattoir: v.abattoir, pigs, doa: v.doa, condemned: v.condemned, tailDamage: v.tailDamage, moveId: moveOf(bid)?.id }, r); strip.commit(ksId, `Kill sheet · ${v.abattoir || ""} ${v.date || ""}`.trim()); sh.close(true, { force: true }); toast(`Kill sheet saved · ${r.pigs} pigs${r.inSpecPct != null ? ` · ${pctText(r.inSpecPct, 0)} in spec` : ""}`); } });
  es.form.onChange(paint); paint();
  return es.sheet.done;
}

/** Close batch (§6.5): summary card → "Close batch Bnn" → room goes to Emptied. */
export function closeBatchSheet(snap, { batchId }) {
  const b = snap.ix.batches.get(batchId); const f = snap.c.bf.get(batchId);
  const ks = snap.data.killSheets.filter((k) => k.batchId === batchId);
  const rev = canRead(snap.role, "finance") ? snap.data.finance.filter((x) => x.batchId === batchId && x.kind === "revenue").reduce((t, x) => t + (+x.amount || 0), 0) : 0;
  const s = closeSummary(f, ks, rev);
  const money = canRead(snap.role, "finance");
  const row = (k, v) => html`<div class="row no-lead pg-kv"><span class="main"><span class="primary">${k}</span></span><span class="v">${v}</span></div>`;
  const body = el(html`<div>${f.onFarm ? html`<div class="warn-card">${raw(icon("alert"))}<span>${f.onFarm} pigs are still on farm. Record them out (or as deaths) first — or close anyway if the count is wrong.</span></div>` : ""}
    <div class="list" style="margin-top:12px">${row("Final FCR", s.fcr ? s.fcr.toFixed(2) : "—")}${row("Growth", s.dlwg ? `${Math.round(s.dlwg)} g/day` : "—")}${row("Mortality", pctText(s.mortPct))}${row("Days", s.days)}
      ${money ? row("Feed £ per pig", s.feedPerPig != null ? pounds(s.feedPerPig, 2) : "—") : ""}${money ? row("Margin per pig over feed", s.marginPerPig != null ? pounds(s.marginPerPig, 2) : "—") : ""}${row("In spec", s.inSpecPct != null ? pctText(s.inSpecPct, 0) : "—")}</div>
    <p class="pg-note">${ks.length ? "Final FCR uses the kill-sheet weights." : "No kill sheets — FCR uses the live weights on the moves."} The room goes to “Emptied” in the wash cycle.</p></div>`);
  const btn = el(html`<button type="button" class="btn">Close batch ${batchName(b)}</button>`);
  import("../../../ui/sheet.js").then(({ openSheet }) => {
    const sh = openSheet({ title: `Close ${batchName(b)}`, body, footer: btn });
    btn.onclick = () => { closeBatch(snap, b, { fcr: s.fcr ? +s.fcr.toFixed(2) : null, dlwg: s.dlwg ? Math.round(s.dlwg) : null, mortPct: s.mortPct != null ? +s.mortPct.toFixed(4) : null, days: s.days, inSpecPct: s.inSpecPct ?? null }); /* margin stays in Money only (01-platform §15) */ sh.close(true, { force: true }); toast(`${batchName(b)} closed`); };
  });
}
export { d2 };
