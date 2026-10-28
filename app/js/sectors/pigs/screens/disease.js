// Report a disease suspicion (design/13 §11 last row): never auto-generated. DAERA phone, your
// vet, and the steps for a suspected notifiable pig disease (ASF, CSF, FMD, Aujeszky's, SVD).
import { html, raw } from "../../../core/html.js";
import { icon } from "../../../ui/icons.js";
import { largeTitle, backLink, groupLabel } from "../../../screens/common.js";
import { bannerItems } from "../../../content/region-rules.js";
import { liveScreen } from "./live.js";
import { DAERA_DISEASE_LINE } from "../../beef/model/disease.js";

const STEPS = [
  "Phone your vet or DAERA straight away — it's an offence not to report a suspicion.",
  "Keep every pig where it is. Stop all movements on and off.",
  "No visitors onto the unit; close the gate. Keep a list of everyone who was here in the last 21 days (your gate log).",
  "Don't move carcases until the vet says so. Keep vehicles off the yard.",
  "Clean and disinfect boots and hands at the entrance.",
];

export default async function disease(ctx) {
  return liveScreen(ctx, { title: "Disease suspicion", tab: null, paint: (snap) => {
    const vet = snap.contacts.find((c) => c.kind === "Vet");
    const banner = bannerItems(snap.ledger.region || "NI", ["pigs"]);
    return html`<div>${backLink(`#/l/${snap.lid}/${snap.s.breeding && !snap.s.smallHerd ? "pigs-paperwork" : "paperwork"}`, "Paperwork")}${largeTitle("Report a disease suspicion", "African swine fever and other notifiable disease")}
      <div class="warn-card">${raw(icon("alert"))}<span>Signs to act on: sudden deaths, high fever, red or blue skin on ears and belly, pigs off feed, abortions, blisters on snout or feet.</span></div>
      <div class="pg-acts" style="grid-template-columns:1fr">${vet?.phone ? html`<a class="btn" href="tel:${vet.phone}">${raw(icon("message"))}Phone ${vet.name}</a>` : ""}<a class="btn ${vet?.phone ? "secondary" : ""}" href="tel:${DAERA_DISEASE_LINE.phone.replace(/\s/g, "")}">${raw(icon("message"))}${DAERA_DISEASE_LINE.name} ${DAERA_DISEASE_LINE.phone}</a></div>
      <div class="section">${groupLabel("What to do now")}<div class="list">${STEPS.map((s, i) => html`<div class="row no-lead"><span class="pg-no" style="min-width:36px;font-size:20px">${i + 1}</span><span class="main"><span class="primary" style="font-weight:500">${s}</span></span></div>`)}</div></div>
      <a class="btn secondary" style="margin-top:12px" href="#/l/${snap.lid}/gate">${raw(icon("people"))}Visitors in the last 21 days</a>
      ${banner.map((b) => html`<div class="info-card" style="margin-top:12px">${raw(icon("info"))}<span>${b.text}${b.source ? html` <span class="ink-3">(${b.source})</span>` : ""}</span></div>`)}
      <p class="pg-note">The app never raises a disease alert on its own. No pork products on the farm; no kitchen waste fed to pigs.</p></div>`;
  } });
}
