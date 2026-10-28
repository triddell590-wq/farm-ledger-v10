// Treat a mob (design/11 §6.1) and FEC result (§6.2). One medicines record per mob dose
// (Research B batch layout) so the register prints one line per mob dose.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { toast } from "../../../ui/toast.js";
import { confirmSheet } from "../../../ui/sheet.js";
import { textField, selectField, chipGroup, segmented, checkRow } from "../../../ui/form.js";
import { todayStr, addDays, daysBetween } from "../../../core/dates.js";
import { entrySheet, mobPickRow, chipsField, opt, groupChip, short, num } from "../ui.js";
import { REASONS, WORMER_GROUPS, groupFromProduct, flukeStage, doseEach, totalDose, groupUses, fecVerdict, fecReduction, preDoseFec, isWormer } from "../model/health.js";
import { BTV_NOTE } from "../model/content.js";
import * as A from "../actions.js";

const n = (v) => parseFloat(String(v ?? "").replace(",", ".")) || 0;

export function doseSheet(snap, { reason = "Worms", mob = null } = {}) {
  const products = snap.store.slice().sort((a, b) => String(a.name).localeCompare(b.name));
  const lastFor = (name) => snap.data.medicines.filter((m) => m.productName === name && m.rateMl).sort((a, b) => b.date.localeCompare(a.date))[0];
  const body = el(html`<form novalidate>
    <div class="form-group" data-mob></div>
    ${checkRow("some", "Only some of the mob", false, "Count how many, or list their tags")}
    <div class="form-group" data-some hidden>${textField({ name: "number", label: "How many", inputmode: "numeric" })}${textField({ name: "tags", label: "Tags", optional: true, placeholder: "Last 5 digits, comma between" })}</div>
    ${chipsField("What for", chipGroup("reason", opt(REASONS), reason, { multi: false }))}
    <p class="info-card" data-btv hidden>${raw(icon("info"))}<span>${BTV_NOTE} The record exports as a list your vet can use.</span></p>
    <div class="form-group">${selectField({ name: "productId", label: "Product", value: "", options: [{ value: "", label: products.length ? "Choose from the medicine store" : "No products in the store yet" }, ...products.map((p) => ({ value: p.id, label: p.name })), { value: "_other", label: "Another product (type it)" }] })}
      <div data-other hidden>${textField({ name: "productName", label: "Product name" })}</div>
      ${textField({ name: "batch", label: "Batch number", optional: true })}</div>
    <div data-group-box><p class="form-label">Wormer group</p>${chipGroup("wormerGroup", Object.entries(WORMER_GROUPS).map(([k, g]) => ({ value: k, label: g.label })), [], { multi: false })}<p class="hint" data-rot></p></div>
    <p class="hint" data-fluke hidden></p>
    <p class="form-label">Dose</p>${segmented("method", [{ value: "heaviest", label: "Heaviest" }, { value: "bands", label: "By weight band" }, { value: "same", label: "Same for all" }], "heaviest")}
    <div class="form-group" style="margin-top:12px">
      <div data-m="heaviest">${textField({ name: "heaviest", label: "Heaviest in mob (kg)", inputmode: "decimal" })}</div>
      <div data-m="bands" hidden>${[1, 2, 3].map((i) => html`${textField({ name: `b${i}kg`, label: `Band ${i}: up to (kg)`, inputmode: "decimal", value: ["30", "45", "70"][i - 1] })}${textField({ name: `b${i}n`, label: `Band ${i}: how many`, inputmode: "numeric" })}`)}</div>
      <div data-m="rate">${textField({ name: "rateMl", label: "Dose rate: ml", inputmode: "decimal", value: "1" })}${textField({ name: "perKg", label: "… per kg", inputmode: "decimal", value: "5" })}</div>
      <div data-m="same" hidden>${textField({ name: "each", label: "Dose each (ml)", inputmode: "decimal" })}</div>
    </div>
    <div class="calc" data-calc></div>
    <div class="form-group" style="margin-top:12px">${textField({ name: "wd", label: "Meat withdrawal (days)", inputmode: "numeric" })}${textField({ name: "date", label: "Date", type: "date", value: todayStr() })}${textField({ name: "givenBy", label: "Given by", value: A.me() })}${textField({ name: "moveTo", label: "Move after dosing to (field)", optional: true, placeholder: "Dose and move" })}</div>
    <div data-dip hidden><p class="form-label">Dipping</p>${chipGroup("dipType", opt(["OP", "Pyrethroid"]), [], { multi: false })}<div class="form-group" style="margin-top:8px">${textField({ name: "cert", label: "Operator's certificate of competence (no.)" })}${textField({ name: "disposal", label: "Dip disposal method" })}${textField({ name: "niea", label: "NIEA authorisation number", optional: true })}</div><div data-cert-warn></div></div>
    <p class="wd-line" data-wd></p></form>`);
  const mp = mobPickRow(snap, { mob, onChange: () => upd() }); body.querySelector("[data-mob]").append(mp.node);
  const q = (s) => body.querySelector(s);
  const prod = () => products.find((p) => p.id === q("[name=productId]").value) || null;
  const calc = (v) => {
    const all = mp.mob() ? snap.counts.get(mp.mob().id) || 0 : 0; const count = v.some ? n(v.number) || (v.tags ? v.tags.split(",").filter((x) => x.trim()).length : 0) : all;
    const rate = n(v.rateMl), per = n(v.perKg) || 1;
    if (v.method === "same") { const each = n(v.each); return { count, each, total: totalDose(count, each) }; }
    if (v.method === "bands") { const bands = [1, 2, 3].map((i) => ({ to: n(v[`b${i}kg`]), n: n(v[`b${i}n`]) })).filter((b) => b.n > 0); const out = bands.map((b) => ({ ...b, each: doseEach(b.to, rate, per) })); const c = out.reduce((s, b) => s + b.n, 0); return { count: c, bands: out, each: null, total: Math.round(out.reduce((s, b) => s + b.each * b.n, 0) * 10) / 10 }; }
    const each = doseEach(n(v.heaviest), rate, per); return { count, each, total: totalDose(count, each) };
  };
  const upd = () => {
    const v = form.values(); const p = prod(); const name = p ? p.name : v.productName;
    q("[data-other]").hidden = q("[name=productId]").value !== "_other";
    q("[data-some]").hidden = !v.some;
    for (const m of ["heaviest", "bands", "same"]) q(`[data-m=${m}]`).hidden = v.method !== m;
    q("[data-m=rate]").hidden = v.method === "same";
    q("[data-btv]").hidden = v.reason !== "BTV-3 vaccine";
    q("[data-dip]").hidden = v.reason !== "Scab";
    const showGroup = v.reason === "Worms" || (!!groupFromProduct(name) && v.reason !== "Fluke");
    q("[data-group-box]").hidden = !showGroup;
    const fl = v.reason === "Fluke" ? flukeStage(name, p?.flukeStages) : ""; q("[data-fluke]").hidden = !fl; q("[data-fluke]").textContent = fl ? `Kills: ${fl}.` : "";
    const g = v.wormerGroup; const uses = g && mp.mob() ? groupUses(snap.data, mp.mob().id, g, snap.today.slice(0, 4)) : 0;
    q("[data-rot]").textContent = uses >= 2 ? `You've used ${WORMER_GROUPS[g].label} ${uses} times on this mob this year.` : "";
    const c = calc(v);
    q("[data-calc]").innerHTML = c.count ? (v.method === "bands" ? (c.bands || []).map((b) => `Up to ${b.to} kg → <b>${b.each} ml</b> each × ${b.n}`).join("<br>") + `<br>Total <b>${c.total} ml</b>` : `${v.method === "heaviest" && n(v.heaviest) ? `Heaviest ${n(v.heaviest)} kg → ` : ""}<b>${c.each || 0} ml each</b><br>Total <b>${c.total} ml</b> (${c.count} × ${c.each || 0})`) + `<p class="hint">Rate ${n(v.rateMl)} ml per ${n(v.perKg) || 1} kg. Check it against the product label.</p>` : `<span class="ink-2">Choose the mob to work out the dose.</span>`;
    const wd = n(v.wd); q("[data-wd]").textContent = v.wd === "" ? "Add the meat withdrawal from the label (0 if none)." : wd > 0 ? `Meat withdrawal ${wd} days → clear ${short(addDays(v.date || snap.today, wd))}` : "No meat withdrawal.";
    const cw = q("[data-cert-warn]"); cw.innerHTML = v.reason === "Scab" && v.dipType === "OP" && !v.cert ? `<div class="field-error" role="alert">${icon("alert")}<span>OP dip needs a certificate of competence. Add one in Training.</span></div>` : "";
  };
  const missing = (v) => {
    if (!mp.mob()) return "Choose the mob to save";
    if (!(prod() || v.productName)) return "Choose the product to save";
    const c = calc(v); if (!c.count) return "Add how many were treated";
    if (v.wd === "") return "Add the withdrawal days to save";
    if (v.reason === "Scab" && v.dipType === "OP" && !v.cert) return "Add the dip certificate to save";
    return null;
  };
  const { form } = entrySheet({ title: "Treat a mob", body, label: "Save dose", missing, save: async (v, sh) => {
    const p = prod(); const c = calc(v); const m = mp.mob();
    const id = A.dose(snap.lid, { date: v.date, mobId: m.id, mobName: m.name, reason: v.reason, productId: p?.id, productName: p ? p.name : v.productName, batch: v.batch || p?.batch, wormerGroup: !q("[data-group-box]").hidden ? v.wormerGroup : undefined, numberTreated: c.count, heaviest: v.method === "heaviest" ? n(v.heaviest) : undefined, doseMethod: v.method, doseEach: c.each, totalDose: c.total, bands: c.bands, rateMl: n(v.rateMl), ratePerKg: n(v.perKg), wdMeatDays: n(v.wd), givenBy: v.givenBy, tags: v.tags ? v.tags.split(",").map((x) => x.trim()).filter(Boolean) : undefined, moveTo: v.moveTo, moveFrom: m.fieldName, dipType: v.reason === "Scab" ? v.dipType : undefined, operatorCert: v.cert, disposalMethod: v.disposal, niea: v.niea, licenceNote: v.reason === "BTV-3 vaccine" ? BTV_NOTE : undefined });
    sh.close(true, { force: true }); toast(`Dose saved: ${m.name}${n(v.wd) ? ` · clear ${short(addDays(v.date, n(v.wd)))}` : ""}`);
    if (v.reason === "Scab" && await confirmSheet({ title: "Is this suspected sheep scab?", body: "Suspected sheep scab must be reported to DAERA — it's an offence not to.", confirm: "Report scab", cancel: "No, it's preventive" })) (await import("./disease.js")).reportSheet(snap, { disease: "scab" });
    return id;
  } });
  // product → wormer group, withdrawal, last-used rate
  q("[name=productId]").addEventListener("change", () => {
    const p = prod(); if (p) { if (p.wdMeat != null && p.wdMeat !== "") q("[name=wd]").value = p.wdMeat; const g = groupFromProduct(p.name); if (g) body.querySelectorAll("[data-chips=wormerGroup] .chip").forEach((x) => x.setAttribute("aria-checked", String(x.dataset.value === g))); const last = lastFor(p.name); if (last) { q("[name=rateMl]").value = last.rateMl; q("[name=perKg]").value = last.ratePerKg || 5; } }
    upd();
  });
  q("[name=productName]").addEventListener("input", () => { const g = groupFromProduct(q("[name=productName]").value); if (g) body.querySelectorAll("[data-chips=wormerGroup] .chip").forEach((x) => x.setAttribute("aria-checked", String(x.dataset.value === g))); });
  form.onChange(() => setTimeout(upd, 0)); body.addEventListener("click", () => setTimeout(upd, 0));
  upd();
}

