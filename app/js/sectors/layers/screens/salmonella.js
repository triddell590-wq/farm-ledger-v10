// Salmonella for one flock (design/14 §7.3): next operator sample (first at 22–26 weeks, then every
// 15 weeks), the last result, the last official (DAERA) sample, the plan to depop, every sample
// (kept 2 years), and the Class B lock on a positive S.E./S.T. result until a negative
// confirmatory result or the flock leaves. Small flocks (< 350 hens, direct sales) are exempt.
import { html, raw } from "../../../core/html.js";
import { icon } from "../../../ui/icons.js";
import { canWrite } from "../../../core/policy.js";
import { largeTitle, backLink, groupLabel, emptyState } from "../../../screens/common.js";
import { liveScreen, flowArg } from "./live.js";
import { tline, dm, d3, pill, kvRows } from "../ui.js";
import { salmonella, isPositive } from "../model/health.js";
import { weekOfAge } from "../model/flock.js";
import { standardFor } from "../model/standards.js";

export default async function salm(ctx) {
  const fid = ctx.match.groups.id;
  return liveScreen(ctx, { title: "Salmonella", tab: "health", paint: (snap) => {
    const f = snap.data.flocks.find((x) => x.id === fid); const back = backLink(`#/l/${snap.lid}/health`, "Health");
    if (!f) return html`<div>${back}${largeTitle("Flock not found")}</div>`;
    const h = snap.data.houses.find((x) => x.id === f.houseId); const sal = salmonella(snap.c, f); const w = canWrite(snap.role, "salmSamples");
    const head = largeTitle("Salmonella", `${h?.name || ""} · ${standardFor(f.breedStdId).breed} · week ${weekOfAge(f, snap.today)}`);
    if (sal.exempt) return html`<div>${back}${head}<div class="ly-banner">${raw(icon("info"))}<span>${sal.reason}</span></div></div>`;
    const list = snap.data.salmSamples.filter((x) => x.flockId === f.id).sort((a, b) => b.date.localeCompare(a.date));
    const add = w && !sal.gone ? html`<button type="button" class="btn" style="margin-top:12px" data-flow="salm" data-arg='${flowArg({ flockId: f.id })}'>${raw(icon("syringe"))}Record a sample</button>` : "";
    return html`<div>${back}${head}
      ${sal.classB ? html`<div class="ly-banner late" style="margin-bottom:12px">${raw(icon("alert"))}<span>${h?.name}: Salmonella positive (${sal.positive.result}, ${dm(sal.positive.date)}). Eggs are Class B — do not pack as Class A. Contact DAERA. A confirmatory test is possible within 4 weeks${sal.positive ? ` (by ${dm(sal.lockSince ? addD(sal.lockSince, 28) : sal.positive.date)})` : ""}. Egg collections from this house are marked Class B until a negative confirmatory result or the flock leaves.</span></div>` : ""}
      ${list.length ? html`<div class="card" style="padding:0">
        <div class="row no-lead" style="background:none"><span class="main"><span class="primary">${sal.gone ? "Flock has left" : `Next operator sample ${dm(sal.due)}`}</span><span class="secondary">${sal.gone ? "" : `week ${weekOfAge(f, sal.due)} · every 15 weeks`}</span></span>${sal.gone || sal.level === "ok" ? "" : pill(sal.level, sal.level === "late" ? "Late" : "Due")}</div>
        ${tline(sal.plan.map((p) => ({ label: p.state === "depop" ? `wk ${p.wk} (depop)` : `wk ${p.wk}${p.state === "done" ? " ✓" : p.state === "pos" ? " positive" : p.state === "wait" ? " awaiting" : p.state === "due" || p.state === "late" ? " (due)" : ""}`, state: p.state })))}</div>
        <div class="section">${kvRows([
          ["Last operator sample", sal.last ? `${dm(sal.last.date)} · wk ${weekOfAge(f, sal.last.date)}` : "—", "", null, sal.last ? `${sal.last.sampleType || ""} · ${sal.last.result}${sal.last.lab ? ` · ${sal.last.lab}` : ""}` : ""],
          ["Official (DAERA) sample", sal.lastOfficial ? dm(sal.lastOfficial.date) : "none recorded", "", null, sal.lastOfficial ? sal.lastOfficial.result : ""],
          ["Tell DAERA before placing", f.daeraNotified ? `told ${dm(f.daeraNotified)}` : "not recorded", f.daeraNotified ? "ok" : ""],
        ])}</div>` : emptyState({ sector: "layers", title: "No samples recorded", body: `Your first boot swabs are due at 22–26 weeks of age (${dm(sal.windowFrom)} – ${dm(sal.firstBy)}). We'll remind you every 15 weeks after.`, action: w ? "Record a sample" : null, actAttr: `data-flow="salm" data-arg='${flowArg({ flockId: f.id })}'` })}
      ${list.length ? add : ""}
      ${list.length ? html`<div class="section">${groupLabel("Samples", "kept 2 years")}<div class="list">${list.map((x) => html`<button type="button" class="row no-lead" ${raw(w ? `data-flow="salm" data-arg='${flowArg({ flockId: f.id, sampleId: x.id })}'` : "")}><span class="main"><span class="primary">${d3(x.date)}${x.time ? ` ${x.time}` : ""} · ${x.sampler === "official" ? "Official (DAERA)" : "Operator"}</span><span class="secondary">${[x.sampleType, x.lab, x.resultDate ? `result ${dm(x.resultDate)}` : null, x.confirmatory ? "confirmatory" : null].filter(Boolean).join(" · ")}</span></span>${isPositive(x) ? pill("late", x.result) : x.result === "Negative" ? pill("ok", "Negative") : pill("due", x.result || "Awaiting")}</button>`)}</div></div>` : ""}
      <p class="ly-law">Salmonella National Control Programme: operator samples (2 pairs of boot swabs, or 150 g of faeces, or dust) every 15 weeks from 22–26 weeks; DAERA takes official samples too. A positive S. Enteritidis or S. Typhimurium (incl. monophasic) result means eggs go as Class B.</p></div>`;
  } });
}
function addD(iso, n) { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
