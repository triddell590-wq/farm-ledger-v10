// Broilers alerts (design/15 §13). c = { s, ix, data, today, now, lid, money }
// Levels: late (red edge, legal or urgent) · due (amber) · info. Copy never diagnoses.
import { houseState, deathsOn, aliveStart, avgDeaths, cumMortPct, legalLine, cropDay, waterChangePct, listOf, cropEvents, currentCrop } from "./crop.js";
import { stdOf, daysUnder, vsStdPct } from "./growth.js";
import { plannedMax, densityNeeds, crossDay, farmLimit, projection } from "./density.js";
import { salmStatus, fciSendBy, withdrawalClashes, withdrawalEnd, feedOffLevel, turnaroundDays, salmPositive } from "./paper.js";
import { regionRule } from "./content.js";
import { addDays, daysBetween, dayLabel, whenLabel, at, addHours, timePart } from "./time.js";

const pct = (v, dp = 2) => `${(+v).toFixed(dp)}%`;
const ORDER = { late: 0, due: 1, info: 2 };

/** AM/PM check state per house: { am, pm } each { done, check, dueAt, lateAt, level } */
export function checkState(c, house, crop) {
  const { s, ix, today, now } = c; const out = {};
  for (const slot of ["am", "pm"]) {
    const done = listOf(ix.checks, crop.id).filter((x) => x.date === today && x.slot === slot).pop() || null;
    const dueAt = at(today, s.checkTimes[slot]); const lateAt = addHours(dueAt, s.lateAfterHours);
    out[slot] = { done: !!done, check: done, dueAt, lateAt, level: done ? "ok" : now >= lateAt ? "late" : now >= dueAt ? "due" : "open" };
  }
  return out;
}
/** Mortality alarm for a house today: null | { level, dead, pct, multiple, avg } */
export function mortalityAlarm(c, crop) {
  const { s, ix, today } = c; const dead = deathsOn(ix, crop, today); if (!dead) return null;
  const a = aliveStart(ix, crop, today); const p = a ? (dead / a) * 100 : 0; const avg = avgDeaths(ix, crop, today, 3);
  const multiple = avg > 0 ? dead / avg : null;
  if (p > s.mortalitySpikePct) return { level: "late", dead, pct: p, multiple, avg };
  if (avg > 0 && dead >= 5 && dead >= s.mortalityMultiple * avg) return { level: "due", dead, pct: p, multiple, avg };
  return null;
}

