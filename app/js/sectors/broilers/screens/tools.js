// Broiler tools (design/15 §12). Each works on its own (type the numbers) and, where a crop is
// growing, starts from that crop's figures. Formulas are shown under every answer. Money tools
// (payment estimate, energy £, income per m²) are for the money roles only.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { wireForm } from "../../../ui/form.js";
import { largeTitle, groupLabel, backLink } from "../../../screens/common.js";
import { loadBroilers } from "../data.js";
import { ensureCss, n0, n1, pc, pounds, dm, when, esc } from "../ui.js";
import { currentCrop, cropDay, aliveEnd, legalLine } from "../model/crop.js";
import { stdOf, stdWt, estWeight, weighStats } from "../model/growth.js";
import { densityOf, tierOf, birdsToThin, farmLimit } from "../model/density.js";
import { epef, paymentEstimate, energyCost, cropResults } from "../model/results.js";
import { salmWindow, fciSendBy, feedOffDefault } from "../model/paper.js";
import { workingDaysBefore, at, addDays } from "../model/time.js";
import { regionRule, BREED_STANDARDS, standardById } from "../model/content.js";
import { contractDoc } from "../actions.js";
import { numField, textField, dateField, dtField, chipsField } from "../flows/common.js";

const TOOLS = [
  ["density", "Density and thin calculator", "kg/m², legal tier, birds to thin", "chart"],
  ["legal", "Legal mortality line", "1% + 0.06% × age", "alert"],
  ["epef", "EPEF", "European production efficiency factor", "broilers"],
  ["projection", "Weight projection", "grams at the thin and clear-out", "scale"],
  ["uniformity", "Uniformity", "mean, CV and % within ±10%", "scale"],
  ["payment", "Payment estimate", "from your contract profile", "money", true],
  ["energy", "Energy per crop", "£ per bird and pence per kg", "fuel", true],
  ["income", "Income per m² per year", "compare contracts", "money", true],
  ["dates", "Feed-off, FCI and Salmonella dates", "from the catch time", "clock"],
  ["workdays", "Working days counter", "DAERA notice 15 working days before", "today"],
];

export default async function tools(ctx) {
  ensureCss();
  const snap = await loadBroilers(ctx.ledger); const id = ctx.match?.groups?.tool;
  const L = (h) => `#/l/${snap.lid}/${h}`;
  const list = TOOLS.filter((t) => !t[4] || snap.money);
  if (!id) {
    const body = el(html`<div class="br-page push">${backLink(L("more"), "More")}${largeTitle("Tools", "Work it out on the spot — no signal needed")}
      <div class="list">${list.map(([k, l, sub, ic]) => html`<a class="row" href="${L(`tools/${k}`)}"><span class="tile">${raw(icon(ic))}</span><span class="main"><span class="primary">${l}</span><span class="secondary">${sub}</span></span><span class="chev">${raw(icon("chevron"))}</span></a>`)}</div></div>`);
    return { el: body, title: "Tools", depth: 1, tab: "more" };
  }
  const t = list.find((x) => x[0] === id) || list[0]; const def = CALC[t[0]](snap);
  const body = el(html`<div class="br-page push">${backLink(L("tools"), "Tools")}${largeTitle(t[1], t[2])}
    <form novalidate class="br-tool"><div class="form-group">${def.fields}</div></form>
    <div class="section"><div class="card pad br-out" data-out aria-live="polite"></div></div>
    ${def.foot ? html`<p class="br-note">${def.foot}</p>` : ""}</div>`);
  const f = wireForm(body.querySelector("form"));
  const run = () => { let out; try { out = def.calc(f.values()); } catch (e) { out = "Check the numbers."; } body.querySelector("[data-out]").innerHTML = out; };
  f.onChange(run); body.addEventListener("input", () => setTimeout(run, 0)); body.addEventListener("click", () => setTimeout(run, 0)); run();
  return { el: body, title: t[1], depth: 1, tab: "more" };
}

