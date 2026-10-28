// Batch card (design/13 §6.2 — signature): live FCR (estimate), growth, feed cost per kg gain,
// mortality as big tiles (tap = the formula with this batch's numbers), projected ship date,
// pigs in/out, feed, weights, treatments, tail bites, enrichment, kill sheets.
// Weigh sample · Death · Pigs out · Close batch.
import { html, raw } from "../../../core/html.js";
import { icon } from "../../../ui/icons.js";
import { canWrite, canRead } from "../../../core/policy.js";
import { largeTitle, backLink, groupLabel } from "../../../screens/common.js";
import { liveScreen, flowArg } from "./live.js";
import { dm, d2, n0, n1, pctText, pounds, pill } from "../ui.js";
import { batchName } from "../model/batches.js";

export default async function batch(ctx) {
  const id = ctx.match.groups.id;
  return liveScreen(ctx, { title: "Batch", tab: "batches", paint: (snap) => {
    const b = snap.ix.batches.get(id); const lid = snap.lid; const back = backLink(`#/l/${lid}/batches`, "Batches");
    if (!b) return html`<div>${back}${largeTitle("Batch not found")}</div>`;
    const f = snap.c.bf.get(id); const room = snap.ix.rooms.get(b.roomId); const money = canRead(snap.role, "finance");
    if (!f) return html`<div>${back}${largeTitle(batchName(b), "Being served — no pigs growing yet")}<div class="card pad t-callout ink-2">This breeding batch becomes a growing batch when its litters are weaned.</div></div>`;
    const est = f.final ? "" : " (estimate)";
    const tile = (label, value, delta, formula, tone = "") => html`<button type="button" class="num-tile" data-f="${formula}"><span class="label">${label}</span><span class="value ${tone}">${raw(value)}</span><span class="delta">${delta}</span></button>`;
    const ws = [...(b.sampleWeighs || [])].sort((x, y) => y.date.localeCompare(x.date));
    const meds = snap.data.medicines.filter((m) => m.batchId === id).sort((x, y) => y.date.localeCompare(x.date));
    const bites = snap.data.tailBites.filter((t) => t.batchId === id || (t.roomId === b.roomId && t.date >= (b.inDate || "")));
    const enr = snap.data.enrichment.filter((e) => e.roomId === b.roomId && e.date >= (b.inDate || ""));
    const ks = snap.data.killSheets.filter((k) => k.batchId === id);
    const src = b.phases?.length ? `From ${snap.ix.rooms.get(b.phases[b.phases.length - 1].roomId)?.name || "the weaner room"} (${b.source || "born on farm"}, ${batchName(b)})` : b.source === "bought in" ? `Bought in${b.contractRef ? " · ref " + b.contractRef : ""}` : b.source || "";
    const w = canWrite(snap.role, "moves");
    const A = (flow, label, ic) => html`<button type="button" class="btn secondary" data-flow="${flow}" data-arg="${flowArg({ batchId: id, roomId: b.roomId })}">${raw(icon(ic, { size: 20 }))}${label}</button>`;
    return html`<div>${back}${largeTitle(batchName(b), [room?.name || b.stage, b.inDate ? `in ${d2(b.inDate)}` : null, `day ${f.days}`, b.closed ? `closed ${d2(b.closed.date)}` : null].filter(Boolean).join(" · "))}
      ${src ? html`<p class="pg-line" style="margin-top:-6px">${src}</p>` : ""}
      ${f.withdrawalEnd && f.withdrawalEnd > snap.today ? html`<div class="warn-card" style="margin-top:10px">${raw(icon("alert"))}<span>Under meat withdrawal — not for slaughter before ${dm(f.withdrawalEnd)}.</span></div>` : ""}
      <div class="section"><div class="pg-bt">
        ${tile(`FCR${est}`, f.fcr ? f.fcr.toFixed(2) : "—", `target ${f.targetFcr}`, `FCR = feed used ÷ kg gained. Feed used = ${n1(f.feedKg / 1000)} t delivered − ${n1(f.binKg / 1000)} t in the bin = ${n1(f.feedUsed / 1000)} t. Kg gained = ${n0(f.onFarm)} × ${n1(f.est)} kg + ${n0(f.kgOut)} kg out + ${n0(f.deadKg)} kg dead − ${n0(f.kgIn)} kg in = ${n0(f.kgGain)} kg.${f.final ? " Final: uses kill-sheet weights." : " Labelled “estimate” until the kill sheets come in."}`, f.fcr && f.fcr > f.targetFcr * 1.03 ? "due" : "")}
        ${tile("Growth", `${f.dlwg ? Math.round(f.dlwg) : "—"}<small> g/day</small>`, `target ${f.targetDlwg}${f.fromTarget ? " · no weigh yet" : ""}`, f.fromTarget ? `No sample weigh yet, so growth is your target (${f.targetDlwg} g/day) and the weight now is ${n1(f.avgIn)} kg in + target growth × ${f.days} days = ${n1(f.est)} kg (target). Weigh a sample to replace it.` : `DLWG = (${n1(f.lastWeigh.avgKg)} kg weighed ${d2(f.lastWeigh.date)} − ${n1(f.avgIn)} kg in) ÷ days between × 1000. Weight now = last weigh + DLWG × days since = ${n1(f.est)} kg.`)}
        ${money ? tile("Feed cost / kg gain", f.costPerKgGain != null ? `${Math.round(f.costPerKgGain * 100)}p` : "—", f.feedPounds ? `${pounds(f.feedPounds)} feed` : "no feed £ yet", `Feed £ ÷ kg gained = ${pounds(f.feedPounds)} ÷ ${n0(f.kgGain)} kg.`) : tile("Feed used", `${n1(f.feedUsed / 1000)}<small> t</small>`, `${f.feedLoads} loads`, "Feed delivered to this batch minus the last bin reading.")}
        ${tile("Mortality", pctText(f.mortPct), `${f.died} of ${n0(f.numberIn)}`, `Deaths ÷ pigs in = ${f.died} ÷ ${n0(f.numberIn)}. Target ${f.targetMort}%.`, f.mortPct * 100 > f.targetMort ? "due" : "")}
      </div><p class="pg-note" data-formula hidden></p></div>
      ${!b.closed && b.stage !== "weaner" ? html`<div class="section"><div class="list"><a class="row no-lead pg-kv" href="#/l/${lid}/ship/${id}"><span class="main"><span class="primary">Ship from</span><span class="secondary">at ${snap.s.targetLive} kg live · ${f.shipDays} days on farm</span></span><span class="v">${f.shipDate ? dm(f.shipDate) : "—"}</span><span class="chev">${raw(icon("chevron"))}</span></a></div></div>` : ""}
      <div class="section"><div class="list">
        <div class="row no-lead pg-kv"><span class="main"><span class="primary">Pigs</span><span class="secondary">In ${n0(f.numberIn)} · Died ${f.died} · Culled ${f.culled} · Out ${n0(f.out)}</span></span><span class="v">${n0(f.onFarm)}<small>on farm</small></span></div>
        <div class="row no-lead pg-kv"><span class="main"><span class="primary">Feed</span><span class="secondary">${n1(f.feedKg / 1000)} t delivered (${f.feedLoads} load${f.feedLoads === 1 ? "" : "s"})${money && f.feedPounds ? " · " + pounds(f.feedPounds) : ""} · bin estimate ${n1(f.binKg / 1000)} t</span></span></div>
        <div class="row no-lead pg-kv"><span class="main"><span class="primary">Weights</span><span class="secondary">In ${n1(f.avgIn)} kg avg${ws[0] ? ` · sample weigh ${d2(ws[0].date)}: ${n1(ws[0].avgKg)} kg (${ws[0].n} pigs)` : " · no sample weigh yet"}</span></span></div>
        ${(b.phases || []).map((p) => html`<div class="row no-lead pg-kv"><span class="main"><span class="primary">${p.stage === "weaner" ? "Weaner phase" : p.stage} · ${snap.ix.rooms.get(p.roomId)?.name || ""}</span><span class="secondary">${d2(p.inDate)}–${d2(p.outDate)} · ${p.numberIn} in → ${p.numberOut} out · FCR ${p.fcr ?? "—"} · ${p.dlwg ?? "—"} g/day</span></span></div>`)}</div></div>
      <div class="section">${groupLabel("Records")}<div class="list">
        <a class="row no-lead" href="#/l/${lid}/reg/medicines"><span class="main"><span class="primary">Treatments</span><span class="secondary">${meds.length ? meds.slice(0, 2).map((m) => `${m.productName} ${d2(m.date)}`).join(" · ") : "None"}</span></span><span class="v">${meds.length}</span><span class="chev">${raw(icon("chevron"))}</span></a>
        <a class="row no-lead" href="#/l/${lid}/reg/tailbites"><span class="main"><span class="primary">Tail bites</span></span><span class="v">${bites.length}</span><span class="chev">${raw(icon("chevron"))}</span></a>
        <a class="row no-lead" href="#/l/${lid}/reg/enrichment"><span class="main"><span class="primary">Enrichment</span><span class="secondary">${enr[0] ? `${enr[enr.length - 1].material} · ${d2(enr[enr.length - 1].date)}` : "none recorded"}</span></span><span class="v">${enr.length}</span><span class="chev">${raw(icon("chevron"))}</span></a>
        <div class="row no-lead"><span class="main"><span class="primary">Kill sheets (${ks.length})</span><span class="secondary">${ks.length ? ks.map((k) => `${d2(k.date)} · ${k.totals?.pigs} pigs · avg ${n1(k.totals?.avgDw)} kg${k.totals?.inSpec != null && k.totals.pigs ? ` · ${Math.round((k.totals.inSpec / k.totals.pigs) * 100)}% in spec` : ""}`).join(" · ") : "Take a photo after each load to see % in spec and margin per pig."}</span></span>${w ? html`<button type="button" class="text-btn" data-flow="killSheet" data-arg="${flowArg({ batchId: id })}">Add</button>` : ""}</div></div></div>
      ${b.closed ? html`<div class="section">${groupLabel("Closed")}<div class="list"><div class="row no-lead pg-kv"><span class="main"><span class="primary">Final FCR · growth · mortality</span></span><span class="v">${b.closed.fcr ?? "—"} · ${b.closed.dlwg ?? "—"} · ${pctText(b.closed.mortPct)}</span></div></div>
        ${b.contract || snap.s.contract.on ? html`<a class="btn secondary" style="margin-top:12px" href="#/l/${lid}/reg/contract-${id}">${raw(icon("share"))}Batch report for the integrator</a>` : ""}</div>` : ""}
      ${w && !b.closed ? html`<div class="pg-acts">${A("weigh", "Weigh sample", "scale")}${A("death", "Death", "alert")}${A("pigsOut", "Pigs out", "truck")}${A("closeBatch", "Close batch", "check")}</div>
        <div class="pg-acts">${A("treat", "Treat", "syringe")}${A("moveBatch", "Move room", "house")}</div>` : ""}
      ${!b.closed && (snap.s.contract.on || b.contract) ? html`<a class="btn secondary" style="margin-top:8px" href="#/l/${lid}/reg/contract-${id}">${raw(icon("share"))}Batch report for the integrator</a>` : ""}</div>`;
  }, after: (node) => {
    const out = node.querySelector("[data-formula]");
    node.querySelectorAll("[data-f]").forEach((t) => (t.onclick = () => { const same = out.textContent === t.dataset.f && !out.hidden; out.hidden = same; out.textContent = t.dataset.f; out.className = "pg-formula"; }));
  } });
}
export { pill };
