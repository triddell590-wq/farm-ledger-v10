// Layers settings and targets (design/14 §13, §19). Owner and manager edit meta/settings; others
// read. Rules the design marks as guesses (water ±10%, spike 3× & 10 birds, lay 3 days / 5 points)
// are settings, labelled. The packer price profile (grade p/dozen, deductions, reference price,
// feed £/t) is a finance doc, shown and saved only for money roles (#prices).
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { toast } from "../../../ui/toast.js";
import { wireForm, checkRow, chipGroup } from "../../../ui/form.js";
import { canWriteMeta, canWrite, canRead } from "../../../core/policy.js";
import { largeTitle, backLink } from "../../../screens/common.js";
import { loadLayers } from "../data.js";
import { saveSettings, savePriceProfile, updateFlock } from "../actions.js";
import { opt } from "../flows/common.js";
import { DOW } from "../model/settings.js";
import { BREED_STANDARDS, STATEMENT_GRADES, REFERENCE_PRICE, RULES, freeRangeText } from "../model/content.js";
import { sortedHouses, flockIn, aliveAt } from "../model/flock.js";
import { linkRow } from "../ui.js";

const F = (name, label, value, { help = "", type = "number", step = "any" } = {}) => html`<div class="field"><label>${label}${help ? html`<br><small class="ink-2" style="font-weight:500">${help}</small>` : ""}</label><input name="${name}" type="${type}" ${raw(type === "number" ? `inputmode="decimal" step="${step}"` : "")} value="${value ?? ""}"></div>`;
const chips = (name, label, options, value, multi = false) => html`<div class="field chips-field"><span class="label">${label}</span>${chipGroup(name, opt(options), value == null ? [] : multi ? value : [value], { multi })}</div>`;

