// Rooms tab — the full room board (design/13 §5.1): every room in the order the pigs flow
// (Service · Dry sow · Farrowing · Weaner · Grower · Finisher · Hospital), each tile with the
// stage, one key number, pigs/places and the space badge. Tap → Room screen.
import { html } from "../../../core/html.js";
import { canWrite } from "../../../core/policy.js";
import { largeTitle, groupLabel, emptyState } from "../../../screens/common.js";
import { liveScreen } from "./live.js";
import { roomTile, plural } from "../ui.js";
import { roomFacts } from "../model/facts.js";
import { KINDS } from "../model/rooms.js";

export default async function rooms(ctx) {
  return liveScreen(ctx, { title: "Rooms", depth: 0, paint: (snap) => {
    const lid = snap.lid; const rf = roomFacts(snap.c);
    if (!rf.length) return html`<div>${largeTitle("Rooms")}${emptyState({ sector: "pigs", title: "Set up your rooms", body: "Add your houses and rooms once. Then the week, the room board and every batch build from them.", action: canWrite(snap.role, "rooms") ? "Add rooms" : null, href: `#/l/${lid}/setup/rooms` })}</div>`;
    const occ = rf.filter((x) => x.pigs > 0 || x.batch); const checked = occ.filter((x) => x.check).length;
    const allEmpty = !occ.length;
    const groups = KINDS.map(([k, name]) => [name, rf.filter((x) => x.room.kind === k)]).filter(([, l]) => l.length);
    return html`<div>${largeTitle("Rooms", `${plural(rf.length, "room")} · in the order the pigs move`)}
      ${occ.length ? html`<div class="list"><a class="row no-lead pg-kv" href="#/l/${lid}/rooms" data-flow="check"><span class="main"><span class="primary">Today's room checks</span><span class="secondary">The law asks for every pig to be inspected once a day</span></span><span class="v ${checked < occ.length ? "due" : "ok"}">${checked} of ${occ.length}</span></a></div>` : ""}
      ${allEmpty ? html`<p class="pg-quiet">All rooms empty — record pigs in or a weaning to start.</p>` : ""}
      ${groups.map(([name, list]) => html`<div class="section">${groupLabel(name, list.length > 1 ? list.length : "")}<div class="pg-rb">${list.map((x) => roomTile(lid, x, { full: true }))}</div></div>`)}
      ${canWrite(snap.role, "rooms") ? html`<div class="section"><a class="btn secondary" href="#/l/${lid}/setup/rooms">Rooms, pens and crates</a></div>` : ""}</div>`;
  } });
}
