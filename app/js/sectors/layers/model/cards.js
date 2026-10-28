// House card facts for the Houses home (design/14 §3.1, §3.2): today's lay % (or yesterday's),
// the last 14 days against the band, deaths, water, temperature, the sheet tick, the card edge,
// pre-lay and empty-house (turnaround) states. Pure: c = model snapshot.
import { addDays, daysBetween } from "../../../core/dates.js";
import { flockIn, plannedFlock, lastFlock, series, stageOf, weekOfAge, aliveAt, dateAtWeek } from "./flock.js";
import { standardFor, layBand } from "./standards.js";
import { classB, eggWithheld } from "./health.js";
import { spike, layAlert } from "./alerts.js";

export function houseCard(c, h) {
  const f = flockIn(c, h.id);
  if (!f) {
    const last = lastFlock(c, h.id); const next = plannedFlock(c, h.id);
    const since = last?.depopDate || null; const stages = last?.turnaround?.stages || [];
    return { h, empty: true, last, next, day: since ? daysBetween(since, c.today) + 1 : null, stages, nextDate: next?.placedDate || last?.nextPlacement || null };
  }
  const std = standardFor(f.breedStdId); const s = series(c, f).filter((d) => d.date <= c.today && !d.partial);
  const all = series(c, f).filter((d) => d.date <= c.today);
  const today = s.find((d) => d.date === c.today) || null; const partToday = all.find((d) => d.date === c.today) || null;
  const shown = today || s[s.length - 1] || null;
  const label = today ? "today" : shown && shown.date === addDays(c.today, -1) ? "yesterday" : shown ? `on ${shown.date.slice(8)}/${shown.date.slice(5, 7)}` : "";
  const wk = weekOfAge(f, c.today); const band = layBand(std, wk);
  const stage = stageOf(c, f);
  const pts = s.slice(-14).map((d) => ({ henDay: d.henDay, band: d.band }));
  const iSp = all.findIndex((d) => d.date === (partToday ? c.today : shown?.date));
  const sp = iSp >= 0 ? spike(c.s, all, iSp) : null;
  const la = layAlert(c.s, s, std.peakWeek);
  const cb = classB((c.data.salmSamples || []).filter((x) => x.flockId === f.id), f, c.today);
  const wd = eggWithheld(c, h.id);
  const water = shown?.waterChange ?? null; const waterFlag = water != null && Math.abs(water) >= (+c.s.waterAlertPct || 10);
  const nowHM = (c.now || "").slice(11, 16); const late = !today && nowHM >= (c.s.sheetBy || "11:00");
  const edge = sp || cb.on ? "late" : la || waterFlag || late ? "due" : "";
  const deadNow = partToday || shown;
  const prelay = stage === "prelay" ? { firstEggsWk: (s.find((d) => +d.eggsTotal > 0) || {}).wk ?? null, floorToday: shown?.floor ?? null, expectWk: std.lay[0][0] - 1 } : null;
  return {
    h, f, std, wk, stage, band, today, shown, label, pts, sp, la, classB: cb.on, withheld: wd, edge, prelay,
    lay: shown?.henDay ?? null, vs: shown?.vs || null,
    hens: aliveAt(c, f, c.today, { end: !!partToday }),
    dead: deadNow ? (+deadNow.dead || 0) + (+deadNow.culled || 0) : null, deadFlag: !!sp,
    waterL: shown?.litres ?? null, water, waterFlag,
    temp: shown?.tMax ?? null,
    done: today ? { at: today.savedAt || "", by: (today.byName || "").split(" ")[0] } : null,
    sheetLate: late,
  };
}
/** Days until the next flock and the clean-out progress for an empty house. */
export function turnaroundLine(card) {
  const parts = ["Empty"];
  if (card.day) parts.push(`day ${card.day} of clean-out`);
  if (card.nextDate) parts.push(`next flock placed ${card.nextDate}`);
  return parts.join(" · ");
}
export { dateAtWeek };
