// Weaned (design/13 §7.3, §5.4 "At weaning"): farrowing room → every suckling crate with
// "Wean all" (tap a crate to change its count or weight) → destination weaner room (Ready rooms
// only, or "Fill anyway") → Save. The batch number carries on into the weaner room.
// Weaning age (Schedule 8 paras 38–39): under 21 days can't be saved; 21–27 needs a reason and
// the "specialised, cleaned housing" tick.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { openSheet } from "../../../ui/sheet.js";
import { toast } from "../../../ui/toast.js";
import { checkRow } from "../../../ui/form.js";
import { daysBetween } from "../model/dates.js";
import { entrySheet, chipsField, warn, lawNote } from "./common.js";
import { weanLitters } from "../actions.js";
import { aliveNow, weaningCheck } from "../model/litters.js";
import { sowLabel } from "../model/sows.js";
import { batchName } from "../model/batches.js";
import { canFill } from "../model/rooms.js";

export async function weanFlow(snap, { roomId } = {}) {
  const suck = snap.data.litters.filter((l) => !l.weaned);
  if (!suck.length) { toast("No litters to wean."); return; }
  // small herds may farrow without rooms: those litters wean as one group ("none")
  const rooms = [...new Set(suck.map((l) => l.roomId || "none"))].map((id) => snap.ix.rooms.get(id) || { id: "none", name: "Sows' pens" });
  let rid = roomId && rooms.some((r) => r.id === roomId) ? roomId : rooms.length === 1 ? rooms[0].id : null;
  if (!rid) {
    const body = el(html`<div class="list">${rooms.map((r) => { const ls = suck.filter((l) => (l.roomId || "none") === r.id); const age = Math.max(...ls.map((l) => daysBetween(l.farrowedAt.slice(0, 10), snap.today))); return html`<button type="button" class="row" data-r="${r.id}"><span class="tile">${raw(icon("house"))}</span><span class="main"><span class="primary">${r.name}</span><span class="secondary">${ls.length} litters · ${ls.reduce((t, l) => t + aliveNow(l), 0)} piglets · oldest ${age} d</span></span>${age >= snap.s.lactation ? html`<span class="pill due">Wean</span>` : ""}</button>`; })}</div>`);
    const sh = openSheet({ title: "Wean which room?", body, size: "small" });
    body.onclick = (e) => { const b = e.target.closest("[data-r]"); if (b) sh.close(b.dataset.r, { force: true }); };
    rid = await sh.done; if (typeof rid !== "string") return;
  }
  return weanSheet(snap, rid);
}

