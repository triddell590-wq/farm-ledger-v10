// Dairy → More → Tools (design/12 §9). One screen each: inputs prefilled from the ledger, the
// answer in big type with its formula and source. All offline, pure maths from the model.
// Money tools (cheque check, MOPF) only for roles that can read finance (design/12 §15).
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { toast } from "../../../ui/toast.js";
import { textField, selectField, wireForm } from "../../../ui/form.js";
import { num, moneyText } from "../../../ui/format.js";
import { addDays } from "../../../core/dates.js";
import { canRead, canWriteMeta } from "../../../core/policy.js";
import { backLink, largeTitle } from "../../../screens/common.js";
import { loadDairy } from "../data.js";
import { setMeta } from "../actions.js";
import { cowRow, sectionOf, dm } from "../ui.js";
import { onFarm, groupOf } from "../model/cows.js";
import { gestationDays, SOURCES } from "../model/settings.js";
import { actionLists } from "../model/fertility.js";
import { chequeCheck, mopf, KG_PER_LITRE } from "../model/money.js";
import { mixing, targetKg, growthStatus, tapeKg, tapeTable } from "../model/calves.js";
import { slurryWeeks, cullRanking } from "../model/tools.js";
import { sdctRow } from "../model/mastitis.js";
import { DISEASE_REPORT, BTV_LICENCE_NOTE } from "../model/content.js";

// [key, label, sub, icon, money?]
export const LIST = [
  ["dates", "Calving, PD and dry-off dates", "From a service date", "birth"],
  ["cheque", "Milk cheque check", "Expected pence per litre from your profile", "money", true],
  ["mopf", "Margin over purchased feed", "£ per cow per day and per litre", "money", true],
  ["conc", "Concentrate per litre", "kg of meal for every litre", "feed"],
  ["mixing", "Calf mixing sheet", "Litres and powder for each feed", "birth"],
  ["growth", "Heifer growth", "On track or behind, % of mature weight", "scale"],
  ["tape", "Weigh tape", "Heart girth to live weight", "scale"],
  ["slurry", "Slurry storage (22 weeks)", "Weeks of storage for your stock", "water"],
  ["cull", "Cull ranking", "Weighted score, weights shown", "grid"],
  ["sdct", "Selective dry cow therapy list", "Last 3 SCCs and cases — the vet decides", "water"],
  ["import", "Import (robot / milk recording)", "CSV column mapper with saved templates", "download"],
  ["disease", "Report a disease suspicion", "Bluetongue and notifiable disease", "alert"],
];