// ---- defaults from the growing crop ----
function growing(snap) {
  const c = snap.ix.houses.map((h) => currentCrop(snap.ix, h.id)).find((x) => x && x.placedDate <= snap.today) || null;
  if (!c) return null; const h = snap.ix.houseById.get(c.houseId) || {}; const std = stdOf(c, snap.s); const day = cropDay(c, snap.today);
  return { c, h, std, day, alive: aliveEnd(snap.ix, c, snap.today), wt: estWeight(snap.ix, c, std, day, snap.today), area: +h.usableM2 || 0 };
}
const big = (v, unit = "") => `<div class="br-ans"><b>${v}</b>${unit ? `<span>${unit}</span>` : ""}</div>`;
const line = (k, v) => `<div class="br-ansrow"><span>${esc(k)}</span><b>${v}</b></div>`;
const formula = (t) => `<p class="br-f">${t}</p>`;
const num = (v) => (v === "" || v == null ? NaN : +v);

const CALC = {
  density(snap) {
    const g = growing(snap); const lim = farmLimit(snap.s, g?.c);
    return {
      fields: html`${numField("birds", "Birds in the house now", g?.alive ?? "", { step: "1" })}${numField("wt", "Average weight", g ? Math.round(g.wt) : "", { unit: "g" })}${numField("area", "Usable floor area", g?.area || "", { unit: "m²" })}
        ${numField("limit", "Farm limit", lim, { unit: "kg/m²" })}${numField("clearBirds", "Birds expected at clear-out", g ? Math.round(g.alive * 0.99) : "", { step: "1" })}${numField("clearWt", "Weight at clear-out", g ? Math.round(estWeight(snap.ix, g.c, g.std, snap.s.plannedClearDay, snap.today)) : "", { unit: "g" })}${numField("module", "Catch module", snap.s.moduleSize, { unit: "birds", step: "1" })}`,
      calc: (v) => { const d = densityOf(num(v.birds), num(v.wt), num(v.area)); const R = regionRule("broilerDensity"); const tier = tierOf(d); const thin = birdsToThin({ aliveAtClear: num(v.clearBirds), wtAtClearG: num(v.clearWt), limit: num(v.limit), area: num(v.area), module: num(v.module) || 1 });
        if (!(d > 0)) return "Enter birds, weight and area.";
        return big(n1(d, 1), "kg/m² now") + line("Tier", { none: `${R.notifyAbove} or under — no notice`, notify: `above ${R.notifyAbove} — tell DAERA`, approval: `above ${R.approvalAbove} — approval needed`, over: `above ${R.legalMax} — not allowed` }[tier]) + (num(v.clearBirds) > 0 && num(v.clearWt) > 0 ? line(`Birds to thin to stay under ${v.limit} at clear-out`, n0(thin)) : "") + formula(`kg/m² = birds × weight ÷ area = ${n0(v.birds)} × ${(num(v.wt) / 1000).toFixed(3)} kg ÷ ${n0(v.area)} m². Birds to thin = birds at clear − limit × area ÷ weight at clear, rounded up to the module.`); },
      foot: "For a growing crop the Density planner (Growth tab) projects every day and plans the thin for you.",
    };
  },
  legal(snap) {
    return { fields: html`${numField("age", "Age at slaughter", snap.s.plannedClearDay, { unit: "days", step: "1" })}${numField("cum", "Crop mortality", "", { unit: "%", optional: true })}`,
      calc: (v) => { const l = legalLine(num(v.age)); if (!(num(v.age) >= 0)) return "Enter the age."; return big(pc(l, 2), `at ${n0(v.age)} days`) + (v.cum !== "" ? line("Your crop", `${pc(num(v.cum), 2)} — ${num(v.cum) <= l ? "under the line ✓" : "over the line"}`) : "") + formula(`Legal line = 1% + 0.06% × age = 1 + 0.06 × ${n0(v.age)}. Applies to crops stocked above 39 kg/m² (Sch. 5 para 14): the last 7 crops must all finish under it.`); } };
  },
  epef(snap) {
    const lc = snap.ix.crops.filter((c) => c.clearedDate).slice(-1)[0]; const last = lc ? (lc.results?.epef ? lc.results : cropResults(snap.ix, lc)) : {};
    return { fields: html`${numField("liv", "Liveability", last.liveability ? n1(last.liveability, 1) : 96.5, { unit: "%" })}${numField("kg", "Average weight", last.avgKg ? (+last.avgKg).toFixed(2) : 2.4, { unit: "kg" })}${numField("age", "Average age", last.ageDays ? n1(last.ageDays, 1) : 37, { unit: "days" })}${numField("fcr", "FCR", last.fcr ? (+last.fcr).toFixed(2) : 1.55)}`,
      calc: (v) => { const e = epef({ liveability: num(v.liv), avgKg: num(v.kg), ageDays: num(v.age), fcr: num(v.fcr) }); return e ? big(n0(e), e >= 400 ? "400+ (Ross 400 Club mark — a guide, not an endorsement)" : "EPEF") + formula(`EPEF = liveability % × average weight kg ÷ (age days × FCR) × 100 = ${v.liv} × ${v.kg} ÷ (${v.age} × ${v.fcr}) × 100`) : "Enter all four figures."; } };
  },
  projection(snap) {
    const g = growing(snap);
    return { fields: html`${chipsField("std", "Hybrid", BREED_STANDARDS.map((b) => [b.id, b.hybrid]), g?.std.id || snap.s.breedStdId)}${numField("day", "Today's age", g?.day ?? 21, { unit: "days", step: "1" })}${numField("wt", "Today's average weight", g ? Math.round(g.wt) : "", { unit: "g" })}${numField("to", "Project to day", snap.s.plannedClearDay, { step: "1" })}`,
      calc: (v) => { const std = standardById(v.std); const d = num(v.day), to = num(v.to), w = num(v.wt); if (!(w > 0) || !(to >= d)) return "Enter today's weight and a later day."; const ratio = w / stdWt(std, d); const p = w + (stdWt(std, to) - stdWt(std, d)) * ratio;
        return big(n0(p), `g on day ${to} (estimate)`) + line(`${std.hybrid} objective day ${to}`, `${n0(stdWt(std, to))} g`) + line("Running at", `${ratio >= 1 ? "+" : "−"}${Math.abs((ratio - 1) * 100).toFixed(0)}% vs objective`) + formula(`Projection = today's weight + objective gain to day ${to} × (today ÷ objective today). An estimate; the Growth tab uses your last weighs.`); } };
  },
  uniformity() {
    return { fields: html`<div class="field stacked"><label>Weights (grams), any separator</label><textarea name="w" rows="5" placeholder="1820 1765 1902 …"></textarea></div>`,
      calc: (v) => { const xs = String(v.w || "").split(/[^\d.]+/).map(Number).filter((x) => x > 0); const st = weighStats(xs); if (!st.n) return "Type or paste the weights."; return big(`${n0(st.mean)} g`, `mean of ${st.n}`) + line("CV", st.cv != null ? `${n1(st.cv)}%` : "—") + line("Uniformity (±10%)", st.uniformity != null ? pc(st.uniformity, 0) : "—") + formula("CV = standard deviation ÷ mean × 100. Uniformity = % of birds within 10% of the mean. Aim for CV under 10%."); } };
  },
  payment(snap) {
    const prof = contractDoc(snap)?.profile; const area = snap.ix.houses.reduce((t, h) => t + (+h.usableM2 || 0), 0);
    return { fields: html`${numField("sold", "Birds sold", 31000, { step: "1" })}${numField("kg", "Total kg", 80000)}${numField("fcr", "FCR", 1.55)}${numField("mort", "Mortality", 3, { unit: "%" })}${numField("rej", "Rejections", 0.8, { unit: "%" })}`,
      calc: (v) => { if (!prof || prof.rate == null) return "Add your pay basis in Contract and payment first."; const kg = num(v.kg), sold = num(v.sold); const e = paymentEstimate(prof, { sold, kg, fcr: num(v.fcr), cumMort: num(v.mort), rejPct: num(v.rej), avgKg: sold ? kg / sold : null }, area);
        return big(pounds(e.total), e.perBird ? `${pounds(e.perBird, 3)} per bird` : "") + e.lines.map((l) => line(l.label, pounds(l.amount))).join("") + formula("From your own contract profile — Farm Ledger doesn't ship any processor's formula."); } };
  },
  energy(snap) {
    const p = contractDoc(snap)?.energyPrices || {};
    return { fields: html`${numField("lpg", "LPG used", "", { unit: "L", optional: true })}${numField("lpgP", "LPG price", p.lpg ?? "", { unit: "£/L" })}${numField("bio", "Biomass used", "", { unit: "kg", optional: true })}${numField("bioP", "Biomass price", p.biomass ?? "", { unit: "£/kg" })}${numField("elec", "Electricity", "", { unit: "kWh", optional: true })}${numField("elecP", "Electricity price", p.elec ?? "", { unit: "£/kWh" })}${numField("birds", "Birds sold", 31000, { step: "1" })}${numField("kg", "Total kg", 80000)}`,
      calc: (v) => { const use = {}; if (v.lpg !== "") use.lpg = num(v.lpg); if (v.bio !== "") use.biomass = num(v.bio); if (v.elec !== "") use.elec = num(v.elec); const c = energyCost(use, { lpg: v.lpgP, biomass: v.bioP, elec: v.elecP }, num(v.birds), num(v.kg)); if (!c) return "Enter what you used and the prices."; return big(`${n1(c.perBird * 100)}p`, "per bird") + line("Per kg", `${n1(c.perKgPence)}p`) + line("This crop", pounds(c.total)) + formula("£ = Σ units used × unit price; per bird ÷ birds sold; per kg ÷ total kg × 100."); } };
  },
  income(snap) {
    const area = snap.ix.houses.reduce((t, h) => t + (+h.usableM2 || 0), 0);
    return { fields: html`${numField("pay", "Average payment per crop (all houses)", 7000, { unit: "£" })}${numField("crops", "Crops a year", 7, { step: "0.5" })}${numField("area", "Usable area (all houses)", area || "", { unit: "m²" })}`,
      calc: (v) => { const a = num(v.area); if (!(a > 0)) return "Enter the usable area."; const y = num(v.pay) * num(v.crops); return big(pounds(y / a, 2), "per m² per year") + line("A year", pounds(y)) + formula("Income per m² per year = payment per crop × crops a year ÷ usable m². Compare contracts on the same basis."); } };
  },
  dates(snap) {
    const s = snap.s; const g = growing(snap); const catchAt = g ? at(addDays(g.c.placedDate, s.plannedThinDay), "02:00") : at(addDays(snap.today, 7), "02:00");
    return { fields: html`${dtField("catchAt", "Catch", catchAt)}${numField("travel", "Hours from catch to the plant", s.arrivalHoursAfterCatch || 0, { unit: "h" })}${numField("age", "Age at slaughter", s.plannedThinDay, { unit: "days", step: "1" })}`,
      calc: (v) => { if (!v.catchAt) return "Enter the catch time."; const arr = addHoursSafe(v.catchAt, num(v.travel) || 0); const w = salmWindow(v.catchAt.slice(0, 10), s, num(v.age) || 0);
        return line("Feed off from", `${when(feedOffDefault(v.catchAt, s))} (catch − ${s.feedOffHours} h)`) + line("Send FCI by", when(fciSendBy(v.catchAt, s, arr))) + line("Salmonella window", `${dm(w.from)} – ${dm(w.to)}`) + line("Boot swabs by", `${dm(w.doBy)} (result back for the FCI)`) + line("No fresh litter from", dm(w.noLitterFrom)) + formula(`Red Tractor: feed off no more than 9 h before catching (law 12 h). FCI 24 h before arrival. Boot swabs within ${w.days} days before slaughter.`); } };
  },
  workdays(snap) {
    const R = regionRule("broilerDensity");
    return { fields: html`${dateField("placed", "Placement date", addDays(snap.today, 28))}${numField("n", "Working days before", R.notifyWorkingDays, { step: "1" })}`,
      calc: (v) => { if (!v.placed) return "Enter the placement date."; const by = workingDaysBefore(v.placed, num(v.n) || 0); return big(`${dm(by)} ${by.slice(0, 4)}`, "tell DAERA by") + formula(`${v.n} working days before ${dm(v.placed)}: weekends and NI bank holidays (incl. 17 March and 12 July) don't count. Needed before stocking above ${R.notifyAbove} kg/m².`); } };
  },
};
function addHoursSafe(s, h) { const d = new Date(s + ":00Z"); d.setUTCMinutes(d.getUTCMinutes() + Math.round(h * 60)); return d.toISOString().slice(0, 16); }
export { textField, groupLabel };
