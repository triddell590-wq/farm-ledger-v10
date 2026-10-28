// Readings (design/13 §7.9): one sheet per room — water meter (shows yesterday's), min/max °C,
// optional bin dip ("about ¼ full" chips or tonnes). Save → water change % vs yesterday; a drop of
// the setting (default 15%, a guess made into a setting) puts a due alert on the room tile.
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { openSheet } from "../../../ui/sheet.js";
import { toast } from "../../../ui/toast.js";
import { addDays } from "../model/dates.js";
import { entrySheet, chipsField, numField } from "./common.js";
import { saveReadings, undoAdd } from "../actions.js";
import { waterChange, waterAlert } from "../model/rooms.js";

export async function readingsFlow(snap, { roomId } = {}) {
  let id = roomId;
  if (!id) {
    const rooms = snap.data.rooms.filter((r) => r.batchId || snap.data.litters.some((l) => !l.weaned && l.roomId === r.id));
    if (!rooms.length) { toast("No rooms with pigs in them."); return; }
    const body = el(html`<div class="list">${rooms.map((r) => { const done = snap.data.readings.some((x) => x.roomId === r.id && x.date === snap.today); return html`<button type="button" class="row" data-r="${r.id}"><span class="tile ${done ? "ok" : ""}">${raw(icon(done ? "check" : "water"))}</span><span class="main"><span class="primary">${r.name}</span><span class="secondary">${done ? "Read today" : "Not read today"}</span></span></button>`; })}</div>`);
    const sh = openSheet({ title: "Readings", body, size: "small" });
    body.onclick = (e) => { const b = e.target.closest("[data-r]"); if (b) sh.close(b.dataset.r, { force: true }); };
    id = await sh.done; if (typeof id !== "string") return;
  }
  const room = snap.ix.rooms.get(id);
  const prev = snap.data.readings.filter((x) => x.roomId === id && x.waterM3 != null && x.date < snap.today).sort((a, b) => b.date.localeCompare(a.date))[0];
  const bins = snap.data.bins.filter((b) => (b.roomIds || []).includes(id));
  const body = el(html`<form novalidate>
    <div class="form-group">${numField("waterM3", "Water meter (m³)", "", { placeholder: prev ? `yesterday ${prev.waterM3}` : "meter reading" })}${numField("tMin", "Min °C", "")}${numField("tMax", "Max °C", "")}</div>
    ${bins.length ? html`<div class="form-group">${bins.length > 1 ? chipsField("binId", "Bin", bins.map((b) => [b.id, b.name]), bins[0].id) : html`<input type="hidden" name="binId" value="${bins[0].id}">`}
      ${chipsField("dip", `Bin dip${bins.length === 1 ? " · " + bins[0].name : ""} (optional)`, [["0", "Empty"], ["0.25", "About ¼"], ["0.5", "About ½"], ["0.75", "About ¾"], ["1", "Full"]], null)}
      ${numField("dipT", "or tonnes in the bin", "", { optional: true })}</div>` : ""}
    <p class="pg-note" data-wc>${prev ? `Last reading ${prev.waterM3} m³ on ${prev.date.slice(8)}/${prev.date.slice(5, 7)}.` : "Read the meter at the same time each day."}</p></form>`);
  const es = entrySheet({ title: `Readings · ${room.name}`, body, label: "Save readings",
    missing: (v) => (v.waterM3 === "" && v.tMin === "" && v.tMax === "" && !v.dip && !v.dipT ? "Add at least one reading" : null),
    save(v, sh) {
      const bin = snap.data.bins.find((b) => b.id === v.binId);
      const dipKg = v.dipT !== "" && v.dipT != null ? +v.dipT * 1000 : v.dip != null && bin?.capacityT ? Math.round(+v.dip * bin.capacityT * 1000) : undefined;
      const rid = saveReadings(snap, id, { waterM3: v.waterM3, tMin: v.tMin, tMax: v.tMax, binId: dipKg != null ? v.binId : undefined, binDipKg: dipKg });
      sh.close(true, { force: true });
      const wc = waterChange([...snap.data.readings, { roomId: id, date: snap.today, waterM3: +v.waterM3 }], id, snap.today);
      const alert = v.waterM3 !== "" && waterAlert(wc, snap.s.waterDrop);
      toast(alert ? `${room.name} water down ${Math.abs(Math.round(wc.change * 100))}% on yesterday — check drinkers and pigs` : `Readings saved${wc ? ` · water ${wc.change >= 0 ? "+" : "−"}${Math.abs(Math.round(wc.change * 100))}%` : ""}`, { action: "Undo", onAction: () => undoAdd(snap.lid, "readings", rid), duration: alert ? 7000 : undefined });
    } });
  es.form.onChange(() => {
    const v = es.form.values(); if (v.waterM3 === "") return;
    const wc = waterChange([...snap.data.readings.filter((x) => !(x.roomId === id && x.date === snap.today)), { roomId: id, date: snap.today, waterM3: +v.waterM3 }], id, snap.today);
    const y = snap.data.readings.find((x) => x.roomId === id && x.date === addDays(snap.today, -1));
    body.querySelector("[data-wc]").textContent = wc ? `Today ${wc.today.toFixed(1)} m³ · yesterday ${wc.yesterday.toFixed(1)} m³ → ${wc.change >= 0 ? "+" : "−"}${Math.abs(Math.round(wc.change * 100))}%${waterAlert(wc, snap.s.waterDrop) ? " — over your alert line" : ""}` : y ? `Yesterday's meter: ${y.waterM3} m³` : "";
  });
  return es.sheet.done;
}
