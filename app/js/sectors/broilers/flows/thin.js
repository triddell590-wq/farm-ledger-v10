// Thin and clear-out (design/15 §7), Plan thin (§6.2) and the processor docket (§7, §9.4).
// The sheet checks the paper chain before the birds go: feed off ≤ 9 h (RT) / ≤ 12 h (law),
// Salmonella sample in its window (blocks), FCI sent 24 h before (red if not), medicine
// withdrawal ending after the catch (blocks). A clear-out closes the crop and starts the turnaround.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { toast } from "../../../ui/toast.js";
import { go } from "../../../core/router.js";
import { entrySheet, numField, textField, dtField, warn, lawNote, houseCrop } from "./common.js";
import { planThin, saveThin, saveDocket, undoAdd } from "../actions.js";
import { aliveEnd, cropDay, dateOfDay, listOf, cropEvents, clearDayOf } from "../model/crop.js";
import { sampleFor, salmResultText, salmPositive, fciSendBy, feedOffDefault, feedOffLevel, withdrawalClashes, withdrawalEnd } from "../model/paper.js";
import { thinPlan } from "../model/density.js";
import { addHours, datePart, at } from "../model/time.js";
import { n0, when, dm } from "../ui.js";
import { photoStrip } from "../../../ui/photo-strip.js";

/** Plan thin: date, catch time, birds, destination → the thin event (feed-off and FCI jobs follow). */
export async function planThinFlow(snap, { cropId, houseId, day, birds, kind = "thin" } = {}) {
  const hc = await houseCrop(snap, { houseId, cropId, title: "Plan for which house?" }); if (!hc) return;
  const { house, crop } = hc;
  const d = day ?? (kind === "clear" ? clearDayOf(snap.ix, crop, snap.s) : snap.s.plannedThinDay);
  const plan = kind === "thin" && +house.usableM2 ? thinPlan(snap.ix, crop, snap.s, +house.usableM2, snap.today, d) : null;
  const catchAt = at(dateOfDay(crop, d), "02:00");
  const body = el(html`<form novalidate>
    <p class="br-sub">${house.name} · Crop ${crop.no || ""} · ${kind === "clear" ? "clear-out" : "thin"} on day ${d}${plan ? ` · planner says ${n0(plan.toThin)} birds to stay under ${plan.limit} kg/m² at clear-out` : ""}</p>
    <div class="form-group">${dtField("catchAt", "Catch", catchAt)}${kind === "thin" ? numField("birds", "Birds to take", birds ?? plan?.toThin ?? "", { step: "1" }) : ""}
      ${textField("processor", "Processor", snap.s.processor)}${textField("destination", "Plant", snap.s.processorPlant, { optional: true })}${dtField("arrivalAt", "Arrival at the plant", addHours(catchAt, +snap.s.arrivalHoursAfterCatch || 0))}</div>
    <div data-dates></div>
  </form>`);
  const paint = (v) => { if (!v.catchAt) return; body.querySelector("[data-dates]").innerHTML = `<div class="br-sum"><div>Feed off at <b>${when(feedOffDefault(v.catchAt, snap.s))}</b> (catch − ${snap.s.feedOffHours} h)</div><div>Send FCI by <b>${when(fciSendBy(v.catchAt, snap.s, v.arrivalAt))}</b> (arrival − 24 h)</div></div>`; };
  const es = entrySheet({ title: kind === "clear" ? "Plan clear-out" : "Plan thin", body, label: kind === "clear" ? "Plan clear-out" : "Plan thin", size: "large",
    missing: (v) => (!v.catchAt ? "Add the catch time" : kind === "thin" && !(+v.birds > 0) ? "Add the birds to take" : null),
    save(v, sh) {
      const id = planThin(snap, crop, { kind, catchAt: v.catchAt, arrivalAt: v.arrivalAt, birds: v.birds, processor: v.processor, destination: v.destination, feedOffAt: feedOffDefault(v.catchAt, snap.s) });
      sh.close(true, { force: true });
      toast(`${kind === "clear" ? "Clear-out" : "Thin"} planned · ${dm(v.catchAt)} · feed off and FCI added to your jobs`, { action: "Undo", onAction: () => undoAdd(snap.lid, "thins", id) });
    } });
  es.form.onChange(() => paint(es.form.values())); paint(es.form.values()); es.rebase();
  return es.sheet.done;
}

