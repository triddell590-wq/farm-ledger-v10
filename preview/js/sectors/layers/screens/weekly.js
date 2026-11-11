// Weekly KPIs for a flock (design/14 §5.3): one row per week, newest first —
// wk · hen-day % · std · egg wt · feed g/b/d · water L/1000 · deaths · cum mort % · seconds % · floor eggs.
// Export CSV; print "Flock weekly sheet".
import { html } from "../../../core/html.js";
import { largeTitle, backLink } from "../../../screens/common.js";
import { liveScreen } from "./live.js";
import { dm, n0, n1, table, okCard, docButtons } from "../ui.js";
import { weekly } from "../model/flock.js";
import { standardFor } from "../model/standards.js";
import { weeklySheet } from "../model/registers.js";

export default async function weeklyScreen(ctx) {
  const id = ctx.match.groups.id;
  return liveScreen(ctx, { title: "Weekly figures", tab: "flock", paint: (snap) => {
    const f = snap.data.flocks.find((x) => x.id === id); const back = backLink(`#/l/${snap.lid}/${f ? `flock/${f.id}` : "flock"}`, "Flock");
    if (!f) return html`<div>${back}${largeTitle("Flock not found")}</div>`;
    const h = snap.data.houses.find((x) => x.id === f.houseId); const rows = weekly(snap.c, f);
    const std = standardFor(f.breedStdId);
    const cell = (v, d = 1) => (v == null ? "—" : n1(v, d));
    return html`<div>${back}${largeTitle("Weekly figures", `${h?.name || ""} · ${std.breed} · placed ${dm(f.placedDate)}`)}
      ${rows.length ? html`<div class="section">${table([["Wk"], ["Lay %", "n"], ["Std", "n"], ["Egg g", "n"], ["Feed g", "n"], ["Water", "n"], ["Dead", "n"], ["Cum %", "n"], ["Sec %", "n"], ["Floor", "n"]],
        rows.map((w) => [w.wk, w.henDay == null ? "—" : html`<span class="${w.std && w.std[1] && w.henDay < w.std[0] ? "ly-ink-due" : ""}">${n1(w.henDay)}</span>`, w.std && w.std[1] ? `${n0(w.std[0])}–${n0(w.std[1])}` : "—", cell(w.eggWt), w.feedG ?? "—", w.waterPer1000 ?? "—", n0(w.deaths), cell(w.cumMort, 2), cell(w.secondsPct), n0(w.floor)]), { cls: "ly-wide" })}
        <p class="ly-cap">Water is litres per 1,000 birds a day; feed is grams per bird a day. Standard: ${std.edition}.</p></div>
        <div data-docs></div>` : okCard("Weekly figures appear after the first week of daily sheets.")}</div>`;
  }, after: (node, snap) => { const f = snap.data.flocks.find((x) => x.id === id); const s = node.querySelector("[data-docs]"); if (f && s) s.replaceWith(docButtons(() => weeklySheet(snap.c, f), { label: "Print the weekly sheet" })); } });
}
