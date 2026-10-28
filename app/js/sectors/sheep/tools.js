// Tools (design/11 §8): one screen each, inputs prefilled from the ledger, the answer in big type
// with its formula and source. All offline, pure maths from the model.
import { html, raw } from "../../core/html.js";
import { el } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { textField, selectField, wireForm } from "../../ui/form.js";
import { listDate, num, moneyText } from "../../ui/format.js";
import { canRead } from "../../core/policy.js";
import { backLink, largeTitle } from "../../screens/common.js";
import { loadSheep } from "./data.js";
import { short, colourChip } from "./ui.js";
import { lambingFromMark, raddleCycles } from "./model/year.js";
import { ewesPerRam, ramSummary, ewesToRam, activeMobs } from "./model/mobs.js";
import { mealPlan } from "./model/feeding.js";
import { scanTotals } from "./model/lambing.js";
import { doseEach, totalDose } from "./model/health.js";
import { growth, draftValue, flockPlanner, ewesPerHa } from "./model/selling.js";
import { SOURCES } from "./model/settings.js";

const LIST = [["raddle", "Lambing dates from raddle", "Lambing window for each mark date", "today"], ["ram", "Ewes per ram", "Against the 1:40 / 1:25 guide", "sheep"], ["meal", "Late-pregnancy meal planner", "kg a day by week, tonnes and cost", "feed"],
  ["dose", "Dose calculator", "Dose to the heaviest, total for the mob", "syringe"], ["growth", "8-week growth", "g/day against the 280 g target", "scale"], ["draft", "Draft value", "Carcase kg and £ a lamb", "money"],
  ["flock", "Flock size planner", "Replacements to keep or buy", "people"], ["grass", "Ewes per hectare", "Stocking on your fields", "map"], ["fym", "Manure storage", "Weeks of storage for housed sheep", "water"]];
// FYM/slurry from housed ewes, m³ a ewe a week. GUESS from typical figures — check the NI Nitrates Action Programme tables.
const FYM_PER_EWE_WK = 0.03;

