// Brooding checklist entries (design/15 §5): pre-heat and litter temperature, the −4 h prep,
// crop-fill at 8 h and 24 h (feel 100 chicks), chick behaviour days 1–3, the 7-day weight and
// mortality; and the chick quality complaint for the integrator (days 0–7).
import { html } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { toast } from "../../../ui/toast.js";
import { checkRow, stepperField } from "../../../ui/form.js";
import { entrySheet, chipsField, numField, textField, dateField, timeField, nowHM, lawNote } from "./common.js";
import { saveBrooding, me } from "../actions.js";
import { mort7Pct, cropDay, dateOfDay } from "../model/crop.js";
import { stdOf, stdWt } from "../model/growth.js";
import { n0, pc, dm, printDoc, shareText } from "../ui.js";
import { photoStrip } from "../../../ui/photo-strip.js";

const stamp = () => ({ at: `${new Date().toISOString().slice(0, 10)}`, by: me() });

export function broodingFlow(snap, { cropId, step }) {
  const crop = snap.ix.cropById.get(cropId); if (!crop) return;
  const b = snap.ix.brooding.get(crop.id) || {}; const house = snap.ix.houseById.get(crop.houseId); const s = snap.s;
  const std = stdOf(crop, s);
  const forms = {
    preheat: { title: "Pre-heat", body: html`${dateField("date", "Pre-heat on", b.preheat?.date || dateOfDay(crop, -1))}${timeField("time", "Time", b.preheat?.time || "")}${numField("litterC", "Litter temperature", b.preheat?.litterC ?? "", { unit: "°C" })}${numField("airC", "Air temperature", b.preheat?.airC ?? "", { unit: "°C", optional: true })}${lawNote("Target 28–30 °C litter and 30–33 °C air before the chicks arrive (breed guide; editable in settings).")}`, missing: (v) => (!v.date ? "Add the date" : null), save: (v) => ({ preheat: { date: v.date, time: v.time, litterC: v.litterC, airC: v.airC, by: me() } }) },
    prep: { title: "Ready for chicks", body: html`${checkRow("flushed", "Water lines flushed", !!b.prep?.flushed)}${checkRow("paper", "Feed on paper", !!b.prep?.paper)}${checkRow("drinkers", "Drinker height set", !!b.prep?.drinkers)}`, missing: () => null, save: (v) => ({ prep: { flushed: v.flushed, paper: v.paper, drinkers: v.drinkers, ...stamp() } }) },
    cropFill8h: { title: "Crop-fill at 8 hours", body: html`${stepperField("n", "Chicks with feed and water in the crop (of 100)", b.cropFill8h ?? 80, { max: 100 })}${lawNote(`Feel 100 chicks across the house. Target ${s.cropFill8h}% or more at 8 hours (breed company guidance).`)}`, missing: () => null, save: (v) => ({ cropFill8h: +v.n, cropFill8hAt: `${snap.today}T${nowHM()}` }) },
    cropFill24h: { title: "Crop-fill at 24 hours", body: html`${stepperField("n", "Chicks with feed and water in the crop (of 100)", b.cropFill24h ?? 95, { max: 100 })}${lawNote(`Target ${s.cropFill24h}% or more at 24 hours.`)}`, missing: () => null, save: (v) => ({ cropFill24h: +v.n, cropFill24hAt: `${snap.today}T${nowHM()}` }) },
    behaviour: { title: "Chick behaviour", body: html`${chipsField("day", "Day", ["1", "2", "3"], String(Math.min(3, Math.max(1, cropDay(crop, snap.today)))))}${chipsField("spread", "Chicks are", [["spread", "Evenly spread"], ["huddled", "Huddled (cold)"], ["panting", "Panting / at the walls (hot)"], ["draught", "Avoiding an area (draught)"]], null)}${numField("tempC", "House temperature", "", { unit: "°C", optional: true })}`, missing: (v) => (!v.spread ? "How are the chicks?" : null), save: (v) => ({ behaviour: { ...(b.behaviour || {}), [`d${v.day}`]: { spread: v.spread, tempC: v.tempC, ...stamp() } } }) },
    day7: { title: "7-day weight and mortality", body: html`${numField("g", "7-day average weight", b.day7?.g ?? "", { unit: "g" })}<p class="br-sub" style="margin:8px 4px">7-day mortality from your checks: <b>${pc(mort7Pct(snap.ix, crop), 2)}</b> · ${std.hybrid} objective ${n0(stdWt(std, 7))} g</p>`, missing: (v) => (!(+v.g > 0) ? "Add the weight" : null), save: (v) => ({ day7: { g: +v.g, mortPct: mort7Pct(snap.ix, crop), ...stamp() } }) },
  };
  const f = forms[step]; if (!f) return;
  const body = el(html`<form novalidate><p class="br-sub">${house?.name || ""} · Crop ${crop.no || ""} · placed ${dm(crop.placedDate)}</p><div class="form-group">${f.body}</div></form>`);
  const es = entrySheet({ title: f.title, body, label: `Save · ${f.title}`, size: "large", missing: f.missing,
    save(v, sh) { saveBrooding(snap, crop, f.save(v)); sh.close(true, { force: true }); toast(`${f.title} saved · ${house?.name || ""}`); } });
  return es.sheet.done;
}

