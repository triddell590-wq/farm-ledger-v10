// Alarm test (design/13 §7.10) — weekly, per house, a legal requirement where ventilation is
// mechanical. House → [Alarm sounded ✓] [Backup ventilation checked ✓] → by (auto) → if it did not
// sound: "What did you do?" (required) → Save. Toast "Alarm test saved · next due Wed 22 Oct".
import { html, raw } from "../../../core/html.js";
import { el } from "../../../ui/dom.js";
import { icon } from "../../../ui/icons.js";
import { openSheet } from "../../../ui/sheet.js";
import { toast } from "../../../ui/toast.js";
import { checkRow } from "../../../ui/form.js";
import { addDays } from "../model/dates.js";
import { entrySheet, chipsField, nowHM, lawNote } from "./common.js";
import { saveAlarmTest, me, undoAdd } from "../actions.js";
import { houses, alarmState } from "../model/rooms.js";
import { dm, d2 } from "../ui.js";

export async function alarmFlow(snap, { house } = {}) {
  const hs = houses(snap.data.rooms.filter((r) => r.mechVent !== false));
  if (!hs.length) { toast("No houses with mechanical ventilation set up."); return; }
  let h = house || (hs.length === 1 ? hs[0] : null);
  if (!h) {
    const body = el(html`<div class="list">${hs.map((x) => { const s = alarmState(snap.data.alarmTests, x, snap.today); return html`<button type="button" class="row" data-h="${x}"><span class="tile ${s.level === "late" ? "late" : s.level === "ok" ? "ok" : ""}">${raw(icon("bell"))}</span><span class="main"><span class="primary">${x}</span><span class="secondary">${s.last ? `Last tested ${d2(s.last.date)} (${s.days} d)` : "Never tested"}</span></span>${s.level === "late" ? html`<span class="pill late">Overdue</span>` : ""}</button>`; })}</div>`);
    const sh = openSheet({ title: "Alarm test — which house?", body, size: "small" });
    body.onclick = (e) => { const b = e.target.closest("[data-h]"); if (b) sh.close(b.dataset.h, { force: true }); };
    h = await sh.done; if (typeof h !== "string") return;
  }
  return alarmSheet(snap, { house: h });
}

export function alarmSheet(snap, { house }) {
  const s = alarmState(snap.data.alarmTests, house, snap.today);
  const body = el(html`<form novalidate>
    <p class="hint" style="margin:0 4px 12px">${house} · ${s.last ? `last tested ${dm(s.last.date)}, ${s.days} days ago` : "no test recorded yet"}</p>
    <div class="form-group">${chipsField("sounded", "Did the alarm sound?", [["yes", "Alarm sounded ✓"], ["no", "It did not sound"]], null)}
      ${checkRow("backupChecked", "Backup ventilation checked", true, "Fail-safe / natural ventilation opens")}</div>
    <div class="form-group" data-what hidden><div class="field"><label>What did you do?</label><input name="action" placeholder="e.g. replaced the battery, engineer called"></div></div>
    <div class="form-group"><div class="field"><label>Tested by</label><input name="by" value="${me()}"></div><div class="field"><label>Time</label><input type="time" name="time" value="${nowHM()}"></div></div>
    ${lawNote("Where ventilation is mechanical, the alarm and the back-up system must be tested at least once every 7 days (Schedule 8; Red Tractor HF.2.3).")}
  </form>`);
  const es = entrySheet({ title: "Alarm test", body, label: "Save alarm test", size: "large",
    missing: (v) => (!v.sounded ? "Did the alarm sound?" : v.sounded === "no" && !v.action ? "Say what you did" : null),
    save(v, sh) {
      const id = saveAlarmTest(snap, house, { date: snap.today, time: v.time, sounded: v.sounded === "yes", backupChecked: v.backupChecked, action: v.sounded === "no" ? v.action : undefined });
      sh.close(true, { force: true });
      const next = addDays(snap.today, 7);
      toast(v.sounded === "yes" ? `Alarm test saved · next due ${dm(next)}` : `Saved — test ${house} again once it's fixed`, { action: "Undo", onAction: () => undoAdd(snap.lid, "alarmTests", id) });
    } });
  es.form.onChange(() => { body.querySelector("[data-what]").hidden = es.form.values().sounded !== "no"; });
  return es.sheet.done;
}
