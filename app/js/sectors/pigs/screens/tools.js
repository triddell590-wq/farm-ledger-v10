// Pigs tools (design/13 §9): space per pen (Schedule 8), batch farrowing planner, feed bins,
// cost of production, margin per pig, ship weight helper, gestation / dates, mg/PCU estimate.
// Every tool shows its formula; guesses are labelled.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { canRead, canWrite } from "../../../core/policy.js";
import { addDays } from "../model/dates.js";
import { largeTitle, backLink, groupLabel } from "../../../screens/common.js";
import { liveScreen, flowArg } from "./live.js";
import { dm, d2, n0, n1, pounds, pill, docButtons } from "../ui.js";
import { spacePerPig, pigsAllowed, breederSpace, penChecks } from "../model/rooms.js";
import { roomFacts, binFacts } from "../model/facts.js";
import { plan, weekNo, batchDates } from "../model/weeks.js";
import { DEFAULT_INTAKE } from "../model/bins.js";
import { moneyFigures, AHDB_COP } from "../model/money.js";

const TOOLS = [
  ["space", "Space per pen", "Pigs allowed per pen — Schedule 8 minimums", "grid"],
  ["planner", "Batch farrowing planner", "26 weeks: serve, farrow, wean, crate capacity", "chart"],
  ["bins", "Feed bins", "Days left and order-by date", "feed"],
  ["cop", "Cost of production", "p/kg deadweight vs AHDB", "money", true],
  ["margin", "Margin per pig", "Sale value − feed − other variable costs", "money", true],
  ["ship", "Ship weight helper", "Pens against your weight band", "truck"],
  ["dates", "Gestation and dates", "Service → scan → move → farrow → wean", "today"],
  ["pcu", "mg/PCU estimate", "Antibiotic use — estimate only", "syringe"],
];

export default async function tools(ctx) {
  const tool = ctx.match.groups.tool;
  return liveScreen(ctx, { title: "Tools", tab: "more", paint: (snap) => {
    const lid = snap.lid; const money = canRead(snap.role, "finance");
    if (!tool) return html`<div>${backLink(`#/l/${lid}/more`, "More")}${largeTitle("Tools", "Pig unit calculators")}<div class="list">${TOOLS.filter((t) => !t[4] || money).filter((t) => t[0] !== "planner" || snap.s.breeding).map(([k, l, s, ic]) => html`<a class="row" href="#/l/${lid}/${k === "ship" ? shipHref(snap) : k === "pcu" ? "emb" : "tools/" + k}"><span class="tile">${raw(icon(ic))}</span><span class="main"><span class="primary">${l}</span><span class="secondary">${s}</span></span><span class="chev">${raw(icon("chevron"))}</span></a>`)}</div></div>`;
    const back = backLink(`#/l/${lid}/tools`, "Tools");
    if (tool === "space") return spaceHtml(snap, back);
    if (tool === "planner") return plannerHtml(snap, back);
    if (tool === "bins") return binsHtml(snap, back);
    if (tool === "cop") return copHtml(snap, back);
    if (tool === "margin") return marginHtml(snap, back);
    if (tool === "dates") return datesHtml(snap, back);
    return html`<div>${back}${largeTitle("Not found")}</div>`;
  }, after: (node, snap) => {
    const calc = node.querySelector("[data-calc]"); if (calc) { const run = () => calc.dispatchEvent(new Event("recalc")); calc.addEventListener("input", run); run(); }
    if (tool === "space") wireSpace(node);
    if (tool === "dates") wireDates(node, snap);
    if (tool === "planner") { const b = node.querySelector("[data-plan-btns]"); if (b) b.replaceChildren(docButtons(() => plannerDoc(snap))); }
  } });
}
const shipHref = (snap) => { const b = snap.data.batches.find((x) => !x.closed && x.stage !== "weaner" && (x.numberIn != null)); return b ? `ship/${b.id}` : "batches"; };

