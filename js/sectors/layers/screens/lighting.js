// More → Lighting programme (design/14 §8.3): per flock, an editable table by week of age (hours
// of light, on/off times) from the breed guide; the hours now, the next step (it also appears in
// To do today), and a welfare check that the dark period stays at least 8 hours.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { openSheet } from "../../../ui/sheet.js";
import { toast } from "../../../ui/toast.js";
import { canWrite } from "../../../core/policy.js";
import { largeTitle, backLink, groupLabel, emptyState } from "../../../screens/common.js";
import { liveScreen } from "./live.js";
import { dm, table, okCard } from "../ui.js";
import { sortedHouses, flockIn, weekOfAge, dateAtWeek } from "../model/flock.js";
import { lightPlan, hoursAt, nextLightStep, darkWarning } from "../model/house.js";
import { standardFor } from "../model/standards.js";
import { saveLightPlan } from "../actions.js";

export default async function lighting(ctx) {
  return liveScreen(ctx, { title: "Lighting", tab: "more", paint, after: (node, snap) => {
    node.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => { const f = snap.data.flocks.find((x) => x.id === b.dataset.edit); if (f) editPlan(snap, f); }));
  } });
}

function paint(snap) {
  const L = (h) => `#/l/${snap.lid}/${h}`; const c = snap.c; const T = snap.today;
  const live = sortedHouses(c).map((h) => ({ h, f: flockIn(c, h.id) })).filter((x) => x.f);
  const back = backLink(L("more"), "More");
  if (!live.length) return html`<div>${back}${largeTitle("Lighting programme")}${emptyState({ sector: "layers", title: "No flock in your houses", body: "A lighting programme belongs to a flock. Place a flock and its plan starts from the breed guide.", action: null })}</div>`;
  const can = canWrite(snap.role, "lightPlans");
  return html`<div>${back}${largeTitle("Lighting programme", "Hours of light by week of age")}
    ${live.map(({ h, f }) => {
      const plan = lightPlan(c, f); const wk = weekOfAge(f, T); const now = hoursAt(plan, wk); const nx = nextLightStep(c, f, T, 28);
      const dark = darkWarning(plan); const after = plan.weeks.find((p) => p.wk > wk);
      return html`<div class="section">${groupLabel(`${h.name} · week ${wk}`, standardFor(f.breedStdId).breed)}
        <div class="card" style="padding:0">
          <div class="ly-stat"><span class="k">Hours of light now<small>${now != null ? `${24 - now} h dark` : "Before the first step"}</small></span><span class="v">${now ?? "—"} h</span></div>
          <div class="ly-stat"><span class="k">Next step<small>${nx ? `${dm(nx.date)} · week ${nx.wk}` : after ? `week ${after.wk}` : "Holds until depop"}</small></span><span class="v">${nx ? `${nx.from ?? "—"} → ${nx.hours} h` : "—"}</span></div></div>
        ${dark.length ? html`<div class="ly-banner due" style="margin-top:8px">${raw(icon("alert"))}<span>Dark period under 8 hours from week ${dark[0]}. Hens need an uninterrupted dark period of about a third of the day.</span></div>` : ""}
        ${table([["Week"], ["From"], ["Hours", "n"], ["On"], ["Off"]], plan.weeks.map((p) => [html`<span class="${p.wk <= wk && (plan.weeks.find((q) => q.wk > p.wk)?.wk ?? 999) > wk ? "ly-ink-ok" : ""}">${p.wk}</span>`, dm(dateAtWeek(f, p.wk)), p.hours, p.on || "—", p.off || "—"]))}
        ${plan.template ? html`<p class="ly-cap">This is a starting template, not your breed guide. Copy your guide's programme in with Edit.</p>` : ""}
        ${can ? html`<button type="button" class="btn secondary" style="margin-top:8px" data-edit="${f.id}">${raw(icon("edit"))}Edit ${h.name} programme</button>` : ""}</div>`;
    })}
    ${okCard("Steps show in To do today a few days before they are due.")}</div>`;
}

function editPlan(snap, f) {
  const plan = lightPlan(snap.c, f); let rows = plan.weeks.map((p) => ({ ...p }));
  const body = el(html`<div><p class="ly-sub">Week of age, hours of light, and the clock times if you use them.</p><div data-rows></div>
    <button type="button" class="btn secondary" data-add style="margin-top:8px">${raw(icon("plus"))}Add a step</button></div>`);
  const draw = () => {
    const box = body.querySelector("[data-rows]");
    box.replaceChildren(el(html`<div class="form-group">${rows.map((r, i) => html`<div class="field ly-plan" data-i="${i}">
      <input aria-label="Week" inputmode="numeric" type="number" name="wk" value="${r.wk ?? ""}" placeholder="wk">
      <input aria-label="Hours" inputmode="decimal" type="number" step="0.5" name="hours" value="${r.hours ?? ""}" placeholder="h">
      <input aria-label="Lights on" type="time" name="on" value="${r.on || ""}"><input aria-label="Lights off" type="time" name="off" value="${r.off || ""}">
      <button type="button" class="icon-btn" data-del="${i}" aria-label="Remove step">${raw(icon("trash"))}</button></div>`)}</div>`));
    box.querySelectorAll("[data-i] input").forEach((inp) => (inp.oninput = () => { const i = +inp.closest("[data-i]").dataset.i; rows[i][inp.name] = inp.value; }));
    box.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => { rows.splice(+b.dataset.del, 1); draw(); }));
  };
  draw();
  body.querySelector("[data-add]").onclick = () => { const last = rows[rows.length - 1]; rows.push({ wk: last ? +last.wk + 1 : 17, hours: last ? +last.hours : 10 }); draw(); };
  const btn = el(html`<button type="button" class="btn">Save programme</button>`);
  const sh = openSheet({ title: "Lighting programme", body, footer: btn });
  btn.onclick = () => {
    const weeks = rows.filter((r) => r.wk !== "" && r.hours !== "" && r.wk != null && r.hours != null);
    if (!weeks.length) { toast("Add at least one step"); return; }
    if (weeks.some((r) => +r.hours > 24 || +r.hours < 0)) { toast("Hours of light must be between 0 and 24"); return; }
    saveLightPlan(snap, f, weeks); sh.close(true, { force: true }); toast("Lighting programme saved");
    const short = weeks.filter((r) => 24 - +r.hours < 8);
    if (short.length) setTimeout(() => toast(`Dark period under 8 hours from week ${short[0].wk}`), 1800);
  };
  return sh.done;
}
