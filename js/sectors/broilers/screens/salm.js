// Salmonella for one crop (design/15 §11; Reg. 200/2012): the sampling window for every thin
// and clear-out (slaughter − 21 days → slaughter; − 42 days at 82 days or older, or organic),
// the do-by date that gets the result back for the FCI, the samples and their results.
import { html, raw } from "../../../core/html.js";
import { icon } from "../../../ui/icons.js";
import { canWrite } from "../../../core/policy.js";
import { largeTitle, groupLabel, backLink } from "../../../screens/common.js";
import { liveScreen, flowArg } from "./live.js";
import { pill, dm, lawNote, warnCard } from "../ui.js";
import { salmStatus, salmResultText, salmPositive } from "../model/paper.js";
import { listOf } from "../model/crop.js";
import { regionRule } from "../model/content.js";

const STATE = { late: ["late", "Late — no sample"], positive: ["late", "Positive"], due: ["due", "Due now"], open: ["due", "Window open"], waiting: ["info", "Waiting for result"], future: ["neutral", "Not open yet"], ok: ["ok", "Negative ✓"] };

export default async function salm(ctx) {
  const cropId = ctx.match.groups.cropId;
  return liveScreen(ctx, { title: "Salmonella", tab: "paperwork", paint: (snap) => {
    const { ix, s, today, lid } = snap; const L = (h) => `#/l/${lid}/${h}`; const crop = ix.cropById.get(cropId);
    const back = backLink(L("paperwork"), "Paperwork");
    if (!crop) return html`<div>${back}${largeTitle("Crop not found")}</div>`;
    const h = ix.houseById.get(crop.houseId) || {}; const R = regionRule("broilerSalmonella");
    const st = crop.clearedDate ? [] : salmStatus(ix, crop, s, today); const samples = listOf(ix.salm, crop.id).slice().reverse();
    const can = canWrite(snap.role, "salmSamples");
    return html`<div>${back}${largeTitle("Salmonella", `${h.name || ""} · crop ${crop.no || ""}`)}
      ${samples.some(salmPositive) ? warnCard("Positive: the processor must be told; clean and check the house before restocking. The hygiene swab step is required at turnaround.", "late") : ""}
      ${st.length ? html`<div class="section">${groupLabel("Before each slaughter")}<div class="list">${st.map((x) => html`<div class="row no-lead"><span class="main"><span class="primary">${x.ev.kind === "clear" ? "Clear-out" : "Thin"} ${dm(x.ev.date)} · day ${x.ev.day}</span><span class="secondary">Window ${dm(x.window.from)} – ${dm(x.window.to)} · do by ${dm(x.window.doBy)} so the result is back for the FCI${x.sample ? ` · sampled ${dm(x.sample.date)}` : ""}</span></span>${pill(STATE[x.state][0], STATE[x.state][1])}</div>`)}</div></div>` : ""}
      ${can && !crop.clearedDate ? html`<button type="button" class="btn br-mt" data-flow="salm" data-arg="${flowArg({ cropId: crop.id })}">${raw(icon("scan"))}Record boot swabs</button>` : ""}
      <div class="section">${groupLabel("Samples")}${samples.length ? html`<div class="list">${samples.map((x) => html`<div class="row no-lead"><span class="main"><span class="primary">${dm(x.date)} · ${x.swabPairs || "?"} pairs · ${x.lab || ""}</span><span class="secondary">${salmResultText(x.result)}${x.resultDate ? ` · ${dm(x.resultDate)}` : ""}${x.sampler ? ` · by ${x.sampler}` : ""}</span></span>${can ? html`<button type="button" class="text-btn" data-flow="salmResult" data-arg="${flowArg({ sampleId: x.id })}">${x.result === "pending" ? "Add result" : "Change"}</button>` : ""}</div>`)}</div>` : html`<p class="br-quiet">No samples for this crop yet.</p>`}</div>
      <div class="card pad br-rules"><b>Boot swabs — every time</b><ul><li>Moisten the boot swabs</li><li>Walk the whole house</li><li>No fresh litter in the ${R.noLitterDays} days before</li><li>Send to the lab the same day</li></ul></div>
      ${lawNote(`National Control Programme (Reg. 200/2012): at least ${R.swabPairs} pairs of boot swabs within ${R.windowDays} days before every slaughter — ${R.longWindowDays} days if the birds are ${R.longAgeDays} days or older, or organic. Keep results ${R.keepYears} years.${s.salmDerogation ? ` Derogation (one flock per round) on${s.salmDerogationDate ? ` — DAERA permission ${dm(s.salmDerogationDate)}` : ""}.` : ""}`)}
    </div>`;
  } });
}
