// "To do today" and "Coming up" for the Broilers home (design/15 §3.1, §3.3).
// Each job has a stable key so ticking it is remembered (tasks with sourceRef), and an optional
// action that ticks the real record instead.
import { houseState, listOf, cropEvents, cropDay, dateOfDay, currentCrop } from "./crop.js";
import { salmStatus, fciSendBy, feedOffDefault, turnaroundDays } from "./paper.js";
import { checkState } from "./alerts.js";
import { regionRule, TURNAROUND_STEPS } from "./content.js";
import { addDays, daysBetween, dayLabel, whenLabel, timePart, datePart, addHours, workingDaysBefore, at } from "./time.js";

export function todayTasks(c) {
  const { s, ix, data, today, now, lid, doneKeys = new Set() } = c; const L = (h) => `#/l/${lid}/${h}`; const out = [];
  const push = (t) => { if (!doneKeys.has(t.key)) out.push(t); };
  const checkDue = { am: [], pm: [] };
  for (const house of ix.houses) {
    const st = houseState(ix, house, s, today); const crop = st.crop; const H = house.name;
    if (crop && st.day >= 0) {
      const ck = checkState(c, house, crop);
      for (const slot of ["am", "pm"]) if (!ck[slot].done && (slot === "am" || now >= at(today, "12:00") || ck.am.done)) checkDue[slot].push(house);
      // brooding: crop-fill at 8 h and 24 h after placement
      const b = ix.brooding.get(crop.id) || {}; const placedAt = at(crop.placedDate, crop.placedTime || b.chicksArrived?.time || "06:00");
      for (const [h, k] of [[8, "cropFill8h"], [24, "cropFill24h"]]) { const when = addHours(placedAt, h); if (datePart(when) === today && (b[k] == null || b[k] === "")) push({ key: `fill${h}:${crop.id}`, title: `Crop-fill check at ${h} hours — ${H} (${timePart(when)})`, due: today, sub: `feel 100 chicks · target ${h === 8 ? s.cropFill8h : s.cropFill24h}%`, href: L(`brooding/${crop.id}`), kind: "open" }); }
      if (st.day === 7 && !b.day7) push({ key: `day7:${crop.id}`, title: `Day 7: record 7-day weight and mortality — ${H}`, due: today, href: L(`brooding/${crop.id}`), kind: "open" });
      // sample weighs on the weigh days (and up to 2 days after if missed)
      const wd = (s.weighDays || []).find((d) => st.day >= d && st.day <= d + 2);
      if (wd != null && !listOf(ix.weighs, crop.id).some((w) => cropDay(crop, w.date) >= wd)) push({ key: `weigh:${crop.id}:${wd}`, title: `Sample weigh ${H} (day ${wd})`, due: today, sub: "100 birds", href: L(`weigh/${crop.id}`), kind: "open" });
      // dark period from day 7
      if (st.day >= 6 && !crop.darkSetAt) push({ key: `dark:${crop.id}`, title: `Dark period starts from day 7 — ${H}`, due: dateOfDay(crop, 7) < today ? dateOfDay(crop, 7) : today, sub: "at least 6 h, 4 h unbroken", legal: true, action: { type: "cropField", id: crop.id, field: "darkSetAt" } });
      // Salmonella, litter, FCI, feed off
      for (const x of salmStatus(ix, crop, s, today)) {
        if (["due", "late", "open"].includes(x.state) && today >= addDays(x.window.doBy, -3)) {
          const what = x.ev.kind === "clear" ? "clear-out" : "thin";
          push({ key: `salm:${crop.id}:${x.ev.day}`, title: `Boot swabs for ${H} before ${dayLabel(x.ev.date).slice(0, 3)}'s ${what} — do by ${dayLabel(x.window.doBy)} so the result is back for the FCI`, due: x.window.doBy < today ? x.window.doBy : today, legal: true, href: L(`salm/${crop.id}`), kind: "open" });
          if (today >= x.window.noLitterFrom && today <= x.window.doBy) push({ key: `litter:${crop.id}:${x.ev.day}:${today}`, title: `No fresh litter in ${H} in the 2 days before boot swabs`, due: today });
        }
      }
      for (const ev of cropEvents(ix, crop, s).filter((e) => !e.done && e.rec)) {
        const t = ev.rec; const sendBy = fciSendBy(t.catchAt, s, t.arrivalAt); const sent = listOf(ix.fci, crop.id).some((f) => f.thinId === t.id && f.sentAt);
        if (!sent && today >= addDays(datePart(sendBy), -1) && today <= datePart(t.catchAt)) push({ key: `fci:${t.id}`, title: `Send FCI for the ${ev.kind === "clear" ? "clear-out" : "thin"} by ${whenLabel(sendBy)}`, due: datePart(sendBy) < today ? datePart(sendBy) : today, legal: true, href: L(`fci/${crop.id}/${t.id}`), kind: "open" });
        const fo = t.feedOffAt || feedOffDefault(t.catchAt, s);
        if (datePart(fo) === today) push({ key: `feedoff:${t.id}`, title: `Feed off ${H} at ${timePart(fo)} (catch ${timePart(t.catchAt)})`, due: today, legal: true });
      }
      if (st.stage === "thinning" || st.stage === "clear") { const ev = st.event || cropEvents(ix, crop, s).find((e) => e.kind === "clear"); if (ev && !ev.done) push({ key: `catch:${crop.id}:${ev.day}`, title: `${ev.kind === "clear" ? "Clear-out" : "Thin"} ${H} — record birds out`, due: today, href: ev.rec ? L(`thin/${crop.id}/${ev.rec.id}`) : L(`thin/${crop.id}/new-${ev.kind}`), kind: "open" }); }
    }
    // turnaround: next step not done
    if (st.turnaround) {
      const ta = st.turnaround; const done = new Set((ta.steps || []).filter((x) => x.at).map((x) => x.key));
      const next = TURNAROUND_STEPS.find(([k]) => !done.has(k) && !(k === "swabs" && !ta.swabsRequired) && k !== "placed");
      if (next) push({ key: `ta:${ta.id}:${next[0]}`, title: `${next[1]} — ${H}`, due: today, sub: ta.plan?.[next[0]] ? `planned ${dayLabel(ta.plan[next[0]])}` : `turnaround day ${daysBetween(ta.clearedDate, today)}`, href: L(`turnaround/${house.id}`), kind: "open" });
      // tell DAERA 15 working days before a placement above 33 kg/m²
      const R = regionRule("broilerDensity");
      if (ta.nextPlacement && +(ta.targetDensity || s.targetDensity || 0) > R.notifyAbove && !ta.notifiedDaera) { const by = workingDaysBefore(ta.nextPlacement, R.notifyWorkingDays); if (today >= addDays(by, -7)) push({ key: `notify:${ta.id}`, title: `Tell DAERA 15 working days before stocking above 33 kg/m² (by ${dayLabel(by)})`, due: by < today ? by : today, legal: true, action: { type: "taField", id: ta.id, field: "notifiedDaera" } }); }
    }
  }
  // AM / PM checks (grouped when every house is due)
  for (const slot of ["am", "pm"]) {
    const hs = checkDue[slot]; if (!hs.length) continue;
    const all = hs.length === ix.houses.filter((h) => currentCrop(ix, h.id)).length && hs.length > 1;
    out.unshift({ key: `check:${slot}:${today}:${hs.map((h) => h.id).join(",")}`, title: `${slot.toUpperCase()} check — ${all ? (hs.length === 2 ? "both houses" : "all houses") : hs.map((h) => h.name).join(", ")}`, due: today, sub: `by ${s.checkTimes[slot]}`, legal: true, href: L(`check/${hs[0].id}/${today}/${slot}`), kind: "check", slot, houseIds: hs.map((h) => h.id) });
  }
  // weekly generator / alarm tests
  if (ix.houses.length) for (const [kind, label] of [["generator", "Generator test on load"], ["alarm", "Alarm test"]]) {
    const last = (data.alarmTests || []).filter((x) => !x.deleted && (x.kind === kind || x.kind === "both")).map((x) => x.date).sort().pop();
    if (!last || daysBetween(last, today) >= 7) push({ key: `${kind}:${last || "never"}`, title: `${label} (weekly)`, due: today, sub: last ? `last ${dayLabel(last)}` : "not recorded yet", legal: true, href: L("paperwork/alarms"), action: { type: "alarm", kind } });
  }
  // non-mains water test every 6 months (Red Tractor)
  if (s.nonMainsWater) { const last = (data.waterTests || []).filter((x) => !x.deleted).map((x) => x.date).sort().pop(); if (!last || daysBetween(last, today) >= 182) push({ key: `watertest:${last || "never"}`, title: "Water test (non-mains, 6-monthly)", due: today, href: L("paperwork/water") }); }
  // processor feedback reviewed with the vet, per crop (Red Tractor)
  for (const crop of ix.crops.filter((x) => x.clearedDate && daysBetween(x.clearedDate, today) <= 30 && !x.feedbackReviewed)) {
    const hasFb = listOf(ix.thins, crop.id).some((t) => t.docket && (t.docket.footpad !== "" && t.docket.footpad != null));
    if (hasFb) push({ key: `fb:${crop.id}`, title: `Review processor footpad and hock feedback with your vet — Crop ${crop.no || ""} ${ix.houseById.get(crop.houseId)?.name || ""}`, due: today, action: { type: "cropField", id: crop.id, field: "feedbackReviewed" } });
  }
  // NI Bird Register on 1 June
  const inv = regionRule("inventories"); const y = today.slice(0, 4);
  if (today >= `${y}-${inv.reminderMonthDay}` && today <= `${y}-${inv.birdsCountMonthDay}` && !(data.birdRegisterReturns || []).some((r) => !r.deleted && r.year === +y)) push({ key: `birdreg:${y}`, title: "Count birds on 1 June for the NI Bird Register", due: `${y}-${inv.birdsCountMonthDay}`, legal: true, href: L("birdreg"), kind: "open" });
  return out.sort((a, b) => (a.kind === "check" ? -1 : 0) - (b.kind === "check" ? -1 : 0) || String(a.due).localeCompare(String(b.due)));
}

