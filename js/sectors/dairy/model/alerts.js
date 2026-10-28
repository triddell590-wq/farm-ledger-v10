// Dairy alerts (design/12 §10). Each: { level: late|due|info, title, body, href, legal, key }.
// c = { s, ix, data, today, now, lid, brd }
import { addDays, daysBetween } from "../../../core/dates.js";
import { onFarm, groupOf, cowLabel } from "./cows.js";
import { actionLists } from "./fertility.js";
import { rolling, LEGAL, inhibitoryFails, overLimit, tankDue } from "./quality.js";
import { sccLists, failures, casesThisLactation } from "./mastitis.js";
import { partWord, hoursBetween, okLabel, quartersText } from "./milking.js";
import { yearlyDue } from "./tools.js";
import { calfSteps, rulesFor, tbNext } from "./duties.js";

export function dairyAlerts(c) {
  const { s, ix, data, today, now, lid, brd } = c; const L = (h) => `#/l/${lid}/${h}`; const out = [];
  if (brd.withheld.length) out.push({ key: "withheld", level: "late", legal: true, title: `Milk out of the tank — ${brd.withheld.length} cow${brd.withheld.length > 1 ? "s" : ""}`, body: brd.withheld.map((x) => `${cowLabel(x.cow)}${x.w.quarters?.length ? " " + quartersText(x.w.quarters) : ""} until ${x.label}`).slice(0, 4).join(" · "), href: L("milking") });
  for (const x of brd.release) out.push({ key: `release:${x.w.id}`, level: "due", title: `${cowLabel(x.cow)} can go back in the tank from ${okLabel(s, x.okFrom).replace(/^\w+ \d+ \w+ · /, "the ")}. Release her?`, body: "Releasing is a deliberate tap — check her marks are off first.", href: L("milking"), action: "Release" });
  // tank
  const recent = data.tankLog.filter((r) => !r.deleted && r.date >= addDays(today, -1)).sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
  const hot = recent.filter((r) => overLimit(s, r)).pop();
  if (hot) out.push({ key: `tank:${hot.id}`, level: "late", legal: true, title: `Tank ${(+hot.tempC).toFixed(1)} °C after ${partWord(hot.milking || "")} milking — above ${s.tankLimit} °C`, body: hot.action ? `Action noted: ${hot.action}` : "Check the cooling and note what you did.", href: L("milk/tank") });
  const td = tankDue(s, data.tankLog, now);
  if (td && hoursBetween(td.at, now) >= 2) out.push({ key: "tank-missing", level: "due", legal: true, title: s.robot ? "Today's tank temperature isn't logged" : `Tank temperature not logged after ${partWord(td.part)} milking`, body: "Red Tractor asks for a reading after each milking.", href: L("milk/tank") });
  // quality
  const q = data.milkQuality.filter((r) => !r.deleted);
  const fails = inhibitoryFails(q, today);
  for (const f of fails.filter((x) => daysBetween(x.date, today) <= 30)) out.push({ key: `inhib:${f.id}`, level: "late", legal: true, title: `Milk failed the antibiotic test (${f.date.slice(8)}/${f.date.slice(5, 7)}).`, body: f.action ? `Action noted. ${fails.length} fail${fails.length > 1 ? "s" : ""} in 12 months.` : "Note what happened and tell your vet.", href: L("milk/quality") });
  for (const key of ["scc", "tbc"]) {
    const r = rolling(q, key); if (!r) continue; const lim = LEGAL[key];
    const name = key === "scc" ? "SCC 3-month" : "TBC 2-month";
    if (r.value > lim) out.push({ key: `q:${key}`, level: "late", legal: true, title: `${name} average ${r.value}k — over the ${lim}k legal limit`, body: "Your processor and the Milk Inspectorate will follow this up. Talk to your vet.", href: L("milk/quality") });
    else if (r.value >= lim * (s.bands.nearLegalPct / 100)) out.push({ key: `q:${key}`, level: "due", legal: true, title: `${name} average ${r.value}k — close to the ${lim}k legal limit`, body: "Check the high-SCC cows and the wash routine.", href: L("milk/quality") });
  }
  // calves: untagged at 24 / 36 h; register and NIFAIS
  const R = rulesFor(s);
  for (const r of calfSteps(c)) {
    const of = r.dam ? `calf of ${cowLabel(r.dam)}` : `calf ${cowLabel(r.a)}`;
    const tag = r.steps.find((x) => x.key === "tagged" && !x.done);
    if (tag) { const h = hoursBetween(r.born, now); if (h >= R.tagHours) out.push({ key: `tag:${r.a.id}`, level: "late", legal: true, title: `Tag ${of} — over ${R.tagHours} hours`, body: "Tag her now and tick it off.", href: L(`cow/${r.a.id}`) }); else if (h >= 24) out.push({ key: `tag:${r.a.id}`, level: "due", legal: true, title: `Tag ${of} within ${R.tagHours} hours`, body: `${Math.round(R.tagHours - h)} hours left.`, href: L(`cow/${r.a.id}`) }); }
    for (const st of r.steps.filter((x) => x.key !== "tagged" && !x.done && x.left < 0)) out.push({ key: `reg:${r.a.id}:${st.key}`, level: "late", legal: true, title: `${st.label}: ${of} is ${-st.left} day${st.left === -1 ? "" : "s"} late`, body: st.key === "nifais" ? R.lateBirth : "Fill in the herd register now.", href: L(`cow/${r.a.id}`) });
  }
  // fertility (info)
  const g = actionLists(s, ix, data, today, 0);
  if (g.notSeen.length) out.push({ key: "nsb", level: "info", title: `${g.notSeen.length} cow${g.notSeen.length > 1 ? "s" : ""} over ${s.vwp + 21} days in milk not seen bulling — add to the vet list?`, body: g.notSeen.map((x) => cowLabel(x.a)).slice(0, 8).join(", "), href: L("fertility/vet"), action: "Vet list" });
  // treatment failures (DP.4)
  for (const f of failures(data, today).filter((x) => !x.vetToldAt && daysBetween(x.date, today) <= 14)) { const cow = ix.byId.get(f.animalId); out.push({ key: `dp4:${f.id}`, level: "due", title: `Treatment failure: ${cow ? cowLabel(cow) : ""} ${quartersText(f.quarters)}`, body: "Tell your vet within 1 week (Red Tractor DP.4).", href: L(`cow/${f.animalId}`) }); }
  // parlour machine
  for (const [type, label] of [["ISO 6690 static test", "Milking machine test due"], ["Liner change", "Liner change due"]]) {
    const last = data.parlourService.filter((x) => !x.deleted && x.type === type).map((x) => x.date).sort().pop();
    const y = yearlyDue(last, today); if (y.due && y.left <= 30) out.push({ key: `parlour:${type}`, level: y.left < 0 ? "late" : "due", title: `${label} by ${y.due.slice(8)}/${y.due.slice(5, 7)}${type.startsWith("ISO") ? " (ISO 6690, yearly)" : " (12 months)"}`, body: y.left < 0 ? "Overdue." : `${y.left} days left.`, href: L("parlour-machine") });
  }
  // SCC cows, 3rd case, mobility
  const sl = sccLists(ix, data, today);
  if (sl.high.length) out.push({ key: "scc-high", level: "info", title: `${sl.high.length} cow${sl.high.length > 1 ? "s" : ""} over 200k at the last recording`, body: sl.chronic.length ? `${sl.chronic.length} chronic (over 200k three times)` : sl.high.map((x) => cowLabel(x.a)).slice(0, 8).join(", "), href: L("milk/mastitis") });
  for (const a of data.animals.filter((x) => onFarm(x) && groupOf(ix, x, today) === "milking")) {
    const cs = casesThisLactation(ix, a); if (cs.length >= 3 && daysBetween(cs[cs.length - 1].date, today) <= 14) out.push({ key: `third:${a.id}`, level: "info", title: `${cowLabel(a)} has had ${cs.length} mastitis cases this lactation`, body: "Consider her for the cull list.", href: L(`cow/${a.id}`) });
  }
  const lastMob = data.scoreSessions.filter((x) => !x.deleted && x.method !== "bcs").map((x) => x.date).sort().pop();
  if (data.animals.some((a) => onFarm(a) && groupOf(ix, a, today) === "milking") && (!lastMob || daysBetween(lastMob, today) > 56)) out.push({ key: "mobility", level: "info", title: "Mobility score due", body: lastMob ? `Last scored ${daysBetween(lastMob, today)} days ago.` : "Not scored yet.", href: L("scores") });
  // robot: not milked 12 h (from the latest robot import)
  for (const r of notMilked(c)) out.push({ key: `robot:${r.a.id}`, level: "late", title: `Cow ${cowLabel(r.a)} not milked for ${Math.floor(r.h)} hours — fetch her`, body: "From the last robot import.", href: L(`cow/${r.a.id}`) });
  // TB, moves, deaths (as Beef)
  const tb = tbNext(c);
  if (tb && [30, 14, 3].some((d) => daysBetween(today, tb) <= d)) out.push({ key: "tb", level: daysBetween(today, tb) < 0 ? "late" : "due", legal: true, title: daysBetween(today, tb) < 0 ? "TB test overdue" : `TB test in ${daysBetween(today, tb)} days`, body: `Due ${tb.slice(8)}/${tb.slice(5, 7)}/${tb.slice(0, 4)}.`, href: L("tb") });
  for (const d of data.deaths.filter((x) => !x.deleted && !x.nifaisDone && daysBetween(x.date, today) > R.deathDays)) out.push({ key: `death:${d.id}`, level: "late", legal: true, title: "Death not yet notified to NIFAIS", body: `Died ${d.date}. Notify by ${R.routes}.`, href: L("paperwork/deaths") });
  const rank = { late: 0, due: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}

/** Robot farms: milking cows not milked for 12 h or more, from the latest robot import (≤ 24 h old). */
export function notMilked(c) {
  const { ix, data, today, now } = c; const out = [];
  const robot = (data.recordings || []).filter((r) => !r.deleted && r.robot).sort((a, b) => String(a.at || a.date).localeCompare(String(b.at || b.date))).pop();
  if (!robot || hoursBetween(robot.at || `${robot.date}T12:00`, now) > 24) return out;
  for (const row of robot.cows || []) {
    if (!row.lastMilked) continue; const h = hoursBetween(row.lastMilked, now); const a = ix.byId.get(row.animalId) || ix.byNo.get(String(row.cowNo));
    if (h >= 12 && a && onFarm(a) && groupOf(ix, a, today) === "milking") out.push({ a, h });
  }
  return out;
}
