// Move sows to farrowing (design/13 §3.4 "Move 24 sows to Farrowing 3"): the sows due within
// the move window, crates handed out in order (one tap each to change), never more than 7 days
// before due (Red Tractor HF.9.2.a); nesting material 24 h before.
import { html, raw } from "../../../core/html.js";
import { icon } from "../../../ui/icons.js";
import { toast } from "../../../ui/toast.js";
import { canWrite } from "../../../core/policy.js";
import { addDays } from "../model/dates.js";
import { largeTitle, backLink, groupLabel } from "../../../screens/common.js";
import { liveScreen } from "./live.js";
import { dm, pill } from "../ui.js";
import { cycles } from "../model/week.js";
import { sowLabel, crateEntryCheck } from "../model/sows.js";
import { crateMap } from "../flows/farrowing.js";
import { moveToFarrowing } from "../actions.js";
import { batchName } from "../model/batches.js";

export default async function moveFarrowing(ctx) {
  let roomPick = null;
  return liveScreen(ctx, { title: "Move to farrowing", tab: "rooms", paint: (snap) => {
    const lid = snap.lid; const rooms = snap.data.rooms.filter((r) => r.kind === "farrowing");
    const due = cycles(snap.c).filter((y) => y.c.dates && ["served", "inpig"].includes(y.c.status) && !y.c.inCrate && y.c.dates.due <= addDays(snap.today, 9) && y.c.dates.due >= addDays(snap.today, -3)).sort((a, b) => a.c.dates.due.localeCompare(b.c.dates.due));
    const free = rooms.map((r) => ({ r, crates: crateMap(snap, r).filter((c) => c.state === "free").map((c) => c.no) }));
    const room = free.find((x) => x.r.id === roomPick) || free.find((x) => x.crates.length >= due.length) || free.sort((a, b) => b.crates.length - a.crates.length)[0];
    roomPick = room?.r.id || null;
    const plan = due.map((y, i) => ({ ...y, crate: room?.crates[i] ?? null, chk: crateEntryCheck(snap.today, y.c.dates.due) }));
    const can = canWrite(snap.role, "sows");
    return html`<div>${backLink(`#/l/${lid}/week`, "Week")}${largeTitle("Move to farrowing", `${due.length} sow${due.length === 1 ? "" : "s"} due in the next 9 days${due[0] ? " · " + batchName(snap.ix.batches.get(due[0].c.first.batchId)) : ""}`)}
      ${rooms.length > 1 ? html`<div class="chips" style="margin:4px 0 12px" data-rooms>${free.map((x) => html`<button type="button" class="chip" aria-checked="${x.r.id === roomPick}" data-r="${x.r.id}">${x.r.name} · ${x.crates.length} free</button>`)}</div>` : ""}
      ${!due.length ? html`<div class="card pad t-callout ink-2">No sows due to move in the next 9 days.</div>` : html`<div class="list">${plan.map((p) => html`<div class="row no-lead"><span class="pg-no">${sowLabel(p.sow)}</span><span class="main"><span class="primary">Due ${dm(p.c.dates.due)}</span><span class="secondary">${p.crate ? `${room.r.name} C${p.crate}` : "No free crate"} · move from ${dm(p.c.dates.move)}</span></span>${!p.chk.ok ? pill("due", `${p.chk.days} d early`) : p.c.dates.move <= snap.today ? pill("ok", "Move now") : ""}</div>`)}</div>
        <p class="pg-note">Sows go in no more than 7 days before they're due (Red Tractor HF.9.2.a). Give nesting material at least 24 hours before farrowing.</p>
        ${can ? html`<button type="button" class="btn" style="margin-top:12px" data-go>${raw(icon("check"))}Move ${plan.filter((p) => p.crate && p.chk.ok).length} sows in today</button>` : ""}`}
      ${due.some((p) => !crateEntryCheck(snap.today, p.c.dates.due).ok) ? html`<p class="pg-note">Sows more than 7 days from due stay out until their move day.</p>` : ""}</div>`;
  }, after: (node, snap, repaint) => {
    node.querySelectorAll("[data-r]").forEach((b) => (b.onclick = () => { roomPick = b.dataset.r; repaint(); }));
    const g = node.querySelector("[data-go]"); if (!g) return;
    g.onclick = () => {
      const rooms = snap.data.rooms.filter((r) => r.kind === "farrowing"); const room = rooms.find((r) => r.id === roomPick); if (!room) return;
      const crates = crateMap(snap, room).filter((c) => c.state === "free").map((c) => c.no);
      const due = cycles(snap.c).filter((y) => y.c.dates && ["served", "inpig"].includes(y.c.status) && !y.c.inCrate && y.c.dates.due <= addDays(snap.today, 9) && y.c.dates.due >= addDays(snap.today, -3)).sort((a, b) => a.c.dates.due.localeCompare(b.c.dates.due));
      const moves = due.map((y, i) => ({ sowId: y.sow.id, roomId: room.id, crate: crates[i], ok: crateEntryCheck(snap.today, y.c.dates.due).ok })).filter((m) => m.crate && m.ok);
      if (!moves.length) { toast("Nobody can go in today — too early."); return; }
      moveToFarrowing(snap, moves, snap.today); toast(`${moves.length} sows into ${room.name}`);
    };
  } });
}