// ---- space per pen (Schedule 8, SR 2012/156; checked by Research B 2026-10-15) ----
function spaceHtml(snap, back) {
  const rf = roomFacts(snap.c).filter((x) => x.room.kind !== "farrowing" && (x.room.pens || []).length);
  return html`<div>${back}${largeTitle("Space per pen", "Minimum unobstructed floor — Schedule 8")}
    <div class="card pad" data-sp><div class="form-group" style="margin:0"><div class="field"><label>Pen floor area (m²)</label><input inputmode="decimal" data-a value="12"></div><div class="field"><label>Average weight (kg)</label><input inputmode="decimal" data-w value="85"></div></div>
      <div class="pg-calc" data-out></div></div>
    <div class="section">${groupLabel("Minimum per pig")}<div class="card pad"><table class="pg-tbl"><thead><tr><th>Average live weight</th><th class="r">m² per pig</th></tr></thead><tbody>${[["up to 10 kg", 0.15], ["10–20 kg", 0.2], ["20–30 kg", 0.3], ["30–50 kg", 0.4], ["50–85 kg", 0.55], ["85–110 kg", 0.65], ["over 110 kg", 1.0]].map(([k, v]) => html`<tr><td>${k}</td><td class="r">${v.toFixed(2)}</td></tr>`)}<tr><td>Gilts after service (groups)</td><td class="r">1.64</td></tr><tr><td>Sows (groups)</td><td class="r">2.25</td></tr></tbody></table>
      <p class="pg-note">Breeding pigs: +10% if the group is under 6; may be −10% if it's 40 or more. Pen sides over 2.8 m (2.4 m if under 6 pigs). Solid floor at least 0.95 m² per gilt, 1.3 m² per sow. Boar pen at least 6 m² (10 m² if used for service).</p></div></div>
    <div class="section">${groupLabel("Your rooms — the farm-map table (Red Tractor DP.1.1)")}<div class="list">${rf.length ? rf.map((x) => { const area = x.room.pens.reduce((t, p) => t + (+p.areaM2 || 0), 0); const w = x.f ? x.f.est : 0;
      return html`<a class="row no-lead pg-kv" href="#/l/${snap.lid}/room/${x.room.id}"><span class="main"><span class="primary">${x.room.name}</span><span class="secondary">${x.room.pens.length} pens · ${area ? n1(area) + " m²" : "no pen areas yet"}${x.f ? ` · ${n0(x.f.onFarm)} pigs at ${Math.round(w)} kg` : " · empty"}${area && x.f ? ` · ${n0(pigsAllowed(area, w))} allowed` : ""}${x.room.places ? ` · ${x.room.places} places` : ""}</span></span>${x.space ? pill(x.space.level, x.space.word === "✓" ? "OK" : x.space.word) : ""}<span class="chev">${raw(icon("chevron"))}</span></a>`; }) : html`<div class="row no-lead"><span class="main"><span class="secondary">Add pens and pen areas to your rooms to see this table.</span></span></div>`}</div></div></div>`;
}
function wireSpace(node) {
  const box = node.querySelector("[data-sp]"); if (!box) return;
  const run = () => { const a = +box.querySelector("[data-a]").value, w = +box.querySelector("[data-w]").value; const out = box.querySelector("[data-out]");
    if (!(a > 0) || !(w > 0)) { out.textContent = ""; return; }
    out.replaceChildren(el(html`<div><b>${n0(pigsAllowed(a, w))} pigs</b><span>${a} m² ÷ ${spacePerPig(w).toFixed(2)} m² per pig at ${w} kg</span><span class="ink-3">Groups of sows: ${n1(a / breederSpace("sow", 10), 0)} · gilts: ${n1(a / breederSpace("gilt", 10), 0)}</span></div>`)); };
  box.addEventListener("input", run); run();
}