export default async function tools(ctx) {
  const snap = await loadDairy(ctx.ledger); const tool = ctx.match?.groups?.tool;
  const money = canRead(snap.role, "finance");
  const list = LIST.filter((t) => !t[4] || money);
  if (!tool) {
    return { el: el(html`<div class="dairy-page">${backLink(`#/l/${snap.lid}/more`, "More")}${largeTitle("Tools", "Worked out on this phone — no signal needed")}
      <div class="list">${list.map(([k, l, sub, ic]) => html`<a class="row" href="#/l/${snap.lid}/${k === "import" ? "imports" : k === "slurry" ? "slurry" : "tools/" + k}"><span class="tile">${raw(icon(ic))}</span><span class="main"><span class="primary">${l}</span><span class="secondary">${sub}</span></span><span class="chev">${raw(icon("chevron"))}</span></a>`)}</div></div>`), title: "Tools", tab: "more" };
  }
  const item = LIST.find(([k]) => k === tool);
  if (!item || (item[4] && !money)) return { el: el(html`<div class="dairy-page">${backLink(`#/l/${snap.lid}/tools`, "Tools")}${largeTitle("Not available", "")}<div class="card pad t-callout ink-2">${item ? "Money tools are for the owner, managers and the accountant." : "That tool doesn't exist."}</div></div>`), title: "Tools", tab: "more" };
  if (PAGES[tool]) return { el: PAGES[tool](snap), title: item[1], tab: "more" };
  const T = TOOLS[tool];
  const body = el(html`<div class="dairy-page">${backLink(`#/l/${snap.lid}/tools`, "Tools")}${largeTitle(item[1], item[2])}<form novalidate class="form-group" data-in></form><div class="card pad tool-out" data-out aria-live="polite"></div></div>`);
  const form = body.querySelector("[data-in]"); form.append(el(html`<div style="display:contents">${T.inputs(snap)}</div>`));
  const f = wireForm(form); const paint = () => body.querySelector("[data-out]").replaceChildren(el(html`<div>${T.out(f.values(), snap)}</div>`));
  f.onChange(paint); paint();
  return { el: body, title: item[1], tab: "more" };
}

const ans = (big, sub = "", src = "") => html`<div class="tool-answer">${big}</div>${sub ? html`<p style="margin:0">${sub}</p>` : ""}${src ? html`<p class="source">${src}</p>` : ""}`;
const n = (name, label, value = "", opt = false) => textField({ name, label, value: value == null ? "" : String(value), inputmode: "decimal", optional: opt });
const v0 = (x) => (x === "" || x == null || Number.isNaN(+x) ? null : +x);
const dmy = (iso) => (iso ? `${dm(iso)} ${iso.slice(0, 4)}` : "—");
const BREEDS = [["HOL", "Holstein / Friesian"], ["JER", "Jersey"], ["AYR", "Ayrshire"], ["AA", "Aberdeen Angus"], ["HER", "Hereford"], ["LIM", "Limousin"], ["BB", "Belgian Blue"], ["CH", "Charolais"], ["SIM", "Simmental"], ["MB", "Montbéliarde"], ["other", "Other"]];
const inMilkNow = (snap) => snap.data.animals.filter((a) => onFarm(a) && groupOf(snap.ix, a, snap.today) === "milking").length;
const lastMonth = (today) => { const d = new Date(today.slice(0, 7) + "-15T12:00:00Z"); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); };

export const TOOLS = {
  dates: {
    inputs: (snap) => html`${textField({ name: "serve", label: "Served on", type: "date", value: snap.today })}${selectField({ name: "breed", label: "Sire breed", value: "HOL", options: BREEDS.map(([value, label]) => ({ value, label })) })}`,
    out(v, snap) {
      if (!v.serve) return ans("—", "Add the service date.");
      const s = snap.s; const g = gestationDays(s, v.breed); const due = addDays(v.serve, g);
      return html`${ans(dmy(due), `Calving due · ${g} days' gestation for this sire breed`, SOURCES.gestation)}
        <table class="mini-table"><tbody>
          <tr><td>Watch for a repeat heat</td><td>${dm(addDays(v.serve, s.heatFrom))} – ${dm(addDays(v.serve, s.heatTo))}</td></tr>
          <tr><td>PD (scan window)</td><td>${dm(addDays(v.serve, s.pdFrom))} – ${dm(addDays(v.serve, s.pdTo))}</td></tr>
          <tr><td>Dry off (${s.dryPeriod} days before)</td><td>${dmy(addDays(due, -s.dryPeriod))}</td></tr>
          <tr><td>Earliest serve after calving (VWP ${s.vwp} d)</td><td>${dmy(addDays(due, s.vwp))}</td></tr></tbody></table>
        <p class="formula">Repeat = serve + ${s.heatFrom}–${s.heatTo} d · PD = serve + ${s.pdFrom}–${s.pdTo} d · calving = serve + gestation · dry-off = calving − dry period. Change the windows in Dairy settings.</p>`;
    },
  },
  cheque: {
    inputs: (snap) => { const p = snap.s.price; return html`${n("litres", "Litres on the statement", "")}${n("fat", "Butterfat %", p.baseFat)}${n("protein", "Protein %", p.baseProtein)}${n("scc", "SCC (thousands)", "", true)}${n("tbc", "TBC (thousands)", "", true)}${n("total", "Payment received (£)", "", true)}`; },
    out(v, snap) {
      const p = snap.s.price; if (p.basePpl == null || p.basePpl === "") return ans("—", html`Set your processor's base price and adjustments in <a href="#/l/${snap.lid}/dairy-settings">Dairy settings</a> first — schedules differ between processors and are never built in.`);
      if (!(+v.litres > 0)) return ans("—", "Add the litres from the statement.");
      const c = chequeCheck(p, { litres: +v.litres, fat: v.fat, protein: v.protein, scc: v.scc, tbc: v.tbc, total: v.total === "" ? null : v.total });
      return html`${ans(`${c.estPpl.toFixed(2)}p`, `per litre expected · ${moneyText(c.estTotal, true)} for ${num(+v.litres)} litres`, `Your ${snap.s.processor || "processor"} profile: base ${p.basePpl}p at ${p.baseFat}% fat / ${p.baseProtein}% protein`)}
        ${v.total !== "" ? html`<p style="margin:8px 0 0"><b>Paid ${c.ppl.toFixed(2)}p per litre</b> — ${Math.abs(c.diff) < 1 ? "matches the estimate" : `${moneyText(Math.abs(c.diff), true)} ${c.diff < 0 ? "less" : "more"} than expected. ${c.diff < 0 ? "Check the deductions and bands with your processor." : ""}`}</p>` : ""}
        <p class="formula">Expected p/L = base + (fat − ${p.baseFat}) ÷ 0.1 × ${p.fatPer01}p + (protein − ${p.baseProtein}) ÷ 0.1 × ${p.proteinPer01}p + SCC/TBC band − ${p.deductPpl || 0}p deductions. Milk solids ≈ litres × ${KG_PER_LITRE} × (fat + protein) %.</p>`;
    },
  },
  mopf: {
    inputs: (snap) => html`${textField({ name: "month", label: "Month", type: "month", value: lastMonth(snap.today) })}${n("cows", "Average cows in milk", inMilkNow(snap))}`,
    out(v, snap) {
      if (!v.month) return ans("—", "Pick a month.");
      const r = mopf(snap.data.finance, v.month, +v.cows || 0);
      if (!r.milkGBP) return ans("—", html`No milk statement for that month. <a href="#/l/${snap.lid}/milk/cheques">Add one</a> on the Milk tab.`);
      return html`${ans(r.perCowDay != null ? `${moneyText(r.perCowDay, true)}` : moneyText(r.margin), r.perCowDay != null ? "margin over purchased feed per cow per day" : "margin over purchased feed (add cows in milk for per-cow)")}
        <table class="mini-table"><tbody><tr><td>Milk income</td><td>${moneyText(r.milkGBP)}</td></tr><tr><td>Purchased feed</td><td>${moneyText(r.feedGBP)}</td></tr><tr><td>Margin</td><td>${moneyText(r.margin)}</td></tr>
          ${r.ppl != null ? html`<tr><td>Per litre</td><td>${r.ppl.toFixed(2)}p</td></tr>` : ""}${r.concPerLitre != null ? html`<tr><td>Concentrate per litre</td><td>${r.concPerLitre.toFixed(2)} kg</td></tr>` : ""}</tbody></table>
        <p class="formula">MOPF = (milk £ − purchased feed £) ÷ cow-days (${num(r.cowDays)}) and ÷ litres (${num(r.litres)}). Feed = deliveries in Feed and silage for that month.</p>`;
    },
  },
  conc: {
    inputs: () => html`${n("kg", "Concentrate fed (kg)", "")}${n("litres", "Milk sold (litres) in the same period", "")}`,
    out(v) { const kg = v0(v.kg), L = v0(v.litres); if (!kg || !L) return ans("—", "Add the kg fed and the litres sold over the same days."); const r = kg / L;
      return html`${ans(`${r.toFixed(2)} kg/L`, `${Math.round(r * 1000)} g of concentrate for every litre`)}<p class="formula">kg/L = kg concentrate ÷ litres. Many grass-based NI herds aim for about 0.25–0.35 kg/L (guide, check with your adviser).</p>`; },
  },
  mixing: {
    inputs: (snap) => { const p = snap.s.calfPlan; const calves = snap.data.animals.filter((a) => onFarm(a) && groupOf(snap.ix, a, snap.today) === "calf" && !a.calf?.weaned).length;
      return html`${n("calves", "Calves on milk", calves)}${n("l", "Litres per feed", p.lPerFeed)}${n("feeds", "Feeds a day", p.feedsPerDay)}${n("g", "Powder (g per litre)", p.gPerL)}`; },
    out(v) { const m = mixing({ calves: v.calves, lPerFeed: v.l, feedsPerDay: v.feeds, gPerL: v.g }); if (!m.litresFeed) return ans("—", "Add the calves and litres.");
      return html`${ans(`${num(m.litresFeed, 1)} L`, `per feed → ${num(m.kgFeed, 2)} kg powder · ${num(m.litresDay, 1)} L and ${num(m.kgDay, 2)} kg a day`)}<p class="formula">${v.calves} calves × ${v.l} L = litres per feed; × ${v.feeds} feeds a day; powder = litres × ${v.g} g ÷ 1000.</p>`; },
  },
  growth: {
    inputs: (snap) => html`${n("age", "Age (days)", 182)}${n("kg", "Weight (kg)", "")}${n("mature", "Mature cow weight (kg)", snap.s.matureKg)}${n("birth", "Birth weight (kg)", snap.s.birthKg)}`,
    out(v) { const age = v0(v.age), mature = v0(v.mature) || 650, birth = v0(v.birth) || 40; if (age == null) return ans("—", "Add the age in days.");
      const t = Math.round(targetKg(age, mature, birth)); const kg = v0(v.kg);
      const g = kg ? growthStatus(addDays("2026-01-01", -age), { date: "2026-01-01", kg }, mature, birth) : null;
      return html`${ans(`${num(t)} kg`, `target at ${age} days (${Math.round((t / mature) * 100)}% of mature weight)${g ? ` · she is ${Math.round(g.ratio * 100)}% of target — ${g.behind ? "behind" : "on track"}` : ""}`, SOURCES.growth)}
        <p class="formula">2 × birth weight by 56 d · 27% at 6 mo · 50% at 12 mo · 55–60% at service · 85–90% at calving · about 0.8 kg/day. "Behind" = under 90% of target.</p>`; },
  },
  tape: {
    inputs: () => n("girth", "Heart girth (cm)", ""),
    out(v) { const g = v0(v.girth); const kg = g ? tapeKg(g) : null;
      return html`${ans(kg ? `${num(kg)} kg` : "—", kg ? "estimated live weight (Holstein heifers)" : "Measure just behind the front legs; 80–210 cm.", SOURCES.weighTape)}
        <table class="mini-table"><thead><tr><th>Girth cm</th><th>About kg</th><th>Girth cm</th><th>About kg</th></tr></thead><tbody>${pairRows(tapeTable(80, 210, 5))}</tbody></table>`; },
  },
  slurry: {
    inputs: (snap) => { const p = snap.s.slurry; return html`${n("capacityM3", "Storage capacity (m³)", p.capacityM3 || "")}${n("cows", "Cows", p.cows)}${n("youngstock", "Youngstock", p.youngstock)}${n("calves", "Calves", p.calves)}${n("extraWk", "Washings and rain (m³ a week)", p.extraWk, true)}`; },
    out(v, snap) { const r = slurryWeeks({ ...snap.s.slurry, ...Object.fromEntries(Object.entries(v).map(([k, x]) => [k, v0(x)])) });
      if (r.weeks == null) return ans("—", "Add the stock numbers.");
      return html`${ans(`${r.weeks.toFixed(1)} weeks`, r.ok ? `Meets the ${r.target}-week requirement.` : `Short of ${r.target} weeks by about ${num(r.shortM3)} m³.`, SOURCES.slurry)}<p class="formula">Weeks = capacity ÷ weekly output (${num(r.weekly, 1)} m³). Save your figures on <a href="#/l/${snap.lid}/slurry">Slurry and nutrients</a>.</p>`; },
  },
};
function pairRows(rows) { const h = Math.ceil(rows.length / 2); const out = []; for (let i = 0; i < h; i++) { const a = rows[i], b = rows[i + h]; out.push(html`<tr><td>${a[0]}</td><td>${a[1]}</td><td>${b ? b[0] : ""}</td><td>${b ? b[1] : ""}</td></tr>`); } return out; }

const WEIGHT_NAMES = { age: "Age (lactation)", scc: "SCC history", cases: "Mastitis cases", daysOpen: "Days open", lameness: "Lameness", yield: "Low yield" };
const PAGES = {
  cull(snap) {
    const rows = cullRanking(snap.s, snap.ix, snap.data, snap.today).slice(0, 40); const w = snap.s.cullWeights; const can = canWriteMeta(snap.role, "settings");
    const node = el(html`<div class="dairy-page">${backLink(`#/l/${snap.lid}/tools`, "Tools")}${largeTitle("Cull ranking", "Highest score first — a list to think about, not a decision")}
      ${sectionOf("Weights", html`<form class="form-group" data-w novalidate>${Object.entries(WEIGHT_NAMES).map(([k, l]) => n(k, l, w[k]))}</form>${can ? html`<button type="button" class="btn secondary" data-save style="margin-top:8px">Save weights</button>` : ""}
        <p class="formula">Score = Σ(factor × weight) ÷ Σ weights, each factor 0–1: age = lactation ÷ 6 · SCC = mean of last 3 ÷ 400k · cases = this lactation ÷ 3 · days open = (open − 150) ÷ 100 · lameness = mobility ÷ 3 · low yield = shortfall vs herd average ÷ 40%.</p>`)}
      ${sectionOf("Ranking", rows.length ? html`<div class="list">${rows.map((r) => cowRow(snap, r.a, { extra: html`<span class="secondary">Score ${r.score}${r.reasons.length ? " · " + r.reasons.join(", ") : ""}</span>` }))}</div>` : html`<p class="hint">No milking or dry cows yet.</p>`, rows.length ? `${rows.length} cows` : "")}</div>`);
    const b = node.querySelector("[data-save]"); if (b) b.onclick = () => { const f = new FormData(node.querySelector("[data-w]")); setMeta(snap.lid, "settings", { cullWeights: Object.fromEntries([...f].map(([k, x]) => [k, v0(x) ?? 0])) }); toast("Weights saved"); };
    return node;
  },
  sdct(snap) {
    const L = actionLists(snap.s, snap.ix, snap.data, snap.today, 31);
    const cows = L.dryOff.map((x) => sdctRow(snap.ix, x.a));
    return el(html`<div class="dairy-page">${backLink(`#/l/${snap.lid}/tools`, "Tools")}${largeTitle("Selective dry cow therapy", `${cows.length} cow${cows.length === 1 ? "" : "s"} to dry off in the next month`)}
      <div class="info-card">${raw(icon("info"))}<span>Antibiotic dry cow therapy is only for a cow your vet has a reason to treat (EU 2019/6 Art. 107). This list helps the conversation — your vet decides.</span></div>
      ${cows.length ? html`<div class="list" style="margin-top:12px">${cows.map((r) => cowRow(snap, r.a, { extra: html`<span class="secondary">SCC ${r.history.length ? r.history.map((h) => `${h.scc}k`).join(" · ") : "no recordings"} · ${r.cases} case${r.cases === 1 ? "" : "s"} this lactation</span>${r.low ? html`<span class="secondary ok-ink">Low SCC (under 200k all 3 tests, no cases) — candidate for sealant only (vet decides)</span>` : ""}` }))}</div>` : html`<p class="hint">No cows due to dry off in the next month.</p>`}</div>`);
  },
  disease(snap) {
    const r = snap.meta.settings?.restricted; const can = canWriteMeta(snap.role, "settings");
    const node = el(html`<div class="dairy-page">${backLink(`#/l/${snap.lid}/more`, "More")}${largeTitle(DISEASE_REPORT.label, "Bluetongue and other notifiable disease")}
      <div class="card pad"><p class="t-callout" style="margin:0">${DISEASE_REPORT.text}</p><p class="hint" style="margin:8px 0 0">BTV-3 vaccination: record it as a treatment ("BTV-3 vaccine"). ${BTV_LICENCE_NOTE}.</p></div>
      ${r?.on ? html`<div class="warn-card" style="margin-top:12px">${raw(icon("alert"))}<span><b>Holding marked restricted</b> since ${r.from}${r.note ? ` · ${r.note}` : ""}. No moves off until the results clear it.</span></div>` : ""}
      ${can ? html`<div class="section"><form class="form-group" data-f novalidate>${textField({ name: "from", label: "Restricted from", type: "date", value: r?.from || snap.today })}${textField({ name: "note", label: "What was reported", value: r?.note || "", optional: true, placeholder: "Suspected bluetongue in 214, vet called" })}</form>
        <div style="margin-top:8px;display:grid">${r?.on ? html`<button type="button" class="btn" data-clear>Results clear — lift it</button>` : html`<button type="button" class="btn danger" data-on>Mark the holding restricted</button>`}</div></div>` : html`<p class="hint" style="margin-top:12px">The owner or a manager marks the holding restricted.</p>`}</div>`);
    const val = () => Object.fromEntries(new FormData(node.querySelector("[data-f]")));
    const on = node.querySelector("[data-on]"); if (on) on.onclick = () => { setMeta(snap.lid, "settings", { restricted: { on: true, ...val() } }); toast("Holding marked restricted"); history.back(); };
    const cl = node.querySelector("[data-clear]"); if (cl) cl.onclick = () => { setMeta(snap.lid, "settings", { restricted: { on: false, from: r.from, liftedOn: snap.today, note: r.note || "" } }); toast("Restriction lifted"); history.back(); };
    return node;
  },
};
