// More → Houses and flocks (design/14 §12, §13, §14): every house with its system, size and
// flock state (tap to edit: name, system digit, producer code, establishment no., space, range,
// trap grid), Add a house, Place a flock in an empty house, and every flock — in lay, planned
// and past — with a link to its curve and passport.
import { html, raw } from "../../../core/html.js";
import { icon } from "../../../ui/icons.js";
import { canWrite } from "../../../core/policy.js";
import { largeTitle, backLink, groupLabel, emptyState } from "../../../screens/common.js";
import { liveScreen, flowArg } from "./live.js";
import { dm, n0, pill, linkRow } from "../ui.js";
import { sortedHouses, flockIn, plannedFlock, weekOfAge, aliveAt } from "../model/flock.js";
import { standardFor } from "../model/standards.js";
import { systemName } from "../model/house.js";

export default async function setup(ctx) {
  return liveScreen(ctx, { title: "Houses and flocks", tab: "more", paint });
}

function paint(snap) {
  const L = (h) => `#/l/${snap.lid}/${h}`; const c = snap.c; const T = snap.today;
  const hs = sortedHouses(c); const canH = canWrite(snap.role, "houses"); const canF = canWrite(snap.role, "flocks");
  const back = backLink(L("more"), "More");
  if (!hs.length) return html`<div>${back}${largeTitle("Houses and flocks")}${emptyState({ sector: "layers", title: "Add your first house", body: "Tell us the house name, system and how many hens it holds. Your daily sheet starts from here.", action: canH ? "Add a house" : null, actAttr: 'data-flow="house"' })}</div>`;
  const flocks = [...snap.data.flocks].sort((a, b) => b.placedDate.localeCompare(a.placedDate));
  const hn = (id) => hs.find((h) => h.id === id)?.name || "";
  const state = (f) => (f.placedDate > T ? pill("info", "Next") : f.depopDate && f.depopDate <= T ? pill("info", "Past") : pill("ok", `wk ${weekOfAge(f, T)}`));
  return html`<div>${back}${largeTitle("Houses and flocks", `${hs.length} house${hs.length === 1 ? "" : "s"}${snap.s.packer ? ` · ${snap.s.packer}` : ""}`)}
    <div class="section">${groupLabel("Houses")}<div class="list">${hs.map((h) => { const f = flockIn(c, h.id); const nx = plannedFlock(c, h.id);
      const sub = [systemName(h.system), h.producerCode, h.places ? `${n0(h.places)} places` : null, f ? `${n0(aliveAt(c, f, T))} hens` : nx ? `empty · next flock ${dm(nx.placedDate)}` : "empty"].filter(Boolean).join(" · ");
      return canH ? html`<button type="button" class="row" data-flow="house" data-arg='${flowArg({ id: h.id })}'><span class="tile">${raw(icon("house"))}</span><span class="main"><span class="primary">${h.name}</span><span class="secondary">${sub}</span></span>${raw(icon("edit"))}</button>`
        : linkRow(L(`house/${h.id}`), h.name, sub, "", "house"); })}</div>
      ${canH ? html`<button type="button" class="btn secondary" style="margin-top:8px" data-flow="house">${raw(icon("plus"))}Add a house</button>` : ""}</div>
    ${canF ? (() => { const empty = hs.filter((h) => !flockIn(c, h.id) && !plannedFlock(c, h.id)); return empty.length ? html`<div class="section">${groupLabel("Empty houses")}${empty.map((h) => html`<button type="button" class="btn" style="margin-bottom:8px" data-flow="place" data-arg='${flowArg({ houseId: h.id })}'>Place a flock in ${h.name}</button>`)}</div>` : ""; })() : ""}
    <div class="section">${groupLabel("Flocks", flocks.length)}<div class="list">${flocks.map((f) => linkRow(L(`flock/${f.id}`), `${hn(f.houseId)} · ${standardFor(f.breedStdId).breed}`, `Placed ${dm(f.placedDate)} ${f.placedDate.slice(0, 4)} · ${n0(f.placed)}${f.depopDate ? ` · out ${dm(f.depopDate)} ${f.depopDate.slice(0, 4)}` : f.plannedDepop ? ` · depop wk ${weekOfAge(f, f.plannedDepop)}` : ""}`, state(f), "chart"))}</div></div>
    <div class="section"><div class="list">${linkRow(L("import"), "Import from your house controller", "Water, temperature and feed from a CSV", "", "download")}${linkRow(L("layers-settings"), "Layers settings", "Packer, alert rules, phone numbers", "", "settings")}</div></div>
  </div>`;
}
