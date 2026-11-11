// Health entries (design/14 §7.3, §7.4): Salmonella sample (operator or official; the result can be
// added later), whole-house treatment with egg withdrawal first, vaccination (dose or plan).
import { html } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { textField } from "../../../ui/form.js";
import { toast } from "../../../ui/toast.js";
import { checkRow } from "../../../ui/form.js";
import { entrySheet, chipsField, numField, dateField, timeField, lawNote, liveHouses, nowHM, warn } from "./common.js";
import { saveSalmSample, saveTreatment, saveVaccination } from "../actions.js";
import { SALM_RESULTS, SAMPLE_TYPES, SALM_POSITIVE } from "../model/content.js";
import { withdrawalDates } from "../model/health.js";
import { weekOfAge } from "../model/flock.js";
import { dm } from "../ui.js";
import { photoStrip } from "../../../ui/photo-strip.js";

export function salmSheet(snap, { flockId = null, sampleId = null } = {}) {
  const old = sampleId ? snap.data.salmSamples.find((x) => x.id === sampleId) : null;
  const live = liveHouses(snap).filter((x) => x.f);
  const f = snap.data.flocks.find((x) => x.id === (flockId || old?.flockId)) || live[0]?.f;
  if (!f) { toast("Place a flock first."); return null; }
  const h = snap.data.houses.find((x) => x.id === f.houseId);
  const body = el(html`<form novalidate>
    <p class="ly-sub">${h?.name || ""} · week ${weekOfAge(f, snap.today)}</p>
    <div class="form-group">${dateField("date", "Sampled", old?.date || snap.today)}${timeField("time", "Time", old?.time || nowHM())}</div>
    ${chipsField("sampler", "Taken by", [["operator", "Us (operator)"], ["official", "DAERA (official)"]], old?.sampler || "operator")}
    ${chipsField("sampleType", "Sample", SAMPLE_TYPES, old?.sampleType || SAMPLE_TYPES[0])}
    <div class="form-group" style="margin-top:12px">${textField({ name: "lab", label: "Lab", value: old?.lab || "AFBI" })}</div>
    ${chipsField("result", "Result", SALM_RESULTS, old?.result || "Awaiting result")}
    <div class="form-group" style="margin-top:12px">${dateField("resultDate", "Result date", old?.resultDate || "", { optional: true })}${checkRow("confirmatory", "Confirmatory test after a positive", !!old?.confirmatory)}</div>
    <div data-pos></div>
    ${lawNote("Salmonella NCP: first samples at 22–26 weeks, then every 15 weeks. Results kept 2 years.")}
  </form>`);
  const es = entrySheet({ title: old ? "Salmonella result" : "Salmonella sample", body, label: old ? "Save result" : "Save sample", missing: () => null,
    save(v, sh) { saveSalmSample(snap, f, v, old); sh.close(true, { force: true }); toast(SALM_POSITIVE.includes(v.result) ? `${h?.name}: positive recorded — eggs are Class B` : "Salmonella sample saved"); } });
  es.form.onChange(() => { const v = es.form.values(); body.querySelector("[data-pos]").replaceChildren(SALM_POSITIVE.includes(v.result) ? el(warn(`${h?.name}: Salmonella positive. Eggs are Class B — do not pack as Class A. Contact DAERA. A confirmatory test is possible within 4 weeks.`)) : document.createTextNode("")); });
  return es.sheet.done;
}