export function broilerAlerts(c) {
  const { s, ix, data, today, now, lid } = c; const L = (h) => `#/l/${lid}/${h}`; const out = [];
  for (const house of ix.houses) {
    const st = houseState(ix, house, s, today); const crop = st.crop; const H = house.name;
    if (crop && st.day >= 0) {
      // twice-daily inspection (legal, Sch. 5 para 8)
      const ck = checkState(c, house, crop);
      for (const slot of ["am", "pm"]) if (["due", "late"].includes(ck[slot].level)) out.push({ key: `check:${house.id}:${today}:${slot}`, level: ck[slot].level, title: `${slot.toUpperCase()} check — ${H}`, body: `Inspect all birds twice a day and record deaths and culls (Sch. 5 para 8). Due by ${timePart(ck[slot].dueAt)}.`, href: L(`check/${house.id}/${today}/${slot}`), action: `Do the ${slot.toUpperCase()} check`, legal: true, houseId: house.id });
      // mortality
      const m = mortalityAlarm(c, crop);
      if (m) out.push({ key: `mort:${house.id}:${today}`, level: m.level, kind: "mortality", title: `${H}: ${m.dead} dead since this morning`, body: `(${pct(m.pct)})${m.multiple ? ` · ${m.multiple.toFixed(m.multiple < 10 ? 1 : 0).replace(/\.0$/, "")}× the last 3 days` : ""}. Red Tractor: investigate if over ${s.mortalitySpikePct}% in 24 hours. A sudden rise can be the first sign of disease, including bird flu — call your vet. Report suspected bird flu to DAERA.`, href: L(`growth/${crop.id}`), legal: m.level === "late", houseId: house.id, mort: m });
      const area = +house.usableM2 || 0;
      const maxKg = area ? plannedMax(ix, crop, s, area, today) : 0;
      const needs = area ? densityNeeds(ix, crop, s, Math.max(maxKg, +crop.targetDensity || 0)) : null;
      // legal mortality line (only crops stocked above 39 kg/m²)
      if (needs?.needsApproval) { const cm = cumMortPct(ix, crop, today); const line = legalLine(st.day); if (cm > line) out.push({ key: `legal:${crop.id}`, level: "late", title: `${H} is above the 1% + 0.06% × age line`, body: `Crop mortality ${pct(cm)} vs ${pct(line)} today — this crop won't count towards your approval.`, href: L(`growth/${crop.id}`), legal: true }); }
      if (needs && needs.tier !== "none" && !needs.notifyOk) out.push({ key: `notify:${crop.id}`, level: "late", title: "Tell DAERA before stocking above 33 kg/m²", body: `${H} is planned at ${maxKg.toFixed(1)} kg/m². DAERA needs ${regionRule("broilerDensity").notifyWorkingDays} working days' notice (by ${dayLabel(needs.notifyBy)}). Add the date you told them.`, href: L(`density/${crop.id}`), legal: true });
      if (needs?.over) out.push({ key: `over42:${crop.id}`, level: "late", title: `${H} is planned above the 42 kg/m² legal maximum`, body: "Plan a thin or an earlier clear-out.", href: L(`density/${crop.id}`), legal: true });
      if (needs?.needsApproval && !needs.approvalRef) out.push({ key: `approval:${crop.id}`, level: "late", title: `${H} needs DAERA approval above 39 kg/m²`, body: "Add the approval reference to the crop.", href: L(`density/${crop.id}`), legal: true });
      // density crossing the farm limit before the next planned thin
      if (area && st.day >= 7) {
        const lim = farmLimit(s, crop); const cross = crossDay(ix, crop, s, area, today, lim);
        const firstThin = cropEvents(ix, crop, s).find((e) => !e.done && e.day >= st.day);
        const proj = projection(ix, crop, s, area, today); const overAny = proj.some((x) => x.day >= st.day && x.kg > lim);
        if (cross != null && overAny) out.push({ key: `dens:${crop.id}:${cross}`, level: "due", title: `Crosses ${lim} kg/m² on day ${cross} — thin by day ${cross}`, body: `${H}${firstThin ? `: planned ${firstThin.kind === "clear" ? "clear-out" : "thin"} on day ${firstThin.day} doesn't take enough birds` : ""}. Open the density planner.`, href: L(`density/${crop.id}`), legal: true });
      }
      // weight vs objective
      const std = stdOf(crop, s); const du = daysUnder(ix, crop, std, today, s.weightAlertPct);
      if (du >= s.weightAlertDays) out.push({ key: `wt:${crop.id}:${today}`, level: "due", title: `${H} is ${Math.abs(vsStdPct(ix, crop, std, st.day, today)).toFixed(0)}% under ${std.hybrid} for ${du} days`, body: "Check water, feed, air and health.", href: L(`growth/${crop.id}`) });
      // water
      const wc = waterChangePct(ix, crop, today);
      if (wc != null && Math.abs(wc) >= s.waterAlertPct) out.push({ key: `water:${crop.id}:${today}`, level: "due", title: `${H} water ${wc < 0 ? "down" : "up"} ${Math.abs(wc).toFixed(0)}%`, body: "Against the 3-day average. A change in water is often the first sign of a problem.", href: L(`growth/${crop.id}`) });
      // environment (latest check today or yesterday)
      const env = listOf(ix.checks, crop.id).filter((x) => x.date >= addDays(today, -1)).pop();
      if (env) {
        const bits = []; if (+env.nh3 > 20) bits.push(`ammonia ${env.nh3} ppm (limit 20)`); if (+env.co2 > 3000) bits.push(`CO₂ ${env.co2} ppm (limit 3,000)`);
        const rh48 = listOf(ix.checks, crop.id).filter((x) => x.date >= addDays(today, -1) && x.rh !== "" && x.rh != null);
        const avgRh = rh48.length ? rh48.reduce((t, x) => t + +x.rh, 0) / rh48.length : null; const cold = rh48.some((x) => x.outsideC !== "" && x.outsideC != null && +x.outsideC < 10);
        if (avgRh != null && avgRh > 70 && cold) bits.push(`humidity ${avgRh.toFixed(0)}% over 48 h with outside under 10 °C`);
        if (bits.length) out.push({ key: `env:${crop.id}:${today}`, level: "due", title: `${H}: ${bits[0]}`, body: `${bits.slice(1).join(" · ")}${bits.length > 1 ? ". " : ""}Required limits above 33 kg/m² (Sch. 5 para 13); Red Tractor applies them to every crop.`, href: L("paperwork/environment"), legal: needs?.tier !== "none" });
      }
      // dark period from day 7 (Sch. 5 para 7)
      if (st.day >= 8 && !crop.darkSetAt) out.push({ key: `dark:${crop.id}`, level: "due", title: `Dark period not set for ${H}`, body: "From day 7 to 3 days before slaughter: at least 6 hours of darkness, 4 hours unbroken (Sch. 5 para 7).", href: L("crop"), legal: true });
      // Salmonella before every slaughter
      for (const x of salmStatus(ix, crop, s, today)) {
        const what = x.ev.kind === "clear" ? "clear-out" : "thin";
        if (x.state === "late") out.push({ key: `salm:${crop.id}:${x.ev.day}`, level: "late", title: `No Salmonella sample for ${H}'s ${what}`, body: `Boot swabs were due by ${dayLabel(x.window.doBy)} for the ${what} on ${dayLabel(x.ev.date)}. Take them now and tell the processor.`, href: L(`salm/${crop.id}`), legal: true });
        else if (x.state === "due" || x.state === "open") out.push({ key: `salm:${crop.id}:${x.ev.day}`, level: "due", title: `Salmonella boot swabs — ${H}`, body: `Do by ${dayLabel(x.window.doBy)} so the result is back for the FCI (${what} ${dayLabel(x.ev.date)}).`, href: L(`salm/${crop.id}`), legal: true });
        else if (x.state === "positive") out.push({ key: `salmpos:${x.sample.id}`, level: "late", title: `Salmonella positive — ${H}`, body: "The processor must be told; clean and check the house before restocking.", href: L(`salm/${crop.id}`), legal: true });
      }
      // FCI and withdrawal against planned/recorded thins
      for (const ev of cropEvents(ix, crop, s).filter((e) => !e.done && e.rec)) {
        const t = ev.rec; const sendBy = fciSendBy(t.catchAt, s, t.arrivalAt); const sent = listOf(ix.fci, crop.id).find((f) => f.thinId === t.id && f.sentAt);
        if (!sent && now >= addHours(sendBy, -24)) out.push({ key: `fci:${t.id}`, level: now > sendBy ? "late" : "due", title: `Send FCI for the ${ev.kind === "clear" ? "clear-out" : "thin"} by ${whenLabel(sendBy)}`, body: `${H} · catch ${whenLabel(t.catchAt)}. Food Chain Information must reach the plant 24 hours before the birds.`, href: L(`fci/${crop.id}/${t.id}`), legal: true });
        const fo = t.feedOffAt ? feedOffLevel(t.feedOffAt, t.catchAt) : null;
        if (fo && fo.level !== "ok") out.push({ key: `feedoff:${t.id}`, level: fo.level, title: "Feed off more than 9 hours before catching", body: `${H}: ${fo.text}.`, href: L(`thin/${crop.id}/${t.id}`), legal: fo.level === "late" });
      }
      for (const ev of cropEvents(ix, crop, s).filter((e) => !e.done)) {
        const clash = withdrawalClashes(ix, crop, ev.date);
        if (clash.length) out.push({ key: `wd:${crop.id}:${ev.day}`, level: "late", title: `Withdrawal for ${H} ends ${dayLabel(withdrawalEnd(clash[0]))} — after ${dayLabel(ev.date)}'s ${ev.kind === "clear" ? "clear-out" : "thin"}`, body: `${clash[0].product || "Treatment"}. Birds can't go for slaughter until the withdrawal ends; talk to your vet and the processor.`, href: L("paperwork/medicines"), legal: true });
      }
    }
    // turnaround shorter than 5 days (Red Tractor)
    if (st.turnaround) { const td = turnaroundDays(st.turnaround, today); if (td.short) out.push({ key: `ta:${st.turnaround.id}`, level: "due", title: `${H}: only ${td.planned} days between flocks`, body: "Red Tractor needs at least 5 days between flocks for cleaning.", href: L(`turnaround/${house.id}`) });
      const pos = listOf(ix.salm, st.turnaround.cropId).find(salmPositive); if (pos && !(st.turnaround.steps || []).some((x) => x.key === "swabs" && x.at)) out.push({ key: `tapos:${st.turnaround.id}`, level: "late", title: `${H}: C&D must be checked before restocking`, body: "After a Salmonella positive the hygiene swab step is required.", href: L(`turnaround/${house.id}`), legal: true }); }
  }
  // weekly generator (on load) and alarm tests — late at 8 days
  for (const [kind, label] of [["generator", "Generator test on load"], ["alarm", "Alarm test"]]) {
    if (!ix.houses.length) break;
    const last = (data.alarmTests || []).filter((x) => !x.deleted && (x.kind === kind || x.kind === "both")).map((x) => x.date).sort().pop();
    if (!last || daysBetween(last, today) >= 8) out.push({ key: `${kind}:${last || "never"}`, level: "late", title: `${label} — overdue`, body: last ? `Last done ${dayLabel(last)}. Weekly (Red Tractor; back-up and alarm every 7 days).` : "Not recorded yet. Weekly (Red Tractor).", href: L("paperwork/alarms"), legal: true });
  }
  // Bird Register 1 June
  const inv = regionRule("inventories"); const y = today.slice(0, 4); const countDate = `${y}-${inv.birdsCountMonthDay}`;
  if (today >= `${y}-${inv.reminderMonthDay}` && today <= addDays(countDate, 14) && !(data.birdRegisterReturns || []).some((r) => !r.deleted && r.year === +y && r.submittedOn)) out.push({ key: `birdreg:${y}`, level: "due", title: "Count birds on 1 June", body: "NI Bird Register: one entry for each establishment number.", href: L("birdreg"), legal: true });
  // settlement vs estimate (money roles only)
  if (c.money) for (const f of (data.finance || []).filter((x) => !x.deleted && x.settlement?.flag && x.date >= addDays(today, -30))) out.push({ key: `settle:${f.id}`, level: "info", title: `Settlement differs from the estimate by ${f.settlement.pct > 0 ? "+" : ""}${(+f.settlement.pct).toFixed(1)}%`, body: f.note || "", href: L(`crop-result/${f.settlement.cropId}`) });
  return out.sort((a, b) => ORDER[a.level] - ORDER[b.level]);
}
