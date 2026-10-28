// Herd performance (design/13 §4.4): breeding KPIs over the last 12 months with the formula and
// AHDB benchmarks (average → top third, source and date labelled); farrowing rate by batch with
// the target dashed; parity profile against a healthy-herd outline marked "guide".
// Finishing figures (FCR, growth, mortality) for farms that grow pigs.
import { html } from "../../../core/html.js";
import { largeTitle, backLink, groupLabel } from "../../../screens/common.js";
import { liveScreen } from "./live.js";
import { barChart, n1, pctText } from "../ui.js";
import { breedingKpis, farrowRateByBatch, parityProfile, PARITY_GUIDE, BENCH, BENCH_SOURCE } from "../model/kpis.js";
import { cycles } from "../model/week.js";

export default async function kpis(ctx) {
  return liveScreen(ctx, { title: "Herd performance", tab: "more", paint: (snap) => {
    const d = snap.data; const k = breedingKpis({ sows: d.sows, services: d.services, litters: d.litters, deaths: d.deaths }, snap.today); const t = snap.s.targets;
    const row = (label, val, formula, bench, tone = "") => html`<div class="row no-lead pg-kpi"><span class="main"><span class="primary">${label}</span><span class="secondary">${formula}</span>${bench ? html`<span class="secondary pg-bench">AHDB ${bench}</span>` : ""}</span><span class="v ${tone}">${val}</span></div>`;
    const fr = farrowRateByBatch(d.batches, d.services, d.litters, snap.today);
    const pp = parityProfile(cycles(snap.c).filter((x) => x.sow.type !== "boar").map((x) => x.c.parity)); const totalP = pp.reduce((a, b) => a + b, 0) || 1;
    const closed = d.batches.filter((b) => b.closed).slice(-6);
    return html`<div>${backLink(`#/l/${snap.lid}/more`, "More")}${largeTitle("Herd performance", `Last 12 months · ${n1(k.avgSows, 0)} average sows and served gilts`)}
      ${snap.s.breeding ? html`<div class="list">
        ${row("Pigs weaned / sow / year", k.pwsy != null ? n1(k.pwsy) : "—", `weaned in 12 months (${k.weaned}) ÷ average sows + served gilts`, `${BENCH.pwsy[0]} → ${BENCH.pwsy[1]}`, k.pwsy != null && k.pwsy < t.pwsy ? "due" : "")}
        ${row("Born alive / litter", k.bornAlive != null ? n1(k.bornAlive) : "—", `born alive ÷ litters (${k.litters})`, `${BENCH.bornAlive[0]} → ${BENCH.bornAlive[1]}`)}
        ${row("Pre-weaning mortality", pctText(k.pwm), "piglet deaths ÷ (born alive + fostered on − fostered off)", `${BENCH.pwm[0]}% → ${BENCH.pwm[1]}%`, k.pwm != null && k.pwm * 100 > t.pwm ? "due" : "")}
        ${row("Litters / sow / year", k.lsy != null ? n1(k.lsy, 2) : "—", "litters ÷ average sows", `${BENCH.lsy[0]} → ${BENCH.lsy[1]}`)}
        ${row("Farrowing rate", pctText(k.farrowRate), "sows farrowed ÷ sows served in the batch 16 weeks earlier", `${BENCH.farrowRate[0]}% → ${BENCH.farrowRate[1]}%`, k.farrowRate != null && k.farrowRate * 100 < t.farrowRate ? "due" : "")}
        ${row("Sow mortality", pctText(k.sowMort), "sow deaths ÷ average sows", `${BENCH.sowMort[0]}–${BENCH.sowMort[1]}%`)}
        ${row("Replacement rate", pctText(k.replacement), "gilts entered ÷ average sows", `${BENCH.replacement[0]}–${BENCH.replacement[1]}%`)}</div>
      <p class="pg-note">Benchmarks: average → top third. ${BENCH_SOURCE}. Non-productive days: set your own farm target.</p>
      <div class="section">${groupLabel("Farrowing rate by batch", `target ${t.farrowRate}%`)}<div class="card pad">${fr.length ? html`${barChart(fr.map((r) => r.rate * 100), { labels: fr.map((r) => "B" + r.no), target: t.farrowRate, max: 100, fmt: (x) => x.toFixed(0) + "%" })}<p class="pg-note">Dashed: your target.</p>` : html`<p class="t-callout ink-2" style="margin:0">Shows once a batch is past its due date.</p>`}</div></div>
      <div class="section">${groupLabel("Parity profile")}<div class="card pad">${barChart(pp.map((n) => (n / totalP) * 100), { labels: ["Gilt", "1", "2", "3", "4", "5", "6", "7", "8+"], outline: PARITY_GUIDE, fmt: (x) => x.toFixed(0) + "%" })}
        <div class="pg-legend"><span><i></i>Your herd</span><span><i class="out"></i>Healthy herd shape (guide)</span></div></div></div>` : ""}
      ${closed.length ? html`<div class="section">${groupLabel("Growing pigs — last closed batches")}<div class="card pad"><table class="pg-tbl"><thead><tr><th>Batch</th><th class="r">FCR</th><th class="r">g/day</th><th class="r">Mortality</th></tr></thead><tbody>${closed.map((b) => html`<tr><td>B${b.no}</td><td class="r">${b.closed.fcr ?? "—"}</td><td class="r">${b.closed.dlwg ?? "—"}</td><td class="r">${pctText(b.closed.mortPct)}</td></tr>`)}</tbody></table>
        <p class="pg-note">Targets: FCR ${t.fcr}, ${t.dlwg} g/day, mortality ${t.mort}% (AHDB finishing average, 35–110 kg); rearing FCR under ${t.rearFcr}.</p></div></div>` : ""}</div>`;
  } });
}