/** Record a thin or clear-out. thinId: a planned thin to complete. */
export async function thinFlow(snap, { cropId, houseId, thinId, kind } = {}) {
  const hc = await houseCrop(snap, { houseId, cropId, title: "Thin or clear which house?" }); if (!hc) return;
  const { house, crop } = hc;
  const old = thinId ? listOf(snap.ix.thins, crop.id).find((t) => t.id === thinId) : null;
  const next = cropEvents(snap.ix, crop, snap.s).find((e) => !e.done);
  const k = kind || old?.kind || (next?.kind === "clear" ? "clear" : "thin");
  const plannedRec = old || (next?.rec && next.kind === k ? next.rec : null);
  const catchAt = plannedRec?.catchAt || at(snap.today, "02:00");
  const allBirds = (ca) => aliveEnd(snap.ix, crop, datePart(addHours(ca, -24)));
  const body = el(html`<form novalidate>
    <p class="br-sub">${house.name} · Crop ${crop.no || ""} · ${n0(aliveEnd(snap.ix, crop, snap.today))} alive</p>
    <div class="form-group">${dtField("catchAt", "Catch", catchAt)}
      ${numField("birds", k === "clear" ? "Birds out (all remaining)" : "Birds out", plannedRec?.status === "done" ? plannedRec.birds : k === "clear" ? allBirds(catchAt) : plannedRec?.birds ?? "", { step: "1" })}
      ${plannedRec?.birds && k === "thin" ? html`<p class="br-help">planned ${n0(plannedRec.birds)}</p>` : ""}
      ${numField("avgKg", "Avg weight", plannedRec?.avgKg ?? "", { unit: "kg", optional: true })}
      ${textField("processor", "Processor", plannedRec?.processor || snap.s.processor)}
      ${dtField("feedOffAt", "Feed off at", plannedRec?.feedOffAt || feedOffDefault(catchAt, snap.s))}</div>
    <div data-chain></div>
    <h3 class="group-label"><span>Catching crew</span></h3>
    <div class="form-group">${textField("crewName", "Crew", plannedRec?.crew?.name || snap.s.crewName)}${textField("crewGlaa", "GLAA licence no.", plannedRec?.crew?.glaa || snap.s.crewGlaa)}</div>
    ${lawNote("Red Tractor: feed off no more than 9 hours before catching (the law allows 12). Catching crews must come from a GLAA-licensed labour provider.")}
  </form>`);
  const chain = (v) => {
    const date = datePart(v.catchAt || catchAt); const day = cropDay(crop, date);
    const smp = sampleFor(snap.ix, crop, { date, day }, snap.s);
    const fci = plannedRec ? (snap.data.fci || []).find((f) => f.thinId === plannedRec.id && f.sentAt) : null;
    const sendBy = fciSendBy(v.catchAt || catchAt, snap.s, plannedRec?.arrivalAt);
    const clash = withdrawalClashes(snap.ix, crop, date);
    const fo = v.feedOffAt ? feedOffLevel(v.feedOffAt, v.catchAt || catchAt) : null;
    return { smp, fci, sendBy, clash, fo, day };
  };
  const paint = (v) => {
    const c = chain(v);
    body.querySelector("[data-chain]").innerHTML = `<div class="list br-chain">
      <div class="row no-lead"><span class="main"><span class="primary">Feed off</span><span class="secondary">${c.fo ? `${c.fo.text}` : "—"}</span></span>${c.fo ? `<span class="pill ${c.fo.level}">${c.fo.level === "ok" ? "✓ OK" : c.fo.level === "due" ? "Over 9 h" : "Over 12 h"}</span>` : ""}</div>
      <div class="row no-lead"><span class="main"><span class="primary">Salmonella</span><span class="secondary">${c.smp ? `Sampled ${dm(c.smp.date)} · ${salmResultText(c.smp.result)}` : "No sample in the 3 weeks before this catch"}</span></span><span class="pill ${!c.smp || salmPositive(c.smp) ? "late" : c.smp.result === "negative" ? "ok" : "due"}">${!c.smp ? "Missing" : salmPositive(c.smp) ? "Positive" : c.smp.result === "negative" ? "✓" : "Waiting"}</span></div>
      <div class="row no-lead"><span class="main"><span class="primary">FCI</span><span class="secondary">${c.fci ? `Sent ${when(c.fci.sentAt)}` : `Not sent · send by ${when(c.sendBy)}`}</span></span><span class="pill ${c.fci ? "ok" : "late"}">${c.fci ? "✓ Sent" : "Not sent"}</span></div>
      <div class="row no-lead"><span class="main"><span class="primary">Medicines</span><span class="secondary">${c.clash.length ? `${c.clash[0].product}: withdrawal ends ${dm(withdrawalEnd(c.clash[0]))} — after the catch` : "None in withdrawal"}</span></span><span class="pill ${c.clash.length ? "late" : "ok"}">${c.clash.length ? "Blocks" : "✓"}</span></div></div>`;
  };
  const es = entrySheet({ title: `${k === "clear" ? "Clear-out" : "Thin"} · ${house.name} · Day ${cropDay(crop, datePart(catchAt))}`, body, label: k === "clear" ? "Save clear-out" : "Save thin", size: "large",
    missing: (v) => { const c = chain(v); if (!v.catchAt) return "Add the catch time"; if (!(+v.birds > 0)) return "Add the birds out"; if (c.clash.length) return `Withdrawal ends ${dm(withdrawalEnd(c.clash[0]))} — can't send birds yet`; if (!c.smp) return "Take Salmonella boot swabs first"; if (c.fo?.level === "late") return "Feed off is over the legal 12 hours"; return null; },
    save(v, sh) {
      const c = chain(v);
      const id = saveThin(snap, crop, { kind: k, catchAt: v.catchAt, arrivalAt: plannedRec?.arrivalAt, birds: v.birds, avgKg: v.avgKg, processor: v.processor, destination: plannedRec?.destination, feedOffAt: v.feedOffAt, crewName: v.crewName, crewGlaa: v.crewGlaa, salmId: c.smp?.id, fciId: c.fci?.id, status: "done" }, plannedRec);
      sh.close(true, { force: true });
      if (k === "clear") toast(`Clear-out saved · ${house.name} · turnaround started`, { action: "Open", onAction: () => go(`/l/${snap.lid}/turnaround/${house.id}`) });
      else toast(`Thin saved · ${n0(v.birds)} birds · ${house.name}`, plannedRec ? {} : { action: "Undo", onAction: () => undoAdd(snap.lid, "thins", id) });
    } });
  es.form.onChange((name) => {
    const v = es.form.values();
    if (name === "catchAt" && v.catchAt) { const fo = body.querySelector("[name=feedOffAt]"); if (!plannedRec?.feedOffAt) fo.value = feedOffDefault(v.catchAt, snap.s); if (k === "clear") body.querySelector("[name=birds]").value = allBirds(v.catchAt); }
    paint(es.form.values());
  });
  paint(es.form.values()); es.rebase();
  return es.sheet.done;
}