export function fecSheet(snap, { mob = null } = {}) {
  const body = el(html`<form novalidate><div class="form-group" data-mob></div>
    <div class="form-group">${textField({ name: "date", label: "Sample date", type: "date", value: snap.today })}${textField({ name: "lab", label: "Lab or kit", optional: true })}
      ${textField({ name: "strongyle", label: "Strongyle (epg)", inputmode: "numeric" })}${textField({ name: "nematodirus", label: "Nematodirus (epg)", inputmode: "numeric", optional: true })}
      ${textField({ name: "coccidia", label: "Coccidia", optional: true })}${textField({ name: "fluke", label: "Fluke", optional: true })}</div>
    <div data-post></div><div class="calc" data-verdict></div></form>`);
  const mp = mobPickRow(snap, { mob, onChange: () => paintPost() }); body.querySelector("[data-mob]").append(mp.node);
  const recentDoses = () => (mp.mob() ? snap.data.medicines.filter((m) => m.mobId === mp.mob().id && isWormer(m) && daysBetween(m.date, snap.today) <= 21 && daysBetween(m.date, snap.today) >= 5) : []);
  const paintPost = () => { const ds = recentDoses(); body.querySelector("[data-post]").innerHTML = ""; if (ds.length) body.querySelector("[data-post]").append(el(html`<div class="form-group">${selectField({ name: "postDoseOf", label: "Drench check after", value: ds[0].id, options: [...ds.map((d) => ({ value: d.id, label: `${d.productName} ${short(d.date)}` })), { value: "", label: "Not a drench check" }] })}</div>`)); };
  const verdict = (v) => {
    const vd = fecVerdict(v.strongyle, snap.s.fecThreshold); let txt = vd ? `<b>${vd.text}</b> <span class="ink-2">(your threshold ${snap.s.fecThreshold} epg)</span>` : `<span class="ink-2">Add the strongyle count to see the result.</span>`;
    const dose = v.postDoseOf && snap.data.medicines.find((m) => m.id === v.postDoseOf);
    if (dose && v.strongyle !== "") { const pre = preDoseFec(snap.data, dose); const r = pre && fecReduction(+pre.counts?.strongyle, +v.strongyle); txt += r ? `<br>Reduction <b>${r.pct}%</b> from ${pre.counts.strongyle} epg — ${r.ok ? "the wormer worked" : "wormer may not be working. Talk to your vet about resistance."}` : "<br><span class='ink-2'>No count before the dose to compare with.</span>"; }
    return txt;
  };
  const { form } = entrySheet({ title: "FEC result", body, label: "Save FEC", missing: (v) => (!mp.mob() ? "Choose the mob to save" : v.strongyle === "" ? "Add the strongyle count" : null),
    save: (v, sh) => { A.fecResult(snap.lid, mp.mob(), v); sh.close(true, { force: true }); const vd = fecVerdict(v.strongyle, snap.s.fecThreshold); toast(`FEC saved: ${vd.text}`); } });
  const upd = () => { body.querySelector("[data-verdict]").innerHTML = verdict(form.values()); };
  form.onChange(upd); paintPost(); upd();
}
export { num, groupChip };
