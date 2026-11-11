// Samples for one house (design/14 §5.5): body weight & uniformity (mean, CV%, % within ±10%)
// against the breed weight for age; egg weight with the S/M/L/XL mix; feather score (% good)
// with the enrichment noted beside each session, so the farmer can see what helped.
import { html, raw } from "../../../core/html.js";
import { icon } from "../../../ui/icons.js";
import { canWrite } from "../../../core/policy.js";
import { largeTitle, backLink, groupLabel, emptyState } from "../../../screens/common.js";
import { liveScreen, flowArg } from "./live.js";
import { dm, n0, n1, table } from "../ui.js";
import { flockIn, weekOfAge } from "../model/flock.js";
import { standardFor, band } from "../model/standards.js";

const META = {
  weights: { title: "Body weight", flow: "weights", btn: "Weigh hens", empty: "Weigh 50–100 hens with a hook scale, typing each weight. We work out the average, CV and uniformity." },
  eggs: { title: "Egg weight", flow: "eggWeights", btn: "Weigh eggs", empty: "Weigh a tray or two of eggs to see the average weight and the size mix." },
  feather: { title: "Feather score", flow: "feather", btn: "Score feathers", empty: "Score 50 hens: 0 good feather, 1 some loss, 2 bare patches. Monthly." },
};

export default async function samples(ctx) {
  const { houseId, kind } = ctx.match.groups; const M = META[kind];
  return liveScreen(ctx, { title: M.title, tab: "health", paint: (snap) => {
    const h = snap.data.houses.find((x) => x.id === houseId); const back = backLink(`#/l/${snap.lid}/health/samples`, "Feather and weights");
    if (!h) return html`<div>${back}${largeTitle("House not found")}</div>`;
    const f = flockIn(snap.c, h.id); const w = canWrite(snap.role, "samples") && f;
    const list = snap.data.samples.filter((x) => x.houseId === h.id && x.kind === kind).sort((a, b) => b.date.localeCompare(a.date));
    const btn = w ? html`<button type="button" class="btn" style="margin-top:12px" data-flow="${M.flow}" data-arg='${flowArg({ houseId: h.id })}'>${raw(icon(kind === "feather" ? "check" : "scale"))}${M.btn}</button>` : "";
    if (!list.length) return html`<div>${back}${largeTitle(M.title, h.name)}${emptyState({ sector: "layers", title: `No ${M.title.toLowerCase()} samples yet`, body: M.empty })}${btn}</div>`;
    const x = list[0]; const fl = snap.data.flocks.find((y) => y.id === x.flockId) || f; const std = standardFor(fl?.breedStdId);
    let top, rows;
    if (kind === "weights") {
      const b = band(std, "bw", weekOfAge(fl, x.date)); const u = +snap.s.uniformityTarget || 80;
      top = html`<div class="ly-tiles"><div class="num-tile"><span class="label">Average</span><span class="value">${n0(x.mean)}<small> g</small></span><span class="delta">${b ? `breed ${n0(b[0])}–${n0(b[1])}` : ""}</span></div><div class="num-tile"><span class="label">Uniformity</span><span class="value ${x.uniformity < u ? "due" : "ok"}">${n0(x.uniformity)}%</span><span class="delta">target over ${u}%</span></div><div class="num-tile"><span class="label">CV</span><span class="value">${n1(x.cv)}%</span><span class="delta">${x.n} hens</span></div></div>`;
      rows = table([["Date"], ["Wk", "n"], ["Hens", "n"], ["Avg g", "n"], ["Unif.", "n"], ["CV", "n"]], list.map((s) => [dm(s.date), s.wk ?? "", s.n, n0(s.mean), `${n0(s.uniformity)}%`, `${n1(s.cv)}%`]));
    } else if (kind === "eggs") {
      const b = band(std, "eggWt", weekOfAge(fl, x.date));
      top = html`<div class="ly-tiles"><div class="num-tile"><span class="label">Average</span><span class="value">${n1(x.mean)}<small> g</small></span><span class="delta">${b ? `breed ${n1(b[0])}–${n1(b[1])}` : ""}</span></div><div class="num-tile" style="grid-column:span 2"><span class="label">Size mix · ${x.n} eggs</span><span class="value" style="font-size:19px">${["S", "M", "L", "XL"].map((g) => `${g} ${x.mix?.[g] ?? 0}%`).join(" · ")}</span></div></div>`;
      rows = table([["Date"], ["Wk", "n"], ["Eggs", "n"], ["Avg g", "n"], ["L+XL", "n"]], list.map((s) => [dm(s.date), s.wk ?? "", s.n, n1(s.mean), `${(s.mix?.L || 0) + (s.mix?.XL || 0)}%`]));
    } else {
      top = html`<div class="ly-tiles"><div class="num-tile"><span class="label">Good feather</span><span class="value ${x.good < 70 ? "due" : "ok"}">${n0(x.good)}%</span><span class="delta">${x.n} hens</span></div><div class="num-tile" style="grid-column:span 2"><span class="label">Scores</span><span class="value" style="font-size:19px">0: ${x.tally?.[0] || 0} · 1: ${x.tally?.[1] || 0} · 2: ${x.tally?.[2] || 0}</span><span class="delta">${x.enrichment ? `Enrichment: ${x.enrichment}` : ""}</span></div></div>`;
      rows = table([["Date"], ["Wk", "n"], ["Good", "n"], ["Enrichment"]], list.map((s) => [dm(s.date), s.wk ?? "", `${n0(s.good)}%`, s.enrichment || ""]));
    }
    return html`<div>${back}${largeTitle(M.title, `${h.name} · last ${dm(x.date)}`)}${top}${btn}<div class="section">${groupLabel("Sessions")}${rows}</div>
      ${kind === "weights" ? html`<p class="ly-cap">Uniformity = hens within ±10% of the average. Target is guidance — change it in Layers settings.</p>` : ""}</div>`;
  } });
}
