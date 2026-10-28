// Sample weigh (design/15 §6.1): tap weights in one by one, or "n birds, total kg", or paste an
// auto-weigher CSV. Shows mean, CV and uniformity live. Feed delivery (integrator-owned feed:
// mill, ration, batch, tonnes — no price).
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { toast } from "../../../ui/toast.js";
import { segmented } from "../../../ui/form.js";
import { entrySheet, chipsField, numField, dateField, textField, houseCrop } from "./common.js";
import { saveWeigh, saveFeedDelivery, undoAdd } from "../actions.js";
import { weighStats, stdOf, stdWt } from "../model/growth.js";
import { cropDay } from "../model/crop.js";
import { n0, n1, pc } from "../ui.js";
import { photoStrip } from "../../../ui/photo-strip.js";

/** Parse an auto-weigher export: any line with a number 20–6000 (grams) or 0.02–6 (kg). */
export function parseWeights(text) {
  const out = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const nums = (line.match(/\d+(?:[.,]\d+)?/g) || []).map((x) => +x.replace(",", "."));
    const v = nums.reverse().find((x) => (x >= 20 && x <= 6000) || (x > 0.02 && x <= 6));
    if (v != null) out.push(v <= 6 ? Math.round(v * 1000) : Math.round(v));
  }
  return out;
}

export async function weighFlow(snap, { houseId, cropId } = {}) {
  const hc = await houseCrop(snap, { houseId, cropId, title: "Weigh which house?" }); if (!hc) return;
  const { house, crop } = hc; const day = cropDay(crop, snap.today); const std = stdOf(crop, snap.s); const target = stdWt(std, day);
  let weights = [];
  const body = el(html`<form novalidate>
    <p class="br-sub">${house.name} · day ${day} · ${std.hybrid} objective ${n0(target)} g</p>
    ${segmented("mode", [{ value: "tap", label: "Tap weights" }, { value: "bulk", label: "Total" }, { value: "csv", label: "Weigher file" }], "tap")}
    <div data-mode="tap"><div class="form-group"><div class="field"><label>Bird weight (g)</label><input name="one" type="number" inputmode="numeric" placeholder="e.g. 1085" data-one><button type="button" class="btn small" data-add>Add</button></div></div>
      <div class="br-weights" data-list></div></div>
    <div data-mode="bulk" hidden><div class="form-group">${numField("n", "Birds weighed", "", { step: "1" })}${numField("totalKg", "Total weight", "", { unit: "kg" })}</div></div>
    <div data-mode="csv" hidden><div class="form-group"><div class="field stacked"><label>Paste the weigher export (one weight per line, grams or kg)</label><textarea name="csv" rows="5" data-csv></textarea></div></div></div>
    <div class="form-group">${dateField("date", "Date", snap.today)}</div>
    <div class="br-sum" data-sum></div>
  </form>`);
  const stats = (v) => (v.mode === "bulk" ? weighStats(v.n && v.totalKg ? { n: +v.n, totalKg: +v.totalKg } : []) : weighStats(v.mode === "csv" ? parseWeights(v.csv) : weights));
  const paint = (v) => {
    body.querySelectorAll("[data-mode]").forEach((m) => (m.hidden = m.dataset.mode !== v.mode));
    body.querySelector("[data-list]").innerHTML = weights.map((w, i) => `<button type="button" class="chip" data-del="${i}" aria-label="Remove ${w} g">${w}</button>`).join("");
    const st = stats(v); const vs = st.mean && target ? (st.mean / target - 1) * 100 : null;
    body.querySelector("[data-sum]").innerHTML = st.n ? `<div><b>${n0(st.mean)} g</b> mean of ${st.n} bird${st.n === 1 ? "" : "s"}${vs != null ? ` · <span class="${vs < -3 ? "warn" : ""}">${vs >= 0 ? "▲" : "▼"} ${Math.abs(vs).toFixed(0)}% ${vs >= 0 ? "over" : "under"} ${std.hybrid}</span>` : ""}</div>${st.cv != null ? `<div>CV ${n1(st.cv)}% · uniformity ${pc(st.uniformity, 0)} within ±10%</div>` : ""}` : "Weigh about 100 birds across the house.";
  };
  const es = entrySheet({ title: `Sample weigh · ${house.name}`, body, label: "Save sample weigh", size: "large",
    missing: (v) => (stats(v).n ? null : "Add the weights to save"),
    save(v, sh) {
      const st = v.mode === "bulk" ? { n: +v.n, totalKg: +v.totalKg } : null;
      const id = saveWeigh(snap, crop, { date: v.date, weights: v.mode === "csv" ? parseWeights(v.csv) : weights, ...(st || {}), source: v.mode === "csv" ? "weigher" : "manual" });
      sh.close(true, { force: true }); const m = stats(v);
      toast(`Sample weigh saved · ${n0(m.mean)} g`, { action: "Undo", onAction: () => undoAdd(snap.lid, "weighs", id) });
    } });
  const addOne = () => { const i = body.querySelector("[data-one]"); const g = +i.value; if (g >= 20 && g <= 6000) { weights.push(Math.round(g)); i.value = ""; i.focus(); paint(es.form.values()); es.refresh(); } };
  body.querySelector("[data-add]").onclick = addOne;
  body.querySelector("[data-one]").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addOne(); } });
  body.querySelector("[data-list]").onclick = (e) => { const b = e.target.closest("[data-del]"); if (b) { weights.splice(+b.dataset.del, 1); paint(es.form.values()); es.refresh(); } };
  es.form.onChange(() => paint(es.form.values())); paint(es.form.values()); es.rebase();
  return es.sheet.done;
}

export async function feedFlow(snap, { houseId, cropId } = {}) {
  const hc = await houseCrop(snap, { houseId, cropId, title: "Feed for which house?" }); if (!hc) return;
  const { house, crop } = hc;
  const body = el(html`<form novalidate>
    <p class="br-sub">${house.name} · Crop ${crop.no || ""} · day ${cropDay(crop, snap.today)}. The integrator owns the feed, so there's no price here.</p>
    <div class="form-group">${chipsField("kind", "This is", [["delivery", "A delivery"], ["return", "Feed taken back / left in bins"]], "delivery")}
      ${chipsField("ration", "Ration", ["Starter", "Grower", "Finisher", "Withdrawal"], null)}
      ${numField("t", "Tonnes", "", { unit: "t" })}${textField("mill", "Mill", snap.s.mill || "")}${textField("batch", "Batch / docket no.", "", { optional: true })}${dateField("date", "Date", snap.today)}</div>
  </form>`);
  const strip = photoStrip({ lid: snap.lid, role: snap.role, parent: { coll: "feedDeliveries", label: "Feed delivery" }, title: "Docket photos" });
  body.appendChild(strip.node);
  const es = entrySheet({ title: "Feed delivery", body, label: "Save feed delivery", size: "large",
    missing: (v) => (!v.ration && v.kind !== "return" ? "Choose the ration" : !(+v.t > 0) ? "Add the tonnes" : null),
    save(v, sh) {
      const id = saveFeedDelivery(snap, crop, { date: v.date, ration: v.ration, kg: +v.t * 1000, mill: v.mill, batch: v.batch, kind: v.kind });
      strip.commit(id, `Feed docket · ${house.name} · ${v.ration || v.kind}`);
      sh.close(true, { force: true }); toast(`${v.kind === "return" ? "Feed return" : "Feed delivery"} saved · ${house.name} · ${v.t} t`, { action: "Undo", onAction: () => undoAdd(snap.lid, "feedDeliveries", id) });
    } });
  return es.sheet.done;
}
export { raw, icon };
