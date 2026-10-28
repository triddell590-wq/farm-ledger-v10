// Layers alerts (design/14 §11). Each: { key, level 'late'|'due'|'info', title, body, href, legal, houseId?, unsnooze? }
import { addDays, daysBetween } from "../../../core/dates.js";
import { sortedHouses, flockIn, plannedFlock, series, mortality, dm, deadOf, sum } from "./flock.js";
import { standardFor } from "./standards.js";
import { salmonella, mite, eggWithheld } from "./health.js";
import { collectionGap, storeStatus, reconcile, farmGateStock } from "./eggs.js";
import { aiState } from "./house.js";
import { RULES, freeRangeText, birdCountDay } from "./content.js";

const DOWS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const dayName = (iso) => `${DOWS[new Date(iso + "T12:00:00Z").getUTCDay()]} ${dm(iso)}`;

/** Mortality spike: deaths on the day ≥ mult × the 7-day average before it, and ≥ min birds. */
export function spike(s, list, i) {
  const d = list[i]; if (!d) return null; const n = deadOf(d);
  const prev = list.slice(Math.max(0, i - 7), i); if (!prev.length) return null;
  const avg = sum(prev, deadOf) / prev.length;
  const mult = +s.spikeMult || 3, min = +s.spikeMin || 10;
  return n >= min && n >= mult * Math.max(avg, 0.0001) ? { n, avg: Math.round(avg * 10) / 10, times: avg ? Math.round(n / avg) : null } : null;
}
/** Lay rules: below the band for N sheets in a row (from peak week on) → due; a drop of > X points day on day → late. */
export function layAlert(s, list, peakWeek = 25) {
  const n = +s.layBelowDays || 3; const tail = list.filter((d) => d.henDay != null).slice(-n);
  const last = tail[tail.length - 1]; const prev = list.filter((d) => d.henDay != null).slice(-2)[0];
  if (last && prev && prev !== last && prev.henDay - last.henDay > (+s.layDropPts || 5) && last.wk >= 22) return { level: "late", drop: Math.round((prev.henDay - last.henDay) * 10) / 10, last };
  if (tail.length === n && tail.every((d) => d.wk >= peakWeek && d.vs?.pos === "below")) return { level: "due", gap: last.vs.gap, days: n, last };
  return null;
}

