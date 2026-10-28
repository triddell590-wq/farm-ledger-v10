// "To do today" for the Dairy ledger (design/12 §3.5). Each job has a stable key so ticking it
// is remembered (tasks with sourceRef), and an optional action that ticks the real record.
// c = { s, ix, data, today, now, lid, doneKeys, brd (withhold board) }
import { addDays, daysBetween } from "../../../core/dates.js";
import { onFarm, cowLabel, groupOf, dim, listOf } from "./cows.js";
import { actionLists } from "./fertility.js";
import { courseTimes, datePart, timePart, addHours, at, milkingAtOrAfter, partWord, quartersText } from "./milking.js";
import { tankDue } from "./quality.js";
import { mixing } from "./calves.js";
import { yearlyDue } from "./tools.js";
import { failures } from "./mastitis.js";
import { registerRules } from "./content.js";

const ord = (n) => n + (["th", "st", "nd", "rd"][((n % 100) - 20) % 10] || ["th", "st", "nd", "rd"][n % 100] || "th");
export const rulesFor = (s) => ({ ...registerRules(s.registerMode, s.region), mode: s.registerMode });

/** Calves born here that still need tagging / registering: [{ a, dam, steps[{key,label,due,done,left,legal}] }] */
export function calfSteps(c) {
  const { s, ix, data, today } = c; const R = rulesFor(s); const out = [];
  for (const a of data.animals) {
    if (a.deleted || !a.bornInHerd || !a.dob || daysBetween(a.dob, today) > 60) continue;
    const dam = a.damId ? ix.byId.get(a.damId) : null; const reg = a.reg || {};
    const born = at(a.dob, a.birthTime || "12:00");
    const steps = [{ key: "tagged", label: "Tag", due: datePart(addHours(born, R.tagHours)), hours: R.tagHours }];
    if (R.mode === "nifais") steps.push({ key: "nifais", label: "Record on NIFAIS", due: addDays(a.dob, R.birthNifaisDays) });
    else steps.push({ key: "register", label: "Herd register", due: addDays(a.dob, R.birthRegisterDays) }, { key: "nifais", label: "Register on NIFAIS", due: addDays(a.dob, R.birthNifaisDays) });
    for (const st of steps) { st.done = !!reg[st.key]; st.left = daysBetween(today, st.due); }
    if (steps.some((x) => !x.done)) out.push({ a, dam, steps, born });
  }
  return out;
}

