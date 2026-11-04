// Money and energy entry sheets (design/15 §9.2, §9.3). Settlements, the contract profile and
// energy unit prices are £ and live only in `finance` (owner, manager, accountant). Energy
// readings (litres, kWh, kg) are not money and live in `energy`, so workers can record them.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { toast } from "../../../ui/toast.js";
import { entrySheet, chipsField, numField, textField, dateField, lawNote } from "./common.js";
import { saveSettlement, saveContractProfile, contractDoc, saveEnergy, saveSettings } from "../actions.js";
import { cropResults, paymentEstimate, settlementCheck, ENERGY_KINDS } from "../model/results.js";
import { pounds, n0, n1 } from "../ui.js";
import { photoStrip } from "../../../ui/photo-strip.js";

export function settlementFlow(snap, { cropId }) {
  const crop = snap.ix.cropById.get(cropId); if (!crop) return;
  const house = snap.ix.houseById.get(crop.houseId); const r = cropResults(snap.ix, crop);
  const est = paymentEstimate(contractDoc(snap)?.profile, r, +house?.usableM2 || 0);
  const body = el(html`<form novalidate>
    <p class="br-sub">Crop ${crop.no || ""} · ${house?.name || ""} · ${n0(r.sold)} birds · ${n0(r.kg)} kg${est ? ` · estimate ${pounds(est.total)}` : " · no contract profile yet (More → Contract)"}</p>
    <div class="form-group">${numField("amount", "Paid", "", { unit: "£" })}${dateField("date", "Statement date", snap.today)}${textField("ref", "Statement ref.", "", { optional: true })}</div>
    <div data-diff></div>
  </form>`);
  const paint = (v) => { const c = est ? settlementCheck(est.total, v.amount) : null; body.querySelector("[data-diff]").innerHTML = c ? `<div class="br-sum"><div>Estimate ${pounds(est.total)} · paid ${pounds(+v.amount)} · <b class="${c.flag ? "warn" : ""}">${c.diff >= 0 ? "+" : ""}${pounds(c.diff)} (${c.pct >= 0 ? "+" : ""}${c.pct.toFixed(1)}%)</b></div>${c.flag ? "<div>More than 2% from the estimate — check the statement lines and send a query if needed.</div>" : ""}</div>` : ""; };
  const strip = photoStrip({ lid: snap.lid, role: snap.role, parent: { coll: "finance", label: "Crop settlement" }, title: "Statement photos" });
  body.querySelector("[data-diff]").before(strip.node);
  const es = entrySheet({ title: "Crop settlement", body, label: "Save settlement", size: "large", missing: (v) => (!(+v.amount > 0) ? "Add the amount paid" : null),
    save(v, sh) { const fid = saveSettlement(snap, crop, house, { ...v, lines: est?.lines?.map((l) => ({ label: l.label, estimate: Math.round(l.amount * 100) / 100 })) }); strip.commit(fid, `Settlement · ${house?.name || ""} crop ${crop.no || ""}`.trim()); sh.close(true, { force: true }); toast(`Settlement saved · ${pounds(+v.amount)}`); } });
  es.form.onChange(() => paint(es.form.values())); paint(es.form.values());
  return es.sheet.done;
}

