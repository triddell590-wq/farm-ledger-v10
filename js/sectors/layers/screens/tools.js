// More → Tools (design/14 §10): daily sheet maths, breed curve, water alarm, mortality spike,
// uniformity, feed per dozen / margin, depop decision, space check, pop-hole dusk time. Each
// calculator works offline, fills itself from today's figures where it can and shows the formula.
// Money tools (feed per dozen, depop decision) are for roles that can see money.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { wireForm } from "../../../ui/form.js";
import { canRead } from "../../../core/policy.js";
import { largeTitle, backLink } from "../../../screens/common.js";
import { liveSnap } from "../data.js";
import { n0, n1, pounds, linkRow, kvRows } from "../ui.js";
import { numField, dateField, chipsField } from "../flows/common.js";
import { sortedHouses, flockIn, series, aliveAt, weekOfAge, predictHHE, sum, deadOf, daysFor } from "../model/flock.js";
import { sheetFigures } from "../model/flock.js";
import { uniformity } from "../model/health.js";
import { depopDecision, flockMoney } from "../model/eggs.js";
import { spaceCheck, sunset } from "../model/house.js";
import { standardFor } from "../model/standards.js";
import { REFERENCE_PRICE } from "../model/content.js";
import { PRICE_PROFILE_ID } from "../data.js";

const TOOLS = [
  ["sheet", "Daily sheet maths", "Lay %, seconds %, water per 1,000 birds", "today", false],
  ["curve", "Breed curve", "Your flock against the breed standard", "chart", false],
  ["water", "Water alarm", "Change against the last 3 days", "water", false],
  ["spike", "Mortality spike", "Is today's loss a spike?", "alert", false],
  ["uniformity", "Uniformity", "Mean, CV and % within ±10%", "scale", false],
  ["dozen", "Feed per dozen and margin", "£ and kg feed per dozen, margin over feed", "money", true],
  ["depop", "Depop decision", "Margin over feed for 0, 4 or 8 more weeks", "truck", true],
  ["space", "Space check", "Hens, nests, perch, litter, range", "house", false],
  ["dusk", "Pop-hole dusk time", "Sunset at the farm, any date", "sun", false],
];

export default async function tools(ctx) {
  const tool = ctx.match?.groups?.tool || null;
  const body = el(html`<div class="ly-page push"></div>`); let cur = null; let drawn = false;
  const { first, stop } = liveSnap(ctx.ledger, (snap) => { cur = snap; if (!drawn) { drawn = true; body.replaceChildren(tool ? one(snap, tool) : list(snap)); } });
  await first;
  return { el: body, title: tool ? (TOOLS.find((t) => t[0] === tool) || [])[1] || "Tool" : "Tools", destroy: stop, tab: "more", depth: 1, snap: () => cur };
}

function list(snap) {
  const L = (h) => `#/l/${snap.lid}/${h}`; const money = canRead(snap.role, "finance");
  const f0 = sortedHouses(snap.c).map((h) => flockIn(snap.c, h.id)).find(Boolean);
  return el(html`<div>${backLink(L("more"), "More")}${largeTitle("Tools", "Work offline · formulas shown")}
    <div class="list">${TOOLS.filter((t) => !t[4] || money).map(([id, title, sub, ic]) => linkRow(id === "curve" && f0 ? L(`curve/${f0.id}`) : L(`tools/${id}`), title, sub, "", ic))}</div>
    <p class="ly-cap">Water alarm (±${snap.s.waterAlertPct}%) and mortality spike (${snap.s.spikeMult}× and ${snap.s.spikeMin}+ birds) are starting rules — change them in Layers settings.</p></div>`);
}

