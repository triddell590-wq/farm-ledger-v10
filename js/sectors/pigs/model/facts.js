// Facts per room, batch and bin, worked out once per snapshot and shared by every screen,
// the alerts and the jobs list. Room tile content follows design/13 §3.1 priority:
// late alert (alarm, water drop, mortality over target) → stage word and day → one key number.
import { addDays, daysBetween } from "./dates.js";
import { batchFacts, batchName } from "./batches.js";
import { washState, waterChange, waterAlert, checkedToday, lastCheck, issuePens, spaceBadge, alarmState, KIND_NAME, sortRooms, WASH_WORD } from "./rooms.js";
import { aliveNow, preWeanMortality, lactationDay } from "./litters.js";
import { binStock, binForecast, intakeAt, SOW_INTAKE } from "./bins.js";
import { cycles } from "./week.js";
import { dayName } from "./sows.js";

const live = (a) => (a || []).filter((r) => !r.deleted);
const pct = (x, dp = 1) => (x == null ? "—" : `${(x * 100).toFixed(dp)}%`);

export function batchFactsAll(c) {
  if (c._bf) return c._bf;
  const d = c.data; const m = new Map();
  for (const b of live(d.batches)) if (b.numberIn != null || b.inDate) m.set(b.id, batchFacts(b, { deaths: live(d.deaths), moves: live(d.moves), deliveries: live(d.feedDeliveries), readings: live(d.readings), killSheets: live(d.killSheets), finance: c.finance || [], medicines: live(d.medicines) }, c.s, c.today));
  c._bf = m; return m;
}

export function roomFacts(c) {
  if (c._rf) return c._rf;
  const d = c.data; const bf = batchFactsAll(c); const cy = cycles(c);
  const out = [...d.rooms].filter((r) => !r.deleted).sort(sortRooms).map((room) => {
    const batch = room.batchId ? c.ix.batches.get(room.batchId) : null; const f = batch ? bf.get(batch.id) : null;
    const sowsIn = cy.filter((x) => x.sow.location?.roomId === room.id && x.c.status !== "gone");
    const litters = live(d.litters).filter((l) => l.roomId === room.id && !l.weaned);
    const check = checkedToday(live(d.roomChecks), room.id, c.today); const last = lastCheck(live(d.roomChecks), room.id);
    const wc = waterChange(live(d.readings), room.id, c.today); const wAlert = waterAlert(wc, c.s.waterDrop);
    const alarm = alarmState(live(d.alarmTests), room.house || room.name, c.today);
    const wash = washState(room, c.today);
    const pigs = room.kind === "farrowing" ? litters.reduce((t, l) => t + aliveNow(l), 0) : f ? f.onFarm : sowsIn.length;
    const space = f && room.kind !== "farrowing" ? spaceBadge(f.onFarm, room.pens, f.est) : null;
    const pwm = room.kind === "farrowing" ? preWeanMortality(litters) : null;
    const scourPens = last && last.date >= addDays(c.today, -1) ? (last.pens || []).filter((p) => (p.status || []).includes("Scour")).length : 0;
    let level = "", stage = "", key = "", keyLevel = "";
    if (!batch && !sowsIn.length && !litters.length) {
      stage = wash.ready ? "Empty · washed" : `Empty · ${WASH_WORD[wash.stage]?.toLowerCase() || "emptied"}`;
      key = wash.ready ? "Ready ✓" : wash.emptyDays != null ? `Empty ${wash.emptyDays} day${wash.emptyDays === 1 ? "" : "s"}` : "Wash it"; keyLevel = wash.ready ? "ok" : "";
    } else if (room.kind === "farrowing") {
      const due = sowsIn.filter((x) => !litters.some((l) => l.sowId === x.sow.id));
      const bNo = batchName(c.ix.batches.get(litters[0]?.batchId || due[0]?.c.batchId));
      if (litters.length) { const day = Math.max(...litters.map((l) => lactationDay(l, c.today))); stage = `${bNo} · day ${day}`; key = `PWM ${pct(pwm)}`; keyLevel = pwm != null && pwm * 100 > c.s.targets.pwm ? "due" : "ok"; if (due.length) key = `${litters.length} of ${litters.length + due.length} farrowed`; }
      else { const dd = due.map((x) => x.c.dates?.due).filter(Boolean).sort()[0]; stage = `${bNo} · due ${dd ? (daysBetween(c.today, dd) <= 6 ? dayName(dd) : dd.slice(8) + "/" + dd.slice(5, 7)) : "—"}`; key = `${room.crates || due.length} crates · 0/${due.length} farrowed`; }
    } else if (f) {
      stage = `${batchName(batch)} · day ${f.days}`;
      if (room.kind === "weaner") { key = scourPens ? `Scour ${scourPens} pen${scourPens > 1 ? "s" : ""}` : `${f.onFarm} pigs · FCR ${f.fcr ? f.fcr.toFixed(2) : "—"}`; keyLevel = scourPens ? "due" : ""; }
      else { key = `Est. ${Math.round(f.est)} kg · ship ${f.shipDate ? (daysBetween(c.today, f.shipDate) <= 6 ? dayName(f.shipDate) : f.shipDate.slice(8) + "/" + f.shipDate.slice(5, 7)) : "—"}`; }
      if (f.mortPct != null && f.mortPct * 100 > f.targetMort) { key = `Mortality ${pct(f.mortPct)}`; keyLevel = "due"; }
    } else { stage = `${sowsIn.length} sows`; key = KIND_NAME[room.kind]; }
    if (space?.level === "late") { key = `Space: over by ${f.onFarm - space.allowed}`; keyLevel = "late"; level = "late"; }
    if (wAlert) { key = `Water ${Math.round(wc.change * 100)}% today`; keyLevel = "due"; level = level || "due"; }
    if (alarm.level === "late" && room.mechVent !== false && (batch || sowsIn.length || litters.length)) { level = "late"; stage += " · alarm overdue"; }
    return { room, batch, f, sowsIn, litters, pigs, check, last, issues: issuePens(last), wc, wAlert, alarm, wash, space, pwm, scourPens, tile: { level, stage, key, keyLevel } };
  });
  c._rf = out; return out;
}

/** Feed bins: stock, kg/day being eaten, days left and the order-by date. */
export function binFacts(c) {
  if (c._bins) return c._bins;
  const rf = roomFacts(c); const dips = live(c.data.readings).filter((r) => r.binId && r.binDipKg != null).map((r) => ({ binId: r.binId, date: r.date, kg: +r.binDipKg }));
  c._bins = live(c.data.bins).map((bin) => {
    const rooms = rf.filter((x) => (bin.roomIds || []).includes(x.room.id));
    const use = rooms.reduce((t, x) => t + (x.f ? x.f.onFarm * intakeAt(x.f.est, c.s.intake) : 0) + (x.room.kind === "farrowing" ? x.litters.length * SOW_INTAKE.lactating : x.sowsIn.length * SOW_INTAKE.dry), 0);
    const stock = binStock(bin, live(c.data.feedDeliveries), dips, use, c.today);
    return { bin, rooms, use, stock, ...binForecast(stock, use, +bin.leadDays || c.s.leadDays, c.today) };
  });
  return c._bins;
}
export { pct };