export default async function settings(ctx) {
  const snap = await loadLayers(ctx.ledger); const s = snap.s; const can = canWriteMeta(snap.role, "settings");
  const money = canRead(snap.role, "finance"); const canMoney = canWrite(snap.role, "finance");
  const L = (h) => `#/l/${snap.lid}/${h}`;
  const live = sortedHouses(snap.c).map((h) => ({ h, f: flockIn(snap.c, h.id) })).filter((x) => x.f);
  const hens = live.reduce((t, { f }) => t + aliveAt(snap.c, f, snap.today), 0) || +s.layingHens || 0;
  const emi = RULES.emi.NI;
  const body = el(html`<div class="ly-page push">${backLink(L("more"), "More")}${largeTitle("Layers settings", can ? "Changes apply straight away" : "Only the owner or a manager can change these")}
    <form novalidate data-main ${raw(can ? "" : "inert")}>
    <p class="form-label">Registration</p><div class="form-group">
      ${F("producerCode", "Producer code", s.producerCode, { type: "text", help: "System digit, UK9, site number — e.g. 1UK9-0412" })}
      ${checkRow("registeredEmi", "Registered with the DAERA Egg Marketing Inspectorate", !!s.registeredEmi, `Required at ${emi.minHens} laying hens or more`)}
      ${F("establishmentNo", "Establishment no. (DAERA bird registration)", s.establishmentNo, { type: "text", help: "All keepers. Houses can have their own in Houses and flocks." })}
      ${F("layingHens", "Laying hens (usual number)", s.layingHens ?? (hens || ""), { step: 1 })}
      ${checkRow("smallFlock", "Small flock — under 350 hens, selling direct", !!s.smallFlock, "Switches off the Salmonella programme and shows why")}
      ${checkRow("gradeOnFarm", "I grade eggs on the farm", !!s.gradeOnFarm, "Adds XL/L/M/S to the daily sheet and the production register")}
      ${checkRow("farmGate", "I sell eggs at the farm gate", !!s.farmGate, "Ungraded eggs within 28 days of lay")}
      ${checkRow("rspca", "RSPCA Assured", !!s.rspca, "Adds the optional checklist (edition to be confirmed)")}</div>
    <div data-emi></div>
    <p class="form-label">Packer</p><div class="form-group">
      ${F("packer", "Packer", s.packer, { type: "text" })}
      ${chips("collectionDays", "Collection days", DOW.map((d, i) => [String(i), d]), (s.collectionDays || []).map(String), true)}
      ${F("collectGapDays", "Collection gap alert (days)", s.collectGapDays, { step: 1, help: "Lion: at least twice a week" })}
      ${F("packerMortTrigger", "Packer mortality trigger (% a week)", s.packerMortTrigger)}
      ${F("packerDiffPct", "Statement difference alert (%)", s.packerDiffPct)}</div>
    <p class="form-label">Daily sheet</p><div class="form-group">
      ${chips("henDayBasis", "Hen-day % counts", [["total", "All eggs"], ["saleable", "Saleable eggs only"]], s.henDayBasis)}
      ${F("sheetBy", "Sheet reminder by", s.sheetBy, { type: "time" })}
      ${checkRow("storeTempDaily", "Log the egg store temperature daily", !!s.storeTempDaily)}
      ${F("storeMax", "Egg store maximum (°C)", s.storeMax, { help: "Lion: below 20 °C, constant" })}</div>
    <p class="form-label">Alert rules</p><div class="form-group">
      ${F("waterAlertPct", "Water change alert (±%)", s.waterAlertPct, { help: "Guess made into a setting" })}
      ${F("spikeMult", "Mortality spike — times the 7-day average", s.spikeMult, { help: "Guess made into a setting" })}${F("spikeMin", "Mortality spike — at least (birds)", s.spikeMin, { step: 1 })}
      ${F("layBelowDays", "Lay below standard for (days)", s.layBelowDays, { step: 1 })}${F("layDropPts", "Lay drop in a day (points)", s.layDropPts)}
      ${F("miteAction", "Red mite action level (average 0–4)", s.miteAction)}
      ${chips("miteDay", "Mite traps on", DOW.map((d, i) => [String(i), d]), String(s.miteDay))}
      ${F("featherEveryDays", "Feather score every (days)", s.featherEveryDays, { step: 1 })}${F("weighEveryDays", "Weigh hens every (days)", s.weighEveryDays, { step: 1 })}
      ${F("uniformityTarget", "Uniformity target (%)", s.uniformityTarget)}
      ${F("alarmEveryDays", "Alarm test every (days)", s.alarmEveryDays, { step: 1, help: "The law says at least every 7 days" })}</div>
    <p class="form-label">Phone numbers</p><div class="form-group">
      ${F("vetPhone", "Vet", s.vetPhone, { type: "tel" })}${F("daeraPhone", "DAERA", s.daeraPhone, { type: "tel" })}</div>
    <p class="form-label">Farm position (dusk times)</p><div class="form-group">
      ${F("lat", "Latitude", s.lat)}${F("lng", "Longitude (west is minus)", s.lng)}</div>
    </form>
    ${can ? html`<button type="button" class="btn" style="margin-top:16px" data-save>Save settings</button>` : ""}
    ${live.length ? html`<p class="form-label" style="margin-top:24px">Breed standard per flock</p><div class="form-group" data-breeds>${live.map(({ h, f }) => chips(`breed:${f.id}`, h.name, BREED_STANDARDS.map((b) => [b.id, b.breed]), f.breedStdId))}</div>` : ""}
    ${money ? html`<p class="form-label" id="prices" style="margin-top:24px">Egg prices (money roles only)</p>
      <form novalidate data-prices ${raw(canMoney ? "" : "inert")}><div class="form-group">${STATEMENT_GRADES.map((g) => F(`p_${g}`, `${g} — pence a dozen`, s.prices?.[g] ?? ""))}
        ${F("deductions", "Weekly deductions (£, levy and transport)", s.deductions ?? "")}${F("refPrice", "Reference price (p a dozen)", s.refPrice ?? "", { help: `${REFERENCE_PRICE.label}: ${REFERENCE_PRICE.pPerDozen}p — entered by you, never fetched` })}${F("feedPerTonne", "Feed price (£ a tonne)", s.feedPerTonne ?? "")}</div></form>
      ${canMoney ? html`<button type="button" class="btn secondary" style="margin-top:12px" data-saveprices>Save egg prices</button>` : ""}` : ""}
    <p class="form-label" style="margin-top:24px">Rules this ledger follows</p>
    <div class="card pad t-callout ink-2">Free-range labelling during a housing order: ${freeRangeText(snap.c.region)}. Salmonella: first sample at 22–26 weeks, then every 15 weeks; tell DAERA 2 weeks before a flock arrives. Ungraded eggs: ${RULES.ungraded.NI.text}</div>
    <div class="list" style="margin-top:12px">${linkRow(L("houses-setup"), "Houses and flocks", "Sizes, systems, trap points", "", "house")}${linkRow(L("import"), "Import from your house controller", "Maximus, Fancom, Big Dutchman CSV", "", "download")}</div>
  </div>`);
  const main = body.querySelector("[data-main]"); const f = wireForm(main);
  const emiBox = body.querySelector("[data-emi]");
  const paintEmi = () => { const v = f.values(); const n = +v.layingHens || hens; emiBox.replaceChildren(n >= emi.minHens && (!v.producerCode || !v.registeredEmi) ? el(html`<div class="warn-card" style="margin-top:8px"><span>${emi.text} Add your producer code and tick that you're registered.</span></div>`) : n < emi.minHens && n > 0 ? el(html`<p class="ly-cap">Under ${emi.minHens} hens the producer code is optional${v.smallFlock ? " and the Salmonella programme is off" : ""}.</p>`) : document.createTextNode("")); };
  f.onChange(paintEmi); paintEmi();
  const btn = body.querySelector("[data-save]");
  if (btn) btn.onclick = () => {
    const v = f.values(); const n = (k) => (v[k] === "" || v[k] == null ? undefined : +v[k]);
    const patch = { producerCode: String(v.producerCode || "").trim().toUpperCase(), registeredEmi: !!v.registeredEmi, establishmentNo: v.establishmentNo || "", layingHens: n("layingHens"), smallFlock: !!v.smallFlock, gradeOnFarm: !!v.gradeOnFarm, farmGate: !!v.farmGate, rspca: !!v.rspca,
      packer: v.packer || "", collectionDays: (v.collectionDays || []).map(Number).sort(), collectGapDays: n("collectGapDays"), packerMortTrigger: n("packerMortTrigger"), packerDiffPct: n("packerDiffPct"),
      henDayBasis: v.henDayBasis || "total", sheetBy: v.sheetBy || "11:00", storeTempDaily: !!v.storeTempDaily, storeMax: n("storeMax"),
      waterAlertPct: n("waterAlertPct"), spikeMult: n("spikeMult"), spikeMin: n("spikeMin"), layBelowDays: n("layBelowDays"), layDropPts: n("layDropPts"), miteAction: n("miteAction"), miteDay: n("miteDay"),
      featherEveryDays: n("featherEveryDays"), weighEveryDays: n("weighEveryDays"), uniformityTarget: n("uniformityTarget"), alarmEveryDays: Math.min(7, n("alarmEveryDays") ?? 7),
      vetPhone: v.vetPhone || "", daeraPhone: v.daeraPhone || "", lat: n("lat"), lng: n("lng") };
    for (const k of Object.keys(patch)) if (patch[k] === undefined) delete patch[k];
    saveSettings(snap, patch); toast("Layers settings saved");
  };
  const bw = body.querySelector("[data-breeds]");
  if (bw) { if (!can) bw.setAttribute("inert", ""); const wf = wireForm(bw); wf.onChange(() => { const v = wf.values(); for (const { f: fl } of live) { const want = v[`breed:${fl.id}`]; if (want && fl.breedStdId !== want) { updateFlock(snap, fl, { breedStdId: want }); fl.breedStdId = want; toast("Breed standard changed"); } } }); }
  const pb = body.querySelector("[data-saveprices]");
  if (pb) pb.onclick = () => {
    const v = wireForm(body.querySelector("[data-prices]")).values(); const n = (k) => (v[k] === "" || v[k] == null ? null : +v[k]);
    savePriceProfile(snap, { prices: Object.fromEntries(STATEMENT_GRADES.map((g) => [g, n(`p_${g}`)]).filter(([, x]) => x != null)), deductions: n("deductions"), refPrice: n("refPrice"), feedPerTonne: n("feedPerTonne") });
    toast("Egg prices saved");
  };
  if (ctx.match?.groups?.sec === "prices") setTimeout(() => body.querySelector("#prices")?.scrollIntoView({ block: "start" }), 400);
  return { el: body, title: "Layers settings", depth: 1, tab: "more" };
}
