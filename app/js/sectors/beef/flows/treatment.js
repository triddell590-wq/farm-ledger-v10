// Treatment, one animal or a group (design/10 §6.2). Product from the farm medicine store;
// dose by weight (rounded up to a 10 kg band) or the same for all; course length makes Today
// jobs for later doses; withdrawal worked out and shown before saving. Writes one DAERA "use"
// line per animal. "BTV-3 vaccine" is its own reason (Research B verification pass 2026-10-15).
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { textField, selectField, chipGroup, segmented, checkRow, stepperField } from "../../../ui/form.js";
import { toast } from "../../../ui/toast.js";
import { todayStr, addDays } from "../../../core/dates.js";
import { cattleRow, entrySheet, me, opt } from "./common.js";
import { recordTreatment, doseFor, softDelete } from "../actions.js";
import { lastWeight, onFarm } from "../model/animals.js";
import { tagParts } from "../model/tags.js";
import { listDate } from "../../../ui/format.js";
import { pill } from "../ui.js";

export const REASONS = ["Pneumonia", "Scour", "Navel", "Lame", "Worm/fluke", "BTV-3 vaccine", "Vaccine", "Other"];
const ROUTES = ["Injection (SC)", "Injection (IM)", "Pour-on", "Oral drench", "Bolus", "Intramammary", "Topical spray", "Other"];

