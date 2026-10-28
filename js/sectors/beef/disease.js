// Report a disease suspicion (design/10 §22): who to phone, and mark the holding restricted
// until results when the farmer records a suspicion. Content from model/disease.js.
import { html, raw } from "../../core/html.js";
import { el } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { toast } from "../../ui/toast.js";
import { canWriteMeta } from "../../core/policy.js";
import { shortDate } from "../../core/dates.js";
import { backLink, largeTitle } from "../../screens/common.js";
import { loadBeef } from "./data.js";
import { setMeta } from "./actions.js";
import { DAERA_DISEASE_LINE } from "./model/disease.js";
import { beefBanner } from "./model/region.js";

export default async function disease(ctx) {
  const snap = await loadBeef(ctx.ledger); const ms = snap.meta.settings || {}; const can = canWriteMeta(snap.role, "settings");
  const vet = snap.contacts.find((c) => c.kind === "Vet");
  const body = el(html`<div class="beef-page">${backLink(`#/l/${snap.lid}/paperwork`, "Paperwork")}${largeTitle("Report a disease suspicion")}
    <div class="warn-card">${raw(icon("alert"))}<span>${DAERA_DISEASE_LINE.note}</span></div>
    <div class="act-grid">${vet?.phone ? html`<a class="btn" href="tel:${vet.phone}">${raw(icon("message"))}Phone ${vet.name}</a>` : ""}<a class="btn secondary" style="grid-column:1/-1" href="tel:${DAERA_DISEASE_LINE.phone.replace(/\s/g, "")}">${raw(icon("message"))}${DAERA_DISEASE_LINE.name} ${DAERA_DISEASE_LINE.phone}</a></div>
    ${beefBanner({ region: ctx.ledger.region }).map((n) => html`<div class="info-card">${raw(icon("info"))}<span>${n.text} <span class="ink-3">(${n.source}, checked ${n.checkedOn})</span></span></div>`)}
    ${can ? html`<div class="section"><div class="card pad"><b>${ms.suspicion ? `Suspicion recorded ${shortDate(ms.suspicion.date)}: ${ms.suspicion.what}` : "Recorded a suspicion with DAERA?"}</b>
      <p class="hint" style="margin:4px 0 0">${ms.suspicion ? "The holding shows as restricted until you record the result." : "Recording it marks the holding as restricted (factory only) until you record the result."}</p>
      <div class="act-grid">${ms.suspicion ? html`<button type="button" class="btn secondary" data-clear style="grid-column:1/-1">Results back — lift it</button>` : html`<button type="button" class="btn secondary" data-btv>Bluetongue</button><button type="button" class="btn secondary" data-other>Something else</button>`}</div></div></div>` : ""}</div>`);
  const rec = (what) => { setMeta(snap.lid, "settings", { suspicion: { what, date: snap.today } }); toast("Recorded. Holding shows as restricted until results."); location.hash = `#/l/${snap.lid}/today`; };
  body.querySelector("[data-btv]")?.addEventListener("click", () => rec("Bluetongue"));
  body.querySelector("[data-other]")?.addEventListener("click", () => rec("Notifiable disease"));
  body.querySelector("[data-clear]")?.addEventListener("click", () => { setMeta(snap.lid, "settings", { suspicion: null }); toast("Restriction lifted"); location.hash = `#/l/${snap.lid}/today`; });
  return { el: body, title: "Disease suspicion", depth: 1, tab: "paperwork" };
}