/** A calculator: form fields + a result card that re-works on every change. */
function calc(snap, title, sub, fieldsHtml, compute, formula) {
  const node = el(html`<div>${backLink(`#/l/${snap.lid}/tools`, "Tools")}${largeTitle(title, sub)}<form novalidate>${fieldsHtml}</form><div class="section" data-out></div><p class="ly-cap">${formula}</p></div>`);
  const f = wireForm(node.querySelector("form")); const out = node.querySelector("[data-out]");
  const run = () => { let r; try { r = compute(f.values()); } catch (e) { console.error(e); r = null; } out.replaceChildren(el(r || html`<div class="card pad t-callout ink-2">Fill in the numbers above.</div>`)); };
  f.onChange(run); node.addEventListener("click", () => setTimeout(run, 0)); run();
  return node;
}
const N = (v) => (v === "" || v == null ? null : +String(v).replace(/,/g, ""));
const tiles = (rows) => html`<div class="ly-tiles">${rows.map(([k, v, d, tone]) => html`<div class="num-tile"><span class="label">${k}</span><span class="value ${tone ? "ly-ink-" + tone : ""}">${v}</span>${d ? html`<span class="delta">${d}</span>` : ""}</div>`)}</div>`;

function firstLive(snap) { return sortedHouses(snap.c).map((h) => ({ h, f: flockIn(snap.c, h.id) })).filter((x) => x.f); }
function lastSheet(snap, f) { const s = series(snap.c, f).filter((d) => !d.partial); return s[s.length - 1] || null; }

function one(snap, tool) {
  const c = snap.c; const s = snap.s; const live = firstLive(snap); const x = live[0]; const money = canRead(snap.role, "finance");
  const d = x ? lastSheet(snap, x.f) : null; const prevD = x ? series(c, x.f).filter((y) => !y.partial && y.date < (d?.date || "")).slice(-1)[0] : null;
  if (tool === "sheet") return calc(snap, "Daily sheet maths", x ? `Filled from ${x.h.name}'s last sheet` : "", html`<div class="form-group">${numField("eggs", "Eggs collected", d?.eggsTotal ?? "")}${numField("seconds", "Seconds", d?.seconds ?? 0)}${numField("alive", "Hens this morning", d?.alive ?? "")}${numField("meter", "Water meter today (L)", d?.waterMeter ?? "")}${numField("meterY", "Water meter yesterday (L)", prevD?.waterMeter ?? "")}</div>`,
    (v) => { if (!N(v.eggs) || !N(v.alive)) return null; const fig = sheetFigures(s, { eggsTotal: N(v.eggs), seconds: N(v.seconds) || 0, alive: N(v.alive), waterMeter: N(v.meter), prev: N(v.meterY) != null ? { waterMeter: N(v.meterY), gap: 1 } : null });
      return tiles([["Lay (hen-day)", `${n1(fig.henDay)}%`, s.henDayBasis === "saleable" ? "saleable eggs" : "all eggs"], ["Seconds", `${n1(fig.secondsPct)}%`], ["Water", fig.waterPer1000 == null ? "—" : n0(fig.waterPer1000), "L per 1,000 birds"]]); },
    "Hen-day % = eggs ÷ hens × 100 · seconds % = seconds ÷ eggs × 100 · water L/1,000 = (meter today − yesterday) ÷ hens × 1,000.");
  if (tool === "water") { const ser = x ? series(c, x.f).filter((y) => y.litres != null) : []; const l3 = ser.slice(-4, -1).map((y) => y.litres);
    return calc(snap, "Water alarm", `Alert at ±${s.waterAlertPct}%`, html`<div class="form-group">${numField("today", "Litres today", ser[ser.length - 1]?.litres ?? "")}${numField("avg", "Average of the last 3 days (L)", l3.length ? Math.round(sum(l3) / l3.length) : "")}</div>`,
      (v) => { if (!N(v.today) || !N(v.avg)) return null; const ch = (N(v.today) / N(v.avg) - 1) * 100; const flag = Math.abs(ch) >= +s.waterAlertPct;
        return html`<div>${tiles([["Change", `${ch > 0 ? "+" : ch < 0 ? "−" : ""}${n1(Math.abs(ch))}%`, flag ? "check lines, birds and heat" : "within your alert", flag ? "due" : "ok"]])}</div>`; },
      "Change % = litres today ÷ average of the last 3 days − 1. A drop is often the first sign of trouble.");
  }
  if (tool === "spike") { const days = x ? daysFor(c, x.f.id) : []; const prev = days.slice(-8, -1);
    return calc(snap, "Mortality spike", `${s.spikeMult}× the 7-day average and at least ${s.spikeMin} birds`, html`<div class="form-group">${numField("today", "Dead and culled today", days.length ? deadOf(days[days.length - 1]) : "")}${numField("avg", "Average a day, last 7 days", prev.length ? n1(sum(prev, deadOf) / prev.length) : "")}</div>`,
      (v) => { if (N(v.today) == null || N(v.avg) == null) return null; const n = N(v.today), a = N(v.avg); const on = n >= +s.spikeMin && n >= +s.spikeMult * Math.max(a, 0.0001);
        return html`<div>${tiles([["Times normal", a ? `${n1(n / a)}×` : "—", on ? "Spike" : "Not a spike", on ? "late" : "ok"]])}${on ? html`<div class="ly-banner late" style="margin-top:8px">${raw(icon("alert"))}<span>A sudden rise can be the first sign of bird flu. Phone your vet now. If you suspect bird flu you must report it to DAERA.</span></div>` : ""}</div>`; },
      "Spike = today's dead ≥ multiplier × the 7-day average, and at least the minimum number of birds (both are your settings).");
  }
  if (tool === "uniformity") return calc(snap, "Uniformity", `Target over ${s.uniformityTarget}%`, html`<div class="field ly-area"><label for="ly-w">Weights in grams, separated by spaces or commas</label><textarea id="ly-w" name="w" rows="5" placeholder="1950 2010 1880 …"></textarea></div>`,
    (v) => { const vals = String(v.w || "").split(/[\s,;]+/).map(Number).filter((y) => y > 0); if (vals.length < 2) return null; const u = uniformity(vals);
      return tiles([["Mean", `${n0(u.mean)} g`, `${u.n} birds`], ["CV", `${n1(u.cv)}%`], ["Uniformity", `${n1(u.uniformity)}%`, `target ${s.uniformityTarget}%`, u.uniformity >= +s.uniformityTarget ? "ok" : "due"]]); },
    "CV % = standard deviation ÷ mean × 100 · uniformity = % of birds within ±10% of the mean. To keep a sample on the flock, use Flock → Body weight.");
  if (tool === "space") { const hs = sortedHouses(c);
    return calc(snap, "Space check", "Welfare of Farmed Animals Regs (NI) 2012, Sch. 2/3", html`${hs.length > 1 ? chipsField("house", "House", hs.map((h) => [h.id, h.name]), hs[0]?.id) : html`<input type="hidden" name="house" value="${hs[0]?.id || ""}">`}<div class="form-group" style="margin-top:12px">${numField("hens", "Hens", x ? aliveAt(c, x.f, snap.today) : "")}</div>`,
      (v) => { const h = hs.find((y) => y.id === v.house); if (!h || !N(v.hens)) return null; const sc = spaceCheck(h, N(v.hens)); if (!sc.rows.length) return html`<div class="card pad t-callout ink-2">Add the house's area, nests and perch in Houses and flocks first.</div>`;
        return kvRows(sc.rows.map((r) => [r.label, r.ok ? "✓" : "Short", r.ok ? "ok" : "due", null, r.text])); },
      "Up to 9 hens per m² usable area · 1 nest per 7 hens (or 1 m² per 120) · 15 cm perch · 250 cm² litter a hen · colony 750 cm² · range 2,500 hens per ha within 150 m of a pop-hole (350 m with 4+ shelters per ha).");
  }
  if (tool === "dusk") return calc(snap, "Pop-hole dusk time", `At ${n1(s.lat, 2)}°N, ${n1(Math.abs(s.lng), 2)}°W (change in settings)`, html`<div class="form-group">${dateField("date", "Date", snap.today)}</div>`,
    (v) => (v.date ? tiles([["Sunset", sunset(v.date, +s.lat, +s.lng), "UK clock time"]]) : null), "Worked out on the phone from the date and the farm's position (NOAA sunrise/sunset approximation) — no signal needed.");
  if ((tool === "dozen" || tool === "depop") && !money) return el(html`<div>${backLink(`#/l/${snap.lid}/tools`, "Tools")}${largeTitle("Money tools")}<p class="ly-note">Money is kept by the owner, manager or accountant.</p></div>`);
  if (tool === "dozen") { const fin = snap.data.finance.filter((r) => r.id !== PRICE_PROFILE_ID); const m = x ? flockMoney(c, x.f, fin) : null;
    return calc(snap, "Feed per dozen and margin", x ? `Filled from ${x.h.name} since placing` : "", html`<div class="form-group">${numField("eggs", "Eggs", m?.eggs ?? "")}${numField("feedCost", "Feed £", m ? Math.round(m.feedCost) : "")}${numField("feedKg", "Feed kg", m?.feedKg ?? "")}${numField("eggIncome", "Egg £", m ? Math.round(m.eggsIncome) : "")}${numField("birds", "Hens now", x ? aliveAt(c, x.f, snap.today) : "")}${numField("weeks", "Weeks", x ? Math.max(1, Math.round(daysFor(c, x.f.id).length / 7)) : "")}${numField("eggWt", "Average egg weight (g)", 62)}</div>`,
      (v) => { const dz = N(v.eggs) / 12; if (!dz) return null; const fpd = (N(v.feedCost) / dz) * 100; const kgpd = N(v.feedKg) / dz; const fcr = N(v.feedKg) / (N(v.eggs) * (N(v.eggWt) || 62) / 1000); const mpb = N(v.birds) && N(v.weeks) ? (N(v.eggIncome) - N(v.feedCost)) / N(v.birds) / N(v.weeks) : null;
        return tiles([["Feed per dozen", `${n1(fpd)}p`], ["kg feed per dozen", n1(kgpd, 2)], ["FCR", isFinite(fcr) ? n1(fcr, 2) : "—", "kg feed / kg egg"], ["Margin over feed", mpb == null ? "—" : pounds(mpb, 3), "per bird per week", mpb < 0 ? "late" : ""]]); },
      "Feed cost per dozen = feed £ ÷ (eggs ÷ 12) · FCR = feed kg ÷ (eggs × egg weight kg) · margin over feed per bird per week = (egg £ − feed £) ÷ hens ÷ weeks.");
  }
  if (tool === "depop") { const hs = live; const f = x?.f; const depWk = f?.plannedDepop ? weekOfAge(f, f.plannedDepop) : 76; const ratio = f ? predictHHE(c, f, depWk).ratio : 100;
    return calc(snap, "Depop decision", "Estimate — margin over feed only", html`${hs.length > 1 ? chipsField("house", "House", hs.map(({ h }) => [h.id, h.name]), hs[0]?.h.id) : html`<input type="hidden" name="house" value="${hs[0]?.h.id || ""}">`}
      <div class="form-group" style="margin-top:12px">${numField("ppd", "Egg price (p a dozen)", s.prices?.L || s.refPrice || REFERENCE_PRICE.pPerDozen)}${numField("fpt", "Feed (£ a tonne)", s.feedPerTonne ?? "")}${numField("feedG", "Feed (g a bird a day)", 118)}${numField("ratio", "Laying at % of standard", n1(ratio))}${numField("fromWk", "Planned depop week", depWk)}</div>`,
      (v) => { const pick = hs.find(({ h }) => h.id === v.house) || hs[0]; if (!pick || !N(v.ppd) || !N(v.fpt)) return null; const birds = aliveAt(c, pick.f, snap.today, { end: true });
        const r = depopDecision(c, pick.f, { ppd: N(v.ppd), feedPerTonne: N(v.fpt), feedG: N(v.feedG) || 118, ratio: (N(v.ratio) || 100) / 100, fromWk: N(v.fromWk) || 76, birds: Math.round(birds * 0.97), weeksList: [4, 8] });
        return html`<div>${tiles(r.map((y) => [`${y.extra} more weeks`, `${y.margin >= 0 ? "+" : "−"}${pounds(Math.abs(y.margin))}`, `${n0(y.eggs)} eggs`, y.margin < 0 ? "late" : "ok"]))}<p class="ly-cap">${standardFor(pick.f.breedStdId).edition}. Doesn't include spent-hen price changes, the next flock's start or energy.</p></div>`; },
      "Extra eggs = standard mid lay % × your flock's ratio × hens × 7 days a week · margin = eggs ÷ 12 × price − feed kg ÷ 1,000 × £ a tonne.");
  }
  return el(html`<div>${backLink(`#/l/${snap.lid}/tools`, "Tools")}${largeTitle("Tool not found")}</div>`);
}
