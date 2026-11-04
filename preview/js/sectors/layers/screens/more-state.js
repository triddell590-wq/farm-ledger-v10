// Live subtitles for the Layers More rows (mockups/layers.html: "Next step: …", "Feed cost 52p/doz").
import { sortedHouses, flockIn } from "../model/flock.js";
import { nextLightStep, aiState } from "../model/house.js";
import { flockMoney } from "../model/eggs.js";
import { daysBetween } from "../../../core/dates.js";
import { PRICE_PROFILE_ID } from "../data.js";

export function moreState(snap) {
  const c = snap.c; const hs = sortedHouses(c); const live = hs.map((h) => ({ h, f: flockIn(c, h.id) })).filter((x) => x.f);
  const out = {};
  out.houses = `${hs.length} house${hs.length === 1 ? "" : "s"} · ${live.length} with a flock${snap.s.packer ? ` · ${snap.s.packer}` : ""}`;
  const steps = live.map(({ h, f }) => ({ h, st: nextLightStep(c, f, snap.today, 21) })).filter((x) => x.st);
  out.light = steps.length ? `Next step: ${steps[0].h.name} to ${steps[0].st.hours} h, wk ${steps[0].st.wk}` : live.length ? "Next step: none until depop" : null;
  const ai = aiState(c); out.range = ai.on ? `Housing order · day ${ai.daysHoused} housed` : null;
  const lastAlarm = [...(snap.data.alarmTests || [])].sort((a, b) => b.date.localeCompare(a.date));
  const late = live.filter(({ h }) => { const t = lastAlarm.find((x) => !x.houseId || x.houseId === h.id); return !t || daysBetween(t.date, snap.today) > +snap.s.alarmEveryDays; });
  out.alarm = late.length ? `${late.map((x) => x.h.name).join(", ")} overdue` : live.length ? "Up to date" : null;
  if (snap.money && live.length) {
    const fin = snap.data.finance.filter((r) => r.id !== PRICE_PROFILE_ID);
    const vals = live.map(({ f }) => flockMoney(c, f, fin).feedPerDozen).filter((x) => x != null);
    if (vals.length) out.money = `Feed cost ${Math.round(vals.reduce((t, x) => t + x, 0) / vals.length)}p/doz · margin over feed`;
  }
  return out;
}