// ---- batch farrowing planner (Research C tool 2) ----
function plannerRows(snap) { return plan({ fromIso: addDays(snap.today, -7 * 2), weeks: 26, s: snap.s, anchorIdx: snap.c.anchorIdx, nextNo: snap.c.nextNo, known: snap.c.knownBatches }); }
function plannerDoc(snap) { const p = plannerRows(snap); return { title: "Batch farrowing planner", top: [["System", `${snap.s.interval}-week batches`], ["Serve target", p.target], ["Crates", snap.s.farrowingPlaces]], headers: ["Week", "Monday", "Serve", "Farrow", "Due", "Wean"], rows: p.rows.map((r) => [r.week, r.monday, r.serve ? `B${r.serve} (${r.serveN})` : "", r.farrow ? `B${r.farrow}` : "", r.due || "", r.wean ? `B${r.wean}` : ""]), note: "Farrow week = serve week + 16 (114 days); wean = farrow + lactation." }; }
function plannerHtml(snap, back) {
  const p = plannerRows(snap); const now = weekNo(snap.today); const over = p.rows.filter((r) => r.over);
  return html`<div>${back}${largeTitle("Batch farrowing planner", `${snap.s.interval === 1 ? "Weekly" : snap.s.interval + "-week"} batches · ${snap.s.farrowingPlaces} crates · serve ${p.target}`)}
    <div class="pg-formula">Serve target = ceil(farrowing places ÷ farrowing rate) = ceil(${snap.s.farrowingPlaces} ÷ ${(snap.s.targets.farrowRate / 100).toFixed(2)}) = ${p.target}. Farrow week = serve week + 16; wean = farrow + ${snap.s.lactation} days.</div>
    ${over.map((r) => html`<div class="warn-card" style="margin-top:8px">${raw(icon("alert"))}<span>Week ${r.week}: ${r.due} sows due, ${snap.s.farrowingPlaces} crates.</span></div>`)}
    <div class="section"><div class="card pad"><table class="pg-plan"><thead><tr><th>Week</th><th>Serve</th><th>Farrow</th><th>Due</th><th>Wean</th></tr></thead><tbody>${p.rows.map((r) => html`<tr class="${r.over ? "over" : ""} ${r.week === now ? "now" : ""}"><td>${r.week}<small class="ink-3"> ${d2(r.monday)}</small></td><td>${r.serve ? html`<span class="b">B${r.serve}</span>` : ""}</td><td>${r.farrow ? html`<span class="b far">B${r.farrow}</span>` : ""}</td><td>${r.due || ""}</td><td>${r.wean ? html`<span class="b">B${r.wean}</span>` : ""}</td></tr>`)}</tbody></table></div></div>
    <div data-plan-btns></div></div>`;
}

// ---- feed bins ----
function binsHtml(snap, back) {
  const bins = binFacts(snap.c); const can = canWrite(snap.role, "bins");
  return html`<div>${back}${largeTitle("Feed bins", "Days left and when to order")}
    <div class="list">${bins.length ? bins.map((b) => html`<div class="row no-lead"><span class="main"><span class="primary">${b.bin.name}${b.bin.ration ? " · " + b.bin.ration : ""}</span><span class="secondary">~${n1(b.stock / 1000)} t in the bin · eating ${n0(b.use)} kg/day${b.rooms.length ? " · " + b.rooms.map((x) => x.room.name).join(", ") : ""}${b.daysLeft != null ? ` · order by ${dm(b.orderBy)}` : ""}</span></span><span class="pg-r ${b.level === "due" ? "pg-ink-due" : ""}" style="font-size:20px;font-weight:800">${b.daysLeft != null ? `${Math.max(0, Math.floor(b.daysLeft))} d` : "—"}</span>${can ? html`<button type="button" class="text-btn" data-flow="feed" data-arg="${flowArg({ binId: b.bin.id })}">Delivery</button>` : ""}</div>`) : html`<div class="row no-lead"><span class="main"><span class="secondary">No feed bins yet. Add them in More → Rooms, bins and semen.</span></span></div>`}</div>
    <div class="pg-formula">Days left = kg in the bin ÷ Σ(pigs × intake at their estimated weight). The bin starts from your last dip reading (Readings) plus deliveries since. Order by = empty date − lead time.</div>
    <div class="section">${groupLabel("Intake table used", snap.s.intake ? "your table" : "guess")}<div class="card pad"><table class="pg-tbl"><thead><tr><th>Weight up to</th><th class="r">kg feed / pig / day</th></tr></thead><tbody>${(snap.s.intake || DEFAULT_INTAKE).map((r) => html`<tr><td>${r.upToKg >= 999 ? "heavier" : r.upToKg + " kg"}</td><td class="r">${r.kgDay}</td></tr>`)}</tbody></table>
      <p class="pg-note">${snap.s.intake ? "From your settings." : "A typical ad-lib intake curve — a guess until you enter your breeding company's table in Pig settings. Sows: dry 2.6, lactating 6.5 kg/day (guess)."}</p></div></div></div>`;
}