export function todayTasks(c) {
  const { s, ix, data, today, now, lid, doneKeys = new Set(), brd } = c; const L = (h) => `#/l/${lid}/${h}`;
  const out = []; const R = rulesFor(s);
  const push = (t) => { if (!doneKeys.has(t.key)) out.push(t); };
  // calves: tag within 36 h, register 7 d, NIFAIS 27 d (or 23 d when NIFAIS is the register)
  for (const r of calfSteps(c)) {
    const of = r.dam ? `calf of ${cowLabel(r.dam)}` : `calf ${cowLabel(r.a)}`;
    for (const st of r.steps.filter((x) => !x.done)) {
      if (st.left > 2 && st.key !== "tagged") continue;
      const title = st.key === "tagged" ? `Tag ${of} (within ${R.tagHours} hours)` : st.key === "register" ? `Enter ${of} in the herd register (${R.birthRegisterDays} days)` : R.mode === "nifais" ? `Record ${of} on NIFAIS (${R.birthNifaisDays} days)` : `Register ${of} on NIFAIS (${R.birthNifaisDays} days)`;
      out.push({ key: `reg:${r.a.id}:${st.key}`, title, due: st.due, legal: true, href: L(`cow/${r.a.id}`), action: { type: "reg", animalId: r.a.id, step: st.key } });
    }
  }
  // fertility lists
  const g = actionLists(s, ix, data, today, 0);
  if (g.heats.length) push({ key: `heats:${today}`, title: `Watch for heats: ${g.heats.length} cow${g.heats.length > 1 ? "s" : ""}`, due: today, href: L("fertility") });
  if (g.serve.length) push({ key: `serve:${today}`, title: `Serve: ${g.serve.map((x) => cowLabel(x.a)).slice(0, 5).join(", ")}`, due: today, href: L("fertility") });
  if (g.pd.length) push({ key: `pd:${today}`, title: `PD with the vet: ${g.pd.length} cow${g.pd.length > 1 ? "s" : ""}`, due: today, href: L("fertility/vet") });
  const dryNow = g.dryOff.filter((x) => x.date <= addDays(today, 7));
  if (dryNow.length) push({ key: `dry:${today}`, title: `Dry off: ${dryNow.map((x) => cowLabel(x.a)).slice(0, 6).join(", ")}`, due: today, href: L("fertility") });
  // course doses due today (2nd dose onwards)
  for (const m of data.medicines.filter((x) => !x.deleted && +x.doses > 1 && x.date >= addDays(today, -10))) {
    for (const d of courseTimes(m).filter((x) => x.n > 1 && datePart(x.at) === today)) {
      const cows = (m.animalIds || []).map((id) => ix.byId.get(id)).filter(Boolean).map(cowLabel).join(", ");
      push({ key: `dose:${m.id}:${d.n}`, title: `${m.reason === "Mastitis" ? "Mastitis tube" : m.productName || "Treatment"}: ${cows}${m.quarters?.length ? " " + quartersText(m.quarters) : ""}, ${ord(d.n)} ${m.reason === "Mastitis" ? "tube" : "dose"}`, due: today, sub: s.robot ? timePart(d.at) : `${partWord(milkingAtOrAfter(s, d.at)?.part || "")} milking`, href: L("milking") });
    }
  }
  // withdrawal ending today: release (deliberate tap)
  for (const it of [...(brd?.withheld || []), ...(brd?.release || [])].filter((x) => x.okFrom && datePart(x.okFrom) <= today)) {
    const when = it.okFrom <= now ? "now" : s.robot ? `at ${timePart(it.okFrom)}` : +timePart(it.okFrom).slice(0, 2) >= 12 ? "at tonight's milking" : "at this morning's milking";
    out.push({ key: `release:${it.w.id}`, title: `Release ${cowLabel(it.cow)}${it.w.quarters?.length ? " " + quartersText(it.w.quarters) : ""} ${when}`, due: today, href: L("milking"), action: { type: "release", id: it.w.id } });
  }
  // tank temperature for the current milking
  const td = tankDue(s, data.tankLog, now);
  if (td) push({ key: `tank:${td.date}:${td.part}`, title: s.robot ? "Log today's tank temperature check" : `Log tank temperature after ${partWord(td.part)} milking`, due: today, href: L("milk/tank"), action: { type: "tank" } });
  // parlour machine: ISO 6690 test and liner change, 12 months
  const svc = (type) => data.parlourService.filter((x) => !x.deleted && x.type === type).map((x) => x.date).sort().pop();
  for (const [type, label] of [["ISO 6690 static test", "ISO 6690 machine test due"], ["Liner change", "Liner change due (12 months)"]]) {
    const y = yearlyDue(svc(type), today); if (y.due && y.left <= 30) push({ key: `parlour:${type}:${y.due}`, title: `${label}${type.startsWith("ISO") ? ` ${y.due < today ? "— overdue" : "by " + y.due.slice(8) + "/" + y.due.slice(5, 7)}` : ""}`, due: y.due < today ? y.due : today, href: L("parlour-machine") });
  }
  // mobility scoring every N weeks
  const lastMob = data.scoreSessions.filter((x) => !x.deleted && x.method !== "bcs").map((x) => x.date).sort().pop();
  const cows = data.animals.filter((a) => onFarm(a) && groupOf(ix, a, today) === "milking").length;
  if (cows && (!lastMob || daysBetween(lastMob, today) >= s.mobilityWeeks * 7)) push({ key: `mobility:${lastMob || "never"}`, title: `Mobility score the herd (every ${s.mobilityWeeks} weeks)`, due: today, href: L("scores") });
  // calves: today's feeds from the mixing plans
  const plans = data.calfFeeds.filter((x) => !x.deleted && (x.calfIds || []).length);
  if (plans.length) {
    const times = s.calfPlan.feedTimes.slice(0, Math.max(...plans.map((p) => +p.feedsPerDay || 2)));
    times.forEach((t, i) => {
      let L2 = 0, kg = 0; for (const p of plans) { if (i >= (+p.feedsPerDay || 2)) continue; const m = mixing({ calves: p.calfIds.length, lPerFeed: p.lPerFeed, feedsPerDay: 1, gPerL: p.gPerL }); L2 += m.litresDay; kg += m.kgDay; }
      push({ key: `calffeed:${today}:${i}`, title: `Feed calves (${+t.slice(0, 2) < 12 ? "am" : "pm"}): ${Math.round(L2)} L, ${Math.round(kg * 10) / 10} kg powder`, due: today, href: L("calves") });
    });
  }
  // fresh cows: daily checks for 0–21 days in milk
  const fresh = data.animals.filter((a) => onFarm(a) && dim(ix, a, today) != null && dim(ix, a, today) <= 21 && !listOf(ix.fresh, a).some((f) => f.date === today));
  if (fresh.length) push({ key: `fresh:${today}`, title: `Fresh cow checks: ${fresh.length} cow${fresh.length > 1 ? "s" : ""}`, due: today, href: L("milking#fresh") });
  // treatment failures: DP.4 tell the vet within 1 week; DP.6 form after 2 in 12 months
  const fails = failures(data, today);
  for (const f of fails.filter((x) => !x.vetToldAt && daysBetween(x.date, today) <= 14)) {
    const cow = ix.byId.get(f.animalId);
    out.push({ key: `dp4:${f.id}`, title: `Tell your vet about the treatment failure (${cow ? cowLabel(cow) : ""} ${quartersText(f.quarters)}) within 1 week`, due: addDays(f.date, 7), legal: false, href: L(`cow/${f.animalId}`), action: { type: "rec", coll: "mastitis", id: f.id, field: "vetToldAt" } });
  }
  const forms = data.abFailures.filter((x) => !x.deleted).map((x) => x.date).sort();
  if (fails.length >= 2 && !(forms.length && forms[forms.length - 1] >= fails[fails.length - 1].date)) push({ key: `dp6:${fails[fails.length - 1].id}`, title: "Fill in the antibiotic failure investigation form (DP.6)", due: today, href: L("ab-failures") });
  // TB test (reminders at 30, 14 and 3 days, as Beef)
  const tb = tbNext(c);
  if (tb && daysBetween(today, tb) <= 30) push({ key: `tb:${tb}`, title: daysBetween(today, tb) < 0 ? "TB test overdue — book it with your vet" : `TB test due ${tb.slice(8)}/${tb.slice(5, 7)} — book it with your vet`, due: daysBetween(today, tb) <= 3 ? today : today, legal: true, href: L("tb") });
  // moves and deaths: register + NIFAIS
  for (const mv of data.movements.filter((x) => !x.deleted && x.date >= addDays(today, -30))) {
    const n = (mv.animalIds || []).length; const what = `${n} animal${n === 1 ? "" : "s"} ${mv.direction === "on" ? "in" : "off"} ${mv.date.slice(8)}/${mv.date.slice(5, 7)}`;
    if (R.mode === "nifais") { if (!mv.nifaisDone) out.push({ key: `mv:${mv.id}:nifais`, title: `Record the move on NIFAIS today (${what})`, due: mv.date, legal: true, href: L("paperwork/movements"), action: { type: "rec", coll: "movements", id: mv.id, field: "nifaisDone" } }); }
    else {
      if (!mv.registerDone) out.push({ key: `mv:${mv.id}:reg`, title: `Enter the move in the herd register (${what})`, due: addDays(mv.date, 1), legal: true, href: L("paperwork/movements"), action: { type: "rec", coll: "movements", id: mv.id, field: "registerDone" } });
      if (!mv.nifaisDone) out.push({ key: `mv:${mv.id}:nifais`, title: `Notify NIFAIS of the move (${what})`, due: addDays(mv.date, R.moveNifaisDays), legal: true, href: L("paperwork/movements"), action: { type: "rec", coll: "movements", id: mv.id, field: "nifaisDone" } });
    }
  }
  for (const d of data.deaths.filter((x) => !x.deleted && x.date >= addDays(today, -30) && !x.nifaisDone)) {
    const a = ix.byId.get(d.animalId);
    out.push({ key: `death:${d.id}`, title: `${R.mode === "nifais" ? "Record" : "Notify"} the death of ${a ? cowLabel(a) : "an animal"} on NIFAIS (${R.deathDays} days)`, due: addDays(d.date, R.deathDays), legal: true, href: L("paperwork/deaths"), action: { type: "rec", coll: "deaths", id: d.id, field: "nifaisDone" } });
  }
  const show = out.filter((t) => t.due <= addDays(today, 0) || t.legal || t.key.startsWith("reg:"));
  return show.sort((a, b) => String(a.due).localeCompare(String(b.due)));
}

export function tbNext(c) {
  const last = [c.s.tbLastDate, ...c.data.tbTests.filter((x) => !x.deleted).map((x) => x.date)].filter(Boolean).sort().pop();
  if (!last) return null;
  const d = new Date(last + "T12:00:00Z"); d.setUTCMonth(d.getUTCMonth() + (+c.s.tbIntervalMonths || 12)); return d.toISOString().slice(0, 10);
}
