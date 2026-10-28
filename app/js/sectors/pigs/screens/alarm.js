// One house's alarm tests (design/13 §7.10, §11): state, the Test button and the history —
// legal evidence that the alarm and back-up ventilation were tested every 7 days.
import { html, raw } from "../../../core/html.js";
import { icon } from "../../../ui/icons.js";
import { canWrite } from "../../../core/policy.js";
import { largeTitle, backLink, groupLabel } from "../../../screens/common.js";
import { liveScreen, flowArg } from "./live.js";
import { dm, pill } from "../ui.js";
import { alarmState, houses } from "../model/rooms.js";

export default async function alarm(ctx) {
  const house = decodeURIComponent(ctx.match.groups.house);
  return liveScreen(ctx, { title: "Alarm tests", tab: "rooms", paint: (snap) => {
    const s = alarmState(snap.data.alarmTests, house, snap.today);
    const list = snap.data.alarmTests.filter((t) => t.house === house).sort((a, b) => b.date.localeCompare(a.date));
    const rooms = snap.data.rooms.filter((r) => (r.house || r.name) === house).map((r) => r.name);
    const others = houses(snap.data.rooms.filter((r) => r.mechVent !== false)).filter((h) => h !== house);
    return html`<div>${backLink(`#/l/${snap.lid}/rooms`, "Rooms")}${largeTitle(house, `Alarm tests · ${rooms.join(", ")}`)}
      <div class="card pad"><div class="pg-head" style="margin:0"><b>${s.last ? `Last tested ${dm(s.last.date)} · ${s.days} day${s.days === 1 ? "" : "s"} ago` : "Never tested"}</b>${s.level === "late" ? pill("late", "Overdue") : s.level === "due" ? pill("due", "Due today") : pill("ok", "Up to date")}</div>
        <p class="pg-note" style="margin:6px 0 0">Next due ${dm(s.next)}. The law asks for every 7 days where ventilation is mechanical.</p>
        ${canWrite(snap.role, "alarmTests") ? html`<button type="button" class="btn" style="margin-top:12px" data-flow="alarm" data-arg="${flowArg({ house })}">${raw(icon("bell"))}Test now</button>` : ""}</div>
      <div class="section">${groupLabel("History", list.length || "")}<div class="list">${list.length ? list.map((t) => html`<div class="row no-lead"><span class="main"><span class="primary">${dm(t.date)}${t.time ? " " + t.time : ""} · ${t.sounded ? "Sounded" : "Did not sound"}</span><span class="secondary">${[t.backupChecked ? "back-up checked" : "back-up not checked", t.by, t.action].filter(Boolean).join(" · ")}</span></span>${t.sounded ? pill("ok", "OK") : pill("late", "Failed")}</div>`) : html`<div class="row no-lead"><span class="main"><span class="secondary">No tests recorded.</span></span></div>`}</div></div>
      ${others.length ? html`<div class="section">${groupLabel("Other houses")}<div class="list">${others.map((h) => { const o = alarmState(snap.data.alarmTests, h, snap.today); return html`<a class="row no-lead" href="#/l/${snap.lid}/alarm/${encodeURIComponent(h)}"><span class="main"><span class="primary">${h}</span><span class="secondary">${o.last ? `Last ${dm(o.last.date)}` : "Never tested"}</span></span>${o.level === "late" ? pill("late", "Overdue") : ""}<span class="chev">${raw(icon("chevron"))}</span></a>`; })}</div></div>` : ""}</div>`;
  } });
}
