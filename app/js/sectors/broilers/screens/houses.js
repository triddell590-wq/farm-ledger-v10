// Houses (design/15 §14 houses, §15): each house's usable floor area (drives the density planner),
// heating, establishment number (for the FCI and the 1 June Bird Register) and what's in it now.
// Controller import lives here too (Maximus etc. CSV → readings that pre-fill the checks).
import { html, raw } from "../../../core/html.js";
import { icon } from "../../../ui/icons.js";
import { canWrite } from "../../../core/policy.js";
import { largeTitle, groupLabel, backLink, emptyState } from "../../../screens/common.js";
import { liveScreen, flowArg } from "./live.js";
import { n0, dm, note, lawNote } from "../ui.js";
import { houseState, STAGES, listOf } from "../model/crop.js";

const HEAT = { gas: "Gas / LPG", biomass: "Biomass", heatpump: "Heat pump", other: "Other heating" };

export default async function houses(ctx) {
  return liveScreen(ctx, { title: "Houses", tab: "more", paint });
}

function paint(snap) {
  const { ix, s, today, lid } = snap; const L = (h) => `#/l/${lid}/${h}`; const can = canWrite(snap.role, "houses");
  const back = backLink(L("more"), "More");
  if (!ix.houses.length) return html`<div>${back}${largeTitle("Houses")}${emptyState({ sector: "broilers", title: "Add your houses", body: "Each house needs its usable floor area — it drives the density planner.", action: can ? "Add a house" : null, actAttr: `data-flow="house"` })}</div>`;
  const area = ix.houses.reduce((t, h) => t + (+h.usableM2 || 0), 0);
  const readings = snap.data.controllerReadings || [];
  return html`<div>${back}${largeTitle("Houses", `${ix.houses.length} house${ix.houses.length > 1 ? "s" : ""} · ${n0(area)} m² usable`)}
    <div class="list">${ix.houses.map((h) => { const st = houseState(ix, h, s, today); const crops = listOf(ix.cropsByHouse, h.id).length; const r = readings.filter((x) => x.houseId === h.id).map((x) => x.date).sort().pop();
      const where = st.stage === "growing" || st.stage === "brooding" ? `crop ${st.crop?.no || ""} · day ${st.day}` : STAGES[st.stage].toLowerCase();
      const inner = html`<span class="tile">${raw(icon("house"))}</span><span class="main"><span class="primary">${h.name}</span><span class="secondary">${n0(h.usableM2)} m² usable · ${HEAT[h.heating] || "heating not set"} · ${where}</span><span class="secondary">${h.establishmentNo ? `Establishment ${h.establishmentNo}` : "No establishment number"} · ${crops} crop${crops === 1 ? "" : "s"} recorded${r ? ` · controller to ${dm(r)}` : ""}</span></span>`;
      return can ? html`<button type="button" class="row" data-flow="house" data-arg="${flowArg({ houseId: h.id })}">${inner}<span class="chev">${raw(icon("edit"))}</span></button>` : html`<div class="row">${inner}</div>`; })}</div>
    ${can ? html`<div class="br-acts br-acts2"><button type="button" class="btn secondary" data-flow="house">${raw(icon("plus"))}Add a house</button><button type="button" class="btn secondary" data-flow="controller">${raw(icon("download"))}Controller file</button></div>` : ""}
    ${lawNote("Usable area is the floor the birds can use — the legal limits (33 / 39 / 42 kg/m²) are kg of live bird per m² of usable floor.")}
    ${note(`Bird Register no. ${s.registerNo || "— (Broiler settings)"} · the establishment number goes on the FCI and the 1 June count.`)}
    ${s.freeRange ? note("Free-range: log range access (at least 8 hours a day) on the PM check notes.") : ""}</div>`;
}
export { groupLabel };
