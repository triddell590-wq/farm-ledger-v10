// Report a disease suspicion (design/11 §19): the flock's status (Restricted while a scab or
// bluetongue report is open), the report and clear buttons, and the history (never deleted).
import { html, raw } from "../../core/html.js";
import { icon } from "../../ui/icons.js";
import { canWrite } from "../../core/policy.js";
import { largeTitle, backLink, groupLabel } from "../../screens/common.js";
import { liveScreen } from "./screen.js";
import { short, pill, banner } from "./ui.js";
import { restriction } from "./model/paperwork.js";
import { DISEASE_BANNER } from "./model/content.js";

const NAMES = { scab: "Sheep scab", bluetongue: "Bluetongue", other: "Other notifiable disease" };

export default async function disease(ctx) {
  return liveScreen(ctx, { title: "Disease suspicion", tab: "paperwork", paint: (snap) => {
    const r = restriction(snap.data); const can = canWrite(snap.role, "diseaseReports");
    const list = (snap.data.diseaseReports || []).slice().sort((a, b) => b.date.localeCompare(a.date));
    return html`<div>${backLink(`#/l/${snap.lid}/paperwork`, "Paperwork")}${largeTitle("Report a disease suspicion", "Scab and bluetongue — DAERA")}
      ${r ? banner("late", `Flock restricted (${r.disease}) since ${short(r.date)}`, " Moves are stopped until your vet confirms in writing.") : html`<div class="info-card">${raw(icon("check"))}<span>Flock status: not restricted.</span></div>`}
      <div class="warn-card" style="margin:12px 0">${raw(icon("alert"))}<span>Suspected sheep scab and bluetongue must be reported to DAERA — it's an offence not to.</span></div>
      ${can ? html`<div class="btn-col">${r ? html`<button type="button" class="btn" data-clear="${r.id}">Add vet's letter — lift restriction</button>` : ""}<button type="button" class="btn ${r ? "secondary" : ""}" data-report>Report a suspicion</button></div>` : ""}
      <div class="section">${groupLabel("Farm-wide notice")}<div class="info-card">${raw(icon("info"))}<span><b>${DISEASE_BANNER.title}:</b> ${DISEASE_BANNER.text} <span class="ink-3">(${DISEASE_BANNER.source}, updated ${short(DISEASE_BANNER.updated)})</span></span></div></div>
      <div class="section">${groupLabel("History", list.length || "")}${list.length ? html`<div class="list">${list.map((x) => html`<div class="row no-lead"><span class="main"><span class="primary">${NAMES[x.disease] || x.disease} · reported ${short(x.date)}</span><span class="secondary">${[x.ref ? `Ref ${x.ref}` : null, x.note, x.clearedOn ? `Lifted ${short(x.clearedOn)} · vet's letter ${short(x.vetLetterDate)}${x.vetName ? " (" + x.vetName + ")" : ""}` : null].filter(Boolean).join(" · ")}</span></span>${x.clearedOn ? pill("ok", "Lifted") : ["scab", "bluetongue"].includes(x.disease) ? pill("late", "Restricted") : pill("info", "Reported")}</div>`)}</div>` : html`<div class="card pad t-callout ink-2">No reports. History is kept here when you make one.</div>`}</div></div>`;
  }, after: (node, snap) => {
    node.querySelector("[data-report]")?.addEventListener("click", async () => (await import("./flows/disease.js")).reportSheet(snap));
    const c = node.querySelector("[data-clear]"); if (c) c.onclick = async () => (await import("./flows/disease.js")).clearSheet(snap, snap.data.diseaseReports.find((x) => x.id === c.dataset.clear));
  } });
}