/** Next milestones across houses: [{ date, at?, icon, title, sub, href }] — the home shows 3. */
export function comingUp(c, n = 3) {
  const { s, ix, today, lid } = c; const L = (h) => `#/l/${lid}/${h}`; const out = [];
  const byEvent = new Map();
  for (const house of ix.houses) {
    const crop = currentCrop(ix, house.id); const ta = houseState(ix, house, s, today).turnaround;
    if (crop) {
      for (const x of salmStatus(ix, crop, s, today)) if (!x.sample && x.window.doBy >= today) out.push({ date: x.window.doBy, group: `salm:${x.window.doBy}`, house, icon: "clock", title: "Salmonella boot swabs", sub: `Do by ${dayLabel(x.window.doBy)} · no fresh litter in the 2 days before`, href: L(`salm/${crop.id}`) });
      for (const ev of cropEvents(ix, crop, s).filter((e) => !e.done && e.date >= today)) {
        const catchAt = ev.rec?.catchAt || at(ev.date, "02:00"); const sendBy = fciSendBy(catchAt, s, ev.rec?.arrivalAt);
        const sent = ev.rec && listOf(ix.fci, crop.id).some((f) => f.thinId === ev.rec.id && f.sentAt);
        if (!sent && datePart(sendBy) >= today) out.push({ date: datePart(sendBy), group: `fci:${ev.kind}:${datePart(sendBy)}`, house, icon: "document", title: `Send FCI for the ${ev.kind === "clear" ? "clear-out" : "thin"}`, sub: `By ${whenLabel(sendBy)} (24 h before arrival)`, href: ev.rec ? L(`fci/${crop.id}/${ev.rec.id}`) : L(`density/${crop.id}`) });
        out.push({ date: ev.date, group: `ev:${ev.kind}:${ev.date}`, house, icon: "broilers", title: `${ev.kind === "clear" ? "Clear" : "Thin"} {houses}`, sub: `${dayLabel(ev.date)}${ev.rec ? ` · catch ${timePart(ev.rec.catchAt)} · feed off from ${timePart(ev.rec.feedOffAt || feedOffDefault(ev.rec.catchAt, s))}` : ` · day ${ev.day}${ev.virtual ? " (planned)" : ""}`}${ev.birds ? ` · ${ev.birds.toLocaleString("en-GB")} birds` : ""}`, href: ev.rec ? L(`thin/${crop.id}/${ev.rec.id}`) : L(`density/${crop.id}`) });
      }
    }
    if (ta?.nextPlacement && ta.nextPlacement >= today) out.push({ date: ta.nextPlacement, group: `place:${ta.nextPlacement}`, house, icon: "birth", title: `Chicks arrive {houses}`, sub: `${dayLabel(ta.nextPlacement)} · pre-heat 24–48 h before`, href: L(`turnaround/${house.id}`) });
  }
  // merge the same milestone across houses ("Thin House 1 & 2", "— both houses")
  for (const x of out) { const g = byEvent.get(x.group); if (g) g.houses.push(x.house); else byEvent.set(x.group, { ...x, houses: [x.house] }); }
  const total = ix.houses.length;
  return [...byEvent.values()].map((x) => {
    const names = x.houses.length === total && total === 2 ? "both houses" : x.houses.length === total && total > 2 ? "all houses" : x.houses.map((h) => h.name).join(" & ").replace(/ & House /g, " & ");
    return { ...x, title: x.title.includes("{houses}") ? x.title.replace("{houses}", names) : `${x.title} — ${names}` };
  }).sort((a, b) => a.date.localeCompare(b.date)).slice(0, n);
}