/** Chick quality complaint → shared text + printable PDF for the integrator. */
export function complaintFlow(snap, { cropId }) {
  const crop = snap.ix.cropById.get(cropId); if (!crop) return;
  const b = snap.ix.brooding.get(crop.id) || {}; const house = snap.ix.houseById.get(crop.houseId);
  const body = el(html`<form novalidate><div class="form-group">${textField("hatchery", "Hatchery", b.chicksArrived?.hatchery || crop.hatchery || "")}${textField("batch", "Hatchery batch / parent flock", b.chicksArrived?.parentFlock || crop.parentFlock || "")}
    ${numField("doa", "Dead on arrival", b.chicksArrived?.doa ?? "", { step: "1" })}<div class="field stacked"><label>What's wrong?</label><textarea name="what" rows="3" placeholder="e.g. navels not healed, dehydrated, uneven size">${b.complaint?.what || ""}</textarea></div></div>
    <p class="br-sub" style="margin:8px 4px">7-day mortality so far: <b>${pc(mort7Pct(snap.ix, crop), 2)}</b>. Photos are kept on the crop — share them from the photo viewer.</p></form>`);
  const strip = photoStrip({ lid: snap.lid, role: snap.role, parent: { coll: "crops", id: crop.id, label: `Chick complaint · ${house?.name || ""} crop ${crop.no || ""}`.trim() }, title: "Photos of the chicks", hint: "Navels, size, DOAs" });
  body.querySelector(".form-group").after(strip.node);
  const text = (v) => [`CHICK QUALITY COMPLAINT — ${snap.ledger.farmName || ""} ${house?.name || ""}`, `Crop ${crop.no || ""} placed ${crop.placedDate} · ${n0(crop.placed)} chicks · ${crop.hybrid || snap.s.hybrid}`, `Hatchery ${v.hatchery || "—"} · batch ${v.batch || "—"}`, `Dead on arrival ${v.doa || 0} · 7-day mortality ${pc(mort7Pct(snap.ix, crop), 2)}`, `What's wrong: ${v.what || ""}`].join("\n");
  const es = entrySheet({ title: "Chick quality complaint", body, label: "Save and share", size: "large", missing: (v) => (!v.what ? "Say what's wrong" : null),
    async save(v, sh) {
      saveBrooding(snap, crop, { complaint: { hatchery: v.hatchery, batch: v.batch, doa: +v.doa || 0, what: v.what, mort7: mort7Pct(snap.ix, crop), ...stamp() } });
      sh.close(true, { force: true });
      const r = await shareText("Chick quality complaint", text(v));
      toast(r === "copied" ? "Complaint saved · copied to send" : "Complaint saved", { action: "PDF", onAction: () => printDoc({ title: "Chick quality complaint", top: [["Farm", snap.ledger.farmName || ""], ["House", house?.name || ""], ["Crop", crop.no || ""]], headers: ["Item", "Detail"], rows: [["Placed", `${crop.placedDate} · ${n0(crop.placed)} chicks · ${crop.hybrid || snap.s.hybrid}`], ["Hatchery", v.hatchery || "—"], ["Batch / parent flock", v.batch || "—"], ["Dead on arrival", String(v.doa || 0)], ["7-day mortality", pc(mort7Pct(snap.ix, crop), 2)], ["What's wrong", v.what]] }) });
    } });
  es.sheet.done.then(() => strip.destroy());
  return es.sheet.done;
}
