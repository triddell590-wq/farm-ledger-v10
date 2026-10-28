// NI Bird Register return — 1 June (design/14 §19, §20): birds per establishment number, filled
// from each house's birds alive on 1 June (from the daily sheets), editable, then marked as sent.
// One `birdRegisterReturns` record per establishment number per year.
import { html, raw } from "../../../core/html.js";

import { icon } from "../../../ui/icons.js";
import { toast } from "../../../ui/toast.js";
import { canWrite } from "../../../core/policy.js";
import { largeTitle, backLink, groupLabel } from "../../../screens/common.js";
import { liveScreen, remember } from "./live.js";
import { d3, n0, pill } from "../ui.js";
import { birdRegister } from "../model/house.js";
import { birdCountDay, RULES } from "../model/content.js";
import { saveBirdReturn } from "../actions.js";

export default async function birdRegisterScreen(ctx) {
  return liveScreen(ctx, { title: "Bird Register", tab: "more", paint, after: (node, snap, repaint) => {
    node.querySelectorAll("[data-year]").forEach((b) => (b.onclick = () => { remember(snap.lid, "birdYear", b.dataset.year); repaint(); }));
    node.querySelectorAll("[data-est]").forEach((card) => {
      const est = card.dataset.est; const year = +card.dataset.y;
      const total = () => [...card.querySelectorAll("input[data-h]")].reduce((t, i) => t + (+i.value || 0), 0);
      card.querySelectorAll("input[data-h]").forEach((i) => (i.oninput = () => { card.querySelector("[data-total]").textContent = n0(total()); }));
      const go = (sent) => { const birds = Object.fromEntries([...card.querySelectorAll("input[data-h]")].map((i) => [i.dataset.h, +i.value || 0]));
        saveBirdReturn(snap, { year, establishmentNo: est, birds, total: total(), submittedOn: sent ? snap.today : undefined }); toast(sent ? `${est}: marked as sent` : `${est}: saved`); };
      card.querySelector("[data-save]")?.addEventListener("click", () => go(false));
      card.querySelector("[data-sent]")?.addEventListener("click", () => go(true));
    });
  } });
}

function paint(snap) {
  const L = (h) => `#/l/${snap.lid}/${h}`; const T = snap.today; const md = birdCountDay(snap.c.region);
  const thisYr = +T.slice(0, 4); const def = T >= `${thisYr}-${md}` ? thisYr : thisYr - 1;
  const year = +(remember(snap.lid, "birdYear") || def); const date = `${year}-${md}`;
  const calc = birdRegister(snap.c, year); const saved = snap.data.birdRegisterReturns.filter((x) => +x.year === year);
  const can = canWrite(snap.role, "birdRegisterReturns"); const hn = (id) => snap.data.houses.find((h) => h.id === id)?.name || "House";
  return html`<div>${backLink(L("layers-paperwork"), "Paperwork")}${largeTitle("Bird Register — 1 June", "NI Bird Register return (NISRA), per establishment number")}
    <div class="ly-segs" role="radiogroup" aria-label="Year">${[thisYr - 1, thisYr, thisYr + 1].filter((y) => y <= thisYr || T >= `${thisYr}-05-01`).map((y) => html`<button type="button" class="chip" role="radio" aria-checked="${y === year}" data-year="${y}">${y}</button>`)}</div>
    <p class="ly-cap" style="margin:8px 4px 0">${RULES.inventories.NI.birds.text}. Count date ${d3(date)}${date > T ? " — the figures below are a forecast from today's flocks" : " — filled from your daily sheets"}.</p>
    ${calc.map((e) => { const s = saved.find((x) => x.establishmentNo === e.establishmentNo); const birds = s?.birds || e.birds;
      return html`<div class="section" data-est="${e.establishmentNo}" data-y="${year}">${groupLabel(`Establishment ${e.establishmentNo}`, s?.submittedOn ? pill("ok", `Sent ${d3(s.submittedOn)}`) : s ? pill("info", "Saved") : pill("due", "Not sent"))}
        <div class="form-group" ${raw(can ? "" : "inert")}>${Object.keys(e.birds).map((id) => html`<div class="field"><label>${hn(id)}<small class="ly-lsub">${n0(e.birds[id])} on the daily sheets</small></label><input data-h="${id}" inputmode="numeric" type="number" value="${birds[id] ?? e.birds[id]}"></div>`)}</div>
        <div class="card" style="padding:0;margin-top:8px"><div class="ly-stat"><span class="k">Total birds</span><span class="v" data-total>${n0(Object.keys(e.birds).reduce((t, id) => t + (+(birds[id] ?? e.birds[id]) || 0), 0))}</span></div></div>
        ${can ? html`<div class="ly-acts"><button type="button" class="btn secondary" data-save>Save</button>${s?.submittedOn ? "" : html`<button type="button" class="btn" data-sent>${raw(icon("check"))}Mark as sent</button>`}</div>` : ""}</div>`; })}
    <p class="ly-cap">Establishment numbers come from each house (Houses and flocks), or the farm one in settings. Kept as a record each year.</p></div>`;
}
