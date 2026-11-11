// Feed delivery (design/13 §7.8): docket → date, supplier, ration, tonnes, £/t, bin, the batch(es)
// the feed is for (default: the batch in the room the bin serves) → Save. Updates bin stock and
// batch feed; one finance record for the £ (money roles only). "Keep a sample for 6 months"
// (Red Tractor FW.8). Small herd: "Feed bought" in bags.
import { html, raw } from "../../../core/html.js";
import { icon } from "../../../ui/icons.js";
import { parseFeedDocket } from "../model/docket.js";
import { el } from "../../../ui/dom.js";
import { textField, checkRow } from "../../../ui/form.js";
import { toast } from "../../../ui/toast.js";
import { canWrite } from "../../../core/policy.js";
import { entrySheet, chipsField, numField, dateField, lawNote } from "./common.js";
import { saveFeedDelivery, feedBought, undoAdd } from "../actions.js";
import { batchName } from "../model/batches.js";
import { photoStrip } from "../../../ui/photo-strip.js";

export function feedSheet(snap, { binId = null } = {}) {
  const bins = snap.data.bins; const money = canWrite(snap.role, "finance");
  const suppliers = [...new Set(snap.data.feedDeliveries.map((d) => d.supplier).filter(Boolean))].slice(0, 5);
  const batches = snap.data.batches.filter((b) => !b.closed && (b.numberIn != null || b.inDate));
  const defBatches = (bid) => { const bin = bins.find((b) => b.id === bid); return (bin?.roomIds || []).map((r) => snap.ix.rooms.get(r)?.batchId).filter(Boolean); };
  const body = el(html`<form novalidate>
    <p class="hint" style="margin:0 4px 12px">Copy it off the docket — or read a photo of it. Feed records are kept 2 years (Red Tractor FW.6).</p>
    <button type="button" class="btn secondary" data-docket style="margin:0 0 12px">${raw(icon("camera"))}Read the docket</button>
    <div class="form-group">${dateField("date", "Delivered", snap.today)}
      ${textField({ name: "supplier", label: "Supplier", value: suppliers[0] || "", placeholder: "e.g. Thompsons" })}
      ${textField({ name: "ration", label: "Ration", value: bins.find((b) => b.id === binId)?.ration || "", placeholder: "Finisher pellets" })}
      ${numField("tonnes", "Tonnes", "")}
      ${money ? numField("pricePerT", "£ per tonne", "", { optional: true }) : ""}
      ${textField({ name: "docketNo", label: "Docket number", optional: true })}</div>
    ${bins.length ? html`<div class="form-group">${chipsField("binId", "Into bin", bins.map((b) => [b.id, b.name]), binId || (bins.length === 1 ? bins[0].id : null))}</div>` : html`<p class="pg-note">No feed bins set up — add them in More → Rooms, bins and semen to see days left.</p>`}
    ${batches.length ? html`<div class="form-group" data-bt>${chipsField("batchIds", "For batch", batches.map((b) => [b.id, `${batchName(b)}${snap.ix.rooms.get(b.roomId) ? " · " + snap.ix.rooms.get(b.roomId).name : ""}`]), defBatches(binId), { multi: true })}</div>` : ""}
    <div class="form-group">${checkRow("sampleKept", "Sample of this delivery kept", false, "Keep it at least 6 months (Red Tractor FW.8)")}</div>
    <p class="pg-note" data-sum></p>
  </form>`);
  const strip = photoStrip({ lid: snap.lid, role: snap.role, parent: { coll: "feedDeliveries", label: "Feed delivery" }, title: "Docket photos", hint: "Kept 2 years" });
  body.appendChild(strip.node);
  const es = entrySheet({ title: "Feed delivery", body, label: "Save delivery",
    missing: (v) => (!+v.tonnes ? "Add the tonnes" : !v.ration ? "Add the ration" : null),
    save(v, sh) { const id = saveFeedDelivery(snap, { ...v, batchIds: v.batchIds || [] }); strip.commit(id, `Feed docket · ${v.ration || ""} ${v.date || ""}`.trim()); sh.close(true, { force: true }); toast(`${(+v.tonnes).toFixed(1)} t ${v.ration} saved`, { action: "Undo", onAction: () => undoAdd(snap.lid, "feedDeliveries", id) }); } });
  body.querySelector("[data-docket]").onclick = async () => {
    const { readTextSheet } = await import("../../beef/flows/read-text.js");
    const text = await readTextSheet({ title: "Feed docket", hint: "Take a photo of the docket (or paste the text). Check what it read before you save.", onPhoto: (f) => strip.addFiles([f]) });
    if (!text) return;
    const d = parseFeedDocket(text); let n = 0;
    for (const k of ["date", "supplier", "ration", "tonnes", "docketNo", ...(money ? ["pricePerT"] : [])]) if (d[k] != null && d[k] !== "") { const inp = body.querySelector(`[name=${k}]`); if (inp) { inp.value = d[k]; inp.dispatchEvent(new Event("input", { bubbles: true })); n++; } }
    es.refresh(); toast(n ? `Read ${n} thing${n > 1 ? "s" : ""} off the docket — check them` : "Couldn't read the docket — type the details");
  };
  let lastBin = binId;
  es.form.onChange((name) => {
    const v = es.form.values();
    if (name === "binId" && v.binId !== lastBin) { lastBin = v.binId; const d = new Set(defBatches(v.binId)); body.querySelectorAll("[data-chips=batchIds] .chip").forEach((c) => c.setAttribute("aria-checked", String(d.has(c.dataset.value)))); const bin = bins.find((b) => b.id === v.binId); const r = body.querySelector("[name=ration]"); if (bin?.ration && !r.value) r.value = bin.ration; }
    body.querySelector("[data-sum]").textContent = money && +v.tonnes && +v.pricePerT ? `£${(+v.tonnes * +v.pricePerT).toLocaleString("en-GB", { maximumFractionDigits: 2 })} goes to Money as a feed cost.` : "";
  });
  return es.sheet.done;
}

/** Small herd: feed bought in bags. */
export function feedBoughtSheet(snap) {
  const money = canWrite(snap.role, "finance");
  const body = el(html`<form novalidate><div class="form-group">${dateField("date", "Bought", snap.today)}${textField({ name: "ration", label: "Feed", placeholder: "Sow rolls, creep, grower nuts" })}${numField("bags", "Bags", "", { step: 1 })}${numField("bagKg", "Kg per bag", 25)}${textField({ name: "supplier", label: "From", optional: true })}${money ? numField("amount", "Cost £", "", { optional: true }) : ""}</div>
    ${lawNote("Keep the receipt or docket — feed records are kept 2 years.")}</form>`);
  entrySheet({ title: "Feed bought", body, label: "Save", missing: (v) => (!+v.bags ? "Add the number of bags" : null),
    save(v, sh) { const id = feedBought(snap, v); sh.close(true, { force: true }); toast(`${v.bags} bags saved`, { action: "Undo", onAction: () => undoAdd(snap.lid, "feedDeliveries", id) }); } });
}
