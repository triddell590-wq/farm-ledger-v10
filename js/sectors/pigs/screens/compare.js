// Compare closed batches (design/13 §6.1): FCR and growth per batch, last 10, against target.
import { html } from "../../../core/html.js";
import { largeTitle, backLink, groupLabel } from "../../../screens/common.js";
import { liveScreen } from "./live.js";
import { barChart, pctText, n1, d2 } from "../ui.js";
import { batchName } from "../model/batches.js";

export default async function compare(ctx) {
  return liveScreen(ctx, { title: "Compare batches", tab: "batches", paint: (snap) => {
    const closed = snap.data.batches.filter((b) => b.closed).sort((a, b) => a.closed.date.localeCompare(b.closed.date)).slice(-10);
    const t = snap.s.targets; const labels = closed.map((b) => batchName(b));
    const body = closed.length ? html`
      <div class="section">${groupLabel("FCR per batch", `target ${t.fcr}`)}<div class="card pad">${barChart(closed.map((b) => b.closed.fcr), { labels, target: t.fcr, fmt: (x) => x?.toFixed(2) })}<p class="pg-note">Dashed: your target (AHDB finishing average ${t.fcr}, 35–110 kg). Lower is better.</p></div></div>
      <div class="section">${groupLabel("Growth (g/day)", `target ${t.dlwg}`)}<div class="card pad">${barChart(closed.map((b) => b.closed.dlwg), { labels, target: t.dlwg })}</div></div>
      <div class="section"><div class="card pad"><table class="pg-tbl"><thead><tr><th>Batch</th><th>Closed</th><th class="r">FCR</th><th class="r">g/day</th><th class="r">Mort.</th><th class="r">Days</th></tr></thead><tbody>${[...closed].reverse().map((b) => html`<tr><td><a href="#/l/${snap.lid}/batch/${b.id}">${batchName(b)}</a></td><td>${d2(b.closed.date)}</td><td class="r">${b.closed.fcr != null ? n1(b.closed.fcr, 2) : "—"}</td><td class="r">${b.closed.dlwg ?? "—"}</td><td class="r">${pctText(b.closed.mortPct)}</td><td class="r">${b.closed.days ?? "—"}</td></tr>`)}</tbody></table></div></div>`
      : html`<div class="card pad t-callout ink-2">No closed batches yet. Each batch you close adds a bar here.</div>`;
    return html`<div>${backLink(`#/l/${snap.lid}/batches`, "Batches")}${largeTitle("Compare batches", `Last ${closed.length || 10} closed`)}${body}</div>`;
  } });
}
