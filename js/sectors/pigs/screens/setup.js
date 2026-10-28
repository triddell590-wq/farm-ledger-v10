// Rooms, bins and semen (design/13 §5.1, §9 feed bins, §7.2 semen stock) and "Import sows"
// (§14): houses and rooms once — then the week, the room board and every batch build from them.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { toast } from "../../../ui/toast.js";
import { canWrite } from "../../../core/policy.js";
import { largeTitle, backLink, groupLabel } from "../../../screens/common.js";
import { liveScreen, flowArg } from "./live.js";
import { d2, plural } from "../ui.js";
import { KINDS, KIND_NAME, sortRooms } from "../model/rooms.js";
import { saveSow } from "../actions.js";

export default async function setup(ctx) {
  const what = ctx.match.groups.what;
  return liveScreen(ctx, { title: "Rooms, bins and semen", tab: "rooms", paint: (snap) => {
    const lid = snap.lid; const can = canWrite(snap.role, "rooms");
    if (what === "sows") return importHtml(snap);
    const rooms = snap.data.rooms.slice().sort(sortRooms);
    const show = (k) => !what || what === k;
    return html`<div>${backLink(`#/l/${lid}/rooms`, "Rooms")}${largeTitle("Rooms, bins and semen", `${plural(rooms.length, "room")} · ${plural(snap.data.bins.length, "bin")}`)}
      ${show("rooms") ? html`<div class="section">${groupLabel("Rooms", "in the order the pigs move")}<div class="list">${rooms.length ? rooms.map((r) => html`<button type="button" class="row" ${raw(can ? `data-flow="room" data-arg='${flowArg({ id: r.id })}'` : "")}><span class="tile">${raw(icon("house"))}</span><span class="main"><span class="primary">${r.name}</span><span class="secondary">${[KIND_NAME[r.kind], r.house, r.kind === "farrowing" ? plural(r.crates || 0, "crate") : r.pens?.length ? `${plural(r.pens.length, "pen")}${r.pens[0]?.areaM2 ? ` × ${r.pens[0].areaM2} m²` : " · no pen area"}` : null, r.places ? `${r.places} places` : null].filter(Boolean).join(" · ")}</span></span>${can ? html`<span class="text-btn">Edit</span>` : ""}</button>`) : html`<div class="row no-lead"><span class="main"><span class="secondary">No rooms yet. Start with the room you use most.</span></span></div>`}</div>
        ${can ? html`<button type="button" class="btn" style="margin-top:12px" data-flow="room">${raw(icon("plus"))}Add a room</button>` : ""}
        ${!rooms.length && can ? html`<button type="button" class="btn secondary" style="margin-top:8px" data-starter>Add a starter set (${snap.s.breeding ? "service, farrowing, weaner, finisher" : "two finisher rooms"})</button>` : ""}</div>` : ""}
      ${show("bins") ? html`<div class="section">${groupLabel("Feed bins")}<div class="list">${snap.data.bins.length ? snap.data.bins.map((b) => html`<button type="button" class="row" ${raw(can ? `data-flow="bin" data-arg='${flowArg({ id: b.id })}'` : "")}><span class="tile">${raw(icon("feed"))}</span><span class="main"><span class="primary">${b.name}</span><span class="secondary">${[b.capacityT ? `${b.capacityT} t` : null, b.ration, (b.roomIds || []).map((id) => snap.ix.rooms.get(id)?.name).filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</span></span></button>`) : html`<div class="row no-lead"><span class="main"><span class="secondary">No bins yet — add them to see days of feed left.</span></span></div>`}</div>
        ${can ? html`<button type="button" class="btn secondary" style="margin-top:12px" data-flow="bin">${raw(icon("plus"))}Add a feed bin</button>` : ""}</div>` : ""}
      ${show("semen") && snap.s.breeding ? html`<div class="section">${groupLabel("Semen stock")}<div class="list">${snap.data.semen.length ? snap.data.semen.slice().sort((a, b) => String(a.expiry || "").localeCompare(String(b.expiry || ""))).map((x) => html`<div class="row no-lead"><span class="main"><span class="primary">Boar ${x.boar}${x.batch ? " · " + x.batch : ""}</span><span class="secondary">${x.doses} doses left${x.expiry ? ` · use by ${d2(x.expiry)}` : ""}${x.supplier ? " · " + x.supplier : ""}</span></span></div>`) : html`<div class="row no-lead"><span class="main"><span class="secondary">No semen in stock.</span></span></div>`}</div>
        ${canWrite(snap.role, "semen") ? html`<button type="button" class="btn secondary" style="margin-top:12px" data-flow="semen">${raw(icon("plus"))}Semen delivery</button>` : ""}</div>` : ""}</div>`;
  }, after: (node, snap) => {
    const st = node.querySelector("[data-starter]"); if (st) st.onclick = async () => {
      const { saveRoom } = await import("../actions.js");
      const set = snap.s.breeding ? [["Service house", "Service 1", "service", { places: 40, pens: 4, penArea: 25 }], ["Farrowing house", "Farrowing 1", "farrowing", { crates: snap.s.farrowingPlaces || 24 }], ["Weaner house", "Weaner 1", "weaner", { places: 300, pens: 6, penArea: 15 }], ["Finishing house", "Finisher 1", "finisher", { places: 400, pens: 8, penArea: 33 }]]
        : [["Finishing house", "Finisher 1", "finisher", { places: 400, pens: 8, penArea: 33 }], ["Finishing house", "Finisher 2", "finisher", { places: 400, pens: 8, penArea: 33 }]];
      for (const [house, name, kind, x] of set) saveRoom(snap, { house, name, kind, ...x });
      toast(`${set.length} rooms added — change their sizes to match yours`);
    };
    const imp = node.querySelector("[data-import]"); if (imp) imp.onclick = () => {
      const rows = parseSows(node.querySelector("[data-text]").value); if (!rows.length) { toast("Nothing to import — one sow per line."); return; }
      const have = new Set(snap.data.sows.map((s) => String(s.sowNo)));
      const fresh = rows.filter((r) => !have.has(r.sowNo)); fresh.forEach((r) => saveSow(snap, r));
      toast(`${fresh.length} imported${rows.length - fresh.length ? ` · ${rows.length - fresh.length} already in the herd` : ""}`); location.hash = `#/l/${snap.lid}/sows`;
    };
  } });
}

/** "1187, UK NI1234 01187, 4" or tab-separated — sow number, tag, parity, type (sow/gilt/boar). */
export function parseSows(text) {
  return String(text || "").split(/\r?\n/).map((l) => l.split(/[,;\t]/).map((x) => x.trim())).filter((c) => c[0] && /\d/.test(c[0]) && !/^sow/i.test(c[0])).map((c) => {
    const parity = c.slice(1).find((x) => /^\d{1,2}$/.test(x)); const tag = c.slice(1).find((x) => /[A-Z]{2}/i.test(x) && /\d{3,}/.test(x)); const type = c.slice(1).find((x) => /^(sow|gilt|boar)$/i.test(x));
    return { sowNo: c[0], tag: tag || "", parityAtEntry: parity ? +parity : undefined, type: type ? type.toLowerCase() : parity === "0" ? "gilt" : "sow" };
  });
}
function importHtml(snap) {
  return html`<div>${backLink(`#/l/${snap.lid}/sows`, "Sows")}${largeTitle("Import sows", "Paste from a spreadsheet or your old sow cards")}
    <p class="pg-note">One sow per line: <b>sow number, ear tag, parity</b> (and “gilt” or “boar” if it is one). Commas or tabs both work. Sows already in the herd are skipped.</p>
    <div class="form-group" style="margin-top:12px"><div class="field stacked"><label for="pg-imp">Sows</label><textarea id="pg-imp" rows="10" data-text placeholder="1187, UK NI1234 01187, 4&#10;0932, UK NI1234 00932, 6&#10;1301, UK NI1234 01301, 0, gilt"></textarea></div></div>
    ${canWrite(snap.role, "sows") ? html`<button type="button" class="btn" style="margin-top:12px" data-import>Import</button>` : ""}</div>`;
}
export { KINDS };
