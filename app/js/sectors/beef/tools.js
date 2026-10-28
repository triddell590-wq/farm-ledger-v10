// Tools (design/10 §10): one screen each, ≤ 4 inputs prefilled from the ledger, the answer in
// big type with its target and source. All offline, pure maths from the model.
import { html, raw } from "../../core/html.js";
import { el } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { textField, selectField, segmented, wireForm } from "../../ui/form.js";
import { addDays, daysBetween, shortDate } from "../../core/dates.js";
import { listDate, num, moneyText } from "../../ui/format.js";
import { canRead } from "../../core/policy.js";
import { backLink, largeTitle } from "../../screens/common.js";
import { loadBeef } from "./data.js";
import { doseFor } from "./actions.js";
import { gestationDays, SOURCES } from "./model/rules.js";
import { heiferWindow, replacementHeifers } from "./model/breeding.js";
import { maxBid, adj200, finishingFacts, deadlineAnimals } from "./model/finishing.js";
import { mealFor } from "./model/feed.js";
import { onFarm, lastWeight, classOf, CLASS_NAMES, shortName } from "./model/animals.js";
import { DAERA_BREEDS, tagParts } from "./model/tags.js";

const LIST = [["calving", "Calving date", "Due date and window from a service or bull dates"], ["heifer", "Heifer breeding window", "Serve-by dates for the Suckler Cow Scheme"], ["dose", "Dose by weight", "Dose per head, rounded up to a weight band"],
  ["wean", "200-day weight", "Adjusted weaning weight and % of the cow's weight"], ["finish", "Finishing date", "Ready-by date and carcase at today's gain"], ["max-bid", "Buy-in max bid", "Break-even £/kg and the most to pay"],
  ["fodder", "Fodder budget", "When the silage runs out"], ["meal", "Meal calculator", "kg of meal a head for the gain you want"], ["slurry", "Slurry storage", "Weeks of storage against the 22 weeks needed"], ["scale", "Import from scale head", "Coming soon"]];
// Slurry produced, m³ per head per week. GUESS from typical figures — check against DAERA NAP tables before relying on it.
const SLURRY = { cow: 0.23, bull: 0.25, heifer: 0.15, finisher: 0.17, store: 0.13, weanling: 0.09, calf: 0.06 };

