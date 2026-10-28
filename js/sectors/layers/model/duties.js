// "To do today" for the Layers home and the farm Overview (design/14 §3.3).
// Job: { key, title, sub, due, href, legal, record } — record=true means ticking opens the entry
// (the job is done when the record exists); the rest tick as tasks with sourceRef = key.
import { addDays, daysBetween } from "../../../core/dates.js";
import { sortedHouses, flockIn, plannedFlock, weekOfAge, dateAtWeek, dm } from "./flock.js";
import { salmonella, mite } from "./health.js";
import { nextCollection, storeStatus } from "./eggs.js";
import { isFreeRange, sunset, nextLightStep, aiState } from "./house.js";
import { RULES, birdCountDay } from "./content.js";
import { DOW_LONG } from "./settings.js";
import { dayName } from "./alerts.js";

const names = (hs) => (hs.length === 2 ? "Both houses" : hs.length > 2 ? "All houses" : hs[0]?.name || "");

export function todayTasks(c) {
  const { s, today, lid } = c; const L = (h) => `#/l/${lid}/${h}`; const out = []; const nowHM = (c.now || "").slice(11, 16);
  const houses = sortedHouses(c); const live = houses.map((h) => ({ h, f: flockIn(c, h.id) })).filter((x) => x.f);
  const days = c.data.days || []; const ai = aiState(c);
  for (const { h } of live) if (!days.some((d) => d.houseId === h.id && d.date === today && !d.partial)) out.push({ key: `sheet:${h.id}:${today}`, title: `Daily sheet — ${h.name}`, sub: `By ${s.sheetBy} · daily inspection and deaths are a legal record`, due: today, href: L(`sheet/${h.id}/${today}`), legal: true, record: true });
  const fr = live.filter((x) => isFreeRange(x.h)).map((x) => x.h);
  if (fr.length && !ai.on) {
    const opened = fr.filter((h) => days.some((d) => d.houseId === h.id && d.date === today && d.popOpen));
    if (opened.length < fr.length && nowHM < "12:00") out.push({ key: `pop-open:${today}`, title: "Open pop-holes by 09:00", sub: `${names(fr)} · free-range access`, due: today, href: L("range") });
    else { const dusk = sunset(today, +s.lat, +s.lng); out.push({ key: `pop-close:${today}`, title: `Close pop-holes at dusk (${dusk})`, sub: names(fr), due: today, href: L("range") }); }
  }
  if (ai.on && !(c.data.biosecurity || []).some((b) => b.date === today)) out.push({ key: `bio:${today}`, title: "Biosecurity check today", sub: "While the housing order or AIPZ is in force", due: today, href: L("range/biosecurity"), legal: true, record: true });
  for (const { h, f } of live) {
    const mt = mite(c, h.id); const dow = new Date(today + "T12:00:00Z").getUTCDay();
    if (!mt.doneThisWeek && dow >= +s.miteDay) out.push({ key: `mite:${h.id}:${today}`, title: `Mite traps — ${h.name}`, sub: `Weekly · ${DOW_LONG[+s.miteDay]}s`, due: today, href: L(`mite/${h.id}`), record: true });
    const sal = salmonella(c, f);
    if (!sal.exempt && !sal.gone && sal.level !== "ok") out.push({ key: `salm:${f.id}:${sal.due}`, title: `Boot swabs — ${h.name} due ${dayName(sal.due)}`, sub: "Salmonella · every 15 weeks", due: sal.due < today ? sal.due : today, href: L(`salmonella/${f.id}`), legal: true, record: true });
    const lt = nextLightStep(c, f, today, 3);
    if (lt) out.push({ key: `light:${f.id}:${lt.wk}`, title: `${h.name} lighting: step ${lt.hours > lt.from ? "up" : "down"} to ${lt.hours} h from ${dayName(lt.date).slice(0, 3)} (wk ${lt.wk})`, sub: "Lighting programme", due: today, href: L("lighting") });
    for (const v of (c.data.vaccinations || []).filter((x) => x.flockId === f.id && !x.date && x.plannedWk)) {
      const at = dateAtWeek(f, +v.plannedWk); if (daysBetween(today, at) <= 7) out.push({ key: `vacc:${v.id}`, title: `${h.name}: ${v.disease} ${v.dose ? v.dose.toLowerCase() + " " : ""}due wk ${v.plannedWk} (vet plan)`, sub: v.product || "Vaccination plan", due: at < today ? at : today, href: L(`flock/${f.id}/passport`), record: true });
    }
    const lastOf = (kind) => (c.data.samples || []).filter((x) => x.houseId === h.id && x.kind === kind).sort((a, b) => b.date.localeCompare(a.date))[0];
    const fs = lastOf("feather"); if (!fs || daysBetween(fs.date, today) >= +s.featherEveryDays) out.push({ key: `feather:${h.id}:${today}`, title: `Feather score 50 hens — ${h.name} (monthly)`, sub: fs ? `Last ${dm(fs.date)}` : "Not scored yet", due: today, href: L(`samples/${h.id}/feather`), record: true });
    const ws = lastOf("weights"); if (!ws || daysBetween(ws.date, today) >= +s.weighEveryDays) out.push({ key: `weigh:${h.id}:${today}`, title: `Weigh 100 hens — ${h.name}`, sub: ws ? `Last ${dm(ws.date)}` : "Body weight and uniformity", due: today, href: L(`samples/${h.id}/weights`), record: true });
    const al = (c.data.alarmTests || []).filter((x) => !x.houseId || x.houseId === h.id).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!al || daysBetween(al.date, today) >= (+s.alarmEveryDays || 7) - 1) out.push({ key: `alarm:${h.id}:${today}`, title: `Test the ventilation alarm — ${h.name}`, sub: "Every 7 days (legal)", due: today, href: L("logs/alarm"), legal: true, record: true });
    if (f.plannedDepop && !f.depopBooked && !f.depopDate && daysBetween(today, f.plannedDepop) <= 42) out.push({ key: `depop:${f.id}`, title: `Book depop for ${h.name} (wk ${weekOfAge(f, f.plannedDepop)} planned, ${dm(f.plannedDepop)})`, sub: "Catching crew and spent-hen buyer", due: today, href: L(`flock/${f.id}`) });
  }
  for (const h of houses) { const nx = plannedFlock(c, h.id); if (nx && !nx.daeraNotified && !s.smallFlock && daysBetween(today, addDays(nx.placedDate, -14)) <= 7) out.push({ key: `notice:${nx.id}`, title: `Tell DAERA about the new flock for ${h.name} at least 2 weeks before it arrives`, sub: `Arrives ${dayName(nx.placedDate)}`, due: today, href: L(`flock/${nx.id}`), legal: true }); }
  const nc = nextCollection(s, today);
  if (nc && daysBetween(today, nc) <= 2) { const n = daysBetween(today, nc); out.push({ key: `collect:${nc}`, title: `Packer collects ${n === 0 ? "today" : dayName(nc).slice(0, 3)}`, sub: `${n === 0 ? "Today" : n === 1 ? "Tomorrow" : n + " days"} · Lion: at least twice a week`, due: today, href: L("eggs/packer") }); }
  if (s.storeTempDaily && live.length && !storeStatus(c).today) out.push({ key: `store:${today}`, title: "Log egg store temperature", sub: `Lion: below ${s.storeMax} °C`, due: today, href: L("eggs/store"), record: true });
  const yr = today.slice(0, 4); const inv = RULES.inventories.NI.birds; const reg = `${yr}-${birdCountDay(c.region)}`;
  if (today >= addDays(reg, -inv.remindDaysBefore) && today <= reg && !(c.data.birdRegisterReturns || []).some((x) => String(x.year) === yr && x.submittedOn)) out.push({ key: `birdreg:${yr}`, title: inv.text, sub: "NI Bird Register return", due: today, href: L("bird-register"), legal: true, record: true });
  // jobs ticked as tasks today drop out (record jobs drop out when their record exists)
  return out.filter((t) => !c.doneKeys?.has(t.key));
}
