// Room sheets: wash-cycle stage (§5.5), enrichment top-up (Red Tractor AH.12), and the set-up
// sheets for rooms (pens, areas, crates), feed bins and semen stock.
import { html } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { textField, checkRow } from "../../../ui/form.js";
import { toast } from "../../../ui/toast.js";
import { entrySheet, chipsField, numField, dateField, lawNote, warn } from "./common.js";
import { washStage, addEnrichment, saveRoom, saveBin, addSemen, undoAdd } from "../actions.js";
import { WASH_WORD, KINDS, penChecks } from "../model/rooms.js";

export function washSheet(snap, { roomId, stage }) {
  const room = snap.ix.rooms.get(roomId);
  if (stage !== "disinfected") { washStage(snap, room, stage); toast(`${room.name}: ${WASH_WORD[stage].toLowerCase()}${stage === "ready" ? " — ready for pigs" : ""}`); return; }
  const body = el(html`<form novalidate><div class="form-group">${textField({ name: "product", label: "Disinfectant", value: room.wash?.product || "", placeholder: "e.g. Virkon S" })}${textField({ name: "dilution", label: "Dilution", value: room.wash?.dilution || "", placeholder: "e.g. 1:100" })}</div>
    ${lawNote("Use a disinfectant approved for the job at the label rate (DAERA approved list).")}</form>`);
  entrySheet({ title: `${room.name} · disinfected`, body, label: "Save", missing: (v) => (v.product ? null : "Add the product"),
    save(v, sh) { washStage(snap, room, "disinfected", { product: v.product, dilution: v.dilution }); sh.close(true, { force: true }); toast(`${room.name}: disinfected`); } });
}

export function enrichSheet(snap, { roomId }) {
  const room = snap.ix.rooms.get(roomId);
  const body = el(html`<form novalidate><div class="form-group">${chipsField("material", "Material", ["Straw", "Hay", "Wood", "Rope", "Hessian", "Peat / compost", "Chew toy", "Rootling material"], [], { multi: true })}${dateField("date", "Date", snap.today)}</div>
    ${lawNote("Pigs must have permanent access to enough material to investigate and manipulate (Red Tractor AH.12).")}</form>`);
  entrySheet({ title: `Enrichment · ${room.name}`, body, label: "Save enrichment", missing: (v) => (v.material?.length ? null : "Choose the material"),
    save(v, sh) { const id = addEnrichment(snap, roomId, { material: v.material.join(" + ").toLowerCase(), date: v.date }); sh.close(true, { force: true }); toast("Enrichment saved", { action: "Undo", onAction: () => undoAdd(snap.lid, "enrichment", id) }); } });
}

/** Add / edit a room: house, name, kind, places, pens and pen area (space calculator), crates. */
export function roomSheet(snap, { id } = {}) {
  const old = id ? snap.ix.rooms.get(id) : null;
  const houses = [...new Set(snap.data.rooms.map((r) => r.house).filter(Boolean))];
  const body = el(html`<form novalidate>
    <div class="form-group">${textField({ name: "name", label: "Room name", value: old?.name || "", placeholder: "Finisher 2" })}${textField({ name: "house", label: "House (alarm tests are per house)", value: old?.house || houses[0] || "", placeholder: "Finishing house" })}</div>
    <div class="form-group">${chipsField("kind", "Room for", KINDS, old?.kind || null)}</div>
    <div class="form-group" data-cr>${numField("crates", "Farrowing crates", old?.crates ?? "", { step: 1 })}</div>
    <div class="form-group" data-pn>${numField("places", "Pig places", old?.places ?? "", { step: 1 })}${numField("pens", "Pens", old?.pens?.length ?? "", { step: 1 })}${numField("penArea", "Floor area per pen (m²)", old?.pens?.[0]?.areaM2 ?? "", { optional: true })}${numField("side", "Shortest pen side (m)", old?.penSide ?? "", { optional: true })}</div>
    <div class="form-group">${checkRow("mechVent", "Mechanical ventilation (weekly alarm test)", old ? old.mechVent !== false : true)}</div>
    <div data-w></div>${lawNote("Pen area is the unobstructed floor. It drives the legal space check (Schedule 8) and the farm-map table for Red Tractor DP.1.1.")}</form>`);
  const es = entrySheet({ title: old ? `Edit ${old.name}` : "Add a room", body, label: old ? "Save room" : "Add room",
    missing: (v) => (!v.name ? "Add the room name" : !v.kind ? "Choose what the room is for" : v.kind === "farrowing" && !+v.crates ? "Add the number of crates" : null),
    save(v, sh) { const rid = saveRoom(snap, v, old); if (+v.side) import("../../../services/records.js").then((R) => R.updateRecord(snap.lid, "rooms", { ...(old || {}), id: rid }, { penSide: +v.side }, { history: false })); sh.close(true, { force: true }); toast(old ? "Room saved" : `${v.name} added`); } });
  const paint = () => { const v = es.form.values(); body.querySelector("[data-cr]").hidden = v.kind !== "farrowing"; body.querySelector("[data-pn]").hidden = v.kind === "farrowing";
    const w = penChecks({ side: v.side === "" ? null : v.side, group: +v.places && +v.pens ? +v.places / +v.pens : 10 }); body.querySelector("[data-w]").replaceChildren(...w.map((t) => el(warn(t)))); };
  es.form.onChange(paint); paint();
}

export function binSheet(snap, { id } = {}) {
  const old = id ? snap.data.bins.find((b) => b.id === id) : null;
  const rooms = snap.data.rooms.filter((r) => !r.deleted).map((r) => [r.id, r.name]);
  const body = el(html`<form novalidate><div class="form-group">${textField({ name: "name", label: "Bin name", value: old?.name || "", placeholder: "Bin 3" })}${numField("capacityT", "Capacity (tonnes)", old?.capacityT ?? "")}${textField({ name: "ration", label: "Ration", value: old?.ration || "", placeholder: "Finisher pellets", optional: true })}${numField("leadDays", "Delivery lead time (days)", old?.leadDays ?? snap.s.leadDays, { step: 1 })}</div>
    <div class="form-group">${chipsField("roomIds", "Feeds these rooms", rooms, old?.roomIds || [], { multi: true })}</div></form>`);
  entrySheet({ title: old ? `Edit ${old.name}` : "Add a feed bin", body, label: old ? "Save bin" : "Add bin", missing: (v) => (v.name ? null : "Add the bin name"),
    save(v, sh) { saveBin(snap, v, old); sh.close(true, { force: true }); toast(old ? "Bin saved" : `${v.name} added`); } });
}

export function semenSheet(snap) {
  const body = el(html`<form novalidate><div class="form-group">${textField({ name: "boar", label: "Boar", placeholder: "77" })}${textField({ name: "batch", label: "Semen batch", optional: true })}${numField("doses", "Doses", "", { step: 1 })}${dateField("expiry", "Use by", "")}${textField({ name: "supplier", label: "Supplier (AI stud)", optional: true })}</div>
    ${lawNote("Semen supplier records are kept for 6 years (Red Tractor TI.7).")}</form>`);
  entrySheet({ title: "Semen delivery", body, label: "Add to stock", missing: (v) => (!v.boar ? "Add the boar" : !+v.doses ? "Add the number of doses" : null),
    save(v, sh) { addSemen(snap, v); sh.close(true, { force: true }); toast(`${v.doses} doses of boar ${v.boar} added`); } });
}