/** Whole-house treatment (§7.4). mite=true: red-mite treatment (method, contractor). */
export function treatSheet(snap, { houseId = null, mite = false } = {}) {
  const hs = liveHouses(snap).filter((x) => x.f).map((x) => x.h);
  const store = (snap.store || []).filter((p) => !p.deleted);
  const body = el(html`<form novalidate>
    ${hs.length > 1 ? chipsField("houseIds", "House", hs.map((h) => [h.id, h.name]), houseId ? [houseId] : [], { multi: true }) : ""}
    <div class="form-group" style="margin-top:12px">${dateField("date", "First dose", snap.today)}
      ${textField({ name: "productName", label: "Product", value: mite ? "" : "", placeholder: mite ? "e.g. Exzolt (fluralaner)" : "From the vet's prescription" })}
      ${textField({ name: "batch", label: "Batch no.", optional: true })}
      ${textField({ name: "dose", label: "Dose and route", placeholder: mite ? "in drinking water" : "e.g. in water, 7 days", optional: true })}
      ${mite ? html`${chipsField("method", "Method", ["In water", "Spray", "Silica dust", "Heat treatment", "Predatory mites"], "In water")}${textField({ name: "contractor", label: "Contractor", optional: true })}` : textField({ name: "reason", label: "Reason", placeholder: "e.g. E. coli, worms" })}
      ${numField("doses", "Number of doses", 1, { step: 1 })}${numField("intervalDays", "Days between doses", 1, { step: 1 })}</div>
    <h2 class="group-label"><span>Withdrawal</span></h2>
    <div class="form-group">${numField("eggDays", "Eggs — days after the last dose", 0, { step: 1 })}${numField("meatDays", "Meat (spent hens) — days", 0, { step: 1 })}
      ${textField({ name: "vet", label: "Prescribing vet", optional: true })}</div>
    <div class="ly-sumbar" data-wd></div>
    ${store.length ? html`<p class="ly-note">Products in the farm medicine store: ${store.slice(0, 6).map((p) => p.name || p.productName).filter(Boolean).join(", ")}.</p>` : ""}
  </form>`);
  const es = entrySheet({ title: mite ? "Mite treatment" : "Treatment", body, label: "Save treatment",
    missing: (v) => (!v.productName ? "Add the product" : hs.length > 1 && !(v.houseIds || []).length ? "Choose the house" : null),
    save(v, sh) {
      const r = saveTreatment(snap, { ...v, houseIds: hs.length > 1 ? v.houseIds : hs.map((h) => h.id), reason: mite ? "Red mite" : v.reason });
      sh.close(true, { force: true }); toast(r.eggsOkFrom ? `Saved · eggs withheld until ${dm(r.eggsOkFrom)}` : "Treatment saved");
    } });
  const paint = () => { const v = es.form.values(); const w = withdrawalDates(v.date || snap.today, v); body.querySelector("[data-wd]").textContent = `Last dose ${dm(w.lastDose)} · ${w.eggsOkFrom ? `eggs can't be sold until ${dm(w.eggsOkFrom)}` : "no egg withdrawal"} · ${w.meatOkFrom ? `spent hens not before ${dm(w.meatOkFrom)}` : "no meat withdrawal"}`; };
  es.form.onChange(paint); paint();
  return es.sheet.done;
}

/** Vaccination: a dose given (from the rearer's certificate or on farm) or a planned week (vet plan → task). */
export function vaccSheet(snap, { flockId = null, id = null } = {}) {
  const old = id ? snap.data.vaccinations.find((x) => x.id === id) : null;
  const live = liveHouses(snap).filter((x) => x.f);
  const fid = flockId || old?.flockId || live[0]?.f.id;
  if (!fid) { toast("Place a flock first."); return null; }
  const body = el(html`<form novalidate>
    ${live.length > 1 && !flockId ? chipsField("flockId", "House", live.map((x) => [x.f.id, x.h.name]), fid) : ""}
    ${chipsField("kind", "This is", [["given", "A dose given"], ["plan", "Planned (vet plan)"]], old && !old.date ? "plan" : "given")}
    <div class="form-group" style="margin-top:12px">${textField({ name: "disease", label: "Disease", value: old?.disease || "", placeholder: "e.g. S. Enteritidis, IB, ND, AE" })}
      ${textField({ name: "product", label: "Product", value: old?.product || "", optional: true })}
      <div data-given>${dateField("date", "Date", old?.date || snap.today)}${textField({ name: "batch", label: "Batch no.", value: old?.batch || "", optional: true })}${chipsField("source", "Given", [["rearer", "At rear (certificate)"], ["farm", "On this farm"]], old?.source || "farm")}</div>
      <div data-plan hidden>${numField("plannedWk", "Week of age", old?.plannedWk ?? "", { step: 1 })}${textField({ name: "dose", label: "Dose", value: old?.dose || "", placeholder: "e.g. Booster", optional: true })}</div></div>
    ${lawNote("Lion: hens vaccinated against S. Enteritidis and S. Typhimurium. Keep the rearer's certificate with the flock passport.")}
  </form>`);
  // The rearer's vaccination certificate (Lion: S.E. / S.T.) — photo kept on the vaccination.
  const strip = photoStrip({ lid: snap.lid, role: snap.role, parent: { coll: "vaccinations", id: old?.id, label: `Vaccination · ${old?.disease || ""}`.trim() }, title: "Certificate photos", hint: "Rearer's certificate" });
  body.querySelector(".form-group").after(strip.node);
  const es = entrySheet({ title: "Vaccination", body, label: "Save", missing: (v) => (!v.disease ? "Add the disease" : v.kind === "plan" && !v.plannedWk ? "Add the week of age" : null),
    save(v, sh) { const vid = saveVaccination(snap, { flockId: v.flockId || fid, disease: v.disease, product: v.product, date: v.kind === "given" ? v.date : undefined, batch: v.batch, source: v.source, plannedWk: v.kind === "plan" ? v.plannedWk : undefined, dose: v.dose }, old); strip.commit(vid, `Vaccination · ${v.disease}`); sh.close(true, { force: true }); toast("Vaccination saved"); } });
  es.sheet.done.then(() => strip.destroy());
  const paint = () => { const k = es.form.values().kind; body.querySelector("[data-given]").hidden = k !== "given"; body.querySelector("[data-plan]").hidden = k !== "plan"; };
  es.form.onChange(paint); paint(); es.rebase();
  return es.sheet.done;
}
