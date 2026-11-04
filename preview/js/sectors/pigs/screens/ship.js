// Ready to ship (design/13 §6.3, Research A challenge 2): pens ranked by estimated weight against
// the processor's deadweight band. Tick pens → Plan a load (ship task, feed-withdrawal time,
// pre-filled movement). Withdrawal blocks the load.
import { html, raw } from "../../../core/html.js";
import { icon } from "../../../ui/icons.js";
import { canWrite } from "../../../core/policy.js";
import { largeTitle, backLink, groupLabel } from "../../../screens/common.js";
import { liveScreen } from "./live.js";
import { dm, n0, n1, pill } from "../ui.js";
import { batchName, readyToShip, shipBlocked } from "../model/batches.js";

const picked = new Map();

export default async function ship(ctx) {
  const id = ctx.match.groups.id; if (!picked.has(id)) picked.set(id, new Set());
  return liveScreen(ctx, { title: "Ready to ship", tab: "batches", paint: (snap) => {
    const b = snap.ix.batches.get(id); const f = b && snap.c.bf.get(id); const lid = snap.lid;
    if (!b || !f) return html`<div>${backLink(`#/l/${lid}/batches`, "Batches")}${largeTitle("Batch not found")}</div>`;
    const room = snap.ix.rooms.get(b.roomId); const pens = room?.pens?.length ? room.pens : [{ no: 1 }];
    const per = Math.floor(f.onFarm / pens.length); const extra = f.onFarm - per * pens.length;
    const weighs = [...(b.sampleWeighs || [])].filter((w) => w.pen).sort((x, y) => x.date.localeCompare(y.date));
    const rows = readyToShip(pens.map((p, i) => { const w = weighs.filter((x) => +x.pen === +p.no).pop(); const grow = w ? (f.dlwg / 1000) * Math.max(0, (new Date(snap.today) - new Date(w.date)) / 864e5) : 0; return { no: p.no, pigs: per + (i < extra ? 1 : 0), avgKg: w ? w.avgKg + grow : null, weighed: !!w }; }), f.est, snap.s);
    const sel = picked.get(id); const nSel = rows.filter((r) => sel.has(r.no)).reduce((t, r) => t + r.pigs, 0);
    const blk = shipBlocked(b, snap.data.medicines, snap.today);
    const ships = snap.data.tasks.filter((t) => t.pig?.kind === "ship" && !t.done && t.pig.batchId === id);
    return html`<div>${backLink(`#/l/${lid}/batch/${id}`, batchName(b))}${largeTitle("Ready to ship", `${batchName(b)} · ${room?.name || ""} · ${n0(f.onFarm)} pigs · est ${n1(f.est)} kg live`)}
      <p class="pg-line">Band ${snap.s.bandMin}–${snap.s.bandMax} kg deadweight · kill-out ${snap.s.killOut}% · target ${snap.s.targetLive} kg live</p>
      ${blk.blocked ? html`<div class="warn-card" style="margin-top:12px">${raw(icon("alert"))}<span>${batchName(b)} can't go for slaughter before ${dm(blk.until)} — withdrawal.</span></div>` : ""}
      ${ships.length ? html`<div class="section">${groupLabel("Planned")}<div class="list">${ships.map((t) => html`<div class="row no-lead"><span class="main"><span class="primary">${t.title}</span><span class="secondary">${t.note || ""}</span></span><button type="button" class="text-btn" data-flow="pigsOut" data-arg='${JSON.stringify({ batchId: id, n: t.pig.n, pens: t.pig.pens })}'>Load</button></div>`)}</div></div>` : ""}
      <div class="section">${groupLabel("Pens, heaviest first", "tick to load")}<div class="list">${rows.map((r) => html`<button type="button" class="row" data-pen="${r.no}" role="checkbox" aria-checked="${sel.has(r.no)}"><span class="checkbox" aria-hidden="true">${raw(icon("check"))}</span><span class="main"><span class="primary">Pen ${r.no} · ${r.pigs} pigs</span><span class="secondary">${n1(r.live)} kg live${r.weighed ? "" : " (batch est.)"} · ${n1(r.dw)} kg dw</span></span>${r.status === "in" ? pill("ok", "In band") : r.status === "light" ? pill("due", `${n1(r.gap)} kg light`) : pill("late", `${n1(r.gap)} kg over`)}</button>`)}</div>
        <p class="pg-note">Pens without their own sample weigh use the batch estimate. Weigh a sample by pen to rank them properly.</p></div>
      ${canWrite(snap.role, "tasks") ? html`<button type="button" class="btn" style="margin-top:12px" data-plan ${raw(blk.blocked ? "disabled" : "")}>${blk.blocked ? "Withdrawal — can't plan a slaughter load yet" : nSel ? `Plan a load · ${nSel} pigs` : "Plan a load"}</button>` : ""}</div>`;
  }, after: (node, snap, repaint) => {
    const sel = picked.get(id);
    node.querySelectorAll("[data-pen]").forEach((b) => (b.onclick = () => { const n = +b.dataset.pen; sel.has(n) ? sel.delete(n) : sel.add(n); repaint(); }));
    const p = node.querySelector("[data-plan]"); if (p) p.onclick = async () => {
      const b = snap.ix.batches.get(id); const f = snap.c.bf.get(id); const room = snap.ix.rooms.get(b.roomId); const pens = room?.pens?.length || 1;
      const per = Math.round(f.onFarm / pens); const n = sel.size ? Math.min(f.onFarm, per * sel.size) : null;
      (await import("../flows/batch.js")).planLoadSheet(snap, { batchId: id, pens: [...sel].sort((a, c) => a - c), n });
    };
  } });
}