// ---- money tools (owner, manager, accountant) ----
function yearRows(snap) { const from = addDays(snap.today, -365); return (snap.data.finance || []).filter((f) => f.date > from); }
function copHtml(snap, back) {
  const m = moneyFigures(yearRows(snap));
  return html`<div>${back}${largeTitle("Cost of production", "Last 12 months, from Money")}
    <div class="pg-bt"><div class="num-tile"><span class="label">Your cost</span><span class="value">${m.copPpk != null ? n1(m.copPpk) + "p" : "—"}</span><span class="delta">per kg deadweight</span></div>
      <div class="num-tile"><span class="label">AHDB GB</span><span class="value">${AHDB_COP.ppk}p</span><span class="delta">${AHDB_COP.label}</span></div></div>
    <div class="pg-formula">All costs ÷ kg deadweight sold = ${pounds(m.totalOut)} ÷ ${n0(m.dwKg)} kg. Costs come from Money (feed, vet and medicine, other variable and fixed costs you enter); kg from your kill sheets.</div>
    ${!m.dwKg ? html`<p class="pg-note">Add kill sheets (with £ paid) to see your figure.</p>` : ""}</div>`;
}
function marginHtml(snap, back) {
  const m = moneyFigures(yearRows(snap));
  return html`<div>${back}${largeTitle("Margin per pig", "Last 12 months")}
    <div class="list">${[["Price per pig", pounds(m.pricePerPig)], ["Feed per pig", pounds(m.feedPerPig)], ["Margin over feed per pig", pounds(m.marginOverFeed)], ["Margin over variable costs per pig", pounds(m.marginPerPig)], ["Price p/kg dw", m.pricePpk != null ? n1(m.pricePpk) + "p" : "—"], ["Pigs sold on kill sheets", n0(m.pigsSold)]].map(([k, v]) => html`<div class="row no-lead pg-kv"><span class="main"><span class="primary">${k}</span></span><span class="v">${v}</span></div>`)}</div>
    <div class="pg-formula">Margin per pig = sale value − feed £ − other variable £, ÷ pigs sold. Per batch: see each batch card.</div></div>`;
}

// ---- gestation / dates (Research C tool 1) ----
function datesHtml(snap, back) {
  return html`<div>${back}${largeTitle("Gestation and dates", `${snap.s.gestation}-day gestation · ${snap.s.lactation}-day lactation`)}
    <div class="card pad"><div class="form-group" style="margin:0"><div class="field"><label>First served</label><input type="date" data-sd value="${snap.today}"></div></div><div class="list" data-dates style="margin-top:12px"></div></div>
    <p class="pg-note">Change the defaults in Pig settings. Crate entry never more than 7 days before due (Red Tractor HF.9.2.a); nesting material 24 h before.</p></div>`;
}
function wireDates(node, snap) {
  const i = node.querySelector("[data-sd]"); const out = node.querySelector("[data-dates]");
  const run = () => { if (!i.value) return; const d = batchDates(i.value, snap.s); out.replaceChildren(el(html`<div>${[["Return check", `${d2(d.returnFrom)} – ${d2(d.returnTo)}`], ["Scan", `${d2(d.scanFrom)} – ${d2(d.scanTo)}`], ["Move to farrowing", dm(d.move)], ["Nesting material", dm(d.nesting)], ["Due", `${dm(d.due)} (${d2(d.dueFrom)}–${d2(d.dueTo)})`], ["Wean", dm(d.wean)], ["Batch farrows", `week ${weekNo(d.due)}`]].map(([k, v]) => html`<div class="row no-lead pg-kv"><span class="main"><span class="primary">${k}</span></span><span class="v">${v}</span></div>`)}</div>`)); };
  i.addEventListener("input", run); run();
}
export { penChecks };
