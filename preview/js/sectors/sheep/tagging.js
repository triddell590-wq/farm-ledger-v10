// Tagging board (design/11 §9.2): untagged lambs per crop, tag-by date (9 months, or 6 if housed
// overnight or milked) and "before first move"; replacement-tag countdowns; GB 20-day re-tags.
import { html, raw } from "../../core/html.js";
import { icon } from "../../ui/icons.js";
import { canWrite } from "../../core/policy.js";
import { daysBetween } from "../../core/dates.js";
import { largeTitle, backLink, groupLabel } from "../../screens/common.js";
import { liveScreen } from "./screen.js";
import { short, num, pill, kvRows } from "./ui.js";
import { cropTagging, retagsDue, importRetags } from "./model/paperwork.js";
import * as A from "./actions.js";

export default async function tagging(ctx) {
  return liveScreen(ctx, { title: "Tagging", tab: "paperwork", paint: (snap) => {
    const tg = cropTagging(snap.data, snap.cy, snap.s); const w = canWrite(snap.role, "lambCrops");
    const rt = retagsDue(snap.data); const gb = importRetags(snap.data);
    const left = tg.tagBy ? daysBetween(snap.today, tg.tagBy) : null;
    return html`<div>${backLink(`#/l/${snap.lid}/paperwork`, "Paperwork")}${largeTitle("Tagging", `${tg.crop} lamb crop`)}
      <div class="s-hero"><span class="k">Untagged lambs</span><div class="big">${num(tg.untagged)}</div>
        <span class="sub">${tg.tagBy ? html`Tag by <b>${short(tg.tagBy)}</b> (${tg.months} months from the first birth, ${short(tg.earliest)})${left != null && left < 0 ? html` · <b class="v-late">${-left} days late</b>` : left != null ? ` · ${left} days left` : ""}` : "No lambs born yet this crop."}</span>
        <span class="sub" style="display:block;margin-top:6px">And before their first move: NI lambs need a full EID tag set before leaving the farm — there's no slaughter tag in NI.</span></div>
      ${kvRows([["Born alive", num(tg.born)], ["Died before tagging", num(tg.died)], ["Tagged", num(tg.tagged)]])}
      ${w ? html`<div class="btn-col" style="margin-top:16px"><button type="button" class="btn" data-flow="tag">${raw(icon("tag", { size: 20 }))} Tag lambs</button><button type="button" class="btn secondary" data-lost>Record a lost tag</button></div>` : ""}
      ${tg.taggings.length ? html`<div class="section">${groupLabel("Tagged this crop")}${kvRows(tg.taggings.map((g) => [`${short(g.date)} · ${num(g.count)} lambs`, g.tagType === "eid" ? "EID" : g.tagType || "", "", [g.tagFrom, g.tagTo].filter(Boolean).join(" – ")]))}</div>` : ""}
      <div class="section">${groupLabel("Replacement tags (28 days)", rt.length || "")}${rt.length ? html`<div class="list">${rt.map(({ ev, due }) => html`<div class="row no-lead"><span class="main"><span class="primary">${ev.tag}</span><span class="secondary">Lost ${short(ev.date)} · fit by ${short(due)}</span></span>${pill(due < snap.today ? "late" : "due", due < snap.today ? "Late" : `${daysBetween(snap.today, due)} d`)}${w ? html`<button type="button" class="text-btn" data-fit="${ev.id}">Fitted</button>` : ""}</div>`)}</div>` : html`<div class="card pad t-callout ink-2">No lost tags waiting.</div>`}
        <p class="foot-note">Red replacement tags in stock: ${snap.s.redTags ?? "not set"} (change in Targets).</p></div>
      <div class="section">${groupLabel("Sheep from GB to re-tag (20 days)", gb.length || "")}${gb.length ? html`<div class="list">${gb.map(({ mv, due }) => html`<div class="row no-lead"><span class="main"><span class="primary">${num(mv.count)} from ${mv.otherName || mv.otherFlock}</span><span class="secondary">Arrived ${short(mv.date)} · re-tag by ${short(due)}</span></span>${w ? html`<button type="button" class="text-btn" data-gb="${mv.id}">Done</button>` : ""}</div>`)}</div>` : html`<div class="card pad t-callout ink-2">None.</div>`}</div></div>`;
  }, after: (node, snap) => {
    node.addEventListener("click", async (e) => {
      const E = await import("./flows/events.js");
      if (e.target.closest("[data-lost]")) E.tagLostSheet(snap);
      const f = e.target.closest("[data-fit]"); if (f) E.tagFittedSheet(snap, snap.data.events.find((x) => x.id === f.dataset.fit));
      const g = e.target.closest("[data-gb]"); if (g) A.markMovement(snap.lid, snap.data.movements.find((m) => m.id === g.dataset.gb), { retaggedOn: snap.today });
    });
  } });
}
