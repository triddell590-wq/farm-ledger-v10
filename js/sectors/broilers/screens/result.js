// Crop results (design/15 §9.1 – §9.4): EPEF, FCR, liveability, average weight, 7-day mortality,
// footpad; processor feedback per thin/clear (docket), days empty, energy per crop and — for the
// money roles only — the payment estimate against the settlement, line by line, with "Send query".
import { html, raw } from "../../../core/html.js";
import { icon } from "../../../ui/icons.js";
import { toast } from "../../../ui/toast.js";
import { canWrite, canRead } from "../../../core/policy.js";
import { largeTitle, groupLabel, backLink } from "../../../screens/common.js";
import { liveScreen, flowArg } from "./live.js";
import { tile, kvRows, n0, n1, pc, pounds, dm, d2, note, lawNote, docButtons, shareText } from "../ui.js";
import { cropResults, paymentEstimate, settlementCheck, energyUse, energyCost, ENERGY_KINDS, feedUsedKg } from "../model/results.js";
import { listOf, cropDay, doneThins } from "../model/crop.js";
import { stdOf, stdFcr } from "../model/growth.js";
import { contractDoc, cropField } from "../actions.js";
import { mortalityCard } from "./growth.js";

export default async function result(ctx) {
  const cropId = ctx.match.groups.cropId;
  return liveScreen(ctx, { title: "Crop results", tab: "crops", paint: (snap) => {
    const crop = snap.ix.cropById.get(cropId); if (!crop) return html`<div>${backLink(`#/l/${snap.lid}/crops`, "Crops")}${largeTitle("Crop not found")}</div>`;
    const h = snap.ix.houseById.get(crop.houseId) || {};
    return html`<div>${backLink(`#/l/${snap.lid}/crops`, "Crops")}${largeTitle(`Crop ${crop.no || ""}`, `${h.name || ""} · ${crop.clearedDate ? `cleared ${dm(crop.clearedDate)} · day ${cropDay(crop, crop.clearedDate)}` : `day ${cropDay(crop, snap.today)} · results so far`}`)}${resultsBlock(snap, crop)}
      <div class="section">${groupLabel("Mortality")}${mortalityCard(snap, crop, +h.usableM2 || 0)}</div></div>`;
  }, after: (node, snap) => {
    const q = node.querySelector("[data-query]"); if (q) q.onclick = async () => { const r = await shareText("Settlement query", q.dataset.text); toast(r === "copied" ? "Query copied — paste it into an email or message" : r ? "Shared" : "Couldn't share"); };
    const rep = node.querySelector("[data-report]"); if (rep) { const c = snap.ix.cropById.get(rep.dataset.report); rep.replaceChildren(docButtons(() => cropReport(snap, c, cropResults(snap.ix, c)), { csv: false })); }
    node.querySelectorAll("[data-fb]").forEach((b) => (b.onclick = () => { const c = snap.ix.cropById.get(b.dataset.fb); cropField(snap, c, "feedbackReviewed", c.feedbackReviewed ? null : snap.today); toast(c.feedbackReviewed ? "Unticked" : "Feedback review recorded"); }));
  } });
}

const f2 = (v) => (v == null ? "—" : (+v).toFixed(2));
/** The results tiles, feedback, energy and money for one crop (also the Crops tab hero). */
export function resultsBlock(snap, crop, { compact = false } = {}) {
  const { ix, s, lid } = snap; const L = (h) => `#/l/${lid}/${h}`; const h = ix.houseById.get(crop.houseId) || {};
  const r = cropResults(ix, crop); const std = stdOf(crop, s);
  const best = ix.crops.filter((c) => c.clearedDate && c.id !== crop.id).map((c) => ({ c, e: c.results?.epef ?? cropResults(ix, c).epef })).filter((x) => x.e).sort((a, b) => b.e - a.e)[0];
  const age = r.ageDays; const stdF = age ? stdFcr(std, age) : null;
  const epefF = r.epef ? `EPEF = liveability % × average weight kg ÷ (age days × FCR) × 100 = ${n1(r.liveability)} × ${f2(r.avgKg)} ÷ (${n1(age)} × ${f2(r.fcr)}) × 100` : "EPEF = liveability % × average weight kg ÷ (age days × FCR) × 100 — needs birds sold, kg and feed";
  const tiles = html`<div class="br-tiles">
    ${tile({ label: "EPEF", value: r.epef ? `${n0(r.epef)}${r.epef >= 400 ? '<small class="br-400">400+</small>' : ""}` : "—", delta: best ? `best ${n0(best.e)} (crop ${best.c.no || ""}${ix.houses.length > 1 ? ` ${(ix.houseById.get(best.c.houseId)?.name || "").replace("House ", "H")}` : ""})` : "first crop", formula: epefF })}
    ${tile({ label: "FCR", value: f2(r.fcr), delta: stdF ? `${std.hybrid}: ${f2(stdF)}` : "feed ÷ kg sold", formula: `FCR = feed used ${n0(r.feedKg)} kg (delivered − returned − left) ÷ total kg sold ${n0(r.kg)}` })}
    ${tile({ label: "Liveability", value: r.liveability != null ? pc(r.liveability, 1) : "—", delta: `${n0(r.sold)} of ${n0(r.placed)} sold`, formula: "Liveability = birds sold (thins + clear-out) ÷ birds placed × 100" })}
    ${tile({ label: "Average weight", value: r.avgKg ? `${f2(r.avgKg)} kg` : "—", delta: age ? `at ${n1(age)} days` : "", formula: "Average weight = total kg sold ÷ birds sold; age = average age at thin(s) and clear, weighted by birds" })}
    ${compact ? "" : tile({ label: "7-day mortality", value: pc(r.mort7, 1), delta: `target ${s.mort7TargetPct}% or under`, tone: r.mort7 > s.mort7TargetPct ? "due" : "" })}
    ${compact ? "" : tile({ label: "Footpad score", value: r.footpad != null ? n0(r.footpad) : "—", delta: "processor" })}</div>
    <p class="br-formula" data-formula hidden></p>`;
  const fb = html`<div class="section">${groupLabel("Processor feedback")}${kvRows([
    ["Rejections · DOA", `${r.rejPct != null ? pc(r.rejPct, 1) : "—"} · ${r.doaPct != null ? pc(r.doaPct, 2) : "—"}`, r.rejPct > 1.5 ? "due" : "", null, "Red Tractor PMI rejections reference 1.5%"],
    ["Hock burn", r.hockPct != null ? pc(r.hockPct, 0) : "—"], compact ? ["Footpad score", r.footpad != null ? n0(r.footpad) : "—"] : null,
    ["Days empty before this crop", r.daysEmpty != null ? `${r.daysEmpty}` : "—", r.daysEmpty != null && r.daysEmpty < 5 ? "due" : ""],
    litterLine(snap, crop),
  ])}
  ${compact ? "" : html`<div class="list br-mt">${doneThins(ix, crop).map((t) => html`<div class="row no-lead"><span class="main"><span class="primary">${t.kind === "clear" ? "Clear-out" : "Thin"} ${d2(t.catchAt)} · ${n0(t.birds)} birds</span><span class="secondary">${t.docket ? `${n0(t.docket.received)} received · ${n0(t.docket.kg)} kg · DOA ${t.docket.doa ?? "—"} · rejections ${t.docket.rejPct ?? "—"}%${t.docket.footpad != null ? ` · footpad ${t.docket.footpad}` : ""}` : "Processor docket not added"}</span></span>${canWrite(snap.role, "thins") ? html`<button type="button" class="text-btn" data-flow="docket" data-arg="${flowArg({ cropId: crop.id, thinId: t.id })}">${t.docket ? "Edit" : "Add docket"}</button>` : ""}</div>`)}</div>
    ${crop.clearedDate && (r.footpad != null || r.hockPct != null) ? html`<div class="list br-mt"><div class="row no-lead"><button type="button" class="checkbox" role="checkbox" aria-checked="${!!crop.feedbackReviewed}" aria-label="Reviewed with the vet" data-fb="${crop.id}" ${raw(canWrite(snap.role, "crops") ? "" : "disabled")} style="flex:none;margin-right:12px">${raw(icon("check"))}</button><span class="main"><span class="primary">Footpad and hock feedback reviewed with the vet</span><span class="secondary">${crop.feedbackReviewed ? `ticked ${dm(crop.feedbackReviewed)}` : "Red Tractor: each crop"}</span></span></div></div>` : ""}`}</div>`;
  return html`<div class="section">${tiles}</div>${fb}${energyBlock(snap, crop, r, compact)}${moneyBlock(snap, crop, r, h, compact)}
    ${compact ? html`<a class="btn secondary br-mt" href="${L(`crop-result/${crop.id}`)}">All results for crop ${crop.no || ""}</a>` : html`<div class="section" data-report="${crop.id}"></div>`}`;
}

function litterLine(snap, crop) {
  const xs = listOf(snap.ix.checks, crop.id).filter((c) => c.litter); if (!xs.length) return null;
  const vals = xs.flatMap((c) => [c.litter.front, c.litter.middle, c.litter.back]).filter((v) => v != null && v !== "").map(Number);
  const wet = vals.filter((v) => v >= snap.s.litterScoreHigh).length;
  return ["Litter score (1 dry – 5 wet)", vals.length ? `avg ${n1(vals.reduce((a, b) => a + b, 0) / vals.length)}` : "—", wet / (vals.length || 1) > 0.2 ? "due" : "", null, wet ? `${wet} wet readings this crop — linked to footpad` : "from the AM/PM checks"];
}

function energyBlock(snap, crop, r, compact) {
  const e = snap.ix.energy.get(crop.id); const use = energyUse(e, snap.s);
  const prices = snap.money ? contractDoc(snap)?.energyPrices : null; const cost = prices ? energyCost(use, prices, r.sold || +crop.placed, r.kg) : null;
  const rows = Object.entries(use).map(([k, q]) => { const kind = ENERGY_KINDS.find((x) => x.key === k); return [kind?.label.replace(/ \(.*/, "") || k, `${n0(q)} ${kind?.unit === "%" ? "L" : kind?.unit || ""}`]; });
  if (compact && !cost && !rows.length) return "";
  return html`<div class="section">${groupLabel("Energy this crop")}${rows.length || cost ? kvRows([...(cost ? [["Heat per bird", `${n1(cost.perBird * 100)}p`], ["Per kg", `${n1(cost.perKgPence)}p`], ["This crop", pounds(cost.total)]] : []), ...(compact ? [] : rows)]) : html`<p class="br-quiet">No meter readings yet. Read the gas, biomass and electricity meters at placement and at clear-out.</p>`}
    ${!compact && canWrite(snap.role, "energy") ? html`<button type="button" class="btn secondary br-mt" data-flow="energy" data-arg="${flowArg({ cropId: crop.id })}">${raw(icon("bolt"))}Energy readings</button>` : ""}
    ${!compact && snap.money && !prices && rows.length ? note("Add your energy prices in Contract and payment to see £ per bird.") : ""}</div>`;
}

function moneyBlock(snap, crop, r, h, compact) {
  if (!snap.money) return "";
  const prof = contractDoc(snap)?.profile; const est = paymentEstimate(prof, r, +h.usableM2 || 0);
  const set = (snap.finance || []).filter((f) => f.cropId === crop.id && f.source === "settlement").pop();
  const chk = est && set ? settlementCheck(est.total, set.amount) : null;
  const text = est && set ? [`Settlement query — crop ${crop.no || ""} ${h.name || ""} (cleared ${crop.clearedDate || ""})`, `Birds ${n0(r.sold)} · ${n0(r.kg)} kg · FCR ${f2(r.fcr)} · mortality ${pc(r.cumMort, 2)}`, ...est.lines.map((l) => `${l.label}: ${pounds(l.amount, 2)}`), `My estimate ${pounds(est.total, 2)} · paid ${pounds(set.amount, 2)} · difference ${pounds(chk.diff, 2)}`, "Could you send the line-by-line workings?"].join("\n") : "";
  return html`<div class="section">${groupLabel("Payment", "money roles only")}
    ${est ? kvRows([...(compact ? [] : est.lines.map((l) => [l.label, pounds(l.amount, 0)])), [crop.clearedDate ? "Estimate" : "If clear-out goes to plan", `${pounds(est.total)}${est.perBird ? ` · ${pounds(est.perBird, 3)}/bird` : ""}`], set ? ["Settlement", pounds(set.amount), chk?.flag ? "due" : "ok", null, chk ? `${chk.diff >= 0 ? "+" : "−"}${pounds(Math.abs(chk.diff))} (${chk.pct >= 0 ? "+" : ""}${chk.pct.toFixed(1)}%) vs estimate${chk.flag ? " ⚠" : ""}` : ""] : null]) : html`<p class="br-quiet">Add your contract profile (More → Contract and payment) to see an estimate.</p>`}
    ${!compact && chk?.flag ? html`<button type="button" class="btn secondary br-mt" data-query data-text="${text}">${raw(icon("share"))}Send query</button>` : ""}
    ${!compact && crop.clearedDate && !set && canWrite(snap.role, "finance") ? html`<button type="button" class="btn br-mt" data-flow="settlement" data-arg="${flowArg({ cropId: crop.id })}">${raw(icon("money"))}Record the settlement</button>` : ""}</div>`;
}

function cropReport(snap, crop, r) {
  const h = snap.ix.houseById.get(crop.houseId) || {};
  return { title: `Crop results — crop ${crop.no || ""} ${h.name || ""}`, top: [["Farm", snap.ledger.farmName || ""], ["Placed", `${crop.placedDate} · ${crop.placed} ${crop.hybrid || ""}`], ["Cleared", crop.clearedDate || "not yet"]],
    headers: ["Measure", "Result"], rows: [["EPEF", r.epef ? n0(r.epef) : "—"], ["FCR", f2(r.fcr)], ["Liveability", pc(r.liveability, 1)], ["Average weight", r.avgKg ? `${f2(r.avgKg)} kg` : "—"], ["Average age", r.ageDays ? `${n1(r.ageDays)} days` : "—"], ["Birds sold", n0(r.sold)], ["Total kg", n0(r.kg)], ["Feed used", `${n0(r.feedKg)} kg`], ["7-day mortality", pc(r.mort7, 2)], ["Crop mortality", pc(r.cumMort, 2)], ["Rejections", r.rejPct != null ? pc(r.rejPct, 1) : "—"], ["DOA", r.doaPct != null ? pc(r.doaPct, 2) : "—"], ["Footpad", r.footpad ?? "—"], ["Hock burn", r.hockPct != null ? pc(r.hockPct, 0) : "—"], ["Days empty before", r.daysEmpty ?? "—"]],
    note: "EPEF = liveability % × average weight kg ÷ (age days × FCR) × 100." };
}
export { feedUsedKg, lawNote, canRead };