export function layerAlerts(c) {
  const { s, today } = c; const out = []; const L = (h) => `#/l/${c.lid}/${h}`;
  const nowHM = (c.now || "").slice(11, 16);
  const ai = aiState(c);
  if (ai.on) out.push({ key: "ai", level: ai.near ? "late" : "info", title: `Housing order in force since ${dm(ai.from)}`, body: `Day ${ai.daysHoused} housed · ${freeRangeText(c.region)}.`, href: L("range"), legal: true });
  for (const h of sortedHouses(c)) {
    const f = flockIn(c, h.id); const H = h.name;
    const nx = plannedFlock(c, h.id);
    if (nx && !nx.daeraNotified && !s.smallFlock) {
      const by = addDays(nx.placedDate, -RULES.salmonella.NI.noticeDays); const left = daysBetween(today, by);
      if (left <= 7) out.push({ key: `notice:${nx.id}`, level: left < 0 ? "late" : "due", title: `Tell DAERA about the new flock for ${H} at least 2 weeks before it arrives`, body: `Flock arrives ${dayName(nx.placedDate)} · tell DAERA by ${dayName(by)}.`, href: L(`flock/${nx.id}`), legal: true, houseId: h.id });
    }
    if (!f) continue;
    const list = series(c, f); const std = standardFor(f.breedStdId);
    const i = list.findIndex((d) => d.date === today); const recent = i >= 0 ? i : list.findIndex((d) => d.date === addDays(today, -1));
    const sp = spike(s, list, recent);
    if (sp) out.push({ key: `spike:${h.id}:${list[recent].date}`, level: "late", kind: "spike", title: `${H}: ${sp.n} dead ${list[recent].date === today ? "today" : "yesterday"}${sp.times ? ` — ${sp.times}× normal` : ""}`, body: "A sudden rise can be the first sign of bird flu. Phone your vet now. If you suspect bird flu you must report it to DAERA.", href: L(`house/${h.id}`), legal: true, houseId: h.id });
    const sal = salmonella(c, f);
    if (sal.classB) out.push({ key: `classb:${f.id}`, level: "late", unsnooze: true, title: `${H}: Salmonella positive. Eggs are Class B — do not pack as Class A.`, body: "Contact DAERA. Confirmatory test is possible within 4 weeks.", href: L(`salmonella/${f.id}`), legal: true, houseId: h.id });
    if (!sal.exempt && !sal.gone && sal.level !== "ok") out.push({ key: `salm:${f.id}:${sal.due}`, level: sal.level, title: `Boot swabs — ${H} ${sal.level === "late" ? "overdue since" : "due"} ${dayName(sal.due)}`, body: "Salmonella · every 15 weeks", href: L(`salmonella/${f.id}`), legal: true, houseId: h.id });
    const wd = eggWithheld(c, h.id);
    if (wd) out.push({ key: `wd:${h.id}:${wd.until}`, level: "late", title: `Eggs withheld — ${H} until ${dayName(wd.until)}`, body: `${wd.product || "Treatment"}: eggs from ${H} can't be sold until ${dayName(wd.until)}.`, href: L("health"), legal: true, houseId: h.id });
    if (nowHM && nowHM >= (s.sheetBy || "11:00") && !list.some((d) => d.date === today && !d.partial)) out.push({ key: `sheet:${h.id}:${today}`, level: "due", title: `Daily sheet — ${H}`, body: `Not filled by ${s.sheetBy}. Daily inspection and deaths are a legal record.`, href: L(`sheet/${h.id}/${today}`), legal: true, houseId: h.id });
    const la = layAlert(s, list, std.peakWeek);
    if (la?.level === "late") out.push({ key: `drop:${h.id}:${la.last.date}`, level: "late", title: `${H}: lay dropped ${la.drop} points in a day`, body: "Check water, feed, light, red mite and for disease.", href: L(`curve/${f.id}`), houseId: h.id });
    else if (la) out.push({ key: `lay:${h.id}:${la.last.date}`, level: "due", title: `${H}: lay ${la.gap}% below standard for ${la.days} days`, body: "Check water, feed, light, red mite, disease.", href: L(`curve/${f.id}`), houseId: h.id });
    const last = list[list.length - 1];
    if (last && last.date >= addDays(today, -1) && last.waterChange != null && Math.abs(last.waterChange) >= (+s.waterAlertPct || 10)) out.push({ key: `water:${h.id}:${last.date}`, level: "due", title: `${H} water ${last.waterChange < 0 ? "down" : "up"} ${Math.abs(Math.round(last.waterChange))}% — check lines, birds and heat`, body: "Compared with the last 3 days.", href: L(`house/${h.id}`), houseId: h.id });
    const m = mortality(c, f);
    if (m.weekPct != null && m.weekPct > (+s.packerMortTrigger || 0.2) && list.length >= 7) out.push({ key: `pmort:${h.id}:${today}`, level: "due", title: `${H} weekly mortality ${m.weekPct}% — over your packer's ${s.packerMortTrigger}% trigger`, body: "Your packer may ask for a vet report.", href: L("health/mortality"), houseId: h.id });
    const mt = mite(c, h.id);
    if (mt.over) out.push({ key: `mite:${h.id}:${mt.last.date}`, level: "due", title: `${H} mite average ${mt.avg} — over your action level`, body: `Action level ${s.miteAction}. Plan a treatment.`, href: L(`mite/${h.id}`), houseId: h.id });
    const lastAlarm = (c.data.alarmTests || []).filter((x) => !x.houseId || x.houseId === h.id).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!lastAlarm || daysBetween(lastAlarm.date, today) > (+s.alarmEveryDays || 7)) out.push({ key: `alarm:${h.id}:${today}`, level: "late", title: `Test the ventilation alarm — ${H}`, body: lastAlarm ? `Last tested ${dayName(lastAlarm.date)} · at least every 7 days` : "No test recorded · at least every 7 days", href: L("logs/alarm"), legal: true, houseId: h.id });
  }
  const st = storeStatus(c);
  if (st.over.length) out.push({ key: `store:${st.over[0].date}`, level: "due", title: `Egg store ${st.over[0].max} °C — Lion needs below ${s.storeMax} °C`, body: `On ${dayName(st.over[0].date)}.`, href: L("eggs/store") });
  const gap = collectionGap(c);
  if (gap?.flag) out.push({ key: `gap:${gap.last.date}`, level: "due", title: `Eggs not collected for ${gap.gap} days — Lion needs at least twice a week`, body: `Last collection ${dayName(gap.last.date)}.`, href: L("eggs/packer") });
  const sts = [...(c.data.packerStatements || [])].sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  if (sts[0] && daysBetween(sts[0].weekStart, today) <= 21) { const r = reconcile(c, sts[0]); if (r.flag) out.push({ key: `diff:${sts[0].id}`, level: "due", title: `Packer counted ${Math.abs(r.diff).toLocaleString("en-GB")} ${r.diff < 0 ? "fewer" : "more"} eggs than you (${Math.abs(r.pct)}%)`, body: `Week ${sts[0].week}. Check the statement or send a query.`, href: L("eggs/packer") }); }
  const yr = today.slice(0, 4); const reg = `${yr}-${birdCountDay(c.region)}`;
  if (today >= addDays(reg, -7) && today <= addDays(reg, 30) && !(c.data.birdRegisterReturns || []).some((x) => String(x.year) === yr && x.submittedOn)) out.push({ key: `birdreg:${yr}`, level: today > reg ? "late" : "due", title: "Count birds on 1 June for the NI Bird Register", body: "We'll fill in birds per establishment number from your daily sheets.", href: L("bird-register"), legal: true });
  if (s.farmGate) { const fg = farmGateStock(c, today, RULES.ungraded.NI.maxDays); if (fg.old) out.push({ key: `gate:${fg.oldest}`, level: "due", title: `${fg.old} farm-gate eggs are over 28 days old`, body: "Ungraded eggs can only be sold within 28 days of lay.", href: L("eggs/farm-gate"), legal: true }); }
  const rank = { late: 0, due: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}
