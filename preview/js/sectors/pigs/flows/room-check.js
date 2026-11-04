// Room check (design/13 §5.3) — the daily inspection the law asks for, and the most-used entry
// on finishing farms. One sheet per room, pen by pen, 48px chips. "All pens OK" marks every
// untouched pen OK in one tap. Tail bite expands to the injurious behaviour record (Red Tractor AH.2).
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { openSheet } from "../../../ui/sheet.js";
import { toast } from "../../../ui/toast.js";
import { stepper } from "../../../ui/form.js";
import { entrySheet, chipsField, nowHM } from "./common.js";
import { saveRoomCheck } from "../actions.js";
import { roomFacts } from "../model/facts.js";
import { PEN_ISSUES, tailBiteRepeat } from "../model/rooms.js";

const SEVERITY = ["Ear/tail marks", "Bleeding", "Severe"];
const ACTIONS = ["Removed biter", "Moved to hospital", "Extra enrichment", "Checked ventilation", "Reduced stocking", "Vet called"];

export async function roomCheckFlow(snap, { roomId } = {}) {
  let id = roomId;
  if (!id) {
    const rf = roomFacts(snap.c).filter((x) => x.pigs > 0 || x.batch);
    if (!rf.length) { toast("No rooms with pigs in them to check."); return; }
    const todo = rf.filter((x) => !x.check); const done = rf.filter((x) => x.check);
    const body = el(html`<div><p class="pg-note" style="margin:0 4px 10px">${done.length} of ${rf.length} rooms checked today.</p><div class="list">${[...todo, ...done].map((x) => html`<button type="button" class="row" data-r="${x.room.id}"><span class="tile ${x.check ? "ok" : ""}">${raw(icon(x.check ? "check" : "house"))}</span><span class="main"><span class="primary">${x.room.name}</span><span class="secondary">${x.check ? `Checked ${x.check.time || ""}` : x.tile.stage}</span></span>${x.check ? "" : html`<span class="pill due">To check</span>`}</button>`)}</div></div>`);
    const sh = openSheet({ title: "Room check", body, size: "small" });
    body.onclick = (e) => { const b = e.target.closest("[data-r]"); if (b) sh.close(b.dataset.r, { force: true }); };
    id = await sh.done; if (typeof id !== "string") return;
  }
  return checkSheet(snap, id);
}

