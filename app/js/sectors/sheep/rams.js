// Rams (design/11 §5.6, §3.6): working / resting, ewes per ram against the guide, ram MOT
// checklist (Teeth · Toes · Testicles · Tone · Body condition) per ram with date.
import { html, raw } from "../../core/html.js";
import { el } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { toast } from "../../ui/toast.js";
import { checkRow, chipGroup, textField } from "../../ui/form.js";
import { canWrite } from "../../core/policy.js";
import { largeTitle, backLink, groupLabel, emptyState } from "../../screens/common.js";
import { addDays } from "../../core/dates.js";
import { liveScreen } from "./screen.js";
import { short, kvRows, pill, entrySheet, chipsField, opt } from "./ui.js";
import { ramSummary, ewesPerRam, ewesToRam } from "./model/mobs.js";
import { SOURCES } from "./model/settings.js";
import * as A from "./actions.js";

export function motSheet(snap, ram) {
  const body = el(html`<form novalidate><p class="t-callout ink-2" style="margin:0 4px 8px">${ram.tag || ram.eid} — tick each one that passes.</p><div class="form-group">${checkRow("teeth", "Teeth", true, "Good bite, no broken mouth")}${checkRow("toes", "Toes", true, "Sound feet, not lame")}${checkRow("testicles", "Testicles", true, "Firm, even, no lumps")}${checkRow("tone", "Tone", true, "Fit, active")}</div>
    ${chipsField("Body condition", chipGroup("bcs", opt(["2.5", "3", "3.5", "4", "4.5"]), "3.5", { multi: false }))}<div class="form-group">${textField({ name: "date", label: "Date", type: "date", value: snap.today })}</div></form>`);
  entrySheet({ title: "Ram MOT", body, label: "Save MOT", missing: () => null, dirty: () => false,
    save: (v, sh) => { const ok = v.teeth && v.toes && v.testicles && v.tone && +v.bcs >= 3; A.ramMot(snap.lid, ram, { date: v.date, teeth: v.teeth, toes: v.toes, testicles: v.testicles, tone: v.tone, bcs: v.bcs, ok }); sh.close(true, { force: true }); toast(ok ? "MOT passed" : "MOT saved — needs attention"); } });
}

export default async function rams(ctx) {
  return liveScreen(ctx, { title: "Rams", tab: "more", paint: (snap) => {
    const r = ramSummary(snap.data); const ewes = ewesToRam(snap.data, snap.cy) || snap.totals.ewes; const epr = ewesPerRam(ewes, r, snap.s); const w = canWrite(snap.role, "sheep");
    const motBy = addDays(snap.cy.nextRamsIn, -30);
    return html`<div>${backLink(`#/l/${snap.lid}/more`, "More")}${largeTitle("Rams", `${r.total} rams · ${r.working} working · ${r.resting} resting`)}
      <div class="s-tiles">${raw(`<div class="num-tile"><span class="label">Ewes per ram</span><span class="value ${epr.ratio && !epr.ok ? "due" : ""}">${epr.ratio ?? "–"}</span><span class="delta">guide 1:${snap.s.ramGuideMature} mature, 1:${snap.s.ramGuideLamb} ram lambs</span></div>`)}${raw(`<div class="num-tile"><span class="label">Ram MOT</span><span class="value">${r.lastMot ? short(r.lastMot) : "Not done"}</span><span class="delta">before ${short(motBy)}</span></div>`)}</div>
      <p class="source">${SOURCES.ramGuide}</p>
      ${w ? html`<div class="btn-col" style="margin-top:12px"><button type="button" class="btn secondary" data-add>${raw(icon("plus", { size: 20 }))} Add a ram</button></div>` : ""}
      <div class="section">${groupLabel("Rams", r.individuals.length || "")}${r.individuals.length ? html`<div class="list">${r.individuals.map((x) => { const m = (x.mot || []).slice().sort((a, b) => b.date.localeCompare(a.date))[0]; return html`<a class="row no-lead" href="#/l/${snap.lid}/sheep/${x.id}"><span class="main"><span class="primary">${x.tag || x.eid}</span><span class="secondary">${[x.breed, x.ramLamb ? "ram lamb" : null, x.resting ? "resting" : "working"].filter(Boolean).join(" · ")}</span></span>${m ? pill(m.ok ? "ok" : "late", `MOT ${short(m.date)}`) : pill("due", "MOT due")}<span class="chev">${raw(icon("chevron"))}</span></a>`; })}</div>`
        : emptyState({ sector: "sheep", title: "No rams recorded", body: "Add each ram by tag to keep his MOT and see ewes per ram. A Rams mob alone gives the count.", action: w ? "Add a ram" : null, actAttr: "data-add" })}</div></div>`;
  }, after: (node, snap) => { node.querySelectorAll("[data-add]").forEach((b) => (b.onclick = async () => (await import("./flows/mob-edit.js")).addSheepSheet(snap, { cls: "ram", mob: snap.data.mobs.find((m) => m.class === "rams") }))); } });
}
export { kvRows };
