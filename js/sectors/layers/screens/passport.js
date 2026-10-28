// Flock passport (design/14 §5.4, Lion): rearer and establishment no., hatch date, breed,
// placement date and number, vaccinations (S. Enteritidis and S. Typhimurium required by Lion),
// feed source (UFAS), medicines, movements and Salmonella results. Print / share as PDF to the packer.
import { html, raw } from "../../../core/html.js";
import { icon } from "../../../ui/icons.js";
import { canWrite } from "../../../core/policy.js";
import { largeTitle, backLink, groupLabel } from "../../../screens/common.js";
import { liveScreen, flowArg } from "./live.js";
import { dm, d3, n0, pill, kvRows, okCard, table, docButtons } from "../ui.js";
import { weekOfAge, dateAtWeek } from "../model/flock.js";
import { standardFor } from "../model/standards.js";
import { passportDoc } from "../model/registers.js";

export default async function passport(ctx) {
  const id = ctx.match.groups.id;
  return liveScreen(ctx, { title: "Flock passport", tab: "flock", paint: (snap) => paint(snap, id), after: (node, snap) => {
    const f = snap.data.flocks.find((x) => x.id === id); const slot = node.querySelector("[data-print]");
    if (f && slot) slot.replaceWith(docButtons(() => passportDoc(snap.c, f), { csv: false, label: "Print or PDF for the packer" }));
  } });
}

function paint(snap, id) {
  const L = (h) => `#/l/${snap.lid}/${h}`; const c = snap.c;
  const f = snap.data.flocks.find((x) => x.id === id);
  const back = backLink(L(f ? `flock/${f.id}` : "flock"), "Flock");
  if (!f) return html`<div>${back}${largeTitle("Flock not found")}</div>`;
  const h = snap.data.houses.find((x) => x.id === f.houseId); const std = standardFor(f.breedStdId);
  const vacc = snap.data.vaccinations.filter((v) => v.flockId === f.id).sort((a, b) => String(a.date || dateAtWeek(f, +a.plannedWk || 0)).localeCompare(String(b.date || dateAtWeek(f, +b.plannedWk || 0))));
  const has = (re) => vacc.some((v) => v.date && re.test(v.disease || ""));
  const se = has(/enteritidis/i), stm = has(/typhimurium/i);
  const meds = snap.data.medicines.filter((m) => m.flockId === f.id || (!m.flockId && m.houseId === f.houseId && m.date >= f.placedDate)).sort((a, b) => b.date.localeCompare(a.date));
  const moves = snap.data.birdMoves.filter((m) => m.flockId === f.id).sort((a, b) => a.date.localeCompare(b.date));
  const salm = snap.data.salmSamples.filter((x) => x.flockId === f.id).sort((a, b) => b.date.localeCompare(a.date));
  const canV = canWrite(snap.role, "vaccinations"); const canF = canWrite(snap.role, "flocks");
  return html`<div>${back}${largeTitle("Flock passport", `${h?.name || ""} · ${std.breed} · placed ${dm(f.placedDate)}`)}
    <div class="section">${kvRows([
      ["Rearer", f.rearer || "—", f.rearer ? "" : "due", null, f.rearerEst ? `Establishment no. ${f.rearerEst}` : "Add the rearer's establishment number"],
      ["Hatch date", f.hatchDate ? d3(f.hatchDate) : "—"],
      ["Breed", std.breed],
      ["Placed", `${d3(f.placedDate)} · ${n0(f.placed)} pullets`, null, null, `${f.ageAtPlacement ?? weekOfAge(f, f.placedDate)} weeks old`],
      ["Feed", f.feedSource || "—", f.feedSource ? "" : "due", null, "Mill and UFAS assurance"],
      ["Planned depop", f.plannedDepop ? `${dm(f.plannedDepop)} · wk ${weekOfAge(f, f.plannedDepop)}` : "—"],
      f.depopDate ? ["Depopulated", `${d3(f.depopDate)} · ${n0(f.numberOut)} out`, null, null, f.destination || ""] : null,
    ])}${canF ? html`<button type="button" class="btn secondary" style="margin-top:8px" data-flow="editFlock" data-arg='${flowArg({ id: f.id })}'>${raw(icon("edit"))}Edit rearer, hatch and feed</button>` : ""}</div>

    <div class="section">${groupLabel("Vaccinations", html`${se && stm ? pill("ok", "S.E. + S.T. done") : pill("due", "S.E./S.T. missing")}`)}
      ${!se || !stm ? html`<div class="ly-banner due" style="margin-bottom:8px">${raw(icon("alert"))}<span>Lion needs every flock vaccinated against S. Enteritidis and S. Typhimurium. Add the doses from the rearer's certificate.</span></div>` : ""}
      ${vacc.length ? html`<div class="list">${vacc.map((v) => html`<button type="button" class="row no-lead" ${raw(canV ? `data-flow="vacc" data-arg='${flowArg({ flockId: f.id, id: v.id })}'` : "disabled")}><span class="main"><span class="primary">${v.disease}${v.dose ? ` · ${v.dose.toLowerCase()}` : ""}</span><span class="secondary">${v.date ? `${d3(v.date)} · wk ${weekOfAge(f, v.date)}` : `Planned wk ${v.plannedWk} · ${dm(dateAtWeek(f, +v.plannedWk))}`}${v.product ? ` · ${v.product}` : ""}${v.batch ? ` · batch ${v.batch}` : ""} · ${v.source === "rearer" ? "rearer certificate" : "on farm"}</span></span>${v.date ? "" : pill("due", "Planned")}</button>`)}</div>` : okCard("No vaccinations recorded. Copy them from the rearer's certificate.")}
      ${canV ? html`<button type="button" class="btn secondary" style="margin-top:8px" data-flow="vacc" data-arg='${flowArg({ flockId: f.id })}'>${raw(icon("plus"))}Add a vaccination</button>` : ""}</div>

    <div class="section">${groupLabel("Medicines", meds.length || "")}${meds.length ? table([["Date"], ["Product"], ["Eggs OK"], ["Meat OK"]], meds.map((m) => [dm(m.date), m.productName || "", m.eggsOkFrom ? dm(m.eggsOkFrom) : "no hold", m.meatOkFrom ? dm(m.meatOkFrom) : "no hold"])) : okCard("No treatments for this flock.")}</div>
    <div class="section">${groupLabel("Movements")}${moves.length ? table([["Date"], ["In/out"], ["Birds", "n"], ["To / from"]], moves.map((m) => [dm(m.date), m.direction === "in" ? (m.kind === "placement" ? "Pullets in" : "In") : m.kind === "depop" ? "Spent hens out" : "Out", n0(m.n), m.est || ""])) : okCard("No movements recorded.")}</div>
    <div class="section">${groupLabel("Salmonella results", html`<a class="text-btn" href="${L(`salmonella/${f.id}`)}">Open</a>`)}${salm.length ? table([["Date"], ["Sampler"], ["Result"]], salm.map((x) => [dm(x.date), x.sampler === "official" ? "Official" : "Operator", x.result || "Awaiting"])) : okCard("No samples yet.")}</div>
    <div class="section"><div data-print></div><p class="ly-cap">The packer receives the passport as a PDF — they don't need an account.</p></div>
  </div>`;
}