export default async function tools(ctx) {
  const snap = await loadSheep(ctx.ledger); const tool = ctx.match?.groups?.tool;
  if (!tool) return { el: el(html`<div class="sheep-page">${backLink(`#/l/${snap.lid}/more`, "More")}${largeTitle("Tools", "Worked out on this phone — no signal needed")}<div class="list">${LIST.map(([k, l, sub, ic]) => html`<a class="row" href="#/l/${snap.lid}/tools/${k}"><span class="tile">${raw(icon(ic))}</span><span class="main"><span class="primary">${l}</span><span class="secondary">${sub}</span></span><span class="chev">${raw(icon("chevron"))}</span></a>`)}</div></div>`), title: "Tools", depth: 1, tab: "more" };
  const [, label] = LIST.find(([k]) => k === tool) || [tool, "Tool"];
  const T = TOOLS[tool] || TOOLS.raddle;
  const body = el(html`<div class="sheep-page">${backLink(`#/l/${snap.lid}/tools`, "Tools")}${largeTitle(label)}<form novalidate class="form-group" data-in></form><div class="card pad tool-out" data-out aria-live="polite"></div></div>`);
  const form = body.querySelector("[data-in]"); form.append(el(html`<div style="display:contents">${T.inputs(snap)}</div>`));
  const f = wireForm(form); const paint = () => body.querySelector("[data-out]").replaceChildren(el(html`<div>${T.out(f.values(), snap)}</div>`));
  f.onChange(paint); form.addEventListener("input", () => setTimeout(paint, 0)); paint();
  return { el: body, title: label, depth: 2, tab: "more" };
}
const ans = (big, sub = "", src = "") => html`<div class="tool-answer">${big}</div>${sub ? html`<p style="margin:0">${sub}</p>` : ""}${src ? html`<p class="source">${src}</p>` : ""}`;
const n = (name, label, value = "", opt = false) => textField({ name, label, value: value === null || value === undefined ? "" : String(value), inputmode: "decimal", optional: opt });

export const TOOLS = {
  raddle: {
    inputs: (snap) => { const rc = raddleCycles(snap.cy, snap.s, snap.today); return html`${textField({ name: "mark", label: "Marked on (or first day of the colour)", type: "date", value: rc.current?.from || rc.cycles[0]?.from || snap.today })}${n("g", "Gestation (days)", snap.s.gestation)}`; },
    out(v, snap) {
      if (!v.mark) return ans("—", "Add the date the ewes were marked.");
      const w = lambingFromMark(v.mark, +v.g || 147); const rc = raddleCycles(snap.cy, snap.s, snap.today);
      return html`${ans(`${short(w.from)} – ${short(w.to)}`, `Peak around ${listDate(w.peak)}. Start = mark + ${(+v.g || 147) - 5} days, end = + ${(+v.g || 147) + 5}. Prolific breeds about 3 days sooner.`, "Research C §1 (gestation 147 days, editable in Targets)")}
        <p class="form-label" style="margin-top:12px">This year's colours</p>${rc.cycles.map((c) => html`<p style="margin:4px 0">${colourChip(c.colour)} · marked ${short(c.from)}–${short(c.to)} → lambing ${short(c.lambFrom)} – ${short(c.lambTo)}</p>`)}`;
    },
  },
  ram: {
    inputs: (snap) => { const r = ramSummary(snap.data); return html`${n("ewes", "Ewes to the ram", ewesToRam(snap.data, snap.cy) || snap.totals.ewes)}${n("mature", "Mature rams", r.mature || r.total)}${n("lambs", "Ram lambs", r.ramLambs)}`; },
    out(v, snap) { const r = ewesPerRam(+v.ewes || 0, { mature: +v.mature || 0, ramLambs: +v.lambs || 0 }, snap.s); if (!r.ratio) return ans("—", "Add how many rams.");
      return ans(`1 : ${r.ratio}`, r.ok ? `Within the guide — room for ${num(r.capacity)} ewes.` : `Over the guide by ${num((+v.ewes || 0) - r.capacity)} ewes. Add a ram or split the ewes.`, SOURCES.ramGuide); },
  },
  meal: {
    inputs: (snap) => { const t = scanTotals(snap.data, snap.cy); return html`${n("single", "Ewes carrying singles", t.single)}${n("twin", "Ewes carrying twins", t.twin)}${n("triplet", "Ewes carrying triplets", t.triplet)}${textField({ name: "lamb", label: "Lambing starts", type: "date", value: snap.cy.lambFrom })}${canRead(snap.role, "finance") ? n("price", "Meal price (£ a tonne)", snap.s.mealPrice) : ""}`; },
    out(v, snap) { if (!v.lamb) return ans("—", "Add the lambing start date."); const p = mealPlan({ single: +v.single || 0, twin: +v.twin || 0, triplet: +v.triplet || 0 }, v.lamb, { ...snap.s, mealPrice: +v.price || snap.s.mealPrice });
      if (!p.totalKg) return ans("—", "Add how many ewes are in each scan group.");
      return html`${ans(`${p.tonnes} t`, `from ${listDate(p.start)}${canRead(snap.role, "finance") ? ` · about ${moneyText(p.cost)}` : ""}`, SOURCES.meal)}<table class="mini-table"><thead><tr><th>Week of</th><th>Weeks to lambing</th><th>kg a day (all ewes)</th></tr></thead><tbody>${p.rows.map((r) => html`<tr><td>${short(r.from)}</td><td>${r.weeksToLambing}</td><td>${r.kgPerDay}</td></tr>`)}</tbody></table>`; },
  },
  dose: {
    inputs: (snap) => { const m = activeMobs(snap.data).filter((x) => x.class !== "rams"); return html`${m.length ? selectField({ name: "mob", label: "Mob", value: m[0].id, options: [...m.map((x) => ({ value: x.id, label: `${x.name} · ${snap.counts.get(x.id) || 0}` })), { value: "", label: "Type a number" }] }) : ""}${n("head", "How many (if no mob)", "", true)}${n("kg", "Heaviest in the mob (kg)")}${n("ml", "Dose: ml", "1")}${n("per", "per kg", "5")}`; },
    out(v, snap) { const each = doseEach(+v.kg, +v.ml, +v.per); const head = v.mob ? snap.counts.get(v.mob) || 0 : +v.head || 0; if (!each) return ans("—", "Add the heaviest sheep's weight and the label rate.");
      return ans(`${each} ml each`, `${num(totalDose(head, each))} ml for ${head} sheep. Dose everyone to the heaviest — under-dosing breeds resistance.`, "Design/11 §6.1 (dose to the heaviest)"); },
  },
  growth: {
    inputs: () => html`${n("kg", "Average weight (kg)")}${n("age", "Age (days)", "56")}${n("birth", "Birth weight (kg)", "4.5")}`,
    out(v, snap) { const g = growth(+v.kg, +v.age, +v.birth || 4.5); if (g == null || !+v.kg) return ans("—", "Add the lambs' weight and age.");
      return ans(`${g} g/day`, g < snap.s.growthWeanBelow ? `Below ${snap.s.growthWeanBelow} g/day — consider weaning these lambs.` : g < snap.s.growthTarget ? `Below the ${snap.s.growthTarget} g/day target.` : `On target (${snap.s.growthTarget} g/day).`, "Research C §5: (weight − birth weight) ÷ age"); },
  },
  draft: {
    inputs: (snap) => html`${n("kg", "Liveweight (kg)", snap.s.draftKg)}${n("ko", "Kill-out %", snap.s.koPct)}${canRead(snap.role, "finance") ? n("p", "Price (pence a kg dead)", "", true) : ""}`,
    out(v, snap) { const r = draftValue(+v.kg, +v.ko || 45, +v.p || 0); if (!+v.kg) return ans("—", "Add a liveweight.");
      return ans(`${r.carcase} kg`, `carcase${+v.p ? ` · ${moneyText(r.value)} a lamb` : ""}${r.carcase > +snap.s.maxCarcase ? ` · over your ${snap.s.maxCarcase} kg maximum` : ""}`, SOURCES.koPct); },
  },
  flock: {
    inputs: (snap) => html`${n("target", "Ewes you want next year", snap.s.targetEwes || snap.totals.ewes)}${n("ewes", "Ewes now", snap.totals.ewes)}${n("cull", "Culled a year (%)", "20")}${n("mort", "Ewe deaths a year (%)", "4")}`,
    out(v) { const r = flockPlanner(+v.target || 0, +v.ewes || 0, +v.cull || 0, +v.mort || 0); return ans(`${num(r.replacements)} replacements`, `${r.culls} culls + ${r.deaths} deaths${+v.target !== +v.ewes ? ` + ${num((+v.target || 0) - (+v.ewes || 0))} to grow` : ""}. Keep ewe lambs or buy in.`, "Target − (ewes − culls − deaths)"); },
  },
  grass: {
    inputs: (snap) => { const acres = snap.fields.reduce((t, f) => t + (+f.acres || 0), 0); return html`${n("ewes", "Ewes", snap.totals.ewes)}${n("ha", "Hectares grazed", acres ? Math.round(acres * 0.4047 * 10) / 10 : "")}`; },
    out(v) { const r = ewesPerHa(+v.ewes, +v.ha); return r == null ? ans("—", "Add the area grazed.") : ans(`${r} ewes/ha`, "Northern Ireland lowland flocks typically run about 8.3 ewes a hectare.", "Research C (Farm Business Survey typical)"); },
  },
  fym: {
    inputs: (snap) => html`${n("ewes", "Ewes housed", snap.totals.ewes)}${n("weeks", "Weeks housed", "10")}${n("cap", "Storage (m³)", "", true)}`,
    out(v) { const need = Math.round((+v.ewes || 0) * (+v.weeks || 0) * FYM_PER_EWE_WK * 10) / 10; if (!need) return ans("—", "Add how many ewes and how long they're in.");
      const wk = +v.cap ? Math.round((+v.cap / ((+v.ewes || 1) * FYM_PER_EWE_WK)) * 10) / 10 : null;
      return ans(`${need} m³`, `of manure while housed${wk != null ? ` · your store holds about ${wk} weeks` : ""}. Farmyard manure can be stored in the field under the NAP rules; slurry needs covered storage.`, `Guess: ${FYM_PER_EWE_WK} m³ a ewe a week — check the NI Nitrates Action Programme tables.`); },
  },
};