function checkSheet(snap, roomId) {
  const room = snap.ix.rooms.get(roomId);
  const pens = room.kind === "farrowing" || !(room.pens || []).length ? [{ no: 0, label: room.kind === "farrowing" ? "Sows and litters" : "All pigs" }] : room.pens.map((p) => ({ no: p.no, label: `Pen ${p.no}` }));
  const state = new Map(pens.map((p) => [p.no, { status: [], pigs: 1, severity: SEVERITY[0], action: [] }]));
  const body = el(html`<form novalidate><p class="pg-note" style="margin:0 4px 6px">Tap the pens with a problem, then “All pens OK” for the rest.</p>
    <button type="button" class="btn secondary" data-allok style="margin:4px 0 4px">${raw(icon("check"))}All pens OK</button>
    <div data-pens>${pens.map((p) => html`<div class="pg-check" data-pen="${p.no}"><div class="pn"><span>${p.label}</span><span class="ink-2" data-ps></span></div>
      <div class="chips pg-pen-chips" data-pc="${p.no}"><button type="button" class="chip" data-s="OK" aria-checked="false"><span class="chk">${raw(icon("check", { size: 18 }))}</span>OK</button>${PEN_ISSUES.map((s) => html`<button type="button" class="chip" data-s="${s}" aria-checked="false"><span class="chk">${raw(icon("check", { size: 18 }))}</span>${s}</button>`)}</div>
      <div class="more" data-more hidden></div></div>`)}</div>
    <div class="form-group" style="margin-top:16px">${chipsField("room", "Room", [["enrichmentOk", "Enrichment OK"], ["waterOk", "Water flowing"], ["feedersOk", "Feeders OK"]], ["enrichmentOk", "waterOk", "feedersOk"], { multi: true })}
      <div class="field"><label>Note</label><input name="note" placeholder="Anything else" autocomplete="off"></div></div></form>`);
  const paintPen = (no) => {
    const s = state.get(no); const box = body.querySelector(`[data-pen="${no}"]`);
    box.querySelectorAll("[data-s]").forEach((c) => c.setAttribute("aria-checked", String(s.status.includes(c.dataset.s))));
    box.querySelector("[data-ps]").textContent = s.status.length ? (s.status.includes("OK") ? "✓" : "●") : "";
    const more = box.querySelector("[data-more]"); const tb = s.status.includes("Tail bite");
    more.hidden = !tb && !s.status.some((x) => x !== "OK");
    if (!more.hidden) {
      more.replaceChildren(el(html`<div><div class="pg-head" style="margin:0 0 8px"><span>Pigs affected</span>${stepper(`p${no}`, s.pigs, { min: 1, max: 99, label: "pigs affected" })}</div>
        ${tb ? html`<p class="pg-note" style="margin:4px 2px">Severity</p><div class="chips" data-sev>${SEVERITY.map((x) => html`<button type="button" class="chip" data-v="${x}" aria-checked="${s.severity === x}">${x}</button>`)}</div>
          <p class="pg-note" style="margin:8px 2px 4px">What you did</p><div class="chips" data-act>${ACTIONS.map((x) => html`<button type="button" class="chip" data-v="${x}" aria-checked="${s.action.includes(x)}"><span class="chk">${raw(icon("check", { size: 18 }))}</span>${x}</button>`)}</div>` : ""}</div>`));
      const inp = more.querySelector("input"); more.querySelectorAll(".step-btn").forEach((b) => (b.onclick = () => { s.pigs = Math.max(1, Math.min(99, s.pigs + +b.dataset.dir)); inp.value = s.pigs; }));
      inp.oninput = () => { s.pigs = Math.max(1, parseInt(inp.value, 10) || 1); };
    }
    es && es.refresh();
  };
  body.addEventListener("click", (e) => {
    const c = e.target.closest("[data-pc] [data-s]");
    if (c) { const no = +c.parentElement.dataset.pc; const s = state.get(no); const v = c.dataset.s;
      if (v === "OK") s.status = s.status.includes("OK") ? [] : ["OK"]; else { s.status = s.status.filter((x) => x !== "OK"); s.status = s.status.includes(v) ? s.status.filter((x) => x !== v) : [...s.status, v]; }
      paintPen(no); return; }
    const sv = e.target.closest("[data-sev] [data-v]"); if (sv) { const no = +sv.closest("[data-pen]").dataset.pen; state.get(no).severity = sv.dataset.v; paintPen(no); return; }
    const ac = e.target.closest("[data-act] [data-v]"); if (ac) { const no = +ac.closest("[data-pen]").dataset.pen; const s = state.get(no); s.action = s.action.includes(ac.dataset.v) ? s.action.filter((x) => x !== ac.dataset.v) : [...s.action, ac.dataset.v]; paintPen(no); return; }
    if (e.target.closest("[data-allok]")) { for (const [no, s] of state) if (!s.status.length) { s.status = ["OK"]; paintPen(no); } }
  });
  const untouched = () => [...state.values()].filter((s) => !s.status.length).length;
  const es = entrySheet({ title: `${room.name} check`, body, label: "Save check",
    missing: () => (untouched() ? `${untouched()} pen${untouched() > 1 ? "s" : ""} still to check` : null),
    save(v, sh) {
      const T = snap.today; const roomFlags = v.room || [];
      saveRoomCheck(snap, roomId, { date: T, time: nowHM(), pens: [...state].map(([no, s]) => ({ no, status: s.status, ...(s.status.some((x) => x !== "OK") ? { pigs: s.pigs } : {}), ...(s.status.includes("Tail bite") ? { severity: s.severity, action: s.action } : {}) })), enrichmentOk: roomFlags.includes("enrichmentOk"), waterOk: roomFlags.includes("waterOk"), feedersOk: roomFlags.includes("feedersOk"), note: v.note });
      sh.close(true, { force: true });
      const bites = [...state.values()].filter((s) => s.status.includes("Tail bite")).length;
      const prior = snap.data.tailBites.filter((t) => t.roomId === roomId);
      if (bites && tailBiteRepeat([...prior, { roomId, date: T }], roomId, T)) toast(`Tail biting twice in ${room.name} this week — look at your tail-biting action plan`, { duration: 7000 });
      else toast(`${room.name} checked${[...state.values()].some((s) => s.status.some((x) => x !== "OK")) ? " · issues noted" : " · all OK"}`);
    } });
  return es.sheet.done;
}
