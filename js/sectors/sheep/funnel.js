// The lamb funnel in full (design/11 §5.5): one crop, last year as a ghost bar, and each step
// taps to the records behind it.
import { html } from "../../core/html.js";
import { addDays } from "../../core/dates.js";
import { largeTitle, backLink, groupLabel, emptyState } from "../../screens/common.js";
import { segmented, wireForm } from "../../ui/form.js";
import { liveScreen } from "./screen.js";
import { funnelView, kvRows, short, num } from "./ui.js";
import { cycleFor } from "./model/year.js";
import { shownFunnel, scanTotals, cropLambings, lambDeaths, lambDate } from "./model/lambing.js";
import { countsAt } from "./model/mobs.js";

const LS = "fl10-sheep-funnel-ghost";
export default async function funnelScreen(ctx) {
  const step = ctx.match?.groups?.step;
  return liveScreen(ctx, { title: "Lamb funnel", tab: "year", paint: (snap) => {
    const prevCy = cycleFor(snap.s, addDays(snap.cy.ramsIn, -1), snap.data.events);
    const olderCy = cycleFor(snap.s, addDays(prevCy.ramsIn, -1), snap.data.events);
    const sf = shownFunnel(snap.data, snap.cy, prevCy, snap.today, olderCy); const f = sf.main; const g = sf.other;
    let ghost = false; try { ghost = localStorage.getItem(LS) === "1"; } catch (e) { /* blocked */ }
    const lines = step ? behind({ ...snap, cy: sf.mainCy }, step) : null;
    return html`<div>${backLink(`#/l/${snap.lid}/year`, "Sheep year")}${largeTitle(`${f.crop} crop`, "Every step is a count; losses are worked out between steps")}
      <div style="margin:4px 0 12px">${!g.enough ? html`<p class="hint" style="margin:0 4px">No ${g.crop} crop recorded to compare with.</p>` : segmented("ghost", [{ value: "0", label: `${f.crop} only` }, { value: "1", label: `Compare with ${g.crop}` }], ghost ? "1" : "0")}</div>
      ${f.enough ? funnelView(f, { ghost: ghost && g.enough ? g : null, lid: snap.lid }) : emptyState({ sector: "sheep", title: "Not enough to show yet", body: "The funnel fills as you record rams in, scanning, lambing and weaning." })}
      ${ghost && g.enough ? html`<p class="foot-note">Dashed outline: ${g.crop} crop (${g.steps.map((s) => (s.n == null ? "–" : num(s.n))).join(" → ")}).</p>` : ""}
      <p class="source">Scanning % = lambs scanned ÷ ewes to the ram. Lambing % = born alive ÷ ewes to the ram. Weaning % = weaned ÷ ewes to the ram (Research C §4, DAERA).</p>
      ${lines ? html`<div class="section">${groupLabel(lines.title, lines.rows.length)}${lines.rows.length ? kvRows(lines.rows) : html`<div class="card pad t-callout ink-2">Nothing recorded for this step yet.</div>`}</div>` : ""}</div>`;
  }, after: (node) => { const f = wireForm(node); f.onChange(() => { try { localStorage.setItem(LS, f.values().ghost); } catch (e) { /* blocked */ } location.hash = location.hash; dispatchEvent(new HashChangeEvent("hashchange")); }); } });
}
function behind(snap, step) {
  const { data, cy } = snap; const name = (id) => data.mobs.find((m) => m.id === id)?.name || "Mob";
  if (step === "ewes") { const c = countsAt(data, cy.ramsIn); return { title: "Ewes to the ram", rows: data.mobs.filter((m) => ["ewes", "ewesWithLambs"].includes(m.class)).map((m) => [m.name, num(c.get(m.id) || snap.counts.get(m.id) || 0)]) }; }
  if (step === "scanned") return { title: "Scan results", rows: scanTotals(data, cy).events.map((e) => [name(e.mobId), `${(+e.counts.single || 0) + 2 * (+e.counts.twin || 0) + 3 * (+e.counts.triplet || 0)} lambs`, "", short(e.date)]) };
  if (step === "born") return { title: "Lambings", rows: cropLambings(data, cy).map((l) => [`${short(lambDate(l))} · ${l.eweTag || l.mobName || "Ewe"}`, l.aborted ? "aborted" : `${(l.lambs || []).filter((x) => x.alive).length} alive`]) };
  if (["at48", "out"].includes(step)) return { title: "Lamb deaths", rows: lambDeaths(data, cy).map((d) => [`${short(d.date)} · ${d.cause}`, `${d.number || 1}`, "late", d.ageBand]) };
  if (step === "weaned") return { title: "Weaning counts", rows: data.events.filter((e) => e.kind === "wean").map((e) => [name(e.mobId), num(e.counts.weaned), "", short(e.date)]) };
  if (step === "sold") return { title: "Lambs sold", rows: data.movements.filter((m) => m.kind === "off" && m.lambs && m.crop === cy.crop).map((m) => [m.otherName || m.dest, num(m.count), "", short(m.date)]) };
  return null;
}