const METRICS = [["fcr", "FCR"], ["mortality", "Mortality %"], ["rejects", "Rejections %"], ["footpad", "Footpad score"], ["epef", "EPEF"], ["avgKg", "Average kg"]];
/** Contract profile (design/15 §9.2): the farmer's own formula; nothing about a processor's real formula is shipped. */
export function contractFlow(snap) {
  const p = contractDoc(snap)?.profile || { basis: "bird", bonusRows: [] }; const ep = contractDoc(snap)?.energyPrices || {};
  const s = snap.s; const rows = [...(p.bonusRows || []), {}, {}].slice(0, Math.max(3, (p.bonusRows || []).length + 1));
  const body = el(html`<form novalidate>
    <h3 class="group-label"><span>Contract</span></h3>
    <div class="form-group">${textField("processor", "Processor", s.processor)}${textField("processorPlant", "Plant", s.processorPlant, { optional: true })}${dateField("contractStart", "Start date", s.contractStart || "")}${numField("noticeMonths", "Notice period", s.noticeMonths ?? "", { unit: "months", step: "1" })}${textField("fciEmail", "FCI email", s.fciEmail || "", { placeholder: "plant FCI address" })}${numField("moduleSize", "Catch module size", s.moduleSize, { unit: "birds", step: "1" })}</div>
    <h3 class="group-label"><span>Payment</span><span>money roles only</span></h3>
    <div class="form-group">${chipsField("basis", "Paid", [["bird", "Per bird"], ["kg", "Per kg"], ["m2", "Per m²"]], p.basis || "bird")}${numField("rate", "Base rate", p.rate ?? "", { unit: "£" })}</div>
    <h3 class="group-label"><span>Bonus and penalty rows</span></h3>
    ${rows.map((b, i) => html`<div class="form-group br-bonus">${chipsField(`m${i}`, `Row ${i + 1}: when`, METRICS, b.metric || null)}${chipsField(`op${i}`, "is", [["<", "under"], [">", "over"]], b.op || null)}${numField(`v${i}`, "Value", b.value ?? "")}${numField(`a${i}`, "Pay (− for a penalty)", b.amount ?? "", { unit: "£" })}${chipsField(`per${i}`, "per", [["bird", "bird"], ["kg", "kg"], ["crop", "crop"]], b.per || "bird")}</div>`)}
    <h3 class="group-label"><span>Energy prices</span></h3>
    <div class="form-group">${numField("lpg", "LPG", ep.lpg ?? "", { unit: "£/L" })}${numField("oil", "Oil", ep.oil ?? "", { unit: "£/L" })}${numField("biomass", "Biomass", ep.biomass ?? "", { unit: "£/kg" })}${numField("heat", "Heat (meter)", ep.heat ?? "", { unit: "£/kWh" })}${numField("elec", "Electricity", ep.elec ?? "", { unit: "£/kWh" })}${numField("lpgTankLitres", "LPG tank size", s.lpgTankLitres || "", { unit: "L", optional: true })}</div>
    ${lawNote("This is your own copy of how you're paid. Farm Ledger doesn't ship any processor's formula; the estimate is only as good as the rows you enter.")}
  </form>`);
  const es = entrySheet({ title: "Contract and payment", body, label: "Save contract", size: "large",
    save(v, sh) {
      const bonusRows = rows.map((_, i) => ({ metric: v[`m${i}`], op: v[`op${i}`], value: v[`v${i}`] === "" ? null : +v[`v${i}`], amount: v[`a${i}`] === "" ? null : +v[`a${i}`], per: v[`per${i}`] || "bird" })).filter((b) => b.metric && b.op && b.value != null && b.amount != null)
        .map((b) => ({ ...b, label: `${METRICS.find((m) => m[0] === b.metric)[1]} ${b.op === "<" ? "under" : "over"} ${b.value}` }));
      saveSettings(snap, { processor: v.processor, processorPlant: v.processorPlant, contractStart: v.contractStart, noticeMonths: v.noticeMonths === "" ? null : +v.noticeMonths, fciEmail: v.fciEmail, moduleSize: +v.moduleSize || 100, lpgTankLitres: +v.lpgTankLitres || 0 });
      const prices = {}; for (const k of ["lpg", "oil", "biomass", "heat", "elec"]) if (v[k] !== "") prices[k] = +v[k];
      saveContractProfile(snap, { basis: v.basis || "bird", rate: v.rate === "" ? null : +v.rate, bonusRows }, prices);
      sh.close(true, { force: true }); toast("Contract saved");
    } });
  return es.sheet.done;
}
/** Contract details without money (workers see none of this; managers without finance get this). */
export function contractInfoFlow(snap) {
  const s = snap.s;
  const body = el(html`<form novalidate><div class="form-group">${textField("processor", "Processor", s.processor)}${textField("processorPlant", "Plant", s.processorPlant, { optional: true })}${textField("fciEmail", "FCI email", s.fciEmail || "")}${numField("moduleSize", "Catch module size", s.moduleSize, { step: "1" })}</div></form>`);
  const es = entrySheet({ title: "Processor", body, label: "Save", size: "large", save(v, sh) { saveSettings(snap, { processor: v.processor, processorPlant: v.processorPlant, fciEmail: v.fciEmail, moduleSize: +v.moduleSize || 100 }); sh.close(true, { force: true }); toast("Saved"); } });
  return es.sheet.done;
}

/** Energy readings at placement and clear, plus deliveries (design/15 §9.3). */
export function energyFlow(snap, { cropId }) {
  const crop = snap.ix.cropById.get(cropId); if (!crop) return;
  const e = snap.ix.energy.get(crop.id) || { readings: [], deliveries: [] };
  const kinds = ENERGY_KINDS.filter((k) => k.key !== "oil" || e.readings.some((r) => r.kind === "oil"));
  const R = (k) => e.readings.find((r) => r.kind === k) || {};
  const del = (k) => (e.deliveries || []).filter((d) => d.kind === k).reduce((t, d) => t + (+d.qty || 0), 0);
  const body = el(html`<form novalidate>
    <p class="br-sub">Crop ${crop.no || ""}: read the meters and tanks at placement and again at clear-out. Fill only the ones you use.</p>
    ${kinds.map((k) => html`<h3 class="group-label"><span>${k.label}</span></h3><div class="form-group">${numField(`${k.key}_s`, "At placement", R(k.key).start ?? "", { unit: k.unit })}${numField(`${k.key}_e`, "At clear-out", R(k.key).end ?? "", { unit: k.unit })}${k.stock ? numField(`${k.key}_d`, "Delivered during the crop", del(k.key) || "", { unit: k.unit, optional: true }) : ""}</div>`)}
    ${snap.s.rhi ? lawNote("On the NI RHI scheme: keep the heat meter readings — they are your scheme meter log.") : ""}
  </form>`);
  const es = entrySheet({ title: "Energy this crop", body, label: "Save readings", size: "large",
    save(v, sh) {
      const readings = []; const deliveries = [];
      for (const k of kinds) { const st = v[`${k.key}_s`], en = v[`${k.key}_e`]; if (st !== "" || en !== "") readings.push({ kind: k.key, start: st === "" ? null : +st, end: en === "" ? null : +en }); if (k.stock && v[`${k.key}_d`] !== "" && v[`${k.key}_d`] != null) deliveries.push({ kind: k.key, qty: +v[`${k.key}_d`] }); }
      saveEnergy(snap, crop, { readings, deliveries }); sh.close(true, { force: true }); toast("Energy readings saved");
    } });
  return es.sheet.done;
}
export { raw, n1 };