export default async function tools(ctx) {
  const snap = await loadBeef(ctx.ledger); const tool = ctx.match?.groups?.tool;
  if (!tool) return { el: el(html`<div class="beef-page">${backLink(`#/l/${snap.lid}/more`, "More")}${largeTitle("Tools", "Worked out on this phone — no signal needed")}<div class="list">${LIST.map(([k, l, sub]) => html`<a class="row" href="${k === "fodder" ? `#/l/${snap.lid}/feed` : `#/l/${snap.lid}/tools/${k}`}"><span class="tile">${raw(icon(k === "scale" ? "scale" : k === "dose" ? "syringe" : k === "fodder" || k === "meal" ? "feed" : k === "max-bid" ? "money" : "grid"))}</span><span class="main"><span class="primary">${l}</span><span class="secondary">${sub}</span></span><span class="chev">${raw(icon("chevron"))}</span></a>`)}</div></div>`), title: "Tools", depth: 1, tab: "more" };
  const [, label] = LIST.find(([k]) => k === tool) || [tool, "Tool"];
  const body = el(html`<div class="beef-page">${backLink(`#/l/${snap.lid}/tools`, "Tools")}${largeTitle(label)}<form novalidate class="form-group" data-in></form><div class="card pad tool-out" data-out aria-live="polite"></div></div>`);
  const T = TOOLS[tool] || TOOLS.scale; const form = body.querySelector("[data-in]");
  form.append(el(html`<div style="display:contents">${T.inputs(snap)}</div>`));
  const f = wireForm(form); const paint = () => body.querySelector("[data-out]").replaceChildren(el(html`<div>${T.out(f.values(), snap)}</div>`));
  f.onChange(paint); paint();
  return { el: body, title: label, depth: 2, tab: "more" };
}
const ans = (big, sub = "", src = "") => html`<div class="tool-answer">${big}</div>${sub ? html`<p style="margin:0">${sub}</p>` : ""}${src ? html`<p class="source">${src}</p>` : ""}`;
const breedOpts = DAERA_BREEDS.map(([c, n]) => ({ value: c, label: n }));

const TOOLS = {
  calving: {
    inputs: () => html`<div class="field"><span class="label">Bred by</span><span style="flex:1"></span>${segmented("kind", [{ value: "ai", label: "AI / date" }, { value: "bull", label: "Bull in/out" }], "ai")}</div>
      ${textField({ name: "date", label: "Service or bull in", type: "date" })}${textField({ name: "out", label: "Bull out", type: "date", optional: true })}${selectField({ name: "breed", label: "Sire breed", value: "CH", options: breedOpts })}`,
    out(v, snap) { if (!v.date) return ans("—", "Add the service date."); const g = gestationDays(snap.s, v.breed);
      if (v.kind === "bull") { const from = addDays(v.date, 279), to = addDays(v.out || addDays(v.date, 63), 287); return ans(`${listDate(from).slice(4)} – ${listDate(to).slice(4)}`, "Due window until a scan narrows it (bull in + 279 … bull out + 287 days).", SOURCES.gestation); }
      const due = addDays(v.date, g); return ans(listDate(due), `${g} days for ${v.breed} (bull calves about a day longer). Window ${listDate(addDays(due, -4)).slice(4)} – ${listDate(addDays(due, 4)).slice(4)}.`, SOURCES.gestation); },
  },
  heifer: {
    inputs: (snap) => { const hs = replacementHeifers(snap.data, snap.ix, snap.today); return html`${hs.length ? selectField({ name: "id", label: "Heifer", value: hs[0].id, options: [...hs.map((h) => ({ value: h.id, label: shortName(h) || h.tag })), { value: "", label: "Type a date of birth" }] }) : ""}${textField({ name: "dob", label: "Born", type: "date", optional: true })}`; },
    out(v, snap) { const h = v.id ? snap.ix.byId.get(v.id) : v.dob ? { id: "x", dob: v.dob, sex: "Heifer" } : null; if (!h) return ans("—", "Pick a heifer or type her date of birth.");
      const w = heiferWindow(snap.data, snap.s, snap.ix, h, snap.today); return ans(`Serve by ${listDate(w.serveTo).slice(4)}`, `Serve ${shortDate(w.serveFrom)} – ${shortDate(w.serveTo)} to calve between 21 and ${w.maxM} months (SC Scheme). Best: serve by ${shortDate(w.best)} to calve at 24 months.`, SOURCES.sc); },
  },
  dose: {
    inputs: (snap) => html`${textField({ name: "kg", label: "Weight (kg)", inputmode: "decimal", value: "" })}${textField({ name: "rate", label: "ml per 100 kg (label)", inputmode: "decimal", value: "" })}${textField({ name: "band", label: "Round up to (kg)", value: "10", inputmode: "numeric" })}${textField({ name: "head", label: "How many head", inputmode: "numeric", value: String(snap.data.animals.filter(onFarm).length || 1) })}`,
    out(v) { const d = doseFor(+v.kg, { ratePerKg: +v.rate / 100, band: +v.band || 10 }); return d == null ? ans("—", "Add the weight and the label dose rate.") : ans(`${d} ml`, `a head · ${num(d * (+v.head || 1), 1)} ml for ${+v.head || 1} head. Weight rounded up to ${Math.ceil(+v.kg / (+v.band || 10)) * (+v.band || 10)} kg. For wormers, dose everyone to the heaviest.`, "Always check the product label"); },
  },
  wean: {
    inputs: () => html`${textField({ name: "wean", label: "Weaning weight (kg)", inputmode: "decimal" })}${textField({ name: "age", label: "Age at weaning (days)", inputmode: "numeric" })}${textField({ name: "birth", label: "Birth weight (kg)", value: "40", inputmode: "decimal" })}${textField({ name: "dam", label: "Cow's weight (kg)", inputmode: "decimal", optional: true })}`,
    out(v) { const r = adj200({ weanKg: +v.wean, birthKg: +v.birth || 40, ageDays: +v.age, damKg: +v.dam || null }); if (!r) return ans("—", "Add weaning weight and age."); return ans(`${Math.round(r.adj200)} kg`, `adjusted 200-day weight${r.pctOfDam ? ` · ${Math.round(r.pctOfDam)}% of the cow's weight (target 50%, at least 40%)` : ""}`, "AHDB adjusted 200-day weight method"); },
  },
  finish: {
    inputs: (snap) => { const l = deadlineAnimals(snap.data, snap.ix, snap.today); return l.length ? selectField({ name: "id", label: "Animal", value: l[0].id, options: l.map((a) => ({ value: a.id, label: `${tagParts(a.tag).tail} · ${CLASS_NAMES[classOf(snap.ix, a, snap.today)] || ""}` })) }) : html`<p class="hint" style="padding:12px 16px">No stores or finishers on the farm.</p>`; },
    out(v, snap) { const a = snap.ix.byId.get(v.id); if (!a) return ""; const f = finishingFacts(snap.data, snap.s, snap.ix, a, snap.today);
      return ans(f.readyBy ? (f.readyBy <= snap.today ? "Ready now" : listDate(f.readyBy)) : "Weigh first", `${f.estCarcase ? `Est. carcase now ${Math.round(f.estCarcase)} kg at ${Math.round(f.ko)}% KO; target ${snap.s.targetCarcaseKg} kg. ` : ""}${f.deadlines.map((d) => `${d.label}: ${shortDate(d.date)}`).join(" · ")}`, "Kill-out % and target carcase from your Targets; deadlines from the BCRS and processor settings"); },
  },
  "max-bid": {
    inputs: (snap) => { const cost = dailyCost(snap); return html`${textField({ name: "win", label: "Weight in (kg)", inputmode: "decimal", value: "400" })}${textField({ name: "wout", label: "Sale weight (kg live)", inputmode: "decimal", value: "650" })}${textField({ name: "days", label: "Days on farm", inputmode: "numeric", value: "200" })}${textField({ name: "cost", label: "Cost a day (£)", inputmode: "decimal", value: cost ? cost.toFixed(2) : "1.80" })}${textField({ name: "price", label: "Sale price (£/kg dead)", inputmode: "decimal", value: String(snap.s.price.perKgDead || "5.80") })}${textField({ name: "margin", label: "Margin you want (£/head)", inputmode: "decimal", value: "100" })}`; },
    out(v, snap) { const r = maxBid({ weightIn: +v.win, saleWeight: +v.wout, koPct: snap.s.processor.ko.Steer, salePricePerKg: +v.price, days: +v.days, dailyCost: +v.cost, targetMargin: +v.margin });
      if (!canRead(snap.role, "finance")) return ans("—", "Prices are hidden for your role.");
      return ans(moneyText(r.maxBid), `most to pay a head (${r.perKgAtMax ? `£${r.perKgAtMax.toFixed(2)}/kg` : ""} live). Break-even £${(r.breakEvenPerKg || 0).toFixed(2)}/kg live. Sale value ${moneyText(r.saleValue)} at ${snap.s.processor.ko.Steer}% kill-out.`, "Daily cost prefilled from the last 90 days' feed and vet money ÷ head"); },
  },
  meal: {
    inputs: () => html`${selectField({ name: "q", label: "Silage quality", value: "average", options: [{ value: "good", label: "Good (D-value 70+)" }, { value: "average", label: "Average (65–70)" }, { value: "poor", label: "Poor (under 65)" }] })}${selectField({ name: "gain", label: "Gain you want (kg/day)", value: "1", options: [{ value: "0.8", label: "0.8" }, { value: "1", label: "1.0" }, { value: "1.2", label: "1.2" }] })}${textField({ name: "price", label: "Meal price (£/t)", inputmode: "decimal", optional: true })}`,
    out(v) { const kg = mealFor(v.q, +v.gain); return ans(`${kg} kg`, `of meal a head a day for a 500 kg steer${+v.price ? ` · ${moneyText((kg * +v.price) / 1000)} a head a day` : ""}.`, "Guide table (DAERA/Teagasc figures, editable) — check with your nutritionist"); },
  },
  slurry: {
    inputs: (snap) => { const by = {}; snap.data.animals.filter(onFarm).forEach((a) => { const c = classOf(snap.ix, a, snap.today); by[c] = (by[c] || 0) + 1; }); return html`${Object.entries(by).map(([k, n]) => textField({ name: `h_${k}`, label: `${CLASS_NAMES[k]} housed`, value: String(n), inputmode: "numeric" }))}${textField({ name: "tank", label: "Tank size (m³)", inputmode: "decimal" })}`; },
    out(v) { const perWeek = Object.entries(v).filter(([k]) => k.startsWith("h_")).reduce((t, [k, n]) => t + (+n || 0) * (SLURRY[k.slice(2)] ?? 0.15), 0); if (!+v.tank || !perWeek) return ans("—", "Add your tank size.");
      const wk = +v.tank / perWeek; return ans(`${num(wk, 1)} weeks`, `${num(perWeek, 1)} m³ a week. Cattle need 22 weeks of storage under the Nutrients Action Programme${wk < 22 ? " — you're short" : " ✓"}.`, "GUESS: per-head slurry figures are typical values; check against the DAERA NAP tables"); },
  },
  scale: { inputs: () => "", out: () => ans("Coming soon", "Importing weights from a Tru-Test or Gallagher scale head (CSV) arrives once we've checked their file formats. Until then use Weigh (crush mode).") },
};
function dailyCost(snap) {
  const from = addDays(snap.today, -90); const head = snap.data.animals.filter(onFarm).length || 1;
  const cost = (snap.data.finance || []).filter((e) => !e.deleted && e.kind === "expense" && e.date >= from && /feed|vet|medicine/i.test(e.category || "")).reduce((t, e) => t + (+e.amount || 0), 0);
  return cost ? cost / 90 / head : null;
}
void daysBetween; void lastWeight;