/** Processor docket: birds received, total kg, DOAs, rejections %, footpad score, hock burn %. */
export async function docketFlow(snap, { cropId, thinId } = {}) {
  const crop = snap.ix.cropById.get(cropId); const thin = crop && listOf(snap.ix.thins, crop.id).find((t) => t.id === thinId);
  if (!thin) { toast("Choose a thin or clear-out first."); return; }
  const d = thin.docket || {};
  const body = el(html`<form novalidate>
    <p class="br-sub">${thin.kind === "clear" ? "Clear-out" : "Thin"} ${dm(thin.catchAt)} · ${n0(thin.birds)} birds sent</p>
    <div class="form-group">${numField("received", "Birds received", d.received ?? thin.birds, { step: "1" })}${numField("kg", "Total live kg", d.kg ?? "", { unit: "kg" })}${numField("doa", "Dead on arrival", d.doa ?? "", { step: "1" })}
      ${numField("rejPct", "Rejections", d.rejPct ?? "", { unit: "%" })}${numField("footpad", "Footpad score", d.footpad ?? "", { optional: true })}${numField("hockPct", "Hock burn", d.hockPct ?? "", { unit: "%", optional: true })}</div>
    ${lawNote("Red Tractor: PMI rejections reference 1.5%. Review footpad and hock burn feedback with your vet each crop.")}
  </form>`);
  // the processor's docket / PMI report, kept on the thin or clear-out (saved at once)
  const strip = photoStrip({ lid: snap.lid, role: snap.role, parent: { coll: "thins", id: thin.id, label: `Processor docket · ${thin.kind === "clear" ? "clear-out" : "thin"} ${dm(thin.catchAt)}` }, title: "Docket photos", hint: "Docket, PMI report" });
  body.querySelector(".form-group").after(strip.node);
  const es = entrySheet({ title: "Processor docket", body, label: "Save docket", size: "large",
    missing: (v) => (!(+v.received > 0) ? "Add birds received" : !(+v.kg > 0) ? "Add the total kg" : null),
    save(v, sh) { saveDocket(snap, crop, thin, v); sh.close(true, { force: true }); toast(`Docket saved · avg ${(+v.kg / +v.received).toFixed(2)} kg`); } });
  es.sheet.done.then(() => strip.destroy());
  return es.sheet.done;
}
export { raw, icon, warn };
