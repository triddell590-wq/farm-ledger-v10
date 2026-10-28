// Live subtitles for the Pigs More tab (mockups/pigs.html): visitors this week, alarm tests,
// QVR weeks, eMB due date, moves to notify, system.
import { houses, alarmState } from "./rooms.js";
import { qvrState, embDue, notifyState } from "./paperwork.js";
import { weekDates } from "./weeks.js";
import { SYSTEMS } from "./settings.js";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dm = (iso) => `${+iso.slice(8, 10)} ${MON[+iso.slice(5, 7) - 1]}`;

export function moreState(snap) {
  const T = snap.today; const d = snap.data; const out = {};
  const wk = weekDates(T, snap.s.weekStart); const v = d.visitors.filter((x) => x.date >= wk[0] && x.date <= wk[6]).length;
  out.visitors = `${v} this week · print the QR gate sign`;
  const hs = houses(d.rooms.filter((r) => r.mechVent !== false));
  if (hs.length) { const late = hs.filter((h) => alarmState(d.alarmTests, h, T).level === "late"); out.alarms = late.length ? `${late.length} overdue — ${late.join(", ")}` : "All up to date"; out.alarmHref = `#/l/${snap.lid}/alarm/${encodeURIComponent(late[0] || hs[0])}`; }
  const q = qvrState(d.vetVisits, T); out.qvr = q.last ? `${q.weeks} weeks since the last · book by ${dm(q.nextBy)}` : "No visit recorded yet";
  const e = embDue(T, d.embUploads); out.embLabel = e.label.split(" ")[0]; out.emb = e.done ? "Uploaded" : `Upload by ${dm(e.due)}`;
  const n = d.moves.filter((m) => m.direction === "off" && !m.notified && notifyState(m, T).by).length; out.pm1 = n ? `${n} move${n > 1 ? "s" : ""} to notify` : "Nothing to notify";
  out.system = snap.s.smallHerd ? "Small herd mode" : `${SYSTEMS[snap.s.system]}${snap.s.breeding ? ` · ${snap.s.interval === 1 ? "weekly" : snap.s.interval + "-week"} batches` : ""}`;
  return out;
}