export default function treatmentSheet(snap, { animalIds = [], reason = "", groupLabel = "" } = {}) {
  const products = [...snap.store].filter((p) => p.name).sort((a, b) => String(b.lastUsed || "").localeCompare(String(a.lastUsed || "")) || a.name.localeCompare(b.name));
  const prodOpts = [{ value: "", label: "Choose" }, ...products.map((p) => ({ value: p.id, label: p.name })), { value: "__new", label: "Not in the store — type it" }];
  const vets = snap.contacts.filter((c) => c.kind === "Vet");
  const body = el(html`<form novalidate data-sector="beef">
    <div class="form-group" data-who></div>
    <div class="form-group" style="margin-top:16px">
      <div class="field chips-field"><span class="label">Reason</span>${chipGroup("reason", opt(REASONS.map((r) => [r])), reason ? [reason] : [], { multi: false })}</div>
      ${selectField({ name: "product", label: "Product", value: "", options: prodOpts })}
      <div data-newprod hidden>${textField({ name: "productName", label: "Product name", placeholder: "e.g. Draxxin" })}</div>
      ${textField({ name: "batch", label: "Batch", placeholder: "On the bottle" })}
      ${textField({ name: "source", label: "Bought from", placeholder: "Vet or supplier" })}
      ${textField({ name: "date", label: "Date", type: "date", value: todayStr() })}
    </div>
    <p class="form-label">Dose</p>
    <div class="form-group">
      <div class="field"><span class="label">Dose</span><span style="flex:1"></span>${segmented("mode", opt([["weight", "By weight"], ["fixed", "Same for all"]]), "fixed")}</div>
      <div data-fixed>${textField({ name: "dose", label: "Dose per head", inputmode: "decimal", placeholder: "ml" })}</div>
      <div data-rate hidden>${textField({ name: "rate", label: "ml per 100 kg", inputmode: "decimal", placeholder: "from the label" })}${textField({ name: "band", label: "Round weight up to (kg)", value: "10", inputmode: "numeric" })}</div>
      ${selectField({ name: "unit", label: "Unit", value: "ml", options: opt([["ml"], ["g"], ["dose"], ["bolus"]]) })}
      ${selectField({ name: "route", label: "Route", value: ROUTES[0], options: opt(ROUTES.map((r) => [r])) })}
      ${stepperField("course", "Course (days)", 1, { min: 1, max: 14 })}
    </div>
    <div data-table></div>
    <p class="form-label">Who and withdrawal</p>
    <div class="form-group">
      ${textField({ name: "givenBy", label: "Given by", value: me() })}
      ${vets.length ? selectField({ name: "vet", label: "Vet", value: vets[0].name, options: [{ value: "", label: "None" }, ...vets.map((v) => ({ value: v.name, label: v.name }))] }) : textField({ name: "vet", label: "Vet", optional: true })}
      ${textField({ name: "wdMeat", label: "Meat withdrawal (days)", inputmode: "numeric" })}
      ${checkRow("broken", "Broken needle")}
      <div data-site hidden>${textField({ name: "site", label: "Where is it?", placeholder: "e.g. left neck" })}</div>
    </div>
    <div class="wd-line" data-wd></div>
  </form>`);
  const who = cattleRow(snap, { label: "Cattle", ids: animalIds, onChange: () => { paintTable(); refresh(); } });
  body.querySelector("[data-who]").append(who.node);
  const prodOf = (v) => products.find((p) => p.id === v.product);
  const ratePerKg = (v) => (+v.rate > 0 ? +v.rate / 100 : null);
  const weights = {};
  const paintTable = () => {
    const v = F ? F.values() : {}; const box = body.querySelector("[data-table]");
    if (v.mode !== "weight" || !who.ids().length) { box.replaceChildren(); return; }
    const rows = who.ids().map((id) => snap.ix.byId.get(id)).filter(Boolean);
    const heaviest = Math.max(0, ...rows.map((a) => +(weights[a.id] ?? lastWeight(snap.ix, a)?.kg ?? 0)));
    const all = v.reason === "Worm/fluke";
    box.replaceChildren(el(html`<div class="card pad" style="margin-top:12px"><table class="dose-table"><thead><tr><th>Animal</th><th>Weight kg</th><th>Dose</th></tr></thead><tbody>
      ${rows.map((a) => { const w = weights[a.id] ?? lastWeight(snap.ix, a)?.kg ?? ""; const d = doseFor(all ? heaviest : +w, { ratePerKg: ratePerKg(v), band: +v.band || 10 }); return html`<tr><td>${tagParts(a.tag).tail}</td><td><input inputmode="decimal" data-w="${a.id}" value="${w}" aria-label="Weight of ${tagParts(a.tag).tail}" placeholder="enter"></td><td>${d != null ? `${d} ${v.unit}` : "—"}</td></tr>`; })}
    </tbody></table><p class="hint" style="margin:8px 0 0">${all ? "Wormers: everyone dosed to the heaviest, as advised." : "Weights rounded up to the band before working out the dose."}</p></div>`));
    box.querySelectorAll("[data-w]").forEach((i) => i.addEventListener("change", () => { weights[i.dataset.w] = i.value; paintTable(); }));
  };
  const paintWd = () => {
    const v = form.values(); const days = v.wdMeat === "" ? null : +v.wdMeat; const box = body.querySelector("[data-wd]");
    if (days == null || isNaN(days)) { box.replaceChildren(); return; }
    const end = addDays(addDays(v.date, Math.max(1, +v.course || 1) - 1), days);
    box.replaceChildren(el(html`<div>${days ? pill("due", `Withdrawal: meat ${days} days → clear ${listDate(end)}`) : pill("ok", "No meat withdrawal")}</div>`));
  };
  const missing = (v) => {
    if (!who.ids().length) return "Choose the cattle to save";
    if (!v.reason) return "Choose a reason to save";
    if (!(prodOf(v) || v.productName)) return "Choose the product to save";
    if (v.mode === "fixed" && !(+v.dose > 0)) return "Add the dose to save";
    if (v.mode === "weight" && !ratePerKg(v)) return "Add the dose rate to save";
    if (v.wdMeat === "") return "Add the meat withdrawal (0 if none)";
    if (v.broken && !v.site) return "Say where the broken needle is";
    return null;
  };
  let F = null;
  const { form, refresh } = entrySheet({
    title: "Treatment", body, label: "Save treatment", missing, dirty: () => !!who.ids().length,
    async save(v, sh) {
      const p = prodOf(v); const all = v.reason === "Worm/fluke";
      const rows = who.ids().map((id) => snap.ix.byId.get(id)).filter(Boolean);
      const heaviest = Math.max(0, ...rows.map((a) => +(weights[a.id] ?? lastWeight(snap.ix, a)?.kg ?? 0)));
      const doses = rows.map((a) => { const w = +(weights[a.id] ?? lastWeight(snap.ix, a)?.kg ?? 0) || null; return { animalId: a.id, weightKg: w, dose: v.mode === "weight" ? doseFor(all ? heaviest : w, { ratePerKg: ratePerKg(v), band: +v.band || 10 }) : +v.dose }; });
      const r = recordTreatment(snap.lid, snap, { date: v.date, reason: v.reason, productName: p ? p.name : v.productName, productId: p?.id, batch: v.batch, source: v.source, unit: v.unit, route: v.route, givenBy: v.givenBy, vet: v.vet, courseDays: +v.course || 1, wdMeatDays: v.wdMeat, wdMilkDays: p?.wdMilk ?? null, brokenNeedle: v.broken, injectionSite: v.site, doses, groupLabel });
      sh.close(true, { force: true });
      toast(`Treatment saved${r.withdrawalEnd && r.withdrawalEnd > todayStr() ? ` · withdrawal to ${listDate(r.withdrawalEnd)}` : ""}`, { action: "Undo", onAction: () => r.ids.forEach((id) => softDelete(snap.lid, "medicines", id)) });
    },
  });
  F = form;
  form.onChange((name) => {
    const v = form.values();
    if (name === "product") {
      const p = prodOf(v); body.querySelector("[data-newprod]").hidden = v.product !== "__new";
      if (p) {
        const set = (n, val) => { const i = body.querySelector(`[name=${n}]`); if (i && val != null && val !== "") i.value = val; };
        set("wdMeat", p.wdMeat); set("batch", p.batch || p.batchNumber); set("source", p.source); set("unit", p.unit);
        if (+p.rateAmount > 0 && +p.rateKg > 0) { set("rate", Math.round((+p.rateAmount / +p.rateKg) * 1000) / 10); body.querySelector("[data-seg=mode] [data-value=weight]").click(); }
        if (+p.dosePerHead > 0) set("dose", p.dosePerHead);
      }
    }
    if (name === "mode") { body.querySelector("[data-fixed]").hidden = v.mode !== "fixed"; body.querySelector("[data-rate]").hidden = v.mode !== "weight"; }
    if (name === "broken") body.querySelector("[data-site]").hidden = !v.broken;
    if (["mode", "rate", "band", "reason", "unit", "product"].includes(name)) paintTable();
    paintWd(); refresh();
  });
  if (!who.ids().length && animalIds.length === 0 && snap.data.animals.filter(onFarm).length === 1) who.set([snap.data.animals.find(onFarm).id]);
  paintWd();
}