function weanSheet(snap, rid) {
  const room = snap.ix.rooms.get(rid) || { id: "none", name: "Sows' pens" };
  const ls = snap.data.litters.filter((l) => !l.weaned && (l.roomId || "none") === rid).sort((a, b) => (a.crate || 0) - (b.crate || 0));
  const roomless = !snap.data.rooms.some((r) => ["weaner", "grower", "hospital"].includes(r.kind));
  const rows = new Map(ls.map((l) => [l.id, { on: true, n: aliveNow(l), kg: "" }]));
  const dest = snap.data.rooms.filter((r) => ["weaner", "grower", "hospital"].includes(r.kind));
  const ready = dest.filter((r) => canFill(r, snap.today)); const notReady = dest.filter((r) => !canFill(r, snap.today) && !r.batchId);
  const bn = batchName(snap.ix.batches.get(ls[0]?.batchId));
  const body = el(html`<form novalidate>
    <p class="hint" style="margin:0 4px 10px">${room.name}${bn ? " · " + bn : ""} · ${ls.length} litters. Change a count or add the weight (kg per litter) where you weighed.</p>
    <div class="list" data-rows></div>
    <div class="form-group" style="margin-top:12px"><div class="field"><label>Weaned</label><input type="date" name="date" value="${snap.today}"></div>
      <div class="field"><label>Total weight (kg)</label><input name="totalKg" inputmode="decimal" placeholder="optional — or per crate above"></div></div>
    <div class="form-group" ${roomless ? "hidden" : ""}>${chipsField("to", "To room", [...ready.map((r) => [r.id, `${r.name} ✓`]), ...notReady.map((r) => [r.id, `${r.name} (not ready)`])], ready[0]?.id || null)}
      <div data-fill hidden>${checkRow("fillAnyway", "Fill anyway", false, "The room isn't through its wash yet — this is recorded as an exception")}</div></div>
    <div data-young hidden><div class="form-group">${checkRow("cleanedHousing", "Going to specialised, cleaned housing", false, "Emptied, cleaned and disinfected, separate from sows")}<div class="field"><label>Reason</label><input name="reason" placeholder="Why before 28 days"></div></div></div>
    <div data-w></div>
    ${lawNote("Weaning before 28 days is only allowed if pigs go to specially cleaned housing (then 21 days minimum).")}
  </form>`);
  const age = (v) => Math.min(...ls.filter((l) => rows.get(l.id).on).map((l) => daysBetween(l.farrowedAt.slice(0, 10), v.date || snap.today)));
  const paintRows = () => body.querySelector("[data-rows]").replaceChildren(...ls.map((l) => { const r = rows.get(l.id); const s = snap.ix.byId.get(l.sowId); return el(html`<div class="row pg-wean-row" data-l="${l.id}"><button type="button" class="checkbox" role="checkbox" aria-checked="${r.on}" aria-label="Wean litter of ${s ? sowLabel(s) : ""}" data-tog="${l.id}">${raw(icon("check"))}</button><span class="main"><span class="primary">${l.crate ? "C" + l.crate + " · " : ""}${s ? s.name || sowLabel(s) : ""}</span><span class="secondary">${daysBetween(l.farrowedAt.slice(0, 10), snap.today)} days old</span></span>
    <label class="pg-mini"><input inputmode="numeric" data-n="${l.id}" value="${r.n}" aria-label="Piglets weaned from crate ${l.crate}"><small>pigs</small></label><label class="pg-mini"><input inputmode="decimal" data-kg="${l.id}" value="${r.kg}" placeholder="—" aria-label="Weight in kg, crate ${l.crate}"><small>kg</small></label></div>`); }));
  paintRows();
  body.querySelector("[data-rows]").addEventListener("click", (e) => {
    const t = e.target.closest("[data-tog]"); if (!t) return; const r = rows.get(t.dataset.tog); r.on = !r.on; t.setAttribute("aria-checked", String(r.on)); es.refresh(); paint();
  });
  body.querySelector("[data-rows]").addEventListener("input", (e) => {
    const n = e.target.dataset.n, k = e.target.dataset.kg;
    if (n) rows.get(n).n = Math.max(0, parseInt(e.target.value, 10) || 0);
    if (k) rows.get(k).kg = +e.target.value > 0 ? +e.target.value : "";
  });
  const paint = () => {
    const v = es.form.values(); const a = age(v); const ck = weaningCheck(a, { cleanedHousing: v.cleanedHousing, reason: v.reason });
    body.querySelector("[data-young]").hidden = a >= 28 || a < 21;
    body.querySelector("[data-fill]").hidden = !v.to || !snap.ix.rooms.get(v.to) || canFill(snap.ix.rooms.get(v.to), snap.today);
    body.querySelector("[data-w]").replaceChildren(...(a < 28 ? [el(warn(ck.text || `Weaning at ${a} days.`))] : []));
  };
  const es = entrySheet({ title: `Wean ${room.name}`, body, label: "Save weaning",
    missing: (v) => {
      const on = ls.filter((l) => rows.get(l.id).on); if (!on.length) return "Choose at least one crate";
      const ck = weaningCheck(age(v), { cleanedHousing: v.cleanedHousing, reason: v.reason }); if (!ck.ok) return age(v) < 21 ? "Too young to wean (under 21 days)" : "Tick cleaned housing and give a reason";
      if (!v.to && !roomless) return "Choose the room they go to";
      if (v.to && !canFill(snap.ix.rooms.get(v.to), snap.today) && !v.fillAnyway && !snap.ix.rooms.get(v.to).batchId) return "That room isn't ready — tick Fill anyway";
      return null;
    },
    save(v, sh) {
      const on = ls.filter((l) => rows.get(l.id).on); const totalN = on.reduce((t, l) => t + rows.get(l.id).n, 0);
      const perKg = +v.totalKg > 0 && totalN ? +v.totalKg / totalN : null;
      const a = age(v);
      const r = weanLitters(snap, { litters: on.map((l) => ({ id: l.id, n: rows.get(l.id).n, kg: rows.get(l.id).kg || (perKg ? +(perKg * rows.get(l.id).n).toFixed(1) : undefined) })), toRoomId: v.to || null, date: v.date || snap.today, reason: a < 28 ? v.reason : undefined, cleanedHousing: a < 28 ? !!v.cleanedHousing : undefined });
      sh.close(true, { force: true });
      toast(`${r.n} piglets weaned${v.to ? " to " + snap.ix.rooms.get(v.to).name : ""}`);
    } });
  es.form.onChange(paint); paint();
  return es.sheet.done;
}
